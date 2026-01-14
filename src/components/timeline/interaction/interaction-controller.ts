import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { MoveClipWithPushCommand } from "@core/commands/move-clip-with-push-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import type { ClipState, TimelineInteractionConfig } from "@timeline/timeline.types";
import { getTrackHeight } from "@timeline/timeline.types";

import { TimelineStateManager } from "../core/state/timeline-state";

import {
	type ClipRef,
	type CollisionResult,
	type DragTarget,
	type SnapPoint,
	buildSnapPoints,
	buildTrackYPositions,
	exceedsDragThreshold,
	findContentClipAtPosition,
	findNearestSnapPoint,
	formatDragTime,
	getDragTargetAtY,
	getTrackYPosition,
	pixelsToSeconds,
	resolveClipCollision,
	secondsToPixels
} from "./interaction-calculations";

/** Point coordinates */
interface Point {
	x: number;
	y: number;
}

/** Interaction state machine */
type InteractionState =
	| { type: "idle" }
	| { type: "pending"; startPoint: Point; clipRef: ClipRef; originalTime: number }
	| {
			type: "dragging";
			clipRef: ClipRef;
			clipElement: HTMLElement; // Original clip element (follows mouse)
			ghost: HTMLElement; // Drop preview (shows snap target)
			startTime: number;
			originalTrack: number;
			dragTarget: DragTarget;
			dragOffsetX: number; // Pixel offset from clip left edge to mouse
			dragOffsetY: number; // Pixel offset from clip top to mouse
			originalStyles: { position: string; left: string; top: string; zIndex: string; pointerEvents: string };
			draggedClipLength: number; // Length of the clip being dragged
			collisionResult: CollisionResult; // Current collision resolution
			altKeyHeld: boolean; // Alt/Option key held for mask attachment mode
	  }
	| { type: "resizing"; clipRef: ClipRef; edge: "left" | "right"; originalStart: number; originalLength: number; clipElement: HTMLElement };

/** Resolved config type - numeric properties required, callback optional */
type ResolvedConfig = Required<Omit<TimelineInteractionConfig, "onRequestRender">> & Pick<TimelineInteractionConfig, "onRequestRender">;

/** Configuration defaults */
const DEFAULT_CONFIG: ResolvedConfig = {
	dragThreshold: 3,
	snapThreshold: 10,
	resizeZone: 12
};

/** Controller for timeline interactions (drag, resize, selection) */
export class InteractionController {
	private state: InteractionState = { type: "idle" };
	private readonly config: ResolvedConfig;
	private snapPoints: SnapPoint[] = [];

	// DOM references
	private readonly feedbackLayer: HTMLElement;
	private snapLine: HTMLElement | null = null;
	private dragGhost: HTMLElement | null = null;
	private dropZone: HTMLElement | null = null;
	private dragTimeTooltip: HTMLElement | null = null;

	// Luma drag state
	private lumaTargetClipElement: HTMLElement | null = null;
	private lumaConnectionLine: HTMLElement | null = null;

	private trackYCache: number[] | null = null;

	// Bound handlers for cleanup
	private readonly handlePointerDown: (e: PointerEvent) => void;
	private readonly handlePointerMove: (e: PointerEvent) => void;
	private readonly handlePointerUp: (e: PointerEvent) => void;

	constructor(
		private readonly edit: Edit,
		private readonly stateManager: TimelineStateManager,
		private readonly tracksContainer: HTMLElement,
		feedbackLayer: HTMLElement,
		config?: Partial<TimelineInteractionConfig>
	) {
		this.feedbackLayer = feedbackLayer;
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Bind handlers
		this.handlePointerDown = this.onPointerDown.bind(this);
		this.handlePointerMove = this.onPointerMove.bind(this);
		this.handlePointerUp = this.onPointerUp.bind(this);

		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.tracksContainer.addEventListener("pointerdown", this.handlePointerDown);
		document.addEventListener("pointermove", this.handlePointerMove);
		document.addEventListener("pointerup", this.handlePointerUp);
	}

	private onPointerDown(e: PointerEvent): void {
		const target = e.target as HTMLElement;

		// Find clip element
		const clipEl = target.closest(".ss-clip") as HTMLElement;
		if (!clipEl) {
			// Click on empty space - clear selection
			this.stateManager.clearSelection();
			return;
		}

		const trackIndex = parseInt(clipEl.dataset["trackIndex"] || "0", 10);
		const clipIndex = parseInt(clipEl.dataset["clipIndex"] || "0", 10);

		// Check if clicking on resize handle
		if (target.classList.contains("ss-clip-resize-handle")) {
			const edge = target.classList.contains("left") ? "left" : "right";
			this.startResize(e, { trackIndex, clipIndex }, edge);
			return;
		}

		// Start potential drag
		this.startPending(e, { trackIndex, clipIndex });
	}

