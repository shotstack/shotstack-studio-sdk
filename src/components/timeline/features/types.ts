import { TimelineTheme } from "../../../core/theme";
import { Timeline } from "../timeline";

// Constants for timeline features
export const TIMELINE_CONSTANTS = {
	RULER: {
		DEFAULT_HEIGHT: 40,
		MAJOR_MARKER_HEIGHT_RATIO: 0.8,
		MINOR_MARKER_HEIGHT_RATIO: 0.6,
		MINOR_MARKER_TENTH_HEIGHT_RATIO: 0.3,
		LABEL_FONT_SIZE: 10,
		LABEL_PADDING_X: 2,
		LABEL_PADDING_Y: 2,
		MINOR_MARKER_ZOOM_THRESHOLD: 20,
		LABEL_INTERVAL_ZOOMED: 1,
		LABEL_INTERVAL_DEFAULT: 5,
		LABEL_ZOOM_THRESHOLD: 50
	},
	PLAYHEAD: {
		LINE_WIDTH: 2,
		HANDLE_WIDTH: 10,
		HANDLE_HEIGHT: 10,
		HANDLE_OFFSET_Y: -10,
		HANDLE_OFFSET_X: 5
	},
	GRID: {
		LINE_WIDTH: 1,
		INTERVAL_ZOOMED: 1,
		INTERVAL_DEFAULT: 5,
		ZOOM_THRESHOLD: 50
	},
	SCROLL: {
		HORIZONTAL_SPEED: 2,
		VERTICAL_SPEED: 0.5
	}
} as const;

// Type-safe event definitions
export interface TimelineFeatureEvents {
	'ruler:seeked': { time: number };
	'playhead:seeked': { time: number };
	'playhead:timeChanged': { time: number };
	'scroll': { x: number; y: number };
}

// Parameter object interfaces
export interface RulerFeatureOptions {
	pixelsPerSecond: number;
	timelineDuration: number;
	rulerHeight?: number;
	theme?: TimelineTheme;
}

export interface PlayheadFeatureOptions {
	pixelsPerSecond: number;
	timelineHeight: number;
	theme?: TimelineTheme;
}

export interface GridFeatureOptions {
	pixelsPerSecond: number;
	timelineDuration: number;
	timelineHeight: number;
	trackHeight: number;
	theme?: TimelineTheme;
}

export interface ScrollManagerOptions {
	timeline: Timeline;
}