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
		textPrimary: 0xffffff,
		textSecondary: 0xdddddd,
		selectionBorder: 0xffffff,
		separator: 0x222222,
		rulerTicks: 0xcccccc,
		// Asset colors
		video: 0x4a90e2,
		audio: 0x7ed321,
		image: 0xf5a623,
		text: 0xbd10e0,
		shape: 0x9013fe,
		html: 0x50e3c2,
		luma: 0x888888,
		default: 0x888888
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
 * Get asset color with optional selection highlight
 */
export function getAssetColor(assetType: string, isSelected: boolean = false): number {
	const baseColor = TIMELINE_CONFIG.colors[assetType as keyof typeof TIMELINE_CONFIG.colors] || TIMELINE_CONFIG.colors.default;

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