	private startPending(e: PointerEvent, clipRef: ClipRef): void {
		const clip = this.stateManager.getClipAt(clipRef.trackIndex, clipRef.clipIndex);
		if (!clip) return;

		this.state = {
			type: "pending",
			startPoint: { x: e.clientX, y: e.clientY },
			clipRef,
			originalTime: clip.config.start
		};
	}

	private startResize(e: PointerEvent, clipRef: ClipRef, edge: "left" | "right"): void {
		const clip = this.stateManager.getClipAt(clipRef.trackIndex, clipRef.clipIndex);
		if (!clip) return;

		// Cache clip element to avoid querySelector on every mouse move
		const clipElement = this.tracksContainer.querySelector(
			`[data-track-index="${clipRef.trackIndex}"][data-clip-index="${clipRef.clipIndex}"]`
		) as HTMLElement | null;
		if (!clipElement) return;

		this.trackYCache = null;

		this.state = {
			type: "resizing",
			clipRef,
			edge,
			originalStart: clip.config.start,
			originalLength: clip.config.length,
			clipElement
		};

		this.buildSnapPointsForClip(clipRef);

		e.preventDefault();
	}

	private onPointerMove(e: PointerEvent): void {
		switch (this.state.type) {
			case "pending":
				this.handlePendingMove(e);
				break;
			case "dragging":
				this.handleDragMove(e);
				break;
			case "resizing":
				this.handleResizeMove(e);
				break;
			default:
				break;
		}
	}

	private handlePendingMove(e: PointerEvent): void {
		if (this.state.type !== "pending") return;

		const dx = e.clientX - this.state.startPoint.x;
		const dy = e.clientY - this.state.startPoint.y;

		if (exceedsDragThreshold(dx, dy, this.config.dragThreshold)) {
			this.transitionToDragging(e);
		}
	}

	private transitionToDragging(e: PointerEvent): void {
		if (this.state.type !== "pending") return;

		this.trackYCache = null;

		const { clipRef, originalTime } = this.state;
		const clip = this.stateManager.getClipAt(clipRef.trackIndex, clipRef.clipIndex);
		if (!clip) {
			this.state = { type: "idle" };
			return;
		}

		// Find the actual clip DOM element
		const clipElement = this.tracksContainer.querySelector(
			`[data-track-index="${clipRef.trackIndex}"][data-clip-index="${clipRef.clipIndex}"]`
		) as HTMLElement | null;
		if (!clipElement) {
			this.state = { type: "idle" };
			return;
		}

		// Store original styles for restoration later
		const originalStyles = {
			position: clipElement.style.position,
			left: clipElement.style.left,
			top: clipElement.style.top,
			zIndex: clipElement.style.zIndex,
			pointerEvents: clipElement.style.pointerEvents
		};

		// Get clip element's current screen position
		const clipRect = clipElement.getBoundingClientRect();

		// Calculate drag offsets - distance from mouse to clip's top-left corner
		const dragOffsetX = e.clientX - clipRect.left;
		const dragOffsetY = e.clientY - clipRect.top;

		// Make clip element follow mouse with position: fixed
		clipElement.style.position = "fixed";
		clipElement.style.left = `${clipRect.left}px`;
		clipElement.style.top = `${clipRect.top}px`;
		clipElement.style.width = `${clipRect.width}px`;
		clipElement.style.height = `${clipRect.height}px`;
		clipElement.style.zIndex = "1000";
		clipElement.style.pointerEvents = "none";

		// Create ghost as drop preview (shows where clip will land)
		const ghost = this.createDragGhost(clip, clipRef.trackIndex);
		this.feedbackLayer.appendChild(ghost);

		const pps = this.stateManager.getViewport().pixelsPerSecond;

		this.state = {
			type: "dragging",
			clipRef,
			clipElement,
			ghost,
			startTime: originalTime,
			originalTrack: clipRef.trackIndex,
			dragTarget: { type: "track", trackIndex: clipRef.trackIndex },
			dragOffsetX,
			dragOffsetY,
			originalStyles,
			draggedClipLength: clip.config.length,
			collisionResult: { newStartTime: originalTime, pushOffset: 0 },
			altKeyHeld: e.altKey
		};

		// Position ghost at current clip position initially
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();
		ghost.style.left = `${clip.config.start * pps}px`;
		ghost.style.top = `${this.getTrackYPositionCached(clipRef.trackIndex) + 4 + tracksOffset}px`;

		this.buildSnapPointsForClip(clipRef);
	}

