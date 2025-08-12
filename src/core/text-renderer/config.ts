export const CANVAS_CONFIG = {
	ANIMATION_TYPES: ["typewriter", "movingLetters", "fadeIn", "slideIn", "ascend", "shift"] as const,

	DEFAULTS: {
		width: 800,
		height: 400,
		fontSize: 48,
		fontFamily: "Roboto",
		fontWeight: "normal" as const,
		fontStyle: "normal" as const,
		color: "#ffffff",
		opacity: 1,
		backgroundColor: "transparent",
		textAlign: "center" as CanvasTextAlign,
		textBaseline: "middle" as CanvasTextBaseline,
		lineHeight: 1.2,
		letterSpacing: 0,
		textTransform: "none" as const,
		textDecoration: "none" as const,
		fps: 30,
		duration: 3,
		pixelRatio: 2
	},

	LIMITS: {
		maxWidth: 1920,
		maxHeight: 1080,
		minWidth: 100,
		minHeight: 50,
		maxFontSize: 512,
		minFontSize: 1,
		maxDuration: 30,
		minDuration: 0.1
	},

	FILE_LIMITS: {
		maxImageSize: 10 * 1024 * 1024,
		maxVideoSize: 250 * 1024 * 1024,
		maxFrames: 300
	},

	FONTS: [
		"Roboto",
		"Arial",
		"Helvetica",
		"Times New Roman",
		"Courier New",
		"Georgia",
		"Verdana",
		"Montserrat",
		"Open Sans",
		"Lato",
		"Raleway",
		"Poppins"
	],

	PERFORMANCE: {
		warningThreshold: 30000,
		errorThreshold: 60000,
		maxRetries: 3
	},

	FONT_WEIGHTS: {
		Roboto: ["100", "300", "400", "500", "700", "900"],
		Montserrat: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
		"Open Sans": ["300", "400", "600", "700", "800"],
		Lato: ["100", "300", "400", "700", "900"],
		Raleway: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
		Poppins: ["100", "200", "300", "400", "500", "600", "700", "800", "900"]
	} as Record<string, string[]>
};

export type AnimationType = (typeof CANVAS_CONFIG.ANIMATION_TYPES)[number];
