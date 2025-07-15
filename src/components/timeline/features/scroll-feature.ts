import { Theme } from "@core/theme/theme-context";

import { ITimelineRenderer } from "../types/timeline.interfaces";
import { TimelineWheelEvent } from "../types/timeline.types";

import { TimelineFeature } from "./feature";

/**
 * Basic scroll functionality for the timeline
 * Handles mouse wheel events for horizontal and vertical scrolling
 */
export class ScrollFeature extends TimelineFeature {
	public readonly name = "scroll";

	// Configuration
	private readonly SCROLL_SPEED = 1;
	private readonly TRACKPAD_MULTIPLIER = 0.5; // Slower scrolling for trackpad

	public onEnable(): void {
		// No setup needed for basic implementation
	}

	public onDisable(): void {
		// No cleanup needed for basic implementation
	}

	public renderOverlay(_: ITimelineRenderer): void {
		// No overlay needed for basic scrolling
	}

	/**
	 * Calculate scroll bounds based on content size
	 */
	private calculateScrollBounds(): { maxScrollX: number; maxScrollY: number } {
		const state = this.getState();
		const { width, height, zoom } = state.viewport;

		// Horizontal bounds based on timeline duration
		const duration = this.context.edit.getTotalDuration(); // Already in milliseconds
		const timelineWidth = (duration / 1000) * zoom; // Convert to seconds and apply zoom
		
		// Dynamic buffer based on zoom level
		// At minimum zoom (10), buffer is 100% of viewport (2x total)
		// At maximum zoom (1000), buffer is minimal (10% of viewport)
		const zoomFactor = (zoom - 10) / (1000 - 10); // Normalize zoom to 0-1 range
		const bufferPercentage = 1.0 - (zoomFactor * 0.9); // 100% at min zoom, 10% at max zoom
		const editingBuffer = width * bufferPercentage;
		
		const maxScrollX = Math.max(0, timelineWidth + editingBuffer - width);

		// Vertical bounds based on track count
		const editData = this.context.edit.getEdit();
		const trackCount = editData.timeline.tracks.length;
		const totalHeight = Math.max(trackCount, 3) * Theme.dimensions.track.height; // Min 3 tracks
		const maxScrollY = Math.max(0, totalHeight - height);

		return { maxScrollX, maxScrollY };
	}

	/**
	 * Handle mouse wheel scrolling
	 */
	public handleWheel(event: TimelineWheelEvent): boolean {
		// Let zoom feature handle Ctrl/Cmd+Wheel
		if (event.ctrlKey || event.metaKey) return false;

		event.preventDefault();

		const state = this.getState();
		const { scrollX, scrollY } = state.viewport;

		// Detect if this is likely a trackpad (smaller delta values, or deltaMode 0)
		const isTrackpad = event.deltaMode === 0 || Math.abs(event.deltaY) < 50;
		const multiplier = isTrackpad ? this.TRACKPAD_MULTIPLIER : this.SCROLL_SPEED;

		// Determine scroll direction and amount
		let deltaX = 0;
		let deltaY = 0;

		// Check if horizontal scroll is intended
		if (event.shiftKey) {
			// Explicit horizontal scroll with Shift
			deltaX = event.deltaY * multiplier;
		} else if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
			// Horizontal scroll gesture on trackpad
			deltaX = event.deltaX * multiplier;
		} else {
			// Vertical scroll (default)
			deltaY = event.deltaY * multiplier;
		}

		// Apply the deltas
		let newScrollX = scrollX + deltaX;
		let newScrollY = scrollY + deltaY;

		// Calculate and apply bounds
		const bounds = this.calculateScrollBounds();
		newScrollX = Math.max(0, Math.min(newScrollX, bounds.maxScrollX));
		newScrollY = Math.max(0, Math.min(newScrollY, bounds.maxScrollY));

		// Update state if values changed
		if (newScrollX !== scrollX || newScrollY !== scrollY) {
			this.updateState({
				viewport: {
					...state.viewport,
					scrollX: newScrollX,
					scrollY: newScrollY
				}
			});
		}

		return true;
	}
}