	private createDragGhost(clip: ClipState, trackIndex: number): HTMLElement {
		const ghost = document.createElement("div");
		ghost.className = "ss-drag-ghost ss-clip";
		const clipAssetType = clip.config.asset?.type || "unknown";
		ghost.dataset["assetType"] = clipAssetType;

		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const width = clip.config.length * pps;
		const track = this.stateManager.getTracks()[trackIndex];
		const trackAssetType = track?.primaryAssetType ?? clipAssetType;
		const trackHeight = getTrackHeight(trackAssetType);

		ghost.style.width = `${width}px`;
		ghost.style.height = `${trackHeight - 8}px`; // Track height - padding
		ghost.style.position = "absolute";
		ghost.style.pointerEvents = "none";
		ghost.style.opacity = "0.8";

		return ghost;
	}

	private handleDragMove(e: PointerEvent): void {
		if (this.state.type !== "dragging") return;

		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const scrollY = this.tracksContainer.scrollTop;
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		// Move the actual clip element freely with the mouse (position: fixed)
		this.state.clipElement.style.left = `${e.clientX - this.state.dragOffsetX}px`;
		this.state.clipElement.style.top = `${e.clientY - this.state.dragOffsetY}px`;

		// Mouse position in content space (for calculating target position)
		const mouseX = e.clientX - rect.left + scrollX;
		const mouseY = e.clientY - rect.top + scrollY;

		// Calculate clip position from mouse (accounting for drag offset in content space)
		const clipX = mouseX - this.state.dragOffsetX;
		let clipTime = Math.max(0, clipX / pps);

		// Determine drag target based on mouse Y
		const dragTarget = this.getDragTargetAtYPosition(mouseY);
		this.state.dragTarget = dragTarget;

		// Apply snapping to clip time
		const snappedTime = this.applySnap(clipTime);
		if (snappedTime !== null) {
			clipTime = snappedTime;
			this.showSnapLine(clipTime);
		} else {
			this.hideSnapLine();
		}

		// Get offset for positioning in feedback layer (accounts for ruler height)
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();

		// Apply collision detection for track targets (skip for luma/image/video when attaching)
		if (dragTarget.type === "track") {
			const draggedClip = this.stateManager.getClipAt(this.state.clipRef.trackIndex, this.state.clipRef.clipIndex);
			const draggedAssetType = draggedClip?.config.asset?.type;
			const canAttachAsLuma = draggedAssetType === "luma" || draggedAssetType === "image" || draggedAssetType === "video";

			if (canAttachAsLuma) {
				// Update Alt key state during drag (user can press/release Alt while dragging)
				this.state.altKeyHeld = e.altKey;

				// Find target content clip (excluding self for image/video)
				const targetClip = this.findContentClipAtPositionOnTrack(dragTarget.trackIndex, clipTime, this.state.clipRef);

				// Alt key enables mask attachment mode
				if (targetClip && e.altKey) {
					const existingLumaRef = this.stateManager.findAttachedLuma(dragTarget.trackIndex, targetClip.clipIndex);
					const isDraggingSameLuma =
						existingLumaRef &&
						existingLumaRef.clipIndex === this.state.clipRef.clipIndex &&
						existingLumaRef.trackIndex === this.state.clipRef.trackIndex;

					if (existingLumaRef && !isDraggingSameLuma) {
						this.clearLumaDragFeedback();
						if (draggedAssetType === "luma") {
							this.state.collisionResult = { newStartTime: clipTime, pushOffset: 0 };
						} else {
							const collisionResult = this.resolveClipCollisionOnTrack(
								dragTarget.trackIndex,
								clipTime,
								this.state.draggedClipLength,
								this.state.clipRef
							);
							clipTime = collisionResult.newStartTime;
							this.state.collisionResult = collisionResult;
						}
					} else {
						// Mask mode: show UI and snap to target
						this.updateLumaTargetHighlight(targetClip, dragTarget.trackIndex, tracksOffset);
						clipTime = targetClip.config.start;
						this.state.collisionResult = { newStartTime: clipTime, pushOffset: 0 };
					}
				} else {
					// Normal mode: clear feedback and use collision detection
					this.clearLumaDragFeedback();
					if (draggedAssetType === "luma") {
						// Luma clips overlay freely (no collision)
						this.state.collisionResult = { newStartTime: clipTime, pushOffset: 0 };
					} else {
						// Image/video use normal collision detection
						const collisionResult = this.resolveClipCollisionOnTrack(
							dragTarget.trackIndex,
							clipTime,
							this.state.draggedClipLength,
							this.state.clipRef
						);
						clipTime = collisionResult.newStartTime;
						this.state.collisionResult = collisionResult;
					}
				}
			} else {
				const collisionResult = this.resolveClipCollisionOnTrack(dragTarget.trackIndex, clipTime, this.state.draggedClipLength, this.state.clipRef);
				clipTime = collisionResult.newStartTime;
				this.state.collisionResult = collisionResult;
			}
		} else {
			// No collision for insertion targets (new track)
			this.state.collisionResult = { newStartTime: clipTime, pushOffset: 0 };
			// Clear luma target highlight when not over a track
			this.clearLumaDragFeedback();
		}

		// Position ghost and drop zone based on target type
		if (dragTarget.type === "track") {
			// Show ghost for track targets
			this.state.ghost.style.display = "block";
			const tracks = this.stateManager.getTracks();
			const targetTrackY = this.getTrackYPositionCached(dragTarget.trackIndex) + 4; // +4 for clip padding
			const targetTrack = tracks[dragTarget.trackIndex];
			const targetHeight = getTrackHeight(targetTrack?.primaryAssetType ?? "default") - 8;

			this.state.ghost.style.left = `${clipTime * pps}px`;
			this.state.ghost.style.top = `${targetTrackY + tracksOffset}px`;
			this.state.ghost.style.height = `${targetHeight}px`;

			this.showDragTimeTooltip(clipTime, clipTime * pps, targetTrackY + tracksOffset);
			this.hideDropZone();
		} else {
			// Hide ghost for insertion targets - drop zone indicator is sufficient
			this.state.ghost.style.display = "none";
			this.showDropZone(dragTarget.insertionIndex);
		}
	}

