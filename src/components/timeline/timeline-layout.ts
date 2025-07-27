import { TimelineTheme } from "../../core/theme";

import { LAYOUT_CONSTANTS } from "./constants";
import { TimelineOptions } from "./types/timeline";

export interface TimelineLayoutConfig {
	toolbarHeight: number;
	rulerHeight: number;
	trackHeight: number;
	toolbarY: number;
	rulerY: number;
	tracksY: number;
	gridY: number;
	playheadY: number;
	viewportY: number;
}

export class TimelineLayout {
	// Use constants from centralized location
	public static readonly TOOLBAR_HEIGHT_RATIO = LAYOUT_CONSTANTS.TOOLBAR_HEIGHT_RATIO;
	public static readonly RULER_HEIGHT_RATIO = LAYOUT_CONSTANTS.RULER_HEIGHT_RATIO;
	public static readonly TOOLBAR_HEIGHT_DEFAULT = LAYOUT_CONSTANTS.TOOLBAR_HEIGHT_DEFAULT;
	public static readonly RULER_HEIGHT_DEFAULT = LAYOUT_CONSTANTS.RULER_HEIGHT_DEFAULT;
	public static readonly TRACK_HEIGHT_DEFAULT = LAYOUT_CONSTANTS.TRACK_HEIGHT_DEFAULT;
	public static readonly CLIP_PADDING = LAYOUT_CONSTANTS.CLIP_PADDING;
	public static readonly BORDER_WIDTH = LAYOUT_CONSTANTS.BORDER_WIDTH;
	public static readonly CORNER_RADIUS = LAYOUT_CONSTANTS.CORNER_RADIUS;
	public static readonly LABEL_PADDING = LAYOUT_CONSTANTS.LABEL_PADDING;
	public static readonly TRACK_PADDING = LAYOUT_CONSTANTS.TRACK_PADDING;

	private config: TimelineLayoutConfig;

	constructor(
		private options: Required<TimelineOptions>,
		private theme?: TimelineTheme
	) {
		this.config = this.calculateLayout();
	}

	private calculateLayout(): TimelineLayoutConfig {
		// Calculate proportional heights based on timeline height
		const timelineHeight = this.options.height;

		// Calculate toolbar and ruler heights proportionally
		// Use theme values if available, otherwise calculate from timeline height
		let toolbarHeight = this.theme?.dimensions?.toolbarHeight || Math.round(timelineHeight * TimelineLayout.TOOLBAR_HEIGHT_RATIO);
		let rulerHeight = this.theme?.dimensions?.rulerHeight || Math.round(timelineHeight * TimelineLayout.RULER_HEIGHT_RATIO);

		// Apply minimum heights to ensure usability
		toolbarHeight = Math.max(toolbarHeight, TimelineLayout.TOOLBAR_HEIGHT_DEFAULT);
		rulerHeight = Math.max(rulerHeight, TimelineLayout.RULER_HEIGHT_DEFAULT);

		// Track height from options (already validated in Timeline)
		const { trackHeight } = this.options;

		return {
			toolbarHeight,
			rulerHeight,
			trackHeight,
			toolbarY: 0,
			rulerY: toolbarHeight,
			tracksY: toolbarHeight + rulerHeight,
			gridY: toolbarHeight + rulerHeight,
			playheadY: toolbarHeight,
			viewportY: toolbarHeight + rulerHeight
		};
	}

	// Layout getters
	get toolbarHeight(): number {
		return this.config.toolbarHeight;
	}

	get toolbarY(): number {
		return this.config.toolbarY;
	}

	get rulerHeight(): number {
		return this.config.rulerHeight;
	}

	get trackHeight(): number {
		return this.config.trackHeight;
	}

	get rulerY(): number {
		return this.config.rulerY;
	}

	get tracksY(): number {
		return this.config.tracksY;
	}

	get gridY(): number {
		return this.config.gridY;
	}

	get playheadY(): number {
		return this.config.playheadY;
	}

	get viewportY(): number {
		return this.config.viewportY;
	}

	// Positioning methods
	public positionTrack(trackIndex: number): number {
		return trackIndex * this.trackHeight;
	}

	public positionClip(startTime: number): number {
		return startTime * this.options.pixelsPerSecond;
	}

	public calculateClipWidth(duration: number): number {
		return Math.max(LAYOUT_CONSTANTS.MIN_CLIP_WIDTH, duration * this.options.pixelsPerSecond);
	}

	public calculateDropPosition(globalX: number, globalY: number): { track: number; time: number; x: number; y: number } {
		// Adjust Y to account for ruler
		const adjustedY = globalY - this.tracksY;

		const trackIndex = Math.floor(adjustedY / this.trackHeight);
		const time = Math.max(0, globalX / this.options.pixelsPerSecond);

		return {
			track: Math.max(0, trackIndex),
			time,
			x: globalX,
			y: adjustedY
		};
	}

	public getTrackAtY(y: number): number {
		// Adjust Y to account for ruler
		const adjustedY = y - this.tracksY;
		return Math.floor(adjustedY / this.trackHeight);
	}

	public getTimeAtX(x: number): number {
		return x / this.options.pixelsPerSecond;
	}

	public getXAtTime(time: number): number {
		return time * this.options.pixelsPerSecond;
	}

	public getYAtTrack(trackIndex: number): number {
		return this.tracksY + trackIndex * this.trackHeight;
	}

	// Grid and ruler dimensions
	public getGridHeight(): number {
		return this.options.height - this.toolbarHeight - this.rulerHeight;
	}

	public getRulerWidth(): number {
		return this.options.width;
	}

	public getGridWidth(): number {
		return this.options.width;
	}

	// Viewport scroll calculations
	public calculateViewportPosition(scrollX: number, scrollY: number): { x: number; y: number } {
		return {
			x: -scrollX,
			y: this.viewportY - scrollY
		};
	}

	// Update layout when options or theme change
	public updateOptions(options: Required<TimelineOptions>, theme?: TimelineTheme): void {
		this.options = options;
		this.theme = theme;
		this.config = this.calculateLayout();
	}

	// Utility methods
	public isPointInToolbar(_x: number, y: number): boolean {
		return y >= this.toolbarY && y <= this.toolbarY + this.toolbarHeight;
	}

	public isPointInRuler(_x: number, y: number): boolean {
		return y >= this.rulerY && y <= this.rulerY + this.rulerHeight;
	}

	public isPointInTracks(_x: number, y: number): boolean {
		return y >= this.tracksY && y <= this.options.height;
	}

	public getVisibleTrackRange(scrollY: number, viewportHeight: number): { start: number; end: number } {
		const adjustedScrollY = scrollY;
		const startTrack = Math.floor(adjustedScrollY / this.trackHeight);
		const endTrack = Math.ceil((adjustedScrollY + viewportHeight) / this.trackHeight);

		return {
			start: Math.max(0, startTrack),
			end: Math.max(0, endTrack)
		};
	}
}
