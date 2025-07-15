import { TimelineTheme } from "../theme.types";

/**
 * Minimal Light Theme - Ultra-clean, modern theme with subtle colors and sharp edges
 */
export const minimalLightTheme: TimelineTheme = {
	colors: {
		background: {
			primary: 0xffffff,
			tracks: {
				even: 0xfafafa,
				odd: 0xffffff
			}
		},
		borders: {
			primary: 0xe0e0e0,
			secondary: 0xf5f5f5
		},
		clips: {
			video: 0x1976d2,
			audio: 0x388e3c,
			image: 0x7b1fa2,
			text: 0xf57c00,
			html: 0x0097a7,
			luma: 0xd32f2f,
			shape: 0xfbc02d,
			default: 0x757575
		},
		ui: {
			selection: 0x1976d2,
			playhead: 0x000000,
			playheadOutline: 0xffffff,
			text: 0x212121,
			ruler: {
				background: 0xfafafa,
				majorTick: 0x616161,
				minorTick: 0xbdbdbd,
				label: 0x424242
			}
		},
		states: {
			valid: 0x4caf50,
			invalid: 0xf44336,
			hover: 0x2196f3,
			active: 0x1565c0
		}
	},
	dimensions: {
		track: {
			height: 60,
			gap: 2
		},
		clip: {
			cornerRadius: 2, // Sharper corners for minimal look
			labelPaddingX: 5
		},
		ruler: {
			height: 25, // Slimmer ruler
			majorTickHeight: 8,
			minorTickHeight: 4,
			labelOffset: 2,
			minPixelsBetweenLabels: 60
		},
		playhead: {
			lineWidth: 2,
			handleWidth: 12,
			handleHeight: 10,
			hitAreaPadding: 4
		},
		interaction: {
			edgeThreshold: 8,
			dragThreshold: 5,
			scrollThreshold: 0.8
		}
	},
	typography: {
		clip: {
			fontSize: 11,
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			fontWeight: "400"
		},
		ruler: {
			fontSize: 9,
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			fontWeight: "400"
		}
	},
	opacity: {
		trackBackground: 0.3, // Very subtle track backgrounds
		clip: 0.95, // Almost opaque clips
		playheadOutline: 0.3,
		dragPreview: {
			fill: 0.2,
			border: 0.6
		},
		clipWhileDragging: 0.7
	},
	borders: {
		track: 1,
		ruler: 1,
		clip: 1, // Thinner selection border
		dragPreview: 1
	},
	animation: {
		snapDuration: 100,
		scrollDuration: 200
	},
	grid: {
		snapInterval: 0.033333,
		showGrid: false,
		gridColor: 0xeeeeee,
		gridOpacity: 0.5
	}
};

// Export theme metadata
export const minimalLightThemeMetadata = {
	name: "Minimal Light",
	id: "minimal-light",
	description: "Ultra-clean modern theme with subtle colors",
	author: "Shotstack",
	version: "1.0.0",
	tags: ["minimal", "light", "modern", "clean", "material"]
};