	private handleResizeMove(e: PointerEvent): void {
		if (this.state.type !== "resizing") return;

		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		const x = e.clientX - rect.left + scrollX;
		let time = Math.max(0, x / pps);

		// Apply snapping
		const snappedTime = this.applySnap(time);
		if (snappedTime !== null) {
			time = snappedTime;
			this.showSnapLine(time);
		} else {
			this.hideSnapLine();
		}

		// Calculate new dimensions based on edge
		const { edge, originalStart, originalLength, clipElement } = this.state;

		if (edge === "left") {
			// Resize from left edge (keep end fixed, change start and length)
			const originalEnd = originalStart + originalLength;
			const newStart = Math.max(0, Math.min(time, originalEnd - 0.1));
			const newLength = originalEnd - newStart;

			clipElement.style.setProperty("--clip-start", String(newStart));
			clipElement.style.setProperty("--clip-length", String(newLength));
			this.showDragTimeTooltip(newStart, e.clientX - rect.left, e.clientY - rect.top);
		} else {
			// Resize from right edge
			const newLength = Math.max(0.1, time - originalStart);

			clipElement.style.setProperty("--clip-length", String(newLength));
			this.showDragTimeTooltip(originalStart + newLength, e.clientX - rect.left, e.clientY - rect.top);
		}
	}

	private onPointerUp(e: PointerEvent): void {
		switch (this.state.type) {
			case "pending":
				// Was just a click, selection already handled
				this.state = { type: "idle" };
				break;
			case "dragging":
				this.completeDrag(e);
				break;
			case "resizing":
				this.completeResize(e);
				break;
			default:
				break;
		}
	}

