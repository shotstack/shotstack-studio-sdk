import { TimelineOptions } from "./types";

export interface TimelineLayoutConfig {
	rulerHeight: number;
	trackHeight: number;
	rulerY: number;
	tracksY: number;
	gridY: number;
	playheadY: number;
	viewportY: number;
}

export class TimelineLayout {
	// Constants
	public static readonly RULER_HEIGHT = 40;
	public static readonly TRACK_HEIGHT_DEFAULT = 80;
	public static readonly CLIP_PADDING = 4;
	public static readonly BORDER_WIDTH = 2;
	public static readonly CORNER_RADIUS = 4;
	public static readonly LABEL_PADDING = 8;
	public static readonly TRACK_PADDING = 2;

	private config: TimelineLayoutConfig;

	constructor(private options: TimelineOptions) {
		this.config = this.calculateLayout();
	}

	private calculateLayout(): TimelineLayoutConfig {
		const rulerHeight = TimelineLayout.RULER_HEIGHT;
		const trackHeight = this.options.trackHeight || TimelineLayout.TRACK_HEIGHT_DEFAULT;

		return {
			rulerHeight,
			trackHeight,
			rulerY: 0,
			tracksY: rulerHeight,
			gridY: rulerHeight,
			playheadY: 0,
			viewportY: rulerHeight
		};
	}

	// Layout getters
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
		return startTime * this.options.pixelsPerSecond!;
	}

	public calculateClipWidth(duration: number): number {
		const minWidth = 50;
		return Math.max(minWidth, duration * this.options.pixelsPerSecond!);
	}

	public calculateDropPosition(globalX: number, globalY: number): { track: number; time: number; x: number; y: number } {
		// Adjust Y to account for ruler
		const adjustedY = globalY - this.tracksY;

		const trackIndex = Math.floor(adjustedY / this.trackHeight);
		const time = Math.max(0, globalX / this.options.pixelsPerSecond!);

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
		return x / this.options.pixelsPerSecond!;
	}

	public getXAtTime(time: number): number {
		return time * this.options.pixelsPerSecond!;
	}

	public getYAtTrack(trackIndex: number): number {
		return this.tracksY + trackIndex * this.trackHeight;
	}

	// Grid and ruler dimensions
	public getGridHeight(): number {
		return this.options.height! - this.rulerHeight;
	}

	public getRulerWidth(): number {
		return this.options.width!;
	}

	public getGridWidth(): number {
		return this.options.width!;
	}

	// Viewport scroll calculations
	public calculateViewportPosition(scrollX: number, scrollY: number): { x: number; y: number } {
		return {
			x: -scrollX,
			y: this.viewportY - scrollY
		};
	}

	// Update layout when options change
	public updateOptions(options: TimelineOptions): void {
		this.options = { ...this.options, ...options };
		this.config = this.calculateLayout();
	}

	// Utility methods
	public isPointInRuler(x: number, y: number): boolean {
		return y >= this.rulerY && y <= this.rulerY + this.rulerHeight;
	}

	public isPointInTracks(x: number, y: number): boolean {
		return y >= this.tracksY && y <= this.options.height!;
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
