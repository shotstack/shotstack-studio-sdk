/**
 * Shared constants for timeline components
 */

// Visual constants for clips
export const CLIP_CONSTANTS = {
	MIN_WIDTH: 50,
	PADDING: 4,
	DEFAULT_ALPHA: 1.0,
	DRAG_OPACITY: 0.6,
	RESIZE_OPACITY: 0.9,
	HOVER_OPACITY: 0.7,
	DISABLED_OPACITY: 0.5,
	BORDER_WIDTH: 2,
	CORNER_RADIUS: 4,
	SELECTED_BORDER_MULTIPLIER: 2,
	TEXT_FONT_SIZE: 12,
	TEXT_TRUNCATE_SUFFIX_LENGTH: 3
} as const;

// Visual constants for tracks
export const TRACK_CONSTANTS = {
	PADDING: 2,
	LABEL_PADDING: 8,
	DEFAULT_OPACITY: 0.8,
	BORDER_WIDTH: 1
} as const;

// Layout constants
export const LAYOUT_CONSTANTS = {
	TOOLBAR_HEIGHT_RATIO: 0.12, // 12% of timeline height
	RULER_HEIGHT_RATIO: 0.133, // 13.3% of timeline height
	TOOLBAR_HEIGHT_DEFAULT: 36,
	RULER_HEIGHT_DEFAULT: 40,
	TRACK_HEIGHT_DEFAULT: 80,
	BORDER_WIDTH: 2,
	CORNER_RADIUS: 4,
	CLIP_PADDING: 4,
	LABEL_PADDING: 8,
	TRACK_PADDING: 2,
	MIN_CLIP_WIDTH: 50
} as const;

// Type for constants
export type ClipConstants = typeof CLIP_CONSTANTS;
export type TrackConstants = typeof TRACK_CONSTANTS;
export type LayoutConstants = typeof LAYOUT_CONSTANTS;
