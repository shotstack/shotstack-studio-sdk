import { TimelineTheme, TimelineThemePreset, TimelineThemeOverride, validateTheme } from "./theme.types";
import { TIMELINE_THEMES } from "./themes";

// Simple theme storage
let currentTheme: TimelineTheme = TIMELINE_THEMES.dark;

/**
 * Deep merge helper for theme overrides
 */
function mergeTheme(base: TimelineTheme, override: TimelineThemeOverride): TimelineTheme {
	const merged = { ...base };

	for (const key in override) {
		if (Object.prototype.hasOwnProperty.call(override, key)) {
			const baseValue = (base as any)[key];
			const overrideValue = (override as any)[key];

			if (typeof overrideValue === "object" && overrideValue !== null && !Array.isArray(overrideValue)) {
				(merged as any)[key] = mergeTheme(baseValue, overrideValue);
			} else {
				(merged as any)[key] = overrideValue;
			}
		}
	}

	return merged;
}

/**
 * Simple theme access object - themes are set once at startup
 */
export const Theme = {
	/**
	 * Set the theme (called once at startup)
	 */
	set(theme: TimelineTheme): void {
		validateTheme(theme);
		currentTheme = theme;
	},

	/**
	 * Set a preset theme by name (called once at startup)
	 */
	setPreset(preset: TimelineThemePreset): void {
		const theme = TIMELINE_THEMES[preset];
		if (theme) {
			this.set(theme);
		} else {
			console.warn(`Theme preset "${preset}" not found`);
		}
	},

	/**
	 * Apply theme overrides to the current theme
	 */
	applyOverrides(overrides: TimelineThemeOverride): void {
		currentTheme = mergeTheme(currentTheme, overrides);
	},

	/**
	 * Direct access to theme properties
	 */
	get colors() {
		return currentTheme.colors;
	},
	get dimensions() {
		// Return dimensions with computed clip values
		const dims = currentTheme.dimensions;
		
		// Calculate clip dimensions as ratios of track height
		const clipHeightRatio = 0.8; // Clip is 80% of track height
		const clipOffsetRatio = 0.1; // Clip starts at 10% from top
		
		return {
			...dims,
			clip: {
				// Compute height from track height
				height: dims.track.height * clipHeightRatio,
				// Keep corner radius and padding as fixed values
				cornerRadius: dims.clip?.cornerRadius ?? 4,
				labelPaddingX: dims.clip?.labelPaddingX ?? 5,
				// Compute vertical offsets from track height
				labelOffsetY: dims.track.height * 0.5, // Center label vertically
				offsetY: dims.track.height * clipOffsetRatio
			}
		};
	},
	get typography() {
		return currentTheme.typography;
	},
	get opacity() {
		return currentTheme.opacity;
	},
	get borders() {
		return currentTheme.borders;
	}
};
