import * as pixi from "pixi.js";

import type { TimelineClipData, TimelineTrackData } from "../timeline-types";

import type { DragOperation } from "./drag-types";
import { DragState } from "./drag-types";

/** Manages horizontal drag operations for timeline clips */
export class TimelineDragManager {
	private state: DragState = DragState.Idle;
	private operation: DragOperation | null = null;
	private isDraggingClip: boolean = false;
	private dragStartMouseX: number = 0;
	private dragStartClipStart: number = 0;
	private pendingClipUpdate: boolean = false;
	private lastClipPointerEvent: PointerEvent | null = null;
	private trackData: TimelineTrackData | null = null;
	private clipIndex: number = -1;
	private pixelsPerSecond: number = 100;
	private onPreviewUpdate?: (start: number) => void;
	private onDragComplete?: (newStart: number, initialStart: number) => void;
	private onDragCancel?: () => void;
	private handleClipDrag: (event: PointerEvent) => void;
	private handleClipDragEnd: () => void;
	private handleClipDragKeyDown: (event: KeyboardEvent) => void;
	private processClipDrag: () => void;

	constructor() {
		// Bind event handlers
		this.handleClipDrag = this.handleDragMove.bind(this);
		this.handleClipDragEnd = this.handleDragEnd.bind(this);
		this.handleClipDragKeyDown = this.handleDragKeyDown.bind(this);
		this.processClipDrag = this.processDragMove.bind(this);
	}

	/** Start a horizontal drag operation (from TimelineClip.startClipDrag) */
	public startHorizontalDrag(
		event: pixi.FederatedPointerEvent,
		clipData: TimelineClipData,
		trackData: TimelineTrackData,
		trackIndex: number,
		clipIndex: number,
		pixelsPerSecond: number,
		callbacks: {
			onPreviewUpdate?: (start: number) => void;
			onDragComplete?: (newStart: number, initialStart: number) => void;
			onDragCancel?: () => void;
		}
	): void {
		if (this.isDraggingClip) return; // Prevent multiple drag sessions

		this.isDraggingClip = true;
		this.state = DragState.Dragging;

		const globalPos = event.global;
		this.dragStartMouseX = globalPos.x;
		this.dragStartClipStart = clipData.start;

		// Store callbacks
		this.onPreviewUpdate = callbacks.onPreviewUpdate;
		this.onDragComplete = callbacks.onDragComplete;
		this.onDragCancel = callbacks.onDragCancel;

		// Store track data and parameters
		this.trackData = trackData;
		this.clipIndex = clipIndex;
		this.pixelsPerSecond = pixelsPerSecond;

		// Create drag operation
		this.operation = {
			clipId: `track${trackIndex}-clip${clipIndex}`,
			trackIndex,
			clipIndex,
			startTime: clipData.start,
			currentTime: clipData.start,
			initialMouseX: globalPos.x,
			clipData
		};

		// Set pointer capture for reliable tracking
		try {
			const pointerId = (event.nativeEvent as PointerEvent)?.pointerId;
			const container = event.currentTarget as any;
			const { canvas } = container;
			if (pointerId !== undefined && canvas && canvas.setPointerCapture) {
				canvas.setPointerCapture(pointerId);
			}
		} catch (e) {
			// Fallback if pointer capture fails
		}

		// Set up global event listeners for drag
		document.addEventListener("pointermove", this.handleClipDrag, { passive: false });
		document.addEventListener("pointerup", this.handleClipDragEnd, { passive: false });
		document.addEventListener("pointercancel", this.handleClipDragEnd, { passive: false });
		document.addEventListener("keydown", this.handleClipDragKeyDown);

		// Change cursor globally during drag
		document.body.style.cursor = "grabbing";

		// Prevent text selection during drag
		document.body.style.userSelect = "none";
	}

	/** Handle drag move events (from TimelineClip.handleClipDrag) */
	private handleDragMove(event: PointerEvent): void {
		if (!this.isDraggingClip) return;

		// Only handle primary pointer to avoid multi-touch issues
		if (!event.isPrimary) return;

		// Store the latest event for RAF processing
		this.lastClipPointerEvent = event;

		// Use RAF for smooth updates
		if (!this.pendingClipUpdate) {
			this.pendingClipUpdate = true;
			requestAnimationFrame(this.processClipDrag);
		}
	}

	/** Process drag movement with RAF (from TimelineClip.processClipDrag) */
	private processDragMove(): void {
		this.pendingClipUpdate = false;

		if (!this.isDraggingClip || !this.lastClipPointerEvent || !this.operation) return;

		const event = this.lastClipPointerEvent;

		const screenWidth = window.innerWidth;
		if (event.clientX < -200 || event.clientX > screenWidth + 200) {
			return;
		}

		// Calculate mouse delta from drag start
		const mouseDelta = event.clientX - this.dragStartMouseX;

		// Convert pixel delta to time delta with precision handling
		const effectivePixelsPerSecond = Math.max(0.1, this.pixelsPerSecond);
		const timeDelta = mouseDelta / effectivePixelsPerSecond;

		// Calculate proposed new start position
		const proposedStart = this.dragStartClipStart + timeDelta;

		const frameRate = 30;
		const frameInterval = 1 / frameRate;
		const snappedStart = Math.round(proposedStart / frameInterval) * frameInterval;

		// Apply constraints and collision detection
		const finalStart = this.applyDragConstraints(snappedStart);

		// Update operation
		this.operation.currentTime = finalStart;

		// Notify preview update
		if (this.onPreviewUpdate) {
			this.onPreviewUpdate(finalStart);
		}
	}

