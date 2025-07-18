import { TimelineTheme } from "../../../core/theme";
import { TimelineLayout } from "../timeline-layout";
import { TimelineOptions } from "../types/timeline";

export class TimelineOptionsManager {
	private pixelsPerSecond: number;
	private trackHeight: number;
	private backgroundColor: number;
	private antialias: boolean;
	private resolution: number;
	private width: number;
	private height: number;

	constructor(
		size: { width: number; height: number },
		theme: TimelineTheme,
		private layout: TimelineLayout,
		private onResize?: (width: number) => void
	) {
		// Set dimensions from size parameter
		this.width = size.width;
		this.height = size.height;
		
		// Set default values for other properties (some from theme)
		this.pixelsPerSecond = 50;
		// Enforce minimum track height of 40px for usability
		const themeTrackHeight = theme.dimensions?.trackHeight || TimelineLayout.TRACK_HEIGHT_DEFAULT;
		this.trackHeight = Math.max(40, themeTrackHeight);
		this.backgroundColor = theme.colors.structure.background;
		this.antialias = true;
		this.resolution = window.devicePixelRatio || 1;
	}

	public getOptions(): TimelineOptions {
		return {
			width: this.width,
			height: this.height,
			pixelsPerSecond: this.pixelsPerSecond,
			trackHeight: this.trackHeight,
			backgroundColor: this.backgroundColor,
			antialias: this.antialias,
			resolution: this.resolution
		};
	}

	public setOptions(options: Partial<TimelineOptions>): void {
		if (options.width !== undefined) {
			this.width = options.width;
			// Notify about width change
			if (this.onResize) {
				this.onResize(this.width);
			}
		}
		if (options.height !== undefined) this.height = options.height;
		if (options.pixelsPerSecond !== undefined) this.pixelsPerSecond = options.pixelsPerSecond;
		if (options.trackHeight !== undefined) this.trackHeight = options.trackHeight;
		if (options.backgroundColor !== undefined) this.backgroundColor = options.backgroundColor;
		if (options.antialias !== undefined) this.antialias = options.antialias;
		if (options.resolution !== undefined) this.resolution = options.resolution;
		
		// Update layout with new options
		this.layout.updateOptions(this.getOptions() as Required<TimelineOptions>);
	}

	public updateFromTheme(theme: TimelineTheme): void {
		// Update backgroundColor from theme
		this.backgroundColor = theme.colors.structure.background;
		
		// Update trackHeight from theme (with minimum of 40px)
		const themeTrackHeight = theme.dimensions?.trackHeight || TimelineLayout.TRACK_HEIGHT_DEFAULT;
		this.trackHeight = Math.max(40, themeTrackHeight);
		
		// Update layout with new options and theme
		this.layout.updateOptions(this.getOptions() as Required<TimelineOptions>, theme);
	}

	// Individual getters
	public getWidth(): number { return this.width; }
	public getHeight(): number { return this.height; }
	public getPixelsPerSecond(): number { return this.pixelsPerSecond; }
	public getTrackHeight(): number { return this.trackHeight; }
	public getBackgroundColor(): number { return this.backgroundColor; }
	public getAntialias(): boolean { return this.antialias; }
	public getResolution(): number { return this.resolution; }
}