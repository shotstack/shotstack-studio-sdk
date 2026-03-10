import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import {
	calculateCornerScale,
	calculateEdgeResize,
	clampDimensions,
	roundDimensions,
	detectCornerZone,
	detectEdgeZone
} from "@core/interaction/clip-interaction";
import { SELECTION_CONSTANTS, CURSOR_BASE_ANGLES, type CornerName, buildResizeCursor } from "@core/interaction/selection-overlay";
import { type ClipBounds, createClipBounds, createSnapContext, snap, snapRotation } from "@core/interaction/snap-system";
import { updateSvgViewBox, isSimpleRectSvg } from "@core/shared/svg-utils";
import { Pointer } from "@inputs/pointer";
import type { Vector } from "@layouts/geometry";
import { absoluteToRelative } from "@layouts/position-builder";
import type { ResolvedClip, SvgAsset } from "@schemas";
import * as pixi from "pixi.js";

import type { CanvasOverlayRegistration } from "./ui-controller";

type ScaleDirection = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
type EdgeDirection = "left" | "right" | "top" | "bottom";

/**
 * SelectionHandles renders selection UI (outline + resize handles) on selected players
 * and handles all drag/resize/rotate interactions.
 *
 * This class decouples interaction logic from Player, allowing Canvas to work as a pure renderer.
 */
// Edge handle dimensions - refined for Canva-like elegance
const EDGE_HANDLE_LENGTH = 20;
const EDGE_HANDLE_THICKNESS = 4;

// Dimension label style
const DIMENSION_FONT_SIZE = 11;
const DIMENSION_PADDING_X = 6;
const DIMENSION_PADDING_Y = 3;
const DIMENSION_GAP = 8; // px below the clip outline

export class SelectionHandles implements CanvasOverlayRegistration {
	private container: pixi.Container;
	private outline: pixi.Graphics;
	private handles: Map<CornerName, pixi.Graphics>;
	private edgeHandles: Map<EdgeDirection, pixi.Graphics>;
	private app: pixi.Application | null = null;

	// Dimension label shown during resize (lives in overlay parent, not rotated container)
	private dimensionContainer: pixi.Container;
	private dimensionBackground: pixi.Graphics;
	private dimensionLabel: pixi.Text;

	// Selection state
	private selectedPlayer: Player | null = null;
	private selectedClipId: string | null = null;
	private selectedTrackIndex = -1;
	private selectedClipIndex = -1;

	// Interaction state
	private isHovering = false;
	private isDragging = false;
	private dragOffset: Vector = { x: 0, y: 0 };

	private scaleDirection: ScaleDirection | null = null;
	private edgeDragDirection: EdgeDirection | null = null;
	private edgeDragStart: Vector = { x: 0, y: 0 };
	private originalDimensions: { width: number; height: number; offsetX: number; offsetY: number } | null = null;

	private isRotating = false;
	private rotationStart: number | null = null;
	private initialRotation = 0;
	private rotationCorner: CornerName | null = null;

	private initialClipConfiguration: ResolvedClip | null = null;

	// Final drag state
	private finalDragState: {
		offset?: { x: number; y: number };
		width?: number;
		height?: number;
		transform?: { rotate?: { angle: number } };
	} | null = null;

	// Bound event handlers for cleanup
	private onClipSelectedBound: (payload: { trackIndex: number; clipIndex: number }) => void;
	private onSelectionClearedBound: () => void;
	private onPointerDownBound: (event: pixi.FederatedPointerEvent) => void;
	private onPointerMoveBound: (event: pixi.FederatedPointerEvent) => void;
	private onPointerUpBound: () => void;

	constructor(private edit: Edit) {
		this.container = new pixi.Container();
		this.container.zIndex = 18;
		this.container.sortableChildren = true;

		this.outline = new pixi.Graphics();
		this.handles = new Map();
		this.edgeHandles = new Map();

		// Dimension label (axis-aligned, not rotated with the clip)
		this.dimensionContainer = new pixi.Container();
		this.dimensionContainer.zIndex = 20;
		this.dimensionContainer.visible = false;
		this.dimensionBackground = new pixi.Graphics();
		this.dimensionLabel = new pixi.Text({
			text: "",
			style: {
				fontFamily: "system-ui, -apple-system, sans-serif",
				fontSize: DIMENSION_FONT_SIZE,
				fill: "#ffffff"
			}
		});
		this.dimensionContainer.addChild(this.dimensionBackground);
		this.dimensionContainer.addChild(this.dimensionLabel);

		// Bind event handlers
		this.onClipSelectedBound = this.onClipSelected.bind(this);
		this.onSelectionClearedBound = this.onSelectionCleared.bind(this);
		this.onPointerDownBound = this.onPointerDown.bind(this);
		this.onPointerMoveBound = this.onPointerMove.bind(this);
		this.onPointerUpBound = this.onPointerUp.bind(this);

		// Listen to selection events
		this.edit.events.on(EditEvent.ClipSelected, this.onClipSelectedBound);
		this.edit.events.on(EditEvent.SelectionCleared, this.onSelectionClearedBound);
	}

	mount(parent: pixi.Container, app: pixi.Application): void {
		this.app = app;

		// Create outline
		this.container.addChild(this.outline);

		// Create corner handles
		const corners: CornerName[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
		for (const corner of corners) {
			const handle = new pixi.Graphics();
			handle.zIndex = 19;
			handle.eventMode = "static";
			this.handles.set(corner, handle);
			this.container.addChild(handle);
		}

		// Create edge handles (for players that support edge resize)
		const edges: EdgeDirection[] = ["top", "bottom", "left", "right"];
		for (const edge of edges) {
			const handle = new pixi.Graphics();
			handle.zIndex = 19;
			handle.eventMode = "static";
			this.edgeHandles.set(edge, handle);
			this.container.addChild(handle);
		}

		parent.addChild(this.container);
		parent.addChild(this.dimensionContainer);

		// Setup pointer events on the stage
		app.stage.on("pointerdown", this.onPointerDownBound);
		app.stage.on("globalpointermove", this.onPointerMoveBound);
		app.stage.on("pointerup", this.onPointerUpBound);
		app.stage.on("pointerupoutside", this.onPointerUpBound);
	}

	update(_deltaTime: number, _elapsed: number): void {
		// Sync position/scale with selected player each frame
		if (this.selectedPlayer) {
			this.syncToPlayer();
		}
	}

	draw(): void {
		if (!this.selectedPlayer || !this.selectedPlayer.isActive() || this.edit.isInExportMode()) {
			this.container.visible = false;
			return;
		}

		this.container.visible = true;
		this.drawOutline();
		this.drawHandles();
	}

	dispose(): void {
		this.edit.events.off(EditEvent.ClipSelected, this.onClipSelectedBound);
		this.edit.events.off(EditEvent.SelectionCleared, this.onSelectionClearedBound);

		if (this.app) {
			this.app.stage.off("pointerdown", this.onPointerDownBound);
			this.app.stage.off("globalpointermove", this.onPointerMoveBound);
			this.app.stage.off("pointerup", this.onPointerUpBound);
			this.app.stage.off("pointerupoutside", this.onPointerUpBound);
		}

		this.outline.destroy();
		for (const handle of this.handles.values()) {
			handle.destroy();
		}
		for (const handle of this.edgeHandles.values()) {
			handle.destroy();
		}
		this.container.destroy();
		this.dimensionLabel.destroy();
		this.dimensionBackground.destroy();
		this.dimensionContainer.destroy();
	}

	// ─── Selection Event Handlers ────────────────────────────────────────────────

	private onClipSelected({ trackIndex, clipIndex }: { trackIndex: number; clipIndex: number }): void {
		this.selectedPlayer = this.edit.getPlayerClip(trackIndex, clipIndex);
		this.selectedClipId = this.selectedPlayer?.clipId ?? null;
		this.selectedTrackIndex = trackIndex;
		this.selectedClipIndex = clipIndex;
	}

	private onSelectionCleared(): void {
		this.selectedPlayer = null;
		this.selectedClipId = null;
		this.selectedTrackIndex = -1;
		this.selectedClipIndex = -1;
		this.resetDragState();
	}

	// ─── Rendering ───────────────────────────────────────────────────────────────

	private syncToPlayer(): void {
		if (!this.selectedPlayer) return;

		const playerContainer = this.selectedPlayer.getContainer();

		// Match player's transform
		this.container.position.copyFrom(playerContainer.position);
		this.container.scale.copyFrom(playerContainer.scale);
		this.container.rotation = playerContainer.rotation;
		this.container.pivot.copyFrom(playerContainer.pivot);
	}

	private drawOutline(): void {
		if (!this.selectedPlayer) return;

		const size = this.selectedPlayer.getSize();
		const uiScale = this.getUIScale();
		const color = this.isHovering || this.isDragging ? SELECTION_CONSTANTS.ACTIVE_COLOR : SELECTION_CONSTANTS.DEFAULT_COLOR;

		this.outline.clear();
		this.outline.strokeStyle = { width: SELECTION_CONSTANTS.OUTLINE_WIDTH / uiScale, color };
		this.outline.rect(0, 0, size.width, size.height);
		this.outline.stroke();
	}

	private drawHandles(): void {
		if (!this.selectedPlayer) return;

		const size = this.selectedPlayer.getSize();
		const uiScale = this.getUIScale();
		const color = this.isHovering || this.isDragging ? SELECTION_CONSTANTS.ACTIVE_COLOR : SELECTION_CONSTANTS.DEFAULT_COLOR;
		const handleSize = (SELECTION_CONSTANTS.SCALE_HANDLE_RADIUS * 2) / uiScale;

		// Corner positions
		const positions: Record<CornerName, Vector> = {
			topLeft: { x: 0, y: 0 },
			topRight: { x: size.width, y: 0 },
			bottomRight: { x: size.width, y: size.height },
			bottomLeft: { x: 0, y: size.height }
		};

		const cornerRadius = 1 / uiScale; // Subtle softening

		for (const [corner, handle] of this.handles) {
			const pos = positions[corner];
			handle.clear();
			handle.fillStyle = { color };
			handle.roundRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize, cornerRadius);
			handle.fill();

			// Set cursor
			handle.cursor = this.getCornerResizeCursor(corner);
		}

		// Draw edge handles for players that support edge resize
		this.drawEdgeHandles(size, uiScale, color);
	}

	private drawEdgeHandles(size: { width: number; height: number }, uiScale: number, color: number): void {
		const supportsEdge = this.selectedPlayer?.supportsEdgeResize() ?? false;

		// Edge handle dimensions scaled for current zoom
		const barLength = EDGE_HANDLE_LENGTH / uiScale;
		const barThickness = EDGE_HANDLE_THICKNESS / uiScale;
		const borderRadius = barThickness / 2; // Pill-shaped rounded corners

		// Edge midpoint positions
		const edgePositions: Record<EdgeDirection, { x: number; y: number; isHorizontal: boolean }> = {
			top: { x: size.width / 2, y: 0, isHorizontal: true },
			bottom: { x: size.width / 2, y: size.height, isHorizontal: true },
			left: { x: 0, y: size.height / 2, isHorizontal: false },
			right: { x: size.width, y: size.height / 2, isHorizontal: false }
		};

		for (const [edge, handle] of this.edgeHandles) {
			handle.clear();

			// Hide edge handles if player doesn't support edge resize
			if (!supportsEdge) {
				handle.visible = false;
			} else {
				handle.visible = true;
				const pos = edgePositions[edge];

				if (pos.isHorizontal) {
					// Horizontal pill (top/bottom edges)
					const x = pos.x - barLength / 2;
					const y = pos.y - barThickness / 2;

					handle.fillStyle = { color };
					handle.roundRect(x, y, barLength, barThickness, borderRadius);
					handle.fill();
				} else {
					// Vertical pill (left/right edges)
					const x = pos.x - barThickness / 2;
					const y = pos.y - barLength / 2;

					handle.fillStyle = { color };
					handle.roundRect(x, y, barThickness, barLength, borderRadius);
					handle.fill();
				}

				// Set resize cursor
				const rotation = this.selectedPlayer?.getRotation() ?? 0;
				const baseAngle = CURSOR_BASE_ANGLES[edge] ?? 0;
				handle.cursor = buildResizeCursor(baseAngle + rotation);
			}
		}
	}

	private getUIScale(): number {
		if (!this.selectedPlayer) return 1;
		const playerScale = this.selectedPlayer.getScale();
		const canvasZoom = this.edit.getCanvasZoom();
		return playerScale * canvasZoom;
	}

