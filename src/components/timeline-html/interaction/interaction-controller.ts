import type { Edit } from "@core/edit";
import type { ClipState, HtmlTimelineInteractionConfig } from "../html-timeline.types";
import { TimelineStateManager } from "../core/state/timeline-state";
import { MoveClipCommand } from "@core/commands/move-clip-command";
import { ResizeClipCommand } from "@core/commands/resize-clip-command";

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

/** Interaction state machine */
type InteractionState =
	| { type: "idle" }
	| { type: "pending"; startPoint: Point; clipRef: ClipRef; originalTime: number }
	| { type: "dragging"; clipRef: ClipRef; ghost: HTMLElement; startTime: number; originalTrack: number }
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

		// Create drag ghost
		const ghost = this.createDragGhost(clip);
		this.feedbackLayer.appendChild(ghost);

		this.state = {
			type: "dragging",
			clipRef,
			ghost,
			startTime: originalTime,
			originalTrack: clipRef.trackIndex
		};

		this.stateManager.setClipVisualState(clipRef.trackIndex, clipRef.clipIndex, "dragging");
		this.buildSnapPoints(clipRef);
	}

	private createDragGhost(clip: ClipState): HTMLElement {
		const ghost = document.createElement("div");
		ghost.className = "ss-drag-ghost ss-clip";
		ghost.dataset["assetType"] = clip.config.asset?.type || "unknown";

		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const width = clip.config.length * pps;

		ghost.style.width = `${width}px`;
		ghost.style.height = "56px"; // Track height - padding
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
		const trackHeight = 64;

		// Calculate new position
		const x = e.clientX - rect.left + scrollX;
		const y = e.clientY - rect.top + scrollY;

		let time = Math.max(0, x / pps);
		const trackIndex = Math.max(0, Math.floor(y / trackHeight));

		// Apply snapping
		const snappedTime = this.applySnap(time);
		if (snappedTime !== null) {
			time = snappedTime;
			this.showSnapLine(time);
		} else {
			this.hideSnapLine();
		}

		// Update ghost position
		this.state.ghost.style.left = `${time * pps}px`;
		this.state.ghost.style.top = `${trackIndex * trackHeight + 4}px`;
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

		const { clipRef, ghost, startTime, originalTrack } = this.state;

		const rect = this.tracksContainer.getBoundingClientRect();
		const scrollX = this.tracksContainer.scrollLeft;
		const scrollY = this.tracksContainer.scrollTop;
		const pps = this.stateManager.getViewport().pixelsPerSecond;
		const trackHeight = 64;

		const x = e.clientX - rect.left + scrollX;
		const y = e.clientY - rect.top + scrollY;

		let newTime = Math.max(0, x / pps);
		const newTrackIndex = Math.max(0, Math.floor(y / trackHeight));

		// Apply snapping
		const snappedTime = this.applySnap(newTime);
		if (snappedTime !== null) {
			newTime = snappedTime;
		}

		// Execute move command if position changed
		if (newTime !== startTime || newTrackIndex !== originalTrack) {
			const command = new MoveClipCommand(
				originalTrack,
				clipRef.clipIndex,
				newTrackIndex,
				newTime
			);
			this.edit.executeEditCommand(command);
		}

		// Cleanup
		ghost.remove();
		this.hideSnapLine();
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
	}
}
