import type { TimelineConfig } from "./timeline-types";

/**
 * Centralized timeline configuration with type-safe constants
 * Use 'as const' for literal type inference and immutability
 */
export const TIMELINE_CONFIG = {
	colors: {
		background: 0x232323,
		ruler: 0x2a2a2a,
		track: 0x333333,
		playhead: 0xff0000,
		text: {
			primary: 0xffffff,
			secondary: 0xdddddd,
			ruler: 0xffffff
		},
		border: {
			selection: 0xffffff,
			separator: 0x222222,
			rulerTicks: 0xcccccc
		},
		assets: {
			video: 0x4a90e2,
			audio: 0x7ed321,
			image: 0xf5a623,
			text: 0xbd10e0,
			shape: 0x9013fe,
			html: 0x50e3c2,
			luma: 0x888888,
			default: 0x888888
		}
	},
	dimensions: {
		rulerHeight: 20,
		trackHeight: 30,
		playheadWidth: 2,
		minZoom: 10,
		maxZoom: 200,
		defaultPixelsPerSecond: 100
	},
	animation: {
		scrollSpeed: 0.5,
		autoScrollThreshold: 100,
		zoomSpeed: 0.001
	}
} as const satisfies TimelineConfig;

/**
 * Default timeline configuration for easy access
 */
export const DEFAULT_TIMELINE_CONFIG = TIMELINE_CONFIG;

/**
 * Creates a custom timeline configuration by merging with defaults
 * @param customConfig Partial configuration to override defaults
 * @returns Complete timeline configuration
 */
export function createTimelineConfig(customConfig?: Partial<TimelineConfig>): TimelineConfig {
	if (!customConfig) {
		return TIMELINE_CONFIG;
	}

	return {
		colors: {
			...TIMELINE_CONFIG.colors,
			...(customConfig.colors || {}),
			text: {
				...TIMELINE_CONFIG.colors.text,
				...(customConfig.colors?.text || {})
			},
			border: {
				...TIMELINE_CONFIG.colors.border,
				...(customConfig.colors?.border || {})
			},
			assets: {
				...TIMELINE_CONFIG.colors.assets,
				...(customConfig.colors?.assets || {})
			}
		},
		dimensions: {
			...TIMELINE_CONFIG.dimensions,
			...(customConfig.dimensions || {})
		},
		animation: {
			...TIMELINE_CONFIG.animation,
			...(customConfig.animation || {})
		}
	};
}

/**
 * Validates timeline configuration values
 * @param config Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateTimelineConfig(config: TimelineConfig): void {
	// Validate dimensions
	if (config.dimensions.rulerHeight <= 0) {
		throw new Error("Ruler height must be positive");
	}
	if (config.dimensions.trackHeight <= 0) {
		throw new Error("Track height must be positive");
	}
	if (config.dimensions.minZoom <= 0 || config.dimensions.minZoom >= config.dimensions.maxZoom) {
		throw new Error("Invalid zoom limits");
	}
	if (config.dimensions.defaultPixelsPerSecond < config.dimensions.minZoom || 
		config.dimensions.defaultPixelsPerSecond > config.dimensions.maxZoom) {
		throw new Error("Default zoom must be within min/max limits");
	}

	// Validate animation
	if (config.animation.scrollSpeed <= 0) {
		throw new Error("Scroll speed must be positive");
	}
	if (config.animation.autoScrollThreshold < 0) {
		throw new Error("Auto scroll threshold must be non-negative");
	}
	if (config.animation.zoomSpeed <= 0) {
		throw new Error("Zoom speed must be positive");
	}
}

/**
 * Asset color utilities
 */
export function getAssetColor(assetType: string, isSelected: boolean = false): number {
	const baseColor = TIMELINE_CONFIG.colors.assets[assetType as keyof typeof TIMELINE_CONFIG.colors.assets] || 
		TIMELINE_CONFIG.colors.assets.default;
	
	if (!isSelected) {
		return baseColor;
	}

	// Brighten color by 20% when selected
	// eslint-disable-next-line no-bitwise
	const r = (baseColor >> 16) & 0xff;
	// eslint-disable-next-line no-bitwise
	const g = (baseColor >> 8) & 0xff;
	// eslint-disable-next-line no-bitwise
	const b = baseColor & 0xff;

	const brighterR = Math.min(255, r + 40);
	const brighterG = Math.min(255, g + 40);
	const brighterB = Math.min(255, b + 40);

	// eslint-disable-next-line no-bitwise
	return (brighterR << 16) | (brighterG << 8) | brighterB;
}