	// ─── Pointer Event Handlers ──────────────────────────────────────────────────

	private onPointerDown(event: pixi.FederatedPointerEvent): void {
		if (event.button !== Pointer.ButtonLeftClick) return;
		if (!this.selectedPlayer) return;

		// Check if click is on selected player
		const playerContainer = this.selectedPlayer.getContainer();
		const localPoint = event.getLocalPosition(playerContainer);
		const size = this.selectedPlayer.getSize();

		// Store initial state for undo
		this.initialClipConfiguration = structuredClone(this.selectedPlayer.clipConfiguration);

		// Check for rotation zone (outside corners)
		const rotationCorner = this.getRotationCorner(localPoint, size);
		if (rotationCorner) {
			this.startRotation(event, rotationCorner);
			return;
		}

		// Check corner handles
		for (const [corner, handle] of this.handles) {
			if (handle.getBounds().containsPoint(event.globalX, event.globalY)) {
				this.startCornerResize(event, corner);
				return;
			}
		}

		// Check if inside player bounds for drag
		if (localPoint.x >= 0 && localPoint.x <= size.width && localPoint.y >= 0 && localPoint.y <= size.height) {
			// Check for edge resize first
			const hitZone = SELECTION_CONSTANTS.EDGE_HIT_ZONE / this.getUIScale();
			const edge = detectEdgeZone(localPoint, size, hitZone);
			if (edge && this.selectedPlayer.supportsEdgeResize()) {
				this.startEdgeResize(event, edge);
				return;
			}

			// Start position drag
			this.startDrag(event);
		}
	}

	private onPointerMove(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer) return;

		// Handle active drag operations
		if (this.scaleDirection) {
			this.handleCornerResize(event);
			return;
		}

		if (this.edgeDragDirection) {
			this.handleEdgeResize(event);
			return;
		}

		if (this.isRotating) {
			this.handleRotation(event);
			return;
		}

		if (this.isDragging) {
			this.handleDrag(event);
			return;
		}

