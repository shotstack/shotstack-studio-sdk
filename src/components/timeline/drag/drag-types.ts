import type { TimelineClipData } from "../timeline-types";

/**
 * Represents an active drag operation for a timeline clip
 */
export type DragOperation = {
	/** Unique identifier for the clip being dragged */
	clipId: string;
	/** Index of the track containing the clip */
	trackIndex: number;
	/** Index of the clip within its track */
	clipIndex: number;
	/** Original start time when drag began */
	startTime: number;
	/** Current time position during drag */
	currentTime: number;
	/** Initial mouse X position when drag started */
	initialMouseX: number;
	/** Complete clip data for the dragged clip */
	clipData: TimelineClipData;
};

/**
 * Constraints for drag operations
 */
export type DragConstraints = {
	/** Minimum allowed start time */
	minStart: number;
	/** Maximum allowed start time */
	maxStart: number;
	/** Frame interval for snapping (e.g., 1/30 for 30fps) */
	frameInterval: number;
};

/**
 * Current state of the drag manager
 */
export enum DragState {
	Idle = "idle",
	Dragging = "dragging"
}
