import { TimelineTheme } from "../theme.types";

/**
 * Dark Theme - Default theme for Shotstack Timeline
 * A professional dark theme optimized for video editing workflows
 */
export const darkTheme: TimelineTheme = {
	colors: {
		background: {
			primary: 0x1a1a1a,
			tracks: {
				even: 0x2a2a2a,
				odd: 0x252525
			}
		},
		borders: {
			primary: 0x404040,
			secondary: 0x2a2a2a
		},
		clips: {
			video: 0x4444ff,
			audio: 0x44ff44,
			image: 0xff44ff,
			text: 0xffaa44,
			html: 0x44ffff,
			luma: 0xff4444,
			shape: 0xaaaa44,
			default: 0x888888
		},
		ui: {
			selection: 0xffff00,
			playhead: 0xff0000,
			playheadOutline: 0xffffff,
			text: 0xffffff,
			ruler: {
				background: 0x1a1a1a,
				majorTick: 0x808080,
				minorTick: 0x606060,
				label: 0xcccccc
			}
		},
		states: {
			valid: 0x4caf50,
			invalid: 0xff5252,
			hover: 0x2196f3,
			active: 0x1565c0
		}
	},
	dimensions: {
		track: {
			height: 60,
			gap: 2,
			backgroundWidth: 5000
		},
		clip: {
			height: 50,
			cornerRadius: 4,
			labelPaddingX: 5,
			labelOffsetY: 30,
			offsetY: 5
		},
		ruler: {
			height: 30,
			majorTickHeight: 10,
			minorTickHeight: 5,
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
			fontSize: 12
		},
		ruler: {
			fontSize: 10
		}
	},
	opacity: {
		trackBackground: 0.5,
		clip: 0.8,
		playheadOutline: 0.5,
		dragPreview: {
			fill: 0.3,
			border: 0.8
		},
		clipWhileDragging: 0.5
	},
	borders: {
		track: 1,
		ruler: 1,
		clip: 2,
		dragPreview: 2
	},
	animation: {},
	grid: {
		snapInterval: 0.033333
	}
};

// Optional metadata for documentation
export const darkThemeMetadata = {
	name: "Dark",
	description: "Default dark theme optimized for video editing"
};
