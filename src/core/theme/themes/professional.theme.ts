import { TimelineTheme } from "../theme.types";

/**
 * Professional Theme - A sophisticated blue-gray theme inspired by professional video editing software
 */
export const professionalTheme: TimelineTheme = {
	colors: {
		background: {
			primary: 0x1e2329,
			tracks: {
				even: 0x2e3440,
				odd: 0x292e38
			}
		},
		borders: {
			primary: 0x4c566a,
			secondary: 0x3b4252
		},
		clips: {
			video: 0x5e81ac,
			audio: 0xa3be8c,
			image: 0xb48ead,
			text: 0xd08770,
			html: 0x88c0d0,
			luma: 0xbf616a,
			shape: 0xebcb8b,
			default: 0x4c566a
		},
		ui: {
			selection: 0x88c0d0,
			playhead: 0xbf616a,
			playheadOutline: 0xd8dee9,
			text: 0xeceff4,
			ruler: {
				background: 0x1e2329,
				majorTick: 0x88c0d0,
				minorTick: 0x4c566a,
				label: 0xd8dee9
			}
		},
		states: {
			valid: 0xa3be8c,
			invalid: 0xbf616a,
			hover: 0x88c0d0,
			active: 0x5e81ac
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
			fontSize: 12,
			fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
			fontWeight: "500"
		},
		ruler: {
			fontSize: 10,
			fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
			fontWeight: "400"
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
export const professionalThemeMetadata = {
	name: "Professional",
	id: "professional",
	description: "Sophisticated blue-gray theme for professional video editing",
	author: "Shotstack",
	version: "1.0.0",
	tags: ["professional", "blue", "nord", "sophisticated"]
};
