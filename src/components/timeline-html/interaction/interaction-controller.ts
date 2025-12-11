import type { Edit } from "@core/edit";
import type { ClipState, HtmlTimelineInteractionConfig } from "../html-timeline.types";
import { getTrackHeight, TRACK_HEIGHTS } from "../html-timeline.types";
import { TimelineStateManager } from "../core/state/timeline-state";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { MoveClipWithPushCommand } from "@core/commands/move-clip-with-push-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import { CreateTrackAndMoveClipCommand } from "@core/commands/create-track-and-move-clip-command";

/** Point coordinates */
interface Point {
	x: number;
	y: number;
}

/** Clip reference */
interface ClipRef {
	trackIndex: number;
	clipIndex: number;
}

/** Snap point for alignment */
interface SnapPoint {
	time: number;
	type: "clip-start" | "clip-end" | "playhead";
}

/** Collision resolution result */
interface CollisionResult {
	newStartTime: number;
	pushOffset: number;
}

/** Drag target - either an existing track or an insertion point between tracks */
type DragTarget =
	| { type: "track"; trackIndex: number }
	| { type: "insert"; insertionIndex: number };

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
	  }
	| { type: "resizing"; clipRef: ClipRef; edge: "left" | "right"; originalStart: number; originalLength: number };

/** Configuration defaults */
const DEFAULT_CONFIG: Required<HtmlTimelineInteractionConfig> = {
	dragThreshold: 3,
	snapThreshold: 10,
	resizeZone: 12
};

/** Controller for timeline interactions (drag, resize, selection) */
export class InteractionController {
	private state: InteractionState = { type: "idle" };
	private readonly config: Required<HtmlTimelineInteractionConfig>;
	private snapPoints: SnapPoint[] = [];

	// DOM references
	private readonly feedbackLayer: HTMLElement;
	private snapLine: HTMLElement | null = null;
	private dragGhost: HTMLElement | null = null;
	private dropZone: HTMLElement | null = null;
	private dragTimeTooltip: HTMLElement | null = null;

	// Bound handlers for cleanup
	private readonly handlePointerMove: (e: PointerEvent) => void;
	private readonly handlePointerUp: (e: PointerEvent) => void;

	constructor(
		private readonly edit: Edit,
		private readonly stateManager: TimelineStateManager,
		private readonly tracksContainer: HTMLElement,
		feedbackLayer: HTMLElement,
		config?: Partial<HtmlTimelineInteractionConfig>
	) {
		this.feedbackLayer = feedbackLayer;
		this.config = { ...DEFAULT_CONFIG, ...config };

		// Bind handlers
		this.handlePointerMove = this.onPointerMove.bind(this);
		this.handlePointerUp = this.onPointerUp.bind(this);

		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.tracksContainer.addEventListener("pointerdown", this.onPointerDown.bind(this));
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

		this.state = {
			type: "resizing",
			clipRef,
			edge,
			originalStart: clip.config.start,
			originalLength: clip.config.length
		};

		this.stateManager.setClipVisualState(clipRef.trackIndex, clipRef.clipIndex, "resizing");
		this.buildSnapPoints(clipRef);

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
		}
	}

	private handlePendingMove(e: PointerEvent): void {
		if (this.state.type !== "pending") return;

		const dx = e.clientX - this.state.startPoint.x;
		const dy = e.clientY - this.state.startPoint.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance >= this.config.dragThreshold) {
			this.transitionToDragging(e);
		}
	}

	private transitionToDragging(e: PointerEvent): void {
		if (this.state.type !== "pending") return;

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
		clipElement.classList.add("dragging");

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
			collisionResult: { newStartTime: originalTime, pushOffset: 0 }
		};

		// Position ghost at current clip position initially
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();
		ghost.style.left = `${clip.config.start * pps}px`;
		ghost.style.top = `${this.getTrackYPosition(clipRef.trackIndex) + 4 + tracksOffset}px`;

		this.buildSnapPoints(clipRef);
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
		const dragTarget = this.getDragTargetAtY(mouseY);
		this.state.dragTarget = dragTarget;

		// Apply snapping to clip time
		const snappedTime = this.applySnap(clipTime);
		if (snappedTime !== null) {
			clipTime = snappedTime;
			this.showSnapLine(clipTime);
		} else {
			this.hideSnapLine();
		}

		// Apply collision detection for track targets
		if (dragTarget.type === "track") {
			// Calculate mouse time (mouse position in seconds, for left/right half detection)
			const mouseTime = mouseX / pps;
			const collisionResult = this.resolveClipCollision(
				dragTarget.trackIndex,
				clipTime,
				this.state.draggedClipLength,
				this.state.clipRef,
				mouseTime
			);
			clipTime = collisionResult.newStartTime;
			this.state.collisionResult = collisionResult;
		} else {
			// No collision for insertion targets (new track)
			this.state.collisionResult = { newStartTime: clipTime, pushOffset: 0 };
		}

		// Get offset for positioning in feedback layer (accounts for ruler height)
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();

		// Calculate target track Y position and height for the ghost
		const tracks = this.stateManager.getTracks();
		let targetTrackY: number;
		let targetHeight: number;
		if (dragTarget.type === "track") {
			targetTrackY = this.getTrackYPosition(dragTarget.trackIndex) + 4; // +4 for clip padding
			const targetTrack = tracks[dragTarget.trackIndex];
			targetHeight = getTrackHeight(targetTrack?.primaryAssetType ?? "default") - 8;
		} else {
			// For insertion, show ghost at the insertion line position with original track height
			targetTrackY = this.getTrackYPosition(dragTarget.insertionIndex);
			const originalTrack = tracks[this.state.originalTrack];
			targetHeight = getTrackHeight(originalTrack?.primaryAssetType ?? "default") - 8;
		}

		// Position and size ghost at snapped target position (shows where clip will land)
		this.state.ghost.style.left = `${clipTime * pps}px`;
		this.state.ghost.style.top = `${targetTrackY + tracksOffset}px`;
		this.state.ghost.style.height = `${targetHeight}px`;

		// Show timestamp tooltip near the ghost
		this.showDragTimeTooltip(clipTime, clipTime * pps, targetTrackY + tracksOffset);

		// Show drop zone indicator when over insertion zone
		if (dragTarget.type === "insert") {
			this.showDropZone(dragTarget.insertionIndex);
		} else {
			this.hideDropZone();
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
		const { clipRef, edge, originalStart, originalLength } = this.state;

		if (edge === "left") {
			// Resize from left edge
			const newStart = Math.min(time, originalStart + originalLength - 0.1);
			const newLength = originalStart + originalLength - newStart;

			// Update clip visually (temporary state during resize)
			const clipEl = this.tracksContainer.querySelector(
				`[data-track-index="${clipRef.trackIndex}"][data-clip-index="${clipRef.clipIndex}"]`
			) as HTMLElement;
			if (clipEl) {
				clipEl.style.setProperty("--clip-start", String(newStart));
				clipEl.style.setProperty("--clip-length", String(newLength));
			}
		} else {
			// Resize from right edge
			const newLength = Math.max(0.1, time - originalStart);

			const clipEl = this.tracksContainer.querySelector(
				`[data-track-index="${clipRef.trackIndex}"][data-clip-index="${clipRef.clipIndex}"]`
			) as HTMLElement;
			if (clipEl) {
				clipEl.style.setProperty("--clip-length", String(newLength));
			}
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
		}
	}

	private completeDrag(_e: PointerEvent): void {
		if (this.state.type !== "dragging") return;

		const { clipRef, clipElement, ghost, startTime, originalTrack, dragTarget, originalStyles, collisionResult } = this.state;

		// Use the collision-resolved time from the last drag move
		const newTime = collisionResult.newStartTime;

		// Restore clip element to normal flow before executing command
		clipElement.style.position = originalStyles.position;
		clipElement.style.left = originalStyles.left;
		clipElement.style.top = originalStyles.top;
		clipElement.style.zIndex = originalStyles.zIndex;
		clipElement.style.pointerEvents = originalStyles.pointerEvents;
		clipElement.style.width = "";
		clipElement.style.height = "";
		clipElement.classList.remove("dragging");

		// Execute appropriate command based on drag target
		if (dragTarget.type === "insert") {
			// Create new track and move clip to it
			const command = new CreateTrackAndMoveClipCommand(
				dragTarget.insertionIndex,
				originalTrack,
				clipRef.clipIndex,
				newTime
			);
			this.edit.executeEditCommand(command);
		} else if (collisionResult.pushOffset > 0) {
			// Need to push clips forward - use MoveClipWithPushCommand
			const command = new MoveClipWithPushCommand(
				originalTrack,
				clipRef.clipIndex,
				dragTarget.trackIndex,
				newTime,
				collisionResult.pushOffset
			);
			this.edit.executeEditCommand(command);
		} else if (newTime !== startTime || dragTarget.trackIndex !== originalTrack) {
			// Simple move without push
			const command = new MoveClipCommand(
				originalTrack,
				clipRef.clipIndex,
				dragTarget.trackIndex,
				newTime
			);
			this.edit.executeEditCommand(command);
		}

		// Cleanup
		ghost.remove();
		this.hideSnapLine();
		this.hideDropZone();
		this.hideDragTimeTooltip();
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

		let newStart = originalStart;
		let newLength = originalLength;

		if (edge === "left") {
			newStart = Math.min(time, originalStart + originalLength - 0.1);
			newLength = originalStart + originalLength - newStart;
		} else {
			newLength = Math.max(0.1, time - originalStart);
		}

		// Execute resize command if dimensions changed
		if (newLength !== originalLength) {
			const command = new ResizeClipCommand(
				clipRef.trackIndex,
				clipRef.clipIndex,
				newLength
			);
			this.edit.executeEditCommand(command);

			// TODO: For left-edge resize (start changed), also need MoveClipCommand
			// Currently ResizeClipCommand only handles length changes
		}

		// Cleanup
		this.hideSnapLine();
		this.stateManager.setClipVisualState(clipRef.trackIndex, clipRef.clipIndex, "normal");
		this.state = { type: "idle" };
	}

	/** Default result when no collision detected */
	private static readonly NO_COLLISION: CollisionResult = {
		newStartTime: 0,
		pushOffset: 0
	};

	/** Get sorted clips on a track, excluding the dragged clip */
	private getTrackClips(trackIndex: number, excludeClip: ClipRef): ClipState[] {
		const track = this.stateManager.getTracks()[trackIndex];
		if (!track) return [];

		return track.clips
			.filter(c => !(c.trackIndex === excludeClip.trackIndex && c.clipIndex === excludeClip.clipIndex))
			.sort((a, b) => a.config.start - b.config.start);
	}

	/** Find which clip (if any) the mouse is directly over */
	private findClipUnderMouse(clips: ClipState[], mouseTime: number): { clip: ClipState; index: number } | null {
		for (let i = 0; i < clips.length; i += 1) {
			const clip = clips[i];
			if (mouseTime >= clip.config.start && mouseTime < clip.config.start + clip.config.length) {
				return { clip, index: i };
			}
		}
		return null;
	}

	/** Resolve snap position when mouse is over a clip (left/right half logic) */
	private resolveMouseOverSnap(
		targetClip: ClipState,
		targetIndex: number,
		clipLength: number,
		isRightHalf: boolean,
		clips: ClipState[]
	): CollisionResult {
		const clipStart = targetClip.config.start;
		const clipEnd = clipStart + targetClip.config.length;

		if (isRightHalf) {
			// Snap to RIGHT of target clip
			const newStartTime = clipEnd;
			const newEndTime = newStartTime + clipLength;
			const nextClip = clips[targetIndex + 1];

			if (nextClip && newEndTime > nextClip.config.start) {
				return { newStartTime, pushOffset: newEndTime - nextClip.config.start };
			}
			return { newStartTime, pushOffset: 0 };
		}

		// Snap to LEFT of target clip
		const prevClipEnd = targetIndex > 0 ? clips[targetIndex - 1].config.start + clips[targetIndex - 1].config.length : 0;
		const availableSpace = clipStart - prevClipEnd;

		if (availableSpace >= clipLength) {
			return { newStartTime: clipStart - clipLength, pushOffset: 0 };
		}

		// No space - push target clip forward
		const newStartTime = prevClipEnd;
		return { newStartTime, pushOffset: newStartTime + clipLength - clipStart };
	}

	/** Resolve collision when dragged clip overlaps another (mouse not directly over any clip) */
	private resolveOverlapCollision(desiredStart: number, clipLength: number, clips: ClipState[]): CollisionResult {
		const desiredEnd = desiredStart + clipLength;

		for (let i = 0; i < clips.length; i += 1) {
			const clip = clips[i];
			const clipStart = clip.config.start;
			const clipEnd = clipStart + clip.config.length;

			if (desiredStart < clipEnd && desiredEnd > clipStart) {
				const prevClipEnd = i > 0 ? clips[i - 1].config.start + clips[i - 1].config.length : 0;
				const availableSpace = clipStart - prevClipEnd;

				if (availableSpace >= clipLength) {
					return { newStartTime: clipStart - clipLength, pushOffset: 0 };
				}
				return { newStartTime: desiredStart, pushOffset: desiredEnd - clipStart };
			}
		}
		return { newStartTime: desiredStart, pushOffset: 0 };
	}

	/** Resolve clip collision - orchestrates detection and resolution */
	private resolveClipCollision(
		trackIndex: number,
		desiredStart: number,
		clipLength: number,
		excludeClip: ClipRef,
		mouseTime: number
	): CollisionResult {
		const clips = this.getTrackClips(trackIndex, excludeClip);
		if (clips.length === 0) {
			return { ...InteractionController.NO_COLLISION, newStartTime: desiredStart };
		}

		const mouseTarget = this.findClipUnderMouse(clips, mouseTime);
		if (mouseTarget) {
			const midpoint = mouseTarget.clip.config.start + mouseTarget.clip.config.length / 2;
			const isRightHalf = mouseTime >= midpoint;
			return this.resolveMouseOverSnap(mouseTarget.clip, mouseTarget.index, clipLength, isRightHalf, clips);
		}

		return this.resolveOverlapCollision(desiredStart, clipLength, clips);
	}

	private buildSnapPoints(excludeClip: ClipRef): void {
		this.snapPoints = [];

		// Add playhead position
		const playback = this.stateManager.getPlayback();
		this.snapPoints.push({
			time: playback.time / 1000,
			type: "playhead"
		});

		// Add clip edges
		const tracks = this.stateManager.getTracks();
		for (const track of tracks) {
			for (const clip of track.clips) {
				// Skip the clip being dragged/resized
				if (clip.trackIndex === excludeClip.trackIndex && clip.clipIndex === excludeClip.clipIndex) {
					continue;
				}

				this.snapPoints.push({
					time: clip.config.start,
					type: "clip-start"
				});
				this.snapPoints.push({
					time: clip.config.start + clip.config.length,
					type: "clip-end"
				});
			}
		}
	}

	private applySnap(time: number): number | null {
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const threshold = this.config.snapThreshold / pps; // Convert pixels to seconds

		for (const point of this.snapPoints) {
			if (Math.abs(time - point.time) <= threshold) {
				return point.time;
			}
		}

		return null;
	}

	private showSnapLine(time: number): void {
		if (!this.snapLine) {
			this.snapLine = document.createElement("div");
			this.snapLine.className = "ss-snap-line";
			this.feedbackLayer.appendChild(this.snapLine);
		}

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
		if (!this.dropZone) {
			this.dropZone = document.createElement("div");
			this.dropZone.className = "ss-drop-zone";
			this.feedbackLayer.appendChild(this.dropZone);
		}

		const y = this.getTrackYPosition(insertionIndex);
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();
		this.dropZone.style.top = `${y - 2 + tracksOffset}px`;
		this.dropZone.style.display = "block";
	}

	/** Get the Y offset of tracks container relative to feedback layer's parent */
	private getTracksOffsetInFeedbackLayer(): number {
		// Feedback layer and tracks container are siblings inside rulerTracksWrapper
		// The ruler sits above the tracks, so we need this offset for correct positioning
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

	/** Format time for drag tooltip display (MM:SS.T) */
	private formatDragTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const tenths = Math.floor((seconds % 1) * 10);
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
	}

	private showDragTimeTooltip(time: number, x: number, y: number): void {
		if (!this.dragTimeTooltip) {
			this.dragTimeTooltip = document.createElement("div");
			this.dragTimeTooltip.className = "ss-drag-time-tooltip";
			this.feedbackLayer.appendChild(this.dragTimeTooltip);
		}

		this.dragTimeTooltip.textContent = this.formatDragTime(time);
		this.dragTimeTooltip.style.left = `${x}px`;
		this.dragTimeTooltip.style.top = `${y - 28}px`;
		this.dragTimeTooltip.style.display = "block";
	}

	private hideDragTimeTooltip(): void {
		if (this.dragTimeTooltip) {
			this.dragTimeTooltip.style.display = "none";
		}
	}

	/** Get track index at a given Y position (accounting for variable heights) */
	private getTrackIndexAtY(y: number): number {
		const tracks = this.stateManager.getTracks();
		let currentY = 0;
		for (let i = 0; i < tracks.length; i++) {
			const height = getTrackHeight(tracks[i].primaryAssetType);
			if (y >= currentY && y < currentY + height) {
				return i;
			}
			currentY += height;
		}
		return Math.max(0, tracks.length - 1);
	}

	/** Get drag target at Y position - either an existing track or an insertion point between tracks */
	private getDragTargetAtY(y: number): DragTarget {
		const tracks = this.stateManager.getTracks();
		const insertZoneSize = 12; // pixels at track edges for insert detection
		let currentY = 0;

		// Top edge - insert above first track
		if (y < insertZoneSize / 2) {
			return { type: "insert", insertionIndex: 0 };
		}

		for (let i = 0; i < tracks.length; i++) {
			const height = getTrackHeight(tracks[i].primaryAssetType);

			// Top edge insert zone (between this track and previous)
			if (i > 0 && y >= currentY - insertZoneSize / 2 && y < currentY + insertZoneSize / 2) {
				return { type: "insert", insertionIndex: i };
			}

			// Inside track (not in edge zones)
			if (y >= currentY + insertZoneSize / 2 && y < currentY + height - insertZoneSize / 2) {
				return { type: "track", trackIndex: i };
			}

			currentY += height;
		}

		// Bottom edge - insert after last track
		if (y >= currentY - insertZoneSize / 2) {
			return { type: "insert", insertionIndex: tracks.length };
		}

		// Default to last track
		return { type: "track", trackIndex: Math.max(0, tracks.length - 1) };
	}

	/** Get Y position of a track by index (accounting for variable heights) */
	private getTrackYPosition(trackIndex: number): number {
		const tracks = this.stateManager.getTracks();
		let y = 0;
		for (let i = 0; i < trackIndex && i < tracks.length; i++) {
			y += getTrackHeight(tracks[i].primaryAssetType);
		}
		return y;
	}

	public dispose(): void {
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
	}
}