	private completeDrag(_e: PointerEvent): void {
		if (this.state.type !== "dragging") return;

		const { clipRef, clipElement, ghost, startTime, originalTrack, dragTarget, originalStyles, collisionResult, altKeyHeld } = this.state;

		// Restore clip element to normal flow before executing command
		clipElement.style.position = originalStyles.position;
		clipElement.style.left = originalStyles.left;
		clipElement.style.top = originalStyles.top;
		clipElement.style.zIndex = originalStyles.zIndex;
		clipElement.style.pointerEvents = originalStyles.pointerEvents;
		clipElement.style.width = "";
		clipElement.style.height = "";

		// Get dragged clip's asset type
		const draggedClip = this.stateManager.getClipAt(clipRef.trackIndex, clipRef.clipIndex);
		const draggedAssetType = draggedClip?.config.asset?.type;

		// Use the collision-resolved time from the last drag move
		let newTime = collisionResult.newStartTime;

		// Handle luma/image/video attachment and detachment
		// Attachment only happens if Alt key was held (deliberate action required)
		const attachMaskMode = altKeyHeld;

		if (dragTarget.type === "track") {
			const targetContentClip = this.findContentClipAtPositionOnTrack(dragTarget.trackIndex, newTime, clipRef);

			// Image/video dropped on a content clip → transform to luma and attach (only if Alt held)
			if ((draggedAssetType === "image" || draggedAssetType === "video") && targetContentClip && attachMaskMode) {
				if (this.edit.hasLumaMask(targetContentClip.trackIndex, targetContentClip.clipIndex)) {
					console.warn("Cannot attach luma: target clip already has a luma mask");
				} else {
					const imagePlayer = this.edit.getPlayerClip(clipRef.trackIndex, clipRef.clipIndex);
					const contentPlayer = this.edit.getPlayerClip(targetContentClip.trackIndex, targetContentClip.clipIndex);

					if (!imagePlayer || !contentPlayer) {
						console.error("Failed to get player references for luma attachment");
						return;
					}

					// Move clip to target track first (if different)
					if (dragTarget.trackIndex !== originalTrack) {
						const moveCmd = new MoveClipCommand(originalTrack, clipRef.clipIndex, dragTarget.trackIndex, sec(targetContentClip.config.start));
						this.edit.executeEditCommand(moveCmd);
					}

					const imageIndices = this.edit.findClipIndices(imagePlayer);
					const contentIndices = this.edit.findClipIndices(contentPlayer);

					if (!imageIndices || !contentIndices) {
						console.error("Failed to find clips after move - players may have been disposed");
						return;
					}

					this.edit.transformToLuma(imageIndices.trackIndex, imageIndices.clipIndex);

					this.edit.syncLumaToContent(contentIndices.trackIndex, contentIndices.clipIndex, imageIndices.trackIndex, imageIndices.clipIndex);

					// Play success animation on target clip before clearing
					if (this.lumaTargetClipElement) {
						const targetElement = this.lumaTargetClipElement;
						targetElement.classList.remove("ss-clip-luma-target");
						targetElement.classList.add("ss-clip-luma-attached");
						setTimeout(() => targetElement.classList.remove("ss-clip-luma-attached"), 600);
						this.lumaTargetClipElement = null;
					}
					this.hideLumaConnectionLine();

					// Trigger re-render
					this.config.onRequestRender?.();

					// Cleanup
					ghost.remove();
					this.hideSnapLine();
					this.hideDropZone();
					this.hideDragTimeTooltip();
					this.state = { type: "idle" };
					return;
				}
			}

			// Luma handling
			if (draggedAssetType === "luma") {
				// Only attach if Alt key was held (deliberate action required)
				if (targetContentClip && attachMaskMode) {
					const existingLumaRef = this.stateManager.findAttachedLuma(targetContentClip.trackIndex, targetContentClip.clipIndex);
					const isDraggingSameLuma = existingLumaRef?.clipIndex === clipRef.clipIndex && existingLumaRef?.trackIndex === clipRef.trackIndex;

					if (existingLumaRef && !isDraggingSameLuma) {
						console.warn("Cannot attach luma: target clip already has a luma mask");
					} else {
						// Luma dropped on content clip → re-attach to new target
						newTime = targetContentClip.config.start;

						if (newTime !== startTime || dragTarget.trackIndex !== originalTrack) {
							const command = new MoveClipCommand(originalTrack, clipRef.clipIndex, dragTarget.trackIndex, sec(newTime));
							this.edit.executeEditCommand(command);
						}

						this.edit.syncLumaToContent(targetContentClip.trackIndex, targetContentClip.clipIndex, dragTarget.trackIndex, clipRef.clipIndex);

						ghost.remove();
						this.hideSnapLine();
						this.hideDropZone();
						this.hideDragTimeTooltip();
						this.clearLumaDragFeedback();
						this.state = { type: "idle" };
						return;
					}
				}

				// Luma dropped on empty space → transform back and place at drop location
				this.edit.transformFromLuma(clipRef.trackIndex, clipRef.clipIndex);

				// Move to drop location - fall through to normal move handling
			}
		}

		// Get attached luma Player reference BEFORE any move (stable across index changes)
		const lumaPlayer = this.stateManager.getAttachedLumaPlayer(clipRef.trackIndex, clipRef.clipIndex);

		// Execute appropriate command based on drag target (non-luma clips)
		if (dragTarget.type === "insert") {
			// Create new track and move clip to it
			const command = new CreateTrackAndMoveClipCommand(dragTarget.insertionIndex, originalTrack, clipRef.clipIndex, sec(newTime));
			this.edit.executeEditCommand(command);

			// Move attached luma to new track
			this.moveLumaWithContent(lumaPlayer, dragTarget.insertionIndex, newTime);
		} else if (collisionResult.pushOffset > 0) {
			// Need to push clips forward - use MoveClipWithPushCommand
			const command = new MoveClipWithPushCommand(
				originalTrack,
				clipRef.clipIndex,
				dragTarget.trackIndex,
				sec(newTime),
				sec(collisionResult.pushOffset)
			);
			this.edit.executeEditCommand(command);

			// Move attached luma to target track
			this.moveLumaWithContent(lumaPlayer, dragTarget.trackIndex, newTime);
		} else if (newTime !== startTime || dragTarget.trackIndex !== originalTrack) {
			// Simple move without push
			const command = new MoveClipCommand(originalTrack, clipRef.clipIndex, dragTarget.trackIndex, sec(newTime));
			this.edit.executeEditCommand(command);

			// Move attached luma to target track
			this.moveLumaWithContent(lumaPlayer, dragTarget.trackIndex, newTime);
		}

		// Cleanup
		ghost.remove();
		this.hideSnapLine();
		this.hideDropZone();
		this.hideDragTimeTooltip();
		this.clearLumaDragFeedback();
		this.state = { type: "idle" };
	}

