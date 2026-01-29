import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";
import { DetachLumaCommand } from "@core/commands/detach-luma-command";
import { MoveAndAttachLumaCommand } from "@core/commands/move-and-attach-luma-command";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { MoveClipWithPushCommand } from "@core/commands/move-clip-with-push-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import type { Edit } from "@core/edit-session";
import { inferAssetTypeFromUrl } from "@core/shared/asset-utils";
import { type Seconds, sec } from "@core/timing/types";
import type { ClipState, TimelineInteractionConfig } from "@timeline/timeline.types";
import { getTrackHeight } from "@timeline/timeline.types";

import { TimelineStateManager } from "../timeline-state";

import {
	type DragBehavior,
	type DropAction,
	type SnapPoint,
	buildSnapPoints,
	buildTrackYPositions,
	determineDragBehavior,
	determineDropAction,
	exceedsDragThreshold,
	findContentClipAtPosition,
	findNearestSnapPoint,
	getDragTargetAtY,
	getTrackYPosition,
	resolveClipCollision
} from "./interaction-calculations";
import {
	type FeedbackConfig,
	type FeedbackElements,
	clearAllFeedback,
	clearLumaFeedback,
	createDragGhost,
	createFeedbackElements,
	disposeFeedbackElements,
	getTracksOffsetInFeedbackLayer,
	hideDragTimeTooltip,
	hideDropZone,
	hideLumaConnectionLine,
	hideSnapLine,
	restoreClipElementStyles,
	showDragTimeTooltip,
	showDropZone,
	showSnapLine,
	updateLumaTargetHighlight
} from "./interaction-feedback";
import {
	type ClipRef,
	type CollisionResult,
	type DragTarget,
	type DraggingState,
	type InteractionState,
	type PendingState,
	type ResizingState,
	IDLE_STATE,
	createDraggingState,
	createPendingState,
	createResizingState,
	updateDragState
} from "./interaction-state";

/** Resolved config type - numeric properties required, callback optional */
type ResolvedConfig = Required<Omit<TimelineInteractionConfig, "onRequestRender">> & Pick<TimelineInteractionConfig, "onRequestRender">;

/** Configuration defaults */
const DEFAULT_CONFIG: ResolvedConfig = {
	dragThreshold: 3,
	snapThreshold: 10,
	resizeZone: 12
};

// ─── Lifecycle Interface ───────────────────────────────────────────────────

/**
 * Lifecycle interface for timeline interaction controllers.
 */
export interface TimelineInteractionRegistration {
	mount(): void;
	update(deltaTime: number): void;
	draw(): void;
	dispose(): void;
}

// ─── Controller ────────────────────────────────────────────────────────────

/** Controller for timeline interactions (drag, resize, selection) */
export class InteractionController implements TimelineInteractionRegistration {
	private state: InteractionState = IDLE_STATE;
	private readonly config: ResolvedConfig;
	private snapPoints: SnapPoint[] = [];

	// DOM feedback elements (stateless management)
	private feedbackElements: FeedbackElements;

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
		this.feedbackElements = createFeedbackElements(feedbackLayer);
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Bind handlers (event setup deferred to mount())
		this.handlePointerDown = this.onPointerDown.bind(this);
		this.handlePointerMove = this.onPointerMove.bind(this);
		this.handlePointerUp = this.onPointerUp.bind(this);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LIFECYCLE (TimelineInteractionRegistration)
	// ═══════════════════════════════════════════════════════════════════════════

	public mount(): void {
		this.tracksContainer.addEventListener("pointerdown", this.handlePointerDown);
		document.addEventListener("pointermove", this.handlePointerMove);
		document.addEventListener("pointerup", this.handlePointerUp);
	}

	public update(_deltaTime: number): void {
		// Lazy caching approach works well for DOM-based timeline.
		// Future optimization: Could rebuild snap points here instead of on-demand.
	}

	public draw(): void {
		// No frame-synced rendering needed for DOM-based timeline.
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

		this.state = createPendingState({ x: e.clientX, y: e.clientY }, clipRef, clip.config.start);
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

		this.state = createResizingState(clipRef, clipElement, edge, clip.config.start, clip.config.length);

		this.buildSnapPointsForClip(clipRef);

		e.preventDefault();
	}

	private onPointerMove(e: PointerEvent): void {
		switch (this.state.type) {
			case "pending":
				this.handlePendingMove(e, this.state);
				break;
			case "dragging":
				this.handleDragMove(e, this.state);
				break;
			case "resizing":
				this.handleResizeMove(e, this.state);
				break;
			default:
				break;
		}
	}

	private handlePendingMove(e: PointerEvent, state: PendingState): void {
		const dx = e.clientX - state.startPoint.x;
		const dy = e.clientY - state.startPoint.y;

		if (exceedsDragThreshold(dx, dy, this.config.dragThreshold)) {
			this.transitionToDragging(e, state);
		}
	}

	private transitionToDragging(e: PointerEvent, state: PendingState): void {
		this.trackYCache = null;

		const { clipRef } = state;
		const clip = this.stateManager.getClipAt(clipRef.trackIndex, clipRef.clipIndex);
		if (!clip) {
			this.state = IDLE_STATE;
			return;
		}

		// Find the actual clip DOM element
		const clipElement = this.tracksContainer.querySelector(
			`[data-track-index="${clipRef.trackIndex}"][data-clip-index="${clipRef.clipIndex}"]`
		) as HTMLElement | null;
		if (!clipElement) {
			this.state = IDLE_STATE;
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
		clipElement.style.zIndex = "18";
		clipElement.style.pointerEvents = "none";

		// Create ghost as drop preview (shows where clip will land)
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const track = this.stateManager.getTracks()[clipRef.trackIndex];
		const clipAssetType = clip.config.asset?.type || "unknown";
		const trackAssetType = track?.primaryAssetType ?? clipAssetType;
		const ghost = createDragGhost(clip.config.length, clipAssetType, trackAssetType, pps);
		this.feedbackElements.container.appendChild(ghost);

		this.state = createDraggingState(state, clipElement, ghost, dragOffsetX, dragOffsetY, originalStyles, clip.config.length, e.altKey);

		// Position ghost at current clip position initially
		const tracksOffset = getTracksOffsetInFeedbackLayer(this.feedbackElements.container, this.tracksContainer);
		ghost.style.left = `${clip.config.start * pps}px`;
		ghost.style.top = `${this.getTrackYPositionCached(clipRef.trackIndex) + 4 + tracksOffset}px`;

		this.buildSnapPointsForClip(clipRef);
	}

	private handleDragMove(e: PointerEvent, state: DraggingState): void {
		// 1. Setup
		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const tracksOffset = getTracksOffsetInFeedbackLayer(this.feedbackElements.container, this.tracksContainer);
		const feedbackConfig: FeedbackConfig = { pixelsPerSecond: pps, scrollLeft: scrollX, tracksOffset };

		// 2. Move clip element with mouse
		state.clipElement.style.left = `${e.clientX - state.dragOffsetX}px`; // eslint-disable-line no-param-reassign -- DOM manipulation
		state.clipElement.style.top = `${e.clientY - state.dragOffsetY}px`; // eslint-disable-line no-param-reassign -- DOM manipulation

		// 3. Calculate target position
		const mouseX = e.clientX - rect.left + scrollX;
		const mouseY = e.clientY - rect.top + this.tracksContainer.scrollTop;
		const clipX = mouseX - state.dragOffsetX;
		let clipTime: Seconds = sec(Math.max(0, clipX / pps));

		// 4. Determine drag target and apply snapping
		const dragTarget = this.getDragTargetAtYPosition(mouseY);
		const updatedState = updateDragState(state, { dragTarget, altKeyHeld: e.altKey });
		this.state = updatedState;
		clipTime = this.applySnapAndShowLine(clipTime, feedbackConfig);

		// 5. Determine behaviour
		const draggedClip = this.stateManager.getClipAt(state.clipRef.trackIndex, state.clipRef.clipIndex);
		const targetClip = dragTarget.type === "track" ? this.findContentClipAtPositionOnTrack(dragTarget.trackIndex, clipTime, state.clipRef) : null;
		const existingLumaRef =
			targetClip && dragTarget.type === "track" ? this.stateManager.findAttachedLuma(dragTarget.trackIndex, targetClip.clipIndex) : null;

		const behavior = determineDragBehavior({
			dragTarget,
			draggedAssetType: draggedClip?.config.asset?.type,
			altKeyHeld: e.altKey,
			targetClip,
			existingLumaRef,
			draggedClipRef: state.clipRef
		});

		// 6. Apply behaviour
		clipTime = this.applyDragBehavior(updatedState, behavior, clipTime, feedbackConfig);

		// 7. Update ghost position
		this.updateGhostPosition(updatedState, clipTime, feedbackConfig);
	}

	// ─── Drag Behavior Helpers ─────────────────────────────────────────────────

	private applySnapAndShowLine(clipTime: Seconds, feedbackConfig: FeedbackConfig): Seconds {
		const snappedTime = this.applySnap(clipTime);
		if (snappedTime !== null) {
			this.feedbackElements.snapLine = showSnapLine(this.feedbackElements, snappedTime, feedbackConfig);
			return snappedTime;
		}
		hideSnapLine(this.feedbackElements.snapLine);
		return clipTime;
	}

	private applyDragBehavior(state: DraggingState, behavior: DragBehavior, clipTime: Seconds, feedbackConfig: FeedbackConfig): Seconds {
		switch (behavior.type) {
			case "track-insert":
				this.state = updateDragState(state, { collisionResult: { newStartTime: clipTime, pushOffset: sec(0) } });
				clearLumaFeedback(this.feedbackElements, state.clipElement);
				return clipTime;

			case "luma-overlay":
				clearLumaFeedback(this.feedbackElements, state.clipElement);
				this.state = updateDragState(state, { collisionResult: { newStartTime: clipTime, pushOffset: sec(0) } });
				return clipTime;

			case "luma-blocked":
				clearLumaFeedback(this.feedbackElements, state.clipElement);
				return this.applyCollisionAndUpdateState(state, clipTime);

			case "normal-collision":
				clearLumaFeedback(this.feedbackElements, state.clipElement);
				return this.applyCollisionAndUpdateState(state, clipTime);

			case "luma-attach":
				return this.applyLumaAttachmentFeedback(state, behavior.targetClip, feedbackConfig);

			default: {
				const exhaustiveCheck: never = behavior;
				throw new Error(`Unhandled drag behavior: ${(exhaustiveCheck as DragBehavior).type}`);
			}
		}
	}

	private applyCollisionAndUpdateState(state: DraggingState, clipTime: Seconds): Seconds {
		if (state.dragTarget.type !== "track") return clipTime;

		const collisionResult = this.resolveClipCollisionOnTrack(state.dragTarget.trackIndex, clipTime, state.draggedClipLength, state.clipRef);
		this.state = updateDragState(state, { collisionResult });
		return collisionResult.newStartTime;
	}

	private applyLumaAttachmentFeedback(state: DraggingState, targetClip: ClipState, feedbackConfig: FeedbackConfig): Seconds {
		if (state.dragTarget.type !== "track") return sec(targetClip.config.start);

		const tracks = this.stateManager.getTracks();
		const targetTrack = tracks[state.dragTarget.trackIndex];
		if (!targetTrack) return sec(targetClip.config.start);

		const targetTrackY = this.getTrackYPositionCached(state.dragTarget.trackIndex);
		const targetTrackHeight = getTrackHeight(targetTrack.primaryAssetType);

		const lumaResult = updateLumaTargetHighlight(
			this.tracksContainer,
			this.feedbackElements,
			state.clipElement,
			targetClip,
			state.dragTarget.trackIndex,
			targetTrackY,
			targetTrackHeight,
			feedbackConfig.tracksOffset,
			feedbackConfig.pixelsPerSecond
		);

		this.feedbackElements.lumaTargetClipElement = lumaResult.targetClipElement;
		this.feedbackElements.lumaConnectionLine = lumaResult.connectionLine;

		const newTime = sec(targetClip.config.start);
		this.state = updateDragState(state, { collisionResult: { newStartTime: newTime, pushOffset: sec(0) } });
		return newTime;
	}

	private updateGhostPosition(state: DraggingState, clipTime: Seconds, feedbackConfig: FeedbackConfig): void {
		const { ghost } = state;
		if (state.dragTarget.type === "track") {
			ghost.style.display = "block"; // eslint-disable-line no-param-reassign -- DOM manipulation
			const tracks = this.stateManager.getTracks();
			const targetTrack = tracks[state.dragTarget.trackIndex];
			if (!targetTrack) return;

			const targetTrackY = this.getTrackYPositionCached(state.dragTarget.trackIndex) + 4;
			const targetHeight = getTrackHeight(targetTrack.primaryAssetType) - 8;

			ghost.style.left = `${clipTime * feedbackConfig.pixelsPerSecond}px`; // eslint-disable-line no-param-reassign -- DOM manipulation
			ghost.style.top = `${targetTrackY + feedbackConfig.tracksOffset}px`; // eslint-disable-line no-param-reassign -- DOM manipulation
			ghost.style.height = `${targetHeight}px`; // eslint-disable-line no-param-reassign -- DOM manipulation

			this.feedbackElements.dragTimeTooltip = showDragTimeTooltip(
				this.feedbackElements,
				clipTime,
				clipTime * feedbackConfig.pixelsPerSecond,
				targetTrackY + feedbackConfig.tracksOffset
			);
			hideDropZone(this.feedbackElements.dropZone);
		} else {
			ghost.style.display = "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
			const dropZoneY = this.getTrackYPositionCached(state.dragTarget.insertionIndex);
			this.feedbackElements.dropZone = showDropZone(this.feedbackElements, dropZoneY, feedbackConfig.tracksOffset);
		}
	}

	// ─── Resize Handling ───────────────────────────────────────────────────────

	private handleResizeMove(e: PointerEvent, state: ResizingState): void {
		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const tracksOffset = getTracksOffsetInFeedbackLayer(this.feedbackElements.container, this.tracksContainer);
		const feedbackConfig = { pixelsPerSecond: pps, scrollLeft: scrollX, tracksOffset };

		const x = e.clientX - rect.left + scrollX;
		let time: Seconds = sec(Math.max(0, x / pps));

		// Apply snapping
		const snappedTime = this.applySnap(time);
		if (snappedTime !== null) {
			time = snappedTime;
			this.feedbackElements.snapLine = showSnapLine(this.feedbackElements, time, feedbackConfig);
		} else {
			hideSnapLine(this.feedbackElements.snapLine);
		}

		// Calculate new dimensions based on edge
		const { edge, originalStart, originalLength, clipElement } = state;

		if (edge === "left") {
			// Resize from left edge (keep end fixed, change start and length)
			const originalEnd = originalStart + originalLength;
			const newStart = sec(Math.max(0, Math.min(time, originalEnd - 0.1)));
			const newLength = sec(originalEnd - newStart);

			clipElement.style.setProperty("--clip-start", String(newStart));
			clipElement.style.setProperty("--clip-length", String(newLength));
			this.feedbackElements.dragTimeTooltip = showDragTimeTooltip(this.feedbackElements, newStart, e.clientX - rect.left, e.clientY - rect.top);
		} else {
			// Resize from right edge
			const newLength = sec(Math.max(0.1, time - originalStart));

			clipElement.style.setProperty("--clip-length", String(newLength));
			this.feedbackElements.dragTimeTooltip = showDragTimeTooltip(
				this.feedbackElements,
				sec(originalStart + newLength),
				e.clientX - rect.left,
				e.clientY - rect.top
			);
		}
	}

	private onPointerUp(e: PointerEvent): void {
		switch (this.state.type) {
			case "pending":
				// Was just a click, selection already handled
				this.state = IDLE_STATE;
				break;
			case "dragging":
				this.completeDrag(e, this.state);
				break;
			case "resizing":
				this.completeResize(e, this.state);
				break;
			default:
				break;
		}
	}

	private completeDrag(_e: PointerEvent, state: DraggingState): void {
		const { clipRef, clipElement, ghost, originalStyles, dragTarget, collisionResult, altKeyHeld, startTime, originalTrack } = state;

		// 1. Restore clip element styles
		restoreClipElementStyles(clipElement, originalStyles);

		// 2. Determine action
		const draggedClip = this.stateManager.getClipAt(clipRef.trackIndex, clipRef.clipIndex);
		const targetClip =
			dragTarget.type === "track" ? this.findContentClipAtPositionOnTrack(dragTarget.trackIndex, collisionResult.newStartTime, clipRef) : null;
		const existingLumaRef =
			targetClip && dragTarget.type === "track" ? this.stateManager.findAttachedLuma(targetClip.trackIndex, targetClip.clipIndex) : null;

		const action = determineDropAction({
			dragTarget,
			draggedAssetType: draggedClip?.config.asset?.type,
			altKeyHeld,
			targetClip,
			existingLumaRef,
			draggedClipRef: clipRef,
			startTime,
			newTime: collisionResult.newStartTime,
			originalTrack,
			pushOffset: collisionResult.pushOffset
		});

		// 3. Execute action
		this.executeDropAction(state, action, targetClip, existingLumaRef);

		// 4. Cleanup
		ghost.remove();
		this.feedbackElements = clearAllFeedback(this.feedbackElements, clipElement);
		this.state = IDLE_STATE;
	}

	private executeDropAction(state: DraggingState, action: DropAction, targetClip: ClipState | null, existingLumaRef: ClipRef | null): void {
		switch (action.type) {
			case "transform-and-attach":
				if (existingLumaRef) {
					console.warn("Cannot attach luma: target clip already has a luma mask");
					this.executeNormalMove(state, { type: "simple-move" });
				} else {
					this.executeTransformAndAttach(state, action.targetClip);
				}
				break;

			case "reattach-luma":
				this.executeReattachLuma(state, action.targetClip);
				break;

			case "detach-luma":
				if (existingLumaRef && targetClip) {
					console.warn("Cannot attach luma: target clip already has a luma mask");
				}
				this.executeDetachLuma(state);
				this.executeNormalMove(state, { type: "simple-move" });
				break;

			case "insert-track":
			case "move-with-push":
			case "simple-move":
			case "no-change":
				this.executeNormalMove(state, action);
				break;

			default: {
				const exhaustiveCheck: never = action;
				throw new Error(`Unhandled action type: ${(exhaustiveCheck as DropAction).type}`);
			}
		}
	}

	private executeTransformAndAttach(state: DraggingState, targetClip: ClipState): void {
		const { clipRef, originalTrack, dragTarget } = state;
		if (dragTarget.type !== "track") return;

		const command = new MoveAndAttachLumaCommand(
			originalTrack, // fromTrackIndex
			clipRef.clipIndex, // fromClipIndex
			dragTarget.trackIndex, // toTrackIndex
			targetClip.trackIndex, // contentTrackIndex
			targetClip.clipIndex, // contentClipIndex
			sec(targetClip.config.start) // targetStart
		);

		this.edit.executeEditCommand(command);

		this.playLumaAttachAnimation();
		this.config.onRequestRender?.();
	}

	private executeReattachLuma(state: DraggingState, targetClip: ClipState): void {
		const { clipRef, startTime, originalTrack, dragTarget } = state;
		if (dragTarget.type !== "track") return;

		const newTime = targetClip.config.start;

		// Get Player references BEFORE move
		const lumaPlayer = this.edit.getPlayerClip(clipRef.trackIndex, clipRef.clipIndex);
		const contentPlayer = this.edit.getPlayerClip(targetClip.trackIndex, targetClip.clipIndex);

		if (newTime !== startTime || dragTarget.trackIndex !== originalTrack) {
			const command = new MoveClipCommand(originalTrack, clipRef.clipIndex, dragTarget.trackIndex, sec(newTime));
			this.edit.executeEditCommand(command);
		}

		// Re-establish luma→content relationship using stable clip IDs
		const lumaIndices = lumaPlayer ? this.edit.findClipIndices(lumaPlayer) : null;
		if (lumaIndices && lumaPlayer?.clipId && contentPlayer?.clipId) {
			// Update relationship
			this.edit.setLumaContentRelationship(lumaPlayer.clipId, contentPlayer.clipId);

			// Sync timing to match content
			lumaPlayer.setResolvedTiming({
				start: contentPlayer.getStart(),
				length: contentPlayer.getLength()
			});
			lumaPlayer.reconfigureAfterRestore();

			// Update document (bypassing command for this immediate sync)
			this.edit.getDocument()?.updateClip(lumaIndices.trackIndex, lumaIndices.clipIndex, {
				start: contentPlayer.getStart(),
				length: contentPlayer.getLength()
			});
		}
	}

	private executeDetachLuma(state: DraggingState): void {
		const { clipRef } = state;

		// Get the clip's asset to infer original type
		const clip = this.edit.getClip(clipRef.trackIndex, clipRef.clipIndex);
		if (!clip?.asset) return;

		const { src } = clip.asset as { src?: string };
		if (!src) return;

		// Infer original type from URL extension
		const originalType = inferAssetTypeFromUrl(src);

		const detachCmd = new DetachLumaCommand(clipRef.trackIndex, clipRef.clipIndex, originalType);
		this.edit.executeEditCommand(detachCmd);
	}

	private executeNormalMove(state: DraggingState, action: DropAction): void {
		const { clipRef, originalTrack, dragTarget, collisionResult, startTime } = state;
		const newTime = collisionResult.newStartTime;

		// Get attached luma Player BEFORE move
		const lumaPlayer = this.stateManager.getAttachedLumaPlayer(clipRef.trackIndex, clipRef.clipIndex);

		switch (action.type) {
			case "insert-track": {
				const command = new CreateTrackAndMoveClipCommand(action.insertionIndex, originalTrack, clipRef.clipIndex, sec(newTime));
				this.edit.executeEditCommand(command);
				this.moveLumaWithContent(lumaPlayer, action.insertionIndex, newTime);
				break;
			}
			case "move-with-push": {
				if (dragTarget.type !== "track") return;
				const command = new MoveClipWithPushCommand(originalTrack, clipRef.clipIndex, dragTarget.trackIndex, sec(newTime), sec(action.pushOffset));
				this.edit.executeEditCommand(command);
				this.moveLumaWithContent(lumaPlayer, dragTarget.trackIndex, newTime);
				break;
			}
			case "simple-move": {
				if (dragTarget.type !== "track") return;
				if (newTime !== startTime || dragTarget.trackIndex !== originalTrack) {
					const command = new MoveClipCommand(originalTrack, clipRef.clipIndex, dragTarget.trackIndex, sec(newTime));
					this.edit.executeEditCommand(command);
					this.moveLumaWithContent(lumaPlayer, dragTarget.trackIndex, newTime);
				}
				break;
			}
			case "no-change":
				// Nothing to do
				break;
			default:
				// Other action types handled elsewhere
				break;
		}
	}

	private playLumaAttachAnimation(): void {
		if (this.feedbackElements.lumaTargetClipElement) {
			const targetElement = this.feedbackElements.lumaTargetClipElement;
			targetElement.classList.remove("ss-clip-luma-target");
			targetElement.classList.add("ss-clip-luma-attached");
			setTimeout(() => targetElement.classList.remove("ss-clip-luma-attached"), 600);
			this.feedbackElements.lumaTargetClipElement = null;
		}
		hideLumaConnectionLine(this.feedbackElements.lumaConnectionLine);
	}

	private completeResize(e: PointerEvent, state: ResizingState): void {
		const { clipRef, edge, originalStart, originalLength } = state;

		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		const x = e.clientX - rect.left + scrollX;
		let time: Seconds = sec(Math.max(0, x / pps));

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
		hideSnapLine(this.feedbackElements.snapLine);
		hideDragTimeTooltip(this.feedbackElements.dragTimeTooltip);
		this.state = IDLE_STATE;
	}

	private moveLumaWithContent(lumaPlayer: ReturnType<TimelineStateManager["getAttachedLumaPlayer"]>, targetTrack: number, newTime: number): void {
		if (!lumaPlayer) return;
		const lumaIndices = this.edit.findClipIndices(lumaPlayer);
		if (!lumaIndices) return;
		const cmd = new MoveClipCommand(lumaIndices.trackIndex, lumaIndices.clipIndex, targetTrack, sec(newTime));
		this.edit.executeEditCommand(cmd);
	}

	/** Resolve clip collision based on clip boundaries (delegates to pure function) */
	private resolveClipCollisionOnTrack(trackIndex: number, desiredStart: Seconds, clipLength: Seconds, excludeClip: ClipRef): CollisionResult {
		const track = this.stateManager.getTracks()[trackIndex];
		if (!track) {
			return { newStartTime: desiredStart, pushOffset: sec(0) };
		}

		return resolveClipCollision({
			track,
			desiredStart,
			clipLength,
			excludeClip
		});
	}

	/** Find a non-luma content clip at the given position on a track (delegates to pure function) */
	private findContentClipAtPositionOnTrack(trackIndex: number, time: Seconds, excludeClipRef?: ClipRef): ClipState | null {
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
			playheadTime: playback.time,
			excludeClip
		});
	}

	private applySnap(time: Seconds): Seconds | null {
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		return findNearestSnapPoint({
			time,
			snapPoints: this.snapPoints,
			snapThresholdPx: this.config.snapThreshold,
			pixelsPerSecond: pps
		});
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

		// Dispose all feedback elements (stateless, idempotent)
		disposeFeedbackElements(this.feedbackElements);
	}
}
