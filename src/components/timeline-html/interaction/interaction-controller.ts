import type { Edit } from "@core/edit";
import type { ClipState, HtmlTimelineInteractionConfig } from "../html-timeline.types";
import { getTrackHeight, TRACK_HEIGHTS } from "../html-timeline.types";
import { TimelineStateManager } from "../core/state/timeline-state";
import { MoveClipCommand } from "@core/commands/move-clip-command";
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
			ghost: HTMLElement;
			startTime: number;
			originalTrack: number;
			dragTarget: DragTarget;
			dragOffsetX: number; // Pixel offset from ghost left edge to mouse
			dragOffsetY: number; // Pixel offset from ghost top to mouse
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

		// Calculate drag offsets - distance from mouse to clip's top-left corner
		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const scrollY = this.tracksContainer.scrollTop;
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		// Mouse position in content space
		const mouseX = e.clientX - rect.left + scrollX;
		const mouseY = e.clientY - rect.top + scrollY;

		// Clip position in content space
		const clipLeft = clip.config.start * pps;
		const clipTop = this.getTrackYPosition(clipRef.trackIndex) + 4; // +4 for padding

		// Offsets from clip corner to mouse
		const dragOffsetX = mouseX - clipLeft;
		const dragOffsetY = mouseY - clipTop;

		// Create drag ghost
		const ghost = this.createDragGhost(clip);
		this.feedbackLayer.appendChild(ghost);

		this.state = {
			type: "dragging",
			clipRef,
			ghost,
			startTime: originalTime,
			originalTrack: clipRef.trackIndex,
			dragTarget: { type: "track", trackIndex: clipRef.trackIndex },
			dragOffsetX,
			dragOffsetY
		};

		this.stateManager.setClipVisualState(clipRef.trackIndex, clipRef.clipIndex, "dragging");
		this.buildSnapPoints(clipRef);
	}

	private createDragGhost(clip: ClipState): HTMLElement {
		const ghost = document.createElement("div");
		ghost.className = "ss-drag-ghost ss-clip";
		const assetType = clip.config.asset?.type || "unknown";
		ghost.dataset["assetType"] = assetType;

		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const width = clip.config.length * pps;
		const trackHeight = getTrackHeight(assetType);

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

		// Mouse position in content space
		const mouseX = e.clientX - rect.left + scrollX;
		const mouseY = e.clientY - rect.top + scrollY;

		// Calculate ghost position (mouse minus offset = clip corner position)
		const ghostX = mouseX - this.state.dragOffsetX;
		const ghostY = mouseY - this.state.dragOffsetY;

		// Calculate new clip start time from ghost position
		let clipTime = Math.max(0, ghostX / pps);

		// Determine drag target based on mouse Y (not ghost Y)
		const dragTarget = this.getDragTargetAtY(mouseY);
		this.state.dragTarget = dragTarget;

		// Apply snapping to clip time (not mouse position)
		const snappedTime = this.applySnap(clipTime);
		if (snappedTime !== null) {
			clipTime = snappedTime;
			this.showSnapLine(clipTime);
		} else {
			this.hideSnapLine();
		}

		// Get offset for positioning in feedback layer (accounts for ruler height)
		const tracksOffset = this.getTracksOffsetInFeedbackLayer();

		// Position ghost freely - X follows clip time (with snap), Y follows mouse
		this.state.ghost.style.left = `${clipTime * pps}px`;
		this.state.ghost.style.top = `${ghostY + tracksOffset}px`;

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

	private completeDrag(e: PointerEvent): void {
		if (this.state.type !== "dragging") return;

		const { clipRef, ghost, startTime, originalTrack, dragTarget, dragOffsetX } = this.state;

		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const pps = this.stateManager.getViewport().pixelsPerSecond;

		// Calculate ghost position (mouse minus offset = clip corner position)
		const mouseX = e.clientX - rect.left + scrollX;
		const ghostX = mouseX - dragOffsetX;

		// Calculate new clip start time from ghost position
		let newTime = Math.max(0, ghostX / pps);

		// Apply snapping
		const snappedTime = this.applySnap(newTime);
		if (snappedTime !== null) {
			newTime = snappedTime;
		}

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
		} else if (newTime !== startTime || dragTarget.trackIndex !== originalTrack) {
			// Move to existing track
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
		this.stateManager.setClipVisualState(clipRef.trackIndex, clipRef.clipIndex, "normal");
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
	}
}
