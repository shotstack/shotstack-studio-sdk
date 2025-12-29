import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import { calculateCornerScale, calculateEdgeResize, clampDimensions, detectCornerZone, detectEdgeZone } from "@core/interaction/clip-interaction";
import { SELECTION_CONSTANTS, CURSOR_BASE_ANGLES, type CornerName, buildResizeCursor } from "@core/interaction/selection-overlay";
import { type ClipBounds, createClipBounds, createSnapContext, snap, snapRotation } from "@core/interaction/snap-system";
import { Pointer } from "@inputs/pointer";
import type { Vector } from "@layouts/geometry";
import { PositionBuilder } from "@layouts/position-builder";
import type { ResolvedClip } from "@schemas";
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
export class SelectionHandles implements CanvasOverlayRegistration {
	private container: pixi.Container;
	private outline: pixi.Graphics;
	private handles: Map<CornerName, pixi.Graphics>;
	private app: pixi.Application | null = null;
	private positionBuilder: PositionBuilder;

	// Selection state
	private selectedPlayer: Player | null = null;
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

	// Bound event handlers for cleanup
	private onClipSelectedBound: (payload: { trackIndex: number; clipIndex: number }) => void;
	private onSelectionClearedBound: () => void;
	private onPointerDownBound: (event: pixi.FederatedPointerEvent) => void;
	private onPointerMoveBound: (event: pixi.FederatedPointerEvent) => void;
	private onPointerUpBound: () => void;

	constructor(private edit: Edit) {
		this.container = new pixi.Container();
		this.container.zIndex = 1000;
		this.container.sortableChildren = true;

		this.outline = new pixi.Graphics();
		this.handles = new Map();

		this.positionBuilder = new PositionBuilder(edit.size);

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
			handle.zIndex = 1001;
			handle.eventMode = "static";
			this.handles.set(corner, handle);
			this.container.addChild(handle);
		}

		parent.addChild(this.container);

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
		this.container.destroy();
	}

	// ─── Selection Event Handlers ────────────────────────────────────────────────

	private onClipSelected({ trackIndex, clipIndex }: { trackIndex: number; clipIndex: number }): void {
		this.selectedPlayer = this.edit.getPlayerClip(trackIndex, clipIndex);
		this.selectedTrackIndex = trackIndex;
		this.selectedClipIndex = clipIndex;
	}

	private onSelectionCleared(): void {
		this.selectedPlayer = null;
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

		for (const [corner, handle] of this.handles) {
			const pos = positions[corner];
			handle.clear();
			handle.fillStyle = { color };
			handle.rect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
			handle.fill();

			// Set cursor
			handle.cursor = this.getCornerResizeCursor(corner);
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

		const hasChanged = this.hasStateChanged();
		if ((this.isDragging || this.scaleDirection || this.edgeDragDirection || this.isRotating) && hasChanged) {
			this.edit.setUpdatedClip(this.selectedPlayer, this.initialClipConfiguration, structuredClone(this.selectedPlayer.clipConfiguration));
		}

		this.resetDragState();
		this.edit.clearAlignmentGuides();
	}

	// ─── Drag Operations ─────────────────────────────────────────────────────────

	private startDrag(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer) return;

		this.isDragging = true;
		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		const playerPos = this.selectedPlayer.getContainer().position;

		this.dragOffset = {
			x: timelinePoint.x - playerPos.x,
			y: timelinePoint.y - playerPos.y
		};
	}

	private handleDrag(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer) return;

		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
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

		// Apply position
		const size = this.selectedPlayer.getSize();
		const position = this.selectedPlayer.clipConfiguration.position ?? "center";
		const updatedRelative = this.positionBuilder.absoluteToRelative(size, position, snapResult.position);

		if (!this.selectedPlayer.clipConfiguration.offset) {
			this.selectedPlayer.clipConfiguration.offset = { x: 0, y: 0 };
		}
		this.selectedPlayer.clipConfiguration.offset.x = updatedRelative.x;
		this.selectedPlayer.clipConfiguration.offset.y = updatedRelative.y;

		// Rebuild keyframes
		this.selectedPlayer.reconfigureAfterRestore();
	}

	private startCornerResize(event: pixi.FederatedPointerEvent, corner: ScaleDirection): void {
		if (!this.selectedPlayer) return;

		this.scaleDirection = corner;
		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		this.edgeDragStart = timelinePoint;

		this.captureOriginalDimensions();
	}

	private handleCornerResize(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer || !this.scaleDirection || !this.originalDimensions) return;

		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		const delta = {
			x: timelinePoint.x - this.edgeDragStart.x,
			y: timelinePoint.y - this.edgeDragStart.y
		};

		const result = calculateCornerScale(this.scaleDirection, delta, this.originalDimensions, this.edit.size);
		const clamped = clampDimensions(result.width, result.height);

		this.selectedPlayer.clipConfiguration.width = clamped.width;
		this.selectedPlayer.clipConfiguration.height = clamped.height;

		if (!this.selectedPlayer.clipConfiguration.offset) {
			this.selectedPlayer.clipConfiguration.offset = { x: 0, y: 0 };
		}
		this.selectedPlayer.clipConfiguration.offset.x = result.offsetX;
		this.selectedPlayer.clipConfiguration.offset.y = result.offsetY;

		this.selectedPlayer.reconfigureAfterRestore();
		this.selectedPlayer.notifyDimensionsChanged();
	}

	private startEdgeResize(event: pixi.FederatedPointerEvent, edge: EdgeDirection): void {
		if (!this.selectedPlayer) return;

		this.edgeDragDirection = edge;
		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		this.edgeDragStart = timelinePoint;

		this.captureOriginalDimensions();
	}

	private handleEdgeResize(event: pixi.FederatedPointerEvent): void {
		if (!this.selectedPlayer || !this.edgeDragDirection || !this.originalDimensions) return;

		const timelinePoint = event.getLocalPosition(this.edit.getContainer());
		const delta = {
			x: timelinePoint.x - this.edgeDragStart.x,
			y: timelinePoint.y - this.edgeDragStart.y
		};

		const result = calculateEdgeResize(this.edgeDragDirection, delta, this.originalDimensions, this.edit.size);
		const clamped = clampDimensions(result.width, result.height);

		this.selectedPlayer.clipConfiguration.width = Math.round(clamped.width);
		this.selectedPlayer.clipConfiguration.height = Math.round(clamped.height);

		if (!this.selectedPlayer.clipConfiguration.offset) {
			this.selectedPlayer.clipConfiguration.offset = { x: 0, y: 0 };
		}
		this.selectedPlayer.clipConfiguration.offset.x = result.offsetX;
		this.selectedPlayer.clipConfiguration.offset.y = result.offsetY;

		this.selectedPlayer.reconfigureAfterRestore();
		this.selectedPlayer.notifyDimensionsChanged();
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
		if (!this.selectedPlayer || this.rotationStart === null) return;

		const center = this.getContentCenter();
		const currentAngle = Math.atan2(event.globalY - center.y, event.globalX - center.x);
		const deltaAngle = (currentAngle - this.rotationStart) * (180 / Math.PI);

		const rawRotation = this.initialRotation + deltaAngle;
		const { angle: snappedRotation } = snapRotation(rawRotation);

		this.selectedPlayer.clipConfiguration.transform = {
			...this.selectedPlayer.clipConfiguration.transform,
			rotate: { angle: snappedRotation }
		};

		this.selectedPlayer.reconfigureAfterRestore();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	private captureOriginalDimensions(): void {
		if (!this.selectedPlayer) return;

		const config = this.selectedPlayer.clipConfiguration;
		let width: number;
		let height: number;

		if (config.width && config.height) {
			width = config.width;
			height = config.height;
		} else {
			const contentSize = this.selectedPlayer.getContentSize();
			const scale = this.selectedPlayer.getScale();
			width = contentSize.width * scale;
			height = contentSize.height * scale;
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
	}

	private hasStateChanged(): boolean {
		if (!this.selectedPlayer || !this.initialClipConfiguration) return false;

		const current = this.selectedPlayer.clipConfiguration;
		const initial = this.initialClipConfiguration as typeof current;

		const currentOffsetX = current.offset?.x;
		const currentOffsetY = current.offset?.y;
		const currentRotation = current.transform?.rotate?.angle ?? 0;

		const initialOffsetX = initial.offset?.x;
		const initialOffsetY = initial.offset?.y;
		const initialRotation = initial.transform?.rotate?.angle ?? 0;

		return (
			currentOffsetX !== initialOffsetX ||
			currentOffsetY !== initialOffsetY ||
			currentRotation !== initialRotation ||
			current.width !== initial.width ||
			current.height !== initial.height
		);
	}
}
