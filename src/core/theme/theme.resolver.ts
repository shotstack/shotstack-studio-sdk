import { convertThemeColors, convertThemeColorsGeneric } from "./theme-utils";
import { TimelineTheme, TimelineThemeOptions, DeepPartial, TimelineThemeInput } from "./theme.types";

// Default theme embedded directly in code
const DEFAULT_THEME_DATA: TimelineThemeInput = {
	colors: {
		structure: {
			background: "#1a1a1a",
			surface: "#2a2a2a",
			surfaceAlt: "#242424",
			border: "#3a3a3a",
			divider: "#1a1a1a",
			ruler: "#404040"
		},
		assets: {
			video: "#4a90e2",
			audio: "#7ed321",
			image: "#f5a623",
			text: "#d0021b",
			shape: "#9013fe",
			html: "#50e3c2",
			luma: "#b8e986",
			transition: "#8e8e93",
			default: "#8e8e93"
		},
		interaction: {
			hover: "#666666",
			selected: "#007acc",
			focus: "#007acc",
			dropZone: "#00ff00",
			snapGuide: "#888888",
			playhead: "#ff4444",
			drag: "#00ff00",
			trackInsertion: "#00ff00"
		},
		ui: {
			text: "#ffffff",
			textMuted: "#cccccc",
			icon: "#888888",
			iconMuted: "#666666"
		},
		toolbar: {
			background: "#1a1a1a",
			surface: "#2a2a2a",
			hover: "#3a3a3a",
			active: "#007acc",
			divider: "#3a3a3a"
		}
	},
	dimensions: {
		toolbarHeight: 36,
		trackHeight: 60,
		rulerHeight: 40,
		clipRadius: 4,
		borderWidth: 2
	}
};

// Default theme converted once at module load
const DEFAULT_THEME: TimelineTheme = convertThemeColors(DEFAULT_THEME_DATA);

export class TimelineThemeResolver {
	public static resolveTheme(options?: TimelineThemeOptions): TimelineTheme {
		if (!options || !options.theme) {
			return this.deepClone(DEFAULT_THEME);
		}

		// Convert hex colors to PIXI numbers
		const convertedTheme = convertThemeColorsGeneric(options.theme) as DeepPartial<TimelineTheme>;

		// Start with default theme and merge with provided theme
		const baseTheme = this.deepClone(DEFAULT_THEME);
		const resolvedTheme = this.deepMerge(baseTheme, convertedTheme);

		return resolvedTheme;
	}

	public static validateTheme(theme: TimelineTheme): boolean {
		try {
			// Basic structure validation
			if (!theme.colors) return false;
			if (!theme.colors.structure) return false;
			if (!theme.colors.assets) return false;
			if (!theme.colors.interaction) return false;
			if (!theme.colors.ui) return false;

			// Validate required color properties
			const requiredStructureColors = ["background", "surface", "surfaceAlt", "border", "divider", "ruler"];
			const requiredAssetColors = ["video", "audio", "image", "text", "shape", "html", "luma", "transition", "default"];
			const requiredInteractionColors = ["hover", "selected", "focus", "dropZone", "snapGuide", "playhead", "drag"];
			const requiredUIColors = ["text", "textMuted", "icon", "iconMuted"];

			for (const color of requiredStructureColors) {
				if (typeof theme.colors.structure[color as keyof typeof theme.colors.structure] !== "number") {
					return false;
				}
			}

			for (const color of requiredAssetColors) {
				if (typeof theme.colors.assets[color as keyof typeof theme.colors.assets] !== "number") {
					return false;
				}
			}

			for (const color of requiredInteractionColors) {
				if (typeof theme.colors.interaction[color as keyof typeof theme.colors.interaction] !== "number") {
					return false;
				}
			}

			for (const color of requiredUIColors) {
				if (typeof theme.colors.ui[color as keyof typeof theme.colors.ui] !== "number") {
					return false;
				}
			}

			// Validate optional sections
			if (theme.dimensions) {
				const { dimensions } = theme;
				if (dimensions.trackHeight !== undefined && (typeof dimensions.trackHeight !== "number" || dimensions.trackHeight <= 0)) {
					return false;
				}
				if (dimensions.rulerHeight !== undefined && (typeof dimensions.rulerHeight !== "number" || dimensions.rulerHeight <= 0)) {
					return false;
				}
				if (dimensions.clipRadius !== undefined && (typeof dimensions.clipRadius !== "number" || dimensions.clipRadius < 0)) {
					return false;
				}
				if (dimensions.borderWidth !== undefined && (typeof dimensions.borderWidth !== "number" || dimensions.borderWidth < 0)) {
					return false;
				}
			}

			return true;
		} catch (error) {
			console.error("Theme validation error:", error);
			return false;
		}
	}

	private static deepClone<T>(obj: T): T {
		if (obj === null || typeof obj !== "object") {
			return obj;
		}

		if (obj instanceof Array) {
			return obj.map(item => this.deepClone(item)) as unknown as T;
		}

		const cloned = {} as T;
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				cloned[key] = this.deepClone(obj[key]);
			}
		}

		return cloned;
	}

	private static deepMerge<T>(target: T, source: DeepPartial<T>): T {
		const result = { ...target };

		for (const key in source) {
			if (Object.prototype.hasOwnProperty.call(source, key)) {
				const sourceValue = source[key];
				const targetValue = result[key];

				if (sourceValue !== undefined) {
					if (
						typeof sourceValue === "object" &&
						sourceValue !== null &&
						!Array.isArray(sourceValue) &&
						typeof targetValue === "object" &&
						targetValue !== null &&
						!Array.isArray(targetValue)
					) {
						result[key] = this.deepMerge(targetValue, sourceValue);
					} else {
						result[key] = sourceValue as T[Extract<keyof T, string>];
					}
				}
			}
		}

		return result;
	}
}
