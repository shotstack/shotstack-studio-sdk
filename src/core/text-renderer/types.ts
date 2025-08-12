export type RendererMode = "auto" | "canvas2d" | "canvaskit";

export interface CanvasConfig {
	text: string;
	width: number;
	height: number;
	fontSize: number;
	fontFamily: string;
	fontWeight: string | number;
	fontStyle: "normal" | "italic" | "oblique";
	color: string;
	opacity: number;
	backgroundColor: string;
	borderRadius: number;
	textAlign: "left" | "center" | "right";
	textBaseline: "top" | "middle" | "bottom" | "alphabetic" | "hanging";
	letterSpacing: number;
	lineHeight: number;
	textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
	textDecoration: "none" | "underline" | "line-through";
	gradient?: GradientConfig;
	shadow?: ShadowConfig;
	stroke?: StrokeConfig;
	overflow?: OverflowConfig;
	duration: number;
	fps: number;
	direction?: "left" | "right" | "up" | "down";
	customFonts?: CustomFont[];
	pixelRatio: number;
	renderer?: RendererMode;
	animation?: {
		preset: string;
		speed?: number;
		fps?: number;
		stagger: boolean;
		duration?: number;
		style?: "character" | "word";
		direction?: "left" | "right" | "up" | "down" | "top" | "bottom";
	};
	animationStyle?: "character" | "word";
	speed?: number;
}

export interface GradientConfig {
	type: "linear" | "radial";
	stops: Array<{
		offset: number;
		color: string;
	}>;
	angle?: number;
}

export interface ShadowConfig {
	offsetX: number;
	offsetY: number;
	blur: number;
	color: string;
	opacity: number;
}

export interface StrokeConfig {
	width: number;
	color: string;
	opacity: number;
}

export interface OverflowConfig {
	wrap: "wrap" | "nowrap";
}

export interface CustomFont {
	src: string;
	family: string;
	weight?: string | number;
	style?: string;
	originalFamily?: string;
}

export interface TextMetrics {
	width: number;
	height: number;
	ascent: number;
	descent: number;
	lineHeight: number;
}

export interface AnimationFrame {
	frameNumber: number;
	timestamp: number;
	imageData: ImageData | Uint8Array;
}

export interface RenderResult {
	type: "image" | "animation";
	data: ImageData | AnimationFrame[];
	metadata: {
		width: number;
		height: number;
		duration?: number;
		frameCount?: number;
		fps?: number;
		generationTime?: number;
	};
}
