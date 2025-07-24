export const TOOLBAR_CONSTANTS = {
	// Layout
	BUTTON_SIZE: 24,
	BUTTON_SPACING: 8,
	BUTTON_HOVER_PADDING: 4,
	BORDER_RADIUS: 4,
	TEXT_SPACING: 16,
	EDGE_MARGIN: 10,
	
	// Playback
	FRAME_TIME_MS: 16.67, // milliseconds per frame
	
	// Icon dimensions
	ICON: {
		// Play icon (triangle)
		PLAY: {
			LEFT: 6,
			TOP: 4,
			RIGHT: 18,
			MIDDLE: 12,
			BOTTOM: 20
		},
		// Pause icon (two rectangles)
		PAUSE: {
			RECT1_X: 6,
			RECT2_X: 14,
			TOP: 4,
			WIDTH: 4,
			HEIGHT: 16
		},
		// Frame back/forward (double triangles)
		FRAME_STEP: {
			TRIANGLE1: {
				BACK: { LEFT: 11, RIGHT: 3, MIDDLE: 12 },
				FORWARD: { LEFT: 4, RIGHT: 12, MIDDLE: 12 }
			},
			TRIANGLE2: {
				BACK: { LEFT: 20, RIGHT: 12, MIDDLE: 12 },
				FORWARD: { LEFT: 13, RIGHT: 21, MIDDLE: 12 }
			},
			TOP: 4,
			BOTTOM: 20
		}
	},
	
	// Cut button
	CUT_BUTTON: {
		WIDTH: 60,
		HEIGHT: 24,
		FONT_SIZE: 12
	},
	
	// Time display
	TIME_DISPLAY: {
		FONT_SIZE: 14,
		FONT_FAMILY: 'monospace'
	},
	
	// Animation
	HOVER_ANIMATION_ALPHA: 1,
	ACTIVE_ANIMATION_ALPHA: 0.3,
	DIVIDER_ALPHA: 0.5
} as const;

export type ToolbarConstants = typeof TOOLBAR_CONSTANTS;