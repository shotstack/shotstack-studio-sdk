import { ITimelineRenderer } from "../types/timeline.interfaces";
import { TimelineWheelEvent } from "../types/timeline.types";

import { TimelineFeature } from "./timeline-feature";

/**
 * Handles zoom functionality for the timeline
 */
export class ZoomFeature extends TimelineFeature {
	public readonly name = "zoom";

	private zoomLevel: number = 1.0;
	private readonly minZoom: number = 0.1;
	private readonly maxZoom: number = 10.0;
	private readonly basePixelsPerSecond: number = 100;

	public onEnable(): void {}
	public onDisable(): void {}
	public renderOverlay(__renderer: ITimelineRenderer): void {}

	/**
	 * Handle wheel events for zoom
	 */
	public handleWheel(event: TimelineWheelEvent): void {
		// Only handle Ctrl/Cmd + wheel for zoom
		if (!event.ctrlKey && !event.metaKey) {
			return;
		}

		event.preventDefault();

		// Calculate zoom change
		const delta = -event.deltaY * 0.01;
		const newZoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));

		if (newZoomLevel !== this.zoomLevel) {
			// Update zoom
			this.zoomLevel = newZoomLevel;
			const newPixelsPerSecond = this.basePixelsPerSecond * this.zoomLevel;

			// Apply changes - this will update the state with the new zoom
			this.context.timeline.setPixelsPerSecond(newPixelsPerSecond);
		}
	}
}