	private completeResize(e: PointerEvent): void {
		if (this.state.type !== "resizing") return;

		const { clipRef, edge, originalStart, originalLength } = this.state;

		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		const x = e.clientX - rect.left + scrollX;
		let time = Math.max(0, x / pps);

		// Apply snapping
		const snappedTime = this.applySnap(time);
		if (snappedTime !== null) {
			time = snappedTime;
		}

		// Get attached luma Player reference BEFORE changes (stable across index changes)
		const lumaPlayer = this.stateManager.getAttachedLumaPlayer(clipRef.trackIndex, clipRef.clipIndex);

		if (edge === "left") {
			// Resize from left edge (keep end fixed, change start and length)
			const originalEnd = originalStart + originalLength;
			const newStart = Math.max(0, Math.min(time, originalEnd - 0.1));
			const newLength = originalEnd - newStart;

			if (newStart !== originalStart || newLength !== originalLength) {
				// Move clip to new start position
				if (newStart !== originalStart) {
					const moveCommand = new MoveClipCommand(clipRef.trackIndex, clipRef.clipIndex, clipRef.trackIndex, sec(newStart));
					this.edit.executeEditCommand(moveCommand);
				}

				// Resize clip to new length
				if (newLength !== originalLength) {
					const resizeCommand = new ResizeClipCommand(clipRef.trackIndex, clipRef.clipIndex, sec(newLength));
					this.edit.executeEditCommand(resizeCommand);
				}

				// Also update attached luma clip
				if (lumaPlayer) {
					const lumaIndices = this.edit.findClipIndices(lumaPlayer);
					if (lumaIndices) {
						if (newStart !== originalStart) {
							const lumaMoveCommand = new MoveClipCommand(lumaIndices.trackIndex, lumaIndices.clipIndex, lumaIndices.trackIndex, sec(newStart));
							this.edit.executeEditCommand(lumaMoveCommand);
						}
						if (newLength !== originalLength) {
							const lumaResizeCommand = new ResizeClipCommand(lumaIndices.trackIndex, lumaIndices.clipIndex, sec(newLength));
							this.edit.executeEditCommand(lumaResizeCommand);
						}
					}
				}
			}
		} else {
			// Resize from right edge (keep start fixed, change length)
			const newLength = Math.max(0.1, time - originalStart);

			if (newLength !== originalLength) {
				const command = new ResizeClipCommand(clipRef.trackIndex, clipRef.clipIndex, sec(newLength));
				this.edit.executeEditCommand(command);

				// Also resize attached luma to match
				if (lumaPlayer) {
					const lumaIndices = this.edit.findClipIndices(lumaPlayer);
					if (lumaIndices) {
						const lumaResizeCommand = new ResizeClipCommand(lumaIndices.trackIndex, lumaIndices.clipIndex, sec(newLength));
						this.edit.executeEditCommand(lumaResizeCommand);
					}
				}
			}
		}

		// Cleanup
		this.hideSnapLine();
		this.hideDragTimeTooltip();
		this.state = { type: "idle" };
	}