		// Update hover state and cursor
		this.updateHoverState(event);
	}

	private onPointerUp(): void {
		if (!this.selectedPlayer) return;

		if (
			(this.isDragging || this.scaleDirection || this.edgeDragDirection || this.isRotating) &&
			this.finalDragState &&
			this.selectedClipId &&
			this.initialClipConfiguration
		) {
			// Construct final config from local state with deep merge
			const finalClip = structuredClone(this.initialClipConfiguration);

			// Deep merge for nested properties (transform, offset)
			if (this.finalDragState.transform) {
				finalClip.transform = {
					...finalClip.transform,
					...this.finalDragState.transform
				};
			}
			if (this.finalDragState.offset) {
				finalClip.offset = {
					...finalClip.offset,
					...this.finalDragState.offset
				};
			}
			// Shallow merge for flat properties (width, height)
			if (this.finalDragState.width !== undefined) finalClip.width = this.finalDragState.width;
			if (this.finalDragState.height !== undefined) finalClip.height = this.finalDragState.height;

			// Update SVG viewBox if this is an SVG clip resize
			if ((this.scaleDirection || this.edgeDragDirection) && finalClip.asset?.type === "svg") {
				const svgAsset = finalClip.asset as SvgAsset;
				if (svgAsset.src && finalClip.width && finalClip.height) {
					// Only manipulate simple rect-based SVGs (maintains toolbar compatibility)
					// Complex SVGs (paths, circles, etc.) are scaled by the renderer automatically
					if (isSimpleRectSvg(svgAsset.src)) {
						const updatedSrc = updateSvgViewBox(svgAsset.src, finalClip.width, finalClip.height);

						// Update document BEFORE commitClipUpdate (two-phase pattern)
						this.edit.updateClipInDocument(this.selectedClipId, {
							asset: { ...svgAsset, src: updatedSrc }
						});
						this.edit.resolveClip(this.selectedClipId);
					}
				}
			}

			// Commit with explicit final state (adds to history, doesn't execute)
			this.edit.commitClipUpdate(this.selectedClipId, this.initialClipConfiguration, finalClip);

			// Notify player if dimensions changed (corner or edge resize)
			if ((this.scaleDirection || this.edgeDragDirection) && this.selectedPlayer) {
				this.selectedPlayer.notifyDimensionsChanged();
			}
		}

		this.finalDragState = null; // Clear final state
		this.resetDragState();
		this.edit.clearAlignmentGuides();
	}

	// ─── Drag Operations ─────────────────────────────────────────────────────────

	private startDrag(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer) return;

		this.isDragging = true;
		const viewportContainer = this.edit.getViewportContainer();
		const timelinePoint = event.getLocalPosition(viewportContainer);
		const playerPos = this.selectedPlayer.getContainer().position;

		this.dragOffset = {
			x: timelinePoint.x - playerPos.x,
			y: timelinePoint.y - playerPos.y
		};
	}

	private handleDrag(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer || !this.selectedClipId) return;

		const viewportContainer = this.edit.getViewportContainer();
		const timelinePoint = event.getLocalPosition(viewportContainer);
		const pivot = this.selectedPlayer.getPivot();

		const cursorPosition: Vector = {
			x: timelinePoint.x - this.dragOffset.x,
			y: timelinePoint.y - this.dragOffset.y
		};
		const rawPosition: Vector = {
			x: cursorPosition.x - pivot.x,
			y: cursorPosition.y - pivot.y
		};

		// Clear and recalculate snap guides
		this.edit.clearAlignmentGuides();

		const otherPlayers = this.edit.getActivePlayersExcept(this.selectedPlayer);
		const otherClipBounds: ClipBounds[] = otherPlayers.map(other => {
			const pos = other.getContainer().position;
			const size = other.getSize();
			return createClipBounds({ x: pos.x, y: pos.y }, size);
		});

		const snapContext = createSnapContext(this.selectedPlayer.getSize(), this.edit.size, otherClipBounds);
		const snapResult = snap(rawPosition, snapContext);

		// Draw alignment guides
		for (const guide of snapResult.guides) {
			this.edit.showAlignmentGuide(guide.type, guide.axis, guide.position, guide.bounds);
		}

		// Calculate new offset position
		const size = this.selectedPlayer.getSize();
		const position = this.selectedPlayer.clipConfiguration.position ?? "center";
		const updatedRelative = absoluteToRelative(this.edit.size, size, position, snapResult.position);

		// Store final state locally
		this.finalDragState = {
			offset: { x: updatedRelative.x, y: updatedRelative.y }
		};

		// Document-first: Update document, then resolve
		this.edit.updateClipInDocument(this.selectedClipId, {
			offset: { x: updatedRelative.x, y: updatedRelative.y }
		});
		this.edit.resolveClip(this.selectedClipId);
	}

	private startCornerResize(event: pixi.FederatedPointerEvent, corner: ScaleDirection): void {
		if (!this.selectedPlayer) return;

		this.scaleDirection = corner;
		const timelinePoint = event.getLocalPosition(this.edit.getViewportContainer());
		this.edgeDragStart = timelinePoint;

		this.captureOriginalDimensions();
	}

	private handleCornerResize(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer || !this.selectedClipId || !this.scaleDirection || !this.originalDimensions) return;

		const timelinePoint = event.getLocalPosition(this.edit.getViewportContainer());
		const delta = {
			x: timelinePoint.x - this.edgeDragStart.x,
			y: timelinePoint.y - this.edgeDragStart.y
		};

		const result = calculateCornerScale(this.scaleDirection, delta, this.originalDimensions, this.edit.size);
		const clamped = clampDimensions(result.width, result.height);
		const rounded = roundDimensions(clamped.width, clamped.height);

		// Store final state locally
		this.finalDragState = {
			width: rounded.width,
			height: rounded.height,
			offset: { x: result.offsetX, y: result.offsetY }
		};

		// Document-first: Update document, then resolve
		this.edit.updateClipInDocument(this.selectedClipId, {
			width: rounded.width,
			height: rounded.height,
			offset: { x: result.offsetX, y: result.offsetY }
		});
		this.edit.resolveClip(this.selectedClipId);

		this.showDimensionLabel(rounded.width, rounded.height);
	}

	private startEdgeResize(event: pixi.FederatedPointerEvent, edge: EdgeDirection): void {
		if (!this.selectedPlayer) return;

		this.edgeDragDirection = edge;
		const timelinePoint = event.getLocalPosition(this.edit.getViewportContainer());
		this.edgeDragStart = timelinePoint;

		this.captureOriginalDimensions();
	}

	private handleEdgeResize(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer || !this.selectedClipId || !this.edgeDragDirection || !this.originalDimensions) return;

		const timelinePoint = event.getLocalPosition(this.edit.getViewportContainer());
		const delta = {
			x: timelinePoint.x - this.edgeDragStart.x,
			y: timelinePoint.y - this.edgeDragStart.y
		};

		const result = calculateEdgeResize(this.edgeDragDirection, delta, this.originalDimensions, this.edit.size);
		const clamped = clampDimensions(result.width, result.height);
		const rounded = roundDimensions(clamped.width, clamped.height);

		// Store final state locally
		this.finalDragState = {
			width: rounded.width,
			height: rounded.height,
			offset: { x: result.offsetX, y: result.offsetY }
		};

		// Document-first: Update document, then resolve
		this.edit.updateClipInDocument(this.selectedClipId, {
			width: rounded.width,
			height: rounded.height,
			offset: { x: result.offsetX, y: result.offsetY }
		});
		this.edit.resolveClip(this.selectedClipId);

		this.showDimensionLabel(rounded.width, rounded.height);
	}

	private startRotation(event: pixi.FederatedPointerEvent, corner: CornerName): void {
		if (!this.selectedPlayer) return;

		this.isRotating = true;
		this.rotationCorner = corner;

		const center = this.getContentCenter();
		this.rotationStart = Math.atan2(event.globalY - center.y, event.globalX - center.x);
		this.initialRotation = this.selectedPlayer.getRotation();
	}

	private handleRotation(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer || !this.selectedClipId || this.rotationStart === null) return;

		const center = this.getContentCenter();
		const currentAngle = Math.atan2(event.globalY - center.y, event.globalX - center.x);
		const deltaAngle = (currentAngle - this.rotationStart) * (180 / Math.PI);

		const rawRotation = this.initialRotation + deltaAngle;
		const { angle: snappedRotation } = snapRotation(rawRotation);

		// Get current transform to preserve other properties (scale, etc.)
		const currentTransform = this.selectedPlayer.clipConfiguration.transform ?? {};

		// Store final state locally
		this.finalDragState = {
			transform: {
				...currentTransform,
				rotate: { angle: snappedRotation }
			}
		};

		// Document-first: Update document, then resolve
		this.edit.updateClipInDocument(this.selectedClipId, {
			transform: {
				...currentTransform,
				rotate: { angle: snappedRotation }
			}
		});
		this.edit.resolveClip(this.selectedClipId);
	}

	// ─── Dimension Label ────────────────────────────────────────────────────────

	private showDimensionLabel(width: number, height: number): void {
		if (!this.selectedPlayer) return;

		// Update text
		this.dimensionLabel.text = `${width} \u00d7 ${height}`;

		// Redraw background pill to fit text
		const textWidth = this.dimensionLabel.width;
		const textHeight = this.dimensionLabel.height;
		const pillWidth = textWidth + DIMENSION_PADDING_X * 2;
		const pillHeight = textHeight + DIMENSION_PADDING_Y * 2;

		this.dimensionBackground.clear();
		this.dimensionBackground.fillStyle = { color: 0x000000, alpha: 0.7 };
		this.dimensionBackground.roundRect(0, 0, pillWidth, pillHeight, pillHeight / 2);
		this.dimensionBackground.fill();

		this.dimensionLabel.position.set(DIMENSION_PADDING_X, DIMENSION_PADDING_Y);

		// Position at bottom-center of clip in overlay-parent space.
		// The clip's container is rotated/scaled, so transform the bottom-center
		// point through the worldTransform to get a screen-axis-aligned position.
		const playerContainer = this.selectedPlayer.getContainer();
		const size = this.selectedPlayer.getSize();
		const bottomCenter = playerContainer.toGlobal({ x: size.width / 2, y: size.height });

		// Convert from global to the overlay parent's local space
		const overlayParent = this.dimensionContainer.parent;
		const local = overlayParent ? overlayParent.toLocal(bottomCenter) : bottomCenter;

		// Account for canvas zoom so the gap is constant screen-space pixels
		const canvasZoom = this.edit.getCanvasZoom();
		this.dimensionContainer.position.set(local.x - pillWidth / 2, local.y + DIMENSION_GAP / canvasZoom);

		this.dimensionContainer.scale.set(1 / canvasZoom);
		this.dimensionContainer.visible = true;
	}

	private hideDimensionLabel(): void {
		this.dimensionContainer.visible = false;
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	private captureOriginalDimensions(): void {
		if (!this.selectedPlayer || !this.selectedClipId) return;

		const config = this.selectedPlayer.clipConfiguration;
		let width: number;
		let height: number;

		if (config.width && config.height) {
			width = config.width;
			height = config.height;
		} else {
			// Use canvas size to preserve visual appearance (clips without explicit dimensions fill the canvas)
			width = this.edit.size.width;
			height = this.edit.size.height;

			// Document-first: Update document, then resolve
			this.edit.updateClipInDocument(this.selectedClipId, { width, height });
			this.edit.resolveClip(this.selectedClipId);
		}

		const currentOffsetX = config.offset?.x ?? 0;
		const currentOffsetY = config.offset?.y ?? 0;

		this.originalDimensions = {
			width,
			height,
			offsetX: typeof currentOffsetX === "number" ? currentOffsetX : 0,
			offsetY: typeof currentOffsetY === "number" ? currentOffsetY : 0
		};
	}

	private getContentCenter(): Vector {
		if (!this.selectedPlayer) return { x: 0, y: 0 };
		const bounds = this.selectedPlayer.getContentContainer().getBounds();
		return {
			x: bounds.x + bounds.width / 2,
			y: bounds.y + bounds.height / 2
		};
	}

	private getRotationCorner(localPoint: Vector, size: { width: number; height: number }): CornerName | null {
		// Rotation zones only active outside content bounds
		if (localPoint.x >= 0 && localPoint.x <= size.width && localPoint.y >= 0 && localPoint.y <= size.height) {
			return null;
		}

		const uiScale = this.getUIScale();
		const handleRadius = SELECTION_CONSTANTS.SCALE_HANDLE_RADIUS / uiScale;
		const rotationZone = SELECTION_CONSTANTS.ROTATION_HIT_ZONE / uiScale;

		const corners = [
			{ x: 0, y: 0 },
			{ x: size.width, y: 0 },
			{ x: size.width, y: size.height },
			{ x: 0, y: size.height }
		];

		return detectCornerZone(localPoint, corners, handleRadius, rotationZone);
	}

	private getCornerResizeCursor(corner: string): string {
		const rotation = this.selectedPlayer?.getRotation() ?? 0;
		const baseAngle = CURSOR_BASE_ANGLES[`${corner}Resize`] ?? 45;
		return buildResizeCursor(baseAngle + rotation);
	}

	private updateHoverState(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer) {
			this.isHovering = false;
			return;
		}

		const playerContainer = this.selectedPlayer.getContainer();
		const localPoint = event.getLocalPosition(playerContainer);
		const size = this.selectedPlayer.getSize();

		this.isHovering = localPoint.x >= 0 && localPoint.x <= size.width && localPoint.y >= 0 && localPoint.y <= size.height;

		// Update cursor for edge resize zones
		if (this.selectedPlayer.supportsEdgeResize()) {
			const hitZone = SELECTION_CONSTANTS.EDGE_HIT_ZONE / this.getUIScale();
			const edge = detectEdgeZone(localPoint, size, hitZone);

			if (edge) {
				const rotation = this.selectedPlayer.getRotation() ?? 0;
				const baseAngle = CURSOR_BASE_ANGLES[edge] ?? 0;
				this.outline.cursor = buildResizeCursor(baseAngle + rotation);
				return;
			}
		}

		// Reset cursor when not over an edge
		this.outline.cursor = this.isHovering ? "move" : "default";
	}

	private resetDragState(): void {
		this.isDragging = false;
		this.dragOffset = { x: 0, y: 0 };
		this.scaleDirection = null;
		this.edgeDragDirection = null;
		this.edgeDragStart = { x: 0, y: 0 };
		this.originalDimensions = null;
		this.isRotating = false;
		this.rotationStart = null;
		this.rotationCorner = null;
		this.initialClipConfiguration = null;
		this.hideDimensionLabel();
	}
}
