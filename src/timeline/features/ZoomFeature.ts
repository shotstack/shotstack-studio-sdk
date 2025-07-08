import { TimelineFeature } from "../core/TimelineFeature";
import { ITimelineRenderer } from "../interfaces";
import { TimelineWheelEvent } from "../types/timeline.types";

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
		
		// Calculate zoom change with focus point preservation
		const oldPixelsPerSecond = this.basePixelsPerSecond * this.zoomLevel;
		const delta = -event.deltaY * 0.01;
		const newZoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomLevel + delta));
		
		if (newZoomLevel !== this.zoomLevel) {
			// Calculate focus point for zoom
			const focusX = event.x || 0;
			const { viewport } = this.state.getState();
			const { scrollX } = viewport;
			const timeAtMouse = (scrollX + focusX) / oldPixelsPerSecond;
			
			// Update zoom
			this.zoomLevel = newZoomLevel;
			const newPixelsPerSecond = this.basePixelsPerSecond * this.zoomLevel;
			
			// Calculate new scroll to maintain focus point
			const newScrollX = (timeAtMouse * newPixelsPerSecond) - focusX;
			
			// Apply changes
			this.context.timeline.setPixelsPerSecond(newPixelsPerSecond);
			
			// Update scroll position
			this.state.update({
				viewport: {
					...viewport,
					scrollX: Math.max(0, newScrollX)
				}
			});
		}
	}
}