	private moveLumaWithContent(lumaPlayer: ReturnType<TimelineStateManager["getAttachedLumaPlayer"]>, targetTrack: number, newTime: number): void {
		if (!lumaPlayer) return;
		const lumaIndices = this.edit.findClipIndices(lumaPlayer);
		if (!lumaIndices) return;
		const cmd = new MoveClipCommand(lumaIndices.trackIndex, lumaIndices.clipIndex, targetTrack, sec(newTime));
		this.edit.executeEditCommand(cmd);
	}

	private getOrCreateFeedbackElement(existing: HTMLElement | null, className: string): HTMLElement {
		if (existing) return existing;
		const el = document.createElement("div");
		el.className = className;
		this.feedbackLayer.appendChild(el);
		return el;
	}

	/** Resolve clip collision based on clip boundaries (delegates to pure function) */
	private resolveClipCollisionOnTrack(trackIndex: number, desiredStart: number, clipLength: number, excludeClip: ClipRef): CollisionResult {
		const track = this.stateManager.getTracks()[trackIndex];
		if (!track) {
			return { newStartTime: desiredStart, pushOffset: 0 };
		}

		return resolveClipCollision({
			track,
			desiredStart,
			clipLength,
			excludeClip
		});
	}

	/** Find a non-luma content clip at the given position on a track (delegates to pure function) */
	private findContentClipAtPositionOnTrack(trackIndex: number, time: number, excludeClipRef?: ClipRef): ClipState | null {
		const track = this.stateManager.getTracks()[trackIndex];
		if (!track) return null;

		return findContentClipAtPosition({
			track,
			time,
			excludeClip: excludeClipRef
		});
	}

	private buildSnapPointsForClip(excludeClip: ClipRef): void {
		const playback = this.stateManager.getPlayback();
		const tracks = this.stateManager.getTracks();

		this.snapPoints = buildSnapPoints({
			tracks,
			playheadTimeMs: playback.time,
			excludeClip
		});
	}

	private applySnap(time: number): number | null {
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		return findNearestSnapPoint({
			time,
			snapPoints: this.snapPoints,
			snapThresholdPx: this.config.snapThreshold,
			pixelsPerSecond: pps
		});
	}

	private showSnapLine(time: number): void {
		this.snapLine = this.getOrCreateFeedbackElement(this.snapLine, "ss-snap-line");
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const x = time * pps - this.tracksContainer.scrollLeft;
		this.snapLine.style.left = `${x}px`;
		this.snapLine.style.display = "block";
	}

	private hideSnapLine(): void {
		if (this.snapLine) {
			this.snapLine.style.display = "none";
		}
	}

	private showDropZone(insertionIndex: number): void {
		this.dropZone = this.getOrCreateFeedbackElement(this.dropZone, "ss-drop-zone");
		const y = this.getTrackYPositionCached(insertionIndex);
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();
		this.dropZone.style.top = `${y - 2 + tracksOffset}px`;
		this.dropZone.style.display = "block";
	}

	private getTracksOffsetInFeedbackLayer(): number {
		const feedbackParent = this.feedbackLayer.parentElement;
		if (!feedbackParent) return 0;

		const parentRect = feedbackParent.getBoundingClientRect();
		const tracksRect = this.tracksContainer.getBoundingClientRect();
		return tracksRect.top - parentRect.top;
	}

	private hideDropZone(): void {
		if (this.dropZone) {
			this.dropZone.style.display = "none";
		}
	}

	private showDragTimeTooltip(time: number, x: number, y: number): void {
		this.dragTimeTooltip = this.getOrCreateFeedbackElement(this.dragTimeTooltip, "ss-drag-time-tooltip");
		this.dragTimeTooltip.textContent = formatDragTime(time);
		this.dragTimeTooltip.style.left = `${x}px`;
		this.dragTimeTooltip.style.top = `${y - 28}px`;
		this.dragTimeTooltip.style.display = "block";
	}

	private hideDragTimeTooltip(): void {
		if (this.dragTimeTooltip) {
			this.dragTimeTooltip.style.display = "none";
		}
	}

	// ========== Luma Target Highlighting ==========

