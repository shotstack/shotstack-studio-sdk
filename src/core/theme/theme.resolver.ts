import { convertThemeColors, convertThemeColorsGeneric } from "./theme-utils";
import { TimelineTheme, TimelineThemeOptions, DeepPartial, TimelineThemeInput } from "./theme.types";

// Default theme embedded directly in code
const DEFAULT_THEME_DATA: TimelineThemeInput = {
	timeline: {
		background: "#1a1a1a",
		divider: "#1a1a1a",
		toolbar: {
			background: "#1a1a1a",
			surface: "#2a2a2a",
			hover: "#3a3a3a",
			active: "#007acc",
			divider: "#3a3a3a",
			icon: "#888888",
			text: "#ffffff",
			height: 36
		},
		ruler: {
			background: "#404040",
			text: "#ffffff",
			markers: "#666666",
			height: 40
		},
		tracks: {
			surface: "#2a2a2a",
			surfaceAlt: "#242424",
			border: "#3a3a3a",
			height: 60
		},
		clips: {
			video: "#4a90e2",
			audio: "#7ed321",
			image: "#f5a623",
			text: "#d0021b",
			shape: "#9013fe",
			html: "#50e3c2",
			luma: "#b8e986",
			default: "#8e8e93",
			selected: "#007acc",
			radius: 4
		},
		playhead: "#ff4444",
		snapGuide: "#888888",
		dropZone: "#00ff00",
		trackInsertion: "#00ff00"
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
			if (!theme.timeline) return false;

			const { timeline } = theme;

			// Validate timeline root properties
			if (typeof timeline.background !== "number") return false;
			if (typeof timeline.divider !== "number") return false;
			if (typeof timeline.playhead !== "number") return false;
			if (typeof timeline.snapGuide !== "number") return false;
			if (typeof timeline.dropZone !== "number") return false;
			if (typeof timeline.trackInsertion !== "number") return false;

			// Validate toolbar
			if (!timeline.toolbar) return false;
			const {toolbar} = timeline;
			if (typeof toolbar.background !== "number") return false;
			if (typeof toolbar.surface !== "number") return false;
			if (typeof toolbar.hover !== "number") return false;
			if (typeof toolbar.active !== "number") return false;
			if (typeof toolbar.divider !== "number") return false;
			if (typeof toolbar.icon !== "number") return false;
			if (typeof toolbar.text !== "number") return false;
			if (typeof toolbar.height !== "number" || toolbar.height <= 0) return false;

			// Validate ruler
			if (!timeline.ruler) return false;
			const {ruler} = timeline;
			if (typeof ruler.background !== "number") return false;
			if (typeof ruler.text !== "number") return false;
			if (typeof ruler.markers !== "number") return false;
			if (typeof ruler.height !== "number" || ruler.height <= 0) return false;

			// Validate tracks
			if (!timeline.tracks) return false;
			const {tracks} = timeline;
			if (typeof tracks.surface !== "number") return false;
			if (typeof tracks.surfaceAlt !== "number") return false;
			if (typeof tracks.border !== "number") return false;
			if (typeof tracks.height !== "number" || tracks.height <= 0) return false;

			// Validate clips
			if (!timeline.clips) return false;
			const {clips} = timeline;
			const clipColors = ["video", "audio", "image", "text", "shape", "html", "luma", "default", "selected"];
			for (const color of clipColors) {
				if (typeof clips[color as keyof typeof clips] !== "number") return false;
			}
			if (typeof clips.radius !== "number" || clips.radius < 0) return false;

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