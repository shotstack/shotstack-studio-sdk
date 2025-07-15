import { TimelineTheme } from "../theme.types";

/**
 * Light Theme - Clean and bright theme for daytime editing
 */
export const lightTheme: TimelineTheme = {
	colors: {
		background: {
			primary: 0xf5f5f5,
			tracks: {
				even: 0xe8e8e8,
				odd: 0xf0f0f0
			}
		},
		borders: {
			primary: 0xcccccc,
			secondary: 0xe0e0e0
		},
		clips: {
			video: 0x2222cc,
			audio: 0x22cc22,
			image: 0xcc22cc,
			text: 0xcc8822,
			html: 0x22cccc,
			luma: 0xcc2222,
			shape: 0x888822,
			default: 0x666666
		},
		ui: {
			selection: 0x0066cc,
			playhead: 0xcc0000,
			playheadOutline: 0x000000,
			text: 0x333333,
			ruler: {
				background: 0xfafafa,
				majorTick: 0x666666,
				minorTick: 0x999999,
				label: 0x444444
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
			height: 30,
			gap: 2
		},
		clip: {
			cornerRadius: 10,
			labelPaddingX: 5
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

// Export theme metadata
export const lightThemeMetadata = {
	name: "Light",
	id: "light",
	description: "Clean and bright theme for daytime editing",
	author: "Shotstack",
	version: "1.0.0",
	tags: ["light", "bright", "clean"]
};