	/** Update luma target highlight during drag */
	private updateLumaTargetHighlight(targetClip: ClipState | null, trackIndex: number, tracksOffset: number): void {
		// Clear previous highlight
		if (this.lumaTargetClipElement) {
			this.lumaTargetClipElement.classList.remove("ss-clip-luma-target");
			this.lumaTargetClipElement = null;
		}

		// Get the dragging clip element
		const draggingClipElement = this.state?.type === "dragging" ? this.state.clipElement : null;

		// Hide connection line and clear dragging clip indicator if no target
		if (!targetClip) {
			this.hideLumaConnectionLine();
			if (draggingClipElement) {
				draggingClipElement.classList.remove("ss-clip-luma-has-target");
			}
			return;
		}

		// Find and highlight new target
		const clipElement = this.tracksContainer.querySelector(
			`[data-track-index="${trackIndex}"][data-clip-index="${targetClip.clipIndex}"]`
		) as HTMLElement | null;

		if (clipElement) {
			clipElement.classList.add("ss-clip-luma-target");
			this.lumaTargetClipElement = clipElement;

			// Add indicator to dragging clip (shows mask icon via ::after)
			if (draggingClipElement) {
				draggingClipElement.classList.add("ss-clip-luma-has-target");
			}

			// Show connection line from ghost to target
			this.showLumaConnectionLine(targetClip, trackIndex, tracksOffset);
		}
	}

	/** Show magnetic connection line between luma ghost and target clip */
	private showLumaConnectionLine(targetClip: ClipState, trackIndex: number, tracksOffset: number): void {
		this.lumaConnectionLine = this.getOrCreateFeedbackElement(this.lumaConnectionLine, "ss-luma-connection-line");
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const tracks = this.stateManager.getTracks();
		const track = tracks[trackIndex];
		const trackY = this.getTrackYPositionCached(trackIndex);
		const trackHeight = getTrackHeight(track?.primaryAssetType ?? "default");

		// Position connection indicator at target clip's left edge
		const clipX = targetClip.config.start * pps;
		this.lumaConnectionLine.style.left = `${clipX}px`;
		this.lumaConnectionLine.style.top = `${trackY + tracksOffset}px`;
		this.lumaConnectionLine.style.height = `${trackHeight}px`;
		this.lumaConnectionLine.classList.add("active");
	}

	/** Hide luma connection line */
	private hideLumaConnectionLine(): void {
		if (this.lumaConnectionLine) {
			this.lumaConnectionLine.classList.remove("active");
		}
	}

	/** Clear all luma drag visual feedback */
	private clearLumaDragFeedback(): void {
		if (this.lumaTargetClipElement) {
			this.lumaTargetClipElement.classList.remove("ss-clip-luma-target");
			this.lumaTargetClipElement = null;
		}
		// Clear dragging clip indicator
		const draggingClipElement = this.state?.type === "dragging" ? this.state.clipElement : null;
		if (draggingClipElement) {
			draggingClipElement.classList.remove("ss-clip-luma-has-target");
		}
		this.hideLumaConnectionLine();
	}

	/** Get drag target at Y position (delegates to pure function) */
	private getDragTargetAtYPosition(y: number): DragTarget {
		const tracks = this.stateManager.getTracks();
		return getDragTargetAtY(y, tracks);
	}

	private ensureTrackYCache(): number[] {
		if (!this.trackYCache) {
			const tracks = this.stateManager.getTracks();
			this.trackYCache = buildTrackYPositions(tracks);
		}
		return this.trackYCache;
	}

	private getTrackYPositionCached(trackIndex: number): number {
		const cache = this.ensureTrackYCache();
		return getTrackYPosition(trackIndex, cache);
	}

	// ========== Visual State Queries ==========

	public isDragging(trackIndex: number, clipIndex: number): boolean {
		if (this.state.type !== "dragging") return false;
		return this.state.clipRef.trackIndex === trackIndex && this.state.clipRef.clipIndex === clipIndex;
	}

	public isResizing(trackIndex: number, clipIndex: number): boolean {
		if (this.state.type !== "resizing") return false;
		return this.state.clipRef.trackIndex === trackIndex && this.state.clipRef.clipIndex === clipIndex;
	}

	public dispose(): void {
		this.tracksContainer.removeEventListener("pointerdown", this.handlePointerDown);
		document.removeEventListener("pointermove", this.handlePointerMove);
		document.removeEventListener("pointerup", this.handlePointerUp);

		if (this.snapLine) {
			this.snapLine.remove();
			this.snapLine = null;
		}

		if (this.dragGhost) {
			this.dragGhost.remove();
			this.dragGhost = null;
		}

		if (this.dropZone) {
			this.dropZone.remove();
			this.dropZone = null;
		}

		if (this.dragTimeTooltip) {
			this.dragTimeTooltip.remove();
			this.dragTimeTooltip = null;
		}

		if (this.lumaConnectionLine) {
			this.lumaConnectionLine.remove();
			this.lumaConnectionLine = null;
		}

		this.clearLumaDragFeedback();
	}
}