	/** Handle drag end (from TimelineClip.handleClipDragEnd) */
	private handleDragEnd(): void {
		if (!this.isDraggingClip || !this.operation) return;

		// Store the final preview position before cleanup
		const finalStart = this.operation.currentTime;
		const hasChanges = finalStart !== this.dragStartClipStart;

		this.isDraggingClip = false;
		this.state = DragState.Idle;

		// Clean up global event listeners
		document.removeEventListener("pointermove", this.handleClipDrag);
		document.removeEventListener("pointerup", this.handleClipDragEnd);
		document.removeEventListener("pointercancel", this.handleClipDragEnd);
		document.removeEventListener("keydown", this.handleClipDragKeyDown);

		// Clean up RAF state
		this.pendingClipUpdate = false;
		this.lastClipPointerEvent = null;

		// Restore cursor and user selection
		document.body.style.cursor = "";
		document.body.style.userSelect = "";

		// Commit the drag operation if there were changes
		if (hasChanges && this.onDragComplete) {
			this.onDragComplete(finalStart, this.dragStartClipStart);
		}

		// Clear operation and track data
		this.operation = null;
		this.trackData = null;
		this.clipIndex = -1;
	}

	/** Handle keyboard events during drag */
	private handleDragKeyDown(event: KeyboardEvent): void {
		if (!this.isDraggingClip) return;

		// Cancel drag on ESC key
		if (event.key === "Escape") {
			this.cancelDrag();
		}
	}

	/** Cancel the current drag operation */
	public cancelDrag(): void {
		if (!this.isDraggingClip) return;

		this.isDraggingClip = false;
		this.state = DragState.Idle;

		// Clean up global event listeners
		document.removeEventListener("pointermove", this.handleClipDrag);
		document.removeEventListener("pointerup", this.handleClipDragEnd);
		document.removeEventListener("pointercancel", this.handleClipDragEnd);
		document.removeEventListener("keydown", this.handleClipDragKeyDown);

		// Clean up RAF state
		this.pendingClipUpdate = false;
		this.lastClipPointerEvent = null;

		// Restore cursor and user selection
		document.body.style.cursor = "";
		document.body.style.userSelect = "";

		// Notify cancellation
		if (this.onDragCancel) {
			this.onDragCancel();
		}

		// Clear operation and track data
		this.operation = null;
		this.trackData = null;
		this.clipIndex = -1;
	}

	/** Apply drag constraints */
	private applyDragConstraints(proposedStart: number): number {
		if (!this.operation) return proposedStart;

		const minStart = 0;
		const maxStart = this.calculateMaxAllowedStart(proposedStart);
		const maxTimelineDuration = 300;
		const timelineConstrainedStart = Math.min(proposedStart, maxTimelineDuration - this.operation.clipData.length);
		const finalMinStart = Math.max(minStart, 0);
		const finalMaxStart = Math.min(maxStart, timelineConstrainedStart);
		const validMax = Math.max(finalMinStart, finalMaxStart);
		return Math.max(finalMinStart, Math.min(validMax, proposedStart));
	}

	/** Calculate maximum allowed start position */
	private calculateMaxAllowedStart(proposedStart: number): number {
		if (!this.trackData || !this.trackData.clips || this.trackData.clips.length <= 1 || !this.operation) {
			return 300; // Default maximum if no other clips
		}

		const epsilon = 0.001;
		let leftBoundary = 0;
		let rightBoundary = 300;
		const sortedClips = [...this.trackData.clips].sort((a, b) => a.start - b.start);

		for (let i = 0; i < sortedClips.length; i += 1) {
			const clip = sortedClips[i];
			// Skip the current clip (same index or same start time)
			if (i !== this.clipIndex && clip.start !== this.operation.clipData.start) {
				const otherClipStart = clip.start;
				const otherClipEnd = clip.start + clip.length;
				const clipEnd = proposedStart + this.operation.clipData.length;

				if (otherClipEnd <= proposedStart + epsilon) {
					leftBoundary = Math.max(leftBoundary, otherClipEnd);
				} else if (otherClipStart >= clipEnd - epsilon) {
					rightBoundary = Math.min(rightBoundary, otherClipStart - this.operation.clipData.length);
				} else if (otherClipStart < proposedStart) {
					leftBoundary = Math.max(leftBoundary, otherClipEnd);
				} else {
					rightBoundary = Math.min(rightBoundary, otherClipStart - this.operation.clipData.length);
				}
			}
		}

		const validRightBoundary = Math.max(leftBoundary, rightBoundary);
		return Math.max(0, validRightBoundary);
	}

	/** Get current drag state */
	public getState(): DragState {
		return this.state;
	}

	/** Check if currently dragging */
	public isDragging(): boolean {
		return this.state === DragState.Dragging;
	}
}
