import { ITimelineRenderer } from "../types/timeline.interfaces";
import { TimelineWheelEvent } from "../types/timeline.types";

import { TimelineFeature } from "./feature";

/**
 * Handles zoom functionality for the timeline
 */
export class ZoomFeature extends TimelineFeature {
	public readonly name = "zoom";
	
	private zoomLevel = 1.0;
	private readonly zoom = {
		min: 0.1,
		max: 10.0,
		basePixelsPerSecond: 100,
		sensitivity: 0.01
	};

	public onEnable(): void {}
	public onDisable(): void {}
	public renderOverlay(_: ITimelineRenderer): void {}

	public handleWheel(event: TimelineWheelEvent): void {
		if (!event.ctrlKey && !event.metaKey) return;
		
		event.preventDefault();
		
		const newZoom = Math.max(this.zoom.min, 
			Math.min(this.zoom.max, this.zoomLevel - event.deltaY * this.zoom.sensitivity));
		
		if (newZoom !== this.zoomLevel) {
			this.zoomLevel = newZoom;
			this.context.timeline.setPixelsPerSecond(this.zoom.basePixelsPerSecond * newZoom);
		}
	}
}
