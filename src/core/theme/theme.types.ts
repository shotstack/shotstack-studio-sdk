/**
 * Timeline Theme Configuration
 * Allows developers to customize the visual appearance of the timeline
 */

export interface TimelineTheme {
	// Color Palette
	colors: {
		// Background colors
		background: {
			primary: number; // Main timeline background (default: 0x1a1a1a)
			tracks: {
				even: number; // Even track rows (default: 0x2a2a2a)
				odd: number; // Odd track rows (default: 0x252525)
			};
		};

		// Border colors
		borders: {
			primary: number; // Main borders (default: 0x404040)
			secondary: number; // Secondary borders (default: 0x2a2a2a)
		};

		// Clip colors by asset type
		clips: {
			video: number; // Video clips (default: 0x4444ff)
			audio: number; // Audio clips (default: 0x44ff44)
			image: number; // Image clips (default: 0xff44ff)
			text: number; // Text clips (default: 0xffaa44)
			html: number; // HTML clips (default: 0x44ffff)
			luma: number; // Luma clips (default: 0xff4444)
			shape: number; // Shape clips (default: 0xaaaa44)
			default: number; // Unknown types (default: 0x888888)
		};

		// UI element colors
		ui: {
			selection: number; // Selection highlight (default: 0xffff00)
			playhead: number; // Playhead color (default: 0xff0000)
			playheadOutline: number; // Playhead outline (default: 0xffffff)
			ruler: {
				background: number; // Ruler background (default: 0x1a1a1a)
				majorTick: number; // Major tick marks (default: 0x808080)
				minorTick: number; // Minor tick marks (default: 0x606060)
				label: number; // Time labels (default: 0xcccccc)
			};
		};

		// Interaction state colors
		states: {
			valid: number; // Valid drop zones (default: 0x4caf50)
			invalid: number; // Invalid drop zones (default: 0xff5252)
		};
	};

	// Dimensions and Spacing
	dimensions: {
		// Track dimensions
		track: {
			height: number; // Track height (default: 60)
			gap: number; // Gap between tracks (default: 2)
		};

		// Clip dimensions (optional - computed from track height if not provided)
		clip?: {
			height?: number; // Clip height (computed as 80% of track height)
			cornerRadius?: number; // Corner radius (default: 4)
			labelPaddingX?: number; // Label padding (default: 5)
			labelOffsetY?: number; // Label Y offset (computed as 50% of track height)
			offsetY?: number; // Clip Y offset in track (computed as 10% of track height)
		};

		// Ruler dimensions
		ruler: {
			height: number; // Ruler height (default: 30)
			majorTickHeight: number; // Major tick height (default: 10)
			minorTickHeight: number; // Minor tick height (default: 5)
			labelOffset: number; // Label offset (default: 2)
			minPixelsBetweenLabels: number; // Min spacing (default: 60)
		};

		// Playhead dimensions
		playhead: {
			lineWidth: number; // Line width (default: 2)
			handleWidth: number; // Handle width (default: 12)
			handleHeight: number; // Handle height (default: 10)
			hitAreaPadding: number; // Hit area padding (default: 4)
		};
	};

	// Typography
	typography: {
		ruler: {
			fontSize: number; // Ruler label font size (default: 10)
		};
	};

	// Opacity values
	opacity: {
		trackBackground: number; // Track background (default: 0.5)
		clip: number; // Clip opacity (default: 0.8)
		playheadOutline: number; // Playhead outline (default: 0.5)
	};

	// Border widths
	borders: {
		track: number; // Track border (default: 1)
	};
}

/**
 * Partial theme for overriding specific values
 */
export type TimelineThemeOverride = DeepPartial<TimelineTheme>;

/**
 * Helper type for deep partial
 */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Theme preset names
 */
export type TimelineThemePreset = "default" | "dark" | "light" | "professional" | "minimal-light";

/**
 * Validates that a theme has all required properties
 * @throws Error if validation fails
 */
export function validateTheme(theme: TimelineTheme): void {
	const requiredPaths = [
		"colors.background.primary",
		"colors.clips.video",
		"colors.ui.selection",
		"dimensions.track.height",
		"opacity.clip"
	];

	for (const path of requiredPaths) {
		const value = path.split(".").reduce((obj: any, key) => obj?.[key], theme);
		if (value === undefined) {
			throw new Error(`Theme validation failed: Missing required property "${path}"`);
		}
	}
}
