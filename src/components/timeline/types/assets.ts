/**
 * Type definitions for timeline assets
 */

import { DrawOp } from "@shotstack/shotstack-canvas";

// Volume keyframe for audio/video assets
export interface VolumeKeyframe {
	from: number;
	to: number;
	start: number;
	length: number;
	interpolation?: "linear" | "bezier" | "constant";
	easing?: string;
}

// Video asset
export interface VideoAsset {
	type: "video";
	src: string;
	trim?: number;
	volume?: number | VolumeKeyframe[];
}


export type TextRenderer = {
	render: (ops: DrawOp[]) => Promise<void>;
};

export type TextEngine = {
	validate: (asset: unknown) => { value: ValidatedRichTextAsset; error?: unknown };
	renderFrame: (asset: ValidatedRichTextAsset, time: number) => Promise<DrawOp[]>;
	createRenderer: (canvas: HTMLCanvasElement) => TextRenderer;
	registerFontFromUrl: (url: string, desc: FontDescriptor) => Promise<void>;
	registerFontFromFile: (path: string, desc: FontDescriptor) => Promise<void>;
	destroy: () => void;
};

export type FontDescriptor = {
	family: string;
	weight: string | number;
	style: string;
};

// Audio asset
export interface AudioAsset {
	type: "audio";
	src: string;
	trim?: number;
	volume?: number | VolumeKeyframe[];
}

// Image asset
export interface ImageAsset {
	type: "image";
	src: string;
}

// Text asset (basic)
export interface TextAsset {
	type: "text";
	text: string;
	font?: {
		color?: string;
		family?: string;
		size?: number;
		weight?: number;
		lineHeight?: number;
	};
	alignment?: {
		horizontal?: "left" | "center" | "right";
		vertical?: "top" | "center" | "bottom";
	};
}

// Rich Text asset (advanced)
export interface ValidatedRichTextAsset {
	type: "rich-text";
	text: string;
	width: number;
	height: number;
	font: {
		family: string;
		size: number;
		weight: string | number;
		style: "normal" | "italic" | "oblique";
		color: string;
		opacity: number;
	};
	style: {
		letterSpacing: number;
		lineHeight: number;
		textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
		textDecoration: "none" | "underline" | "line-through";
		gradient?: {
			type: "linear" | "radial";
			angle: number;
			stops: { offset: number; color: string }[];
		};
	};
	stroke: { width: number; color: string; opacity: number };
	shadow: { offsetX: number; offsetY: number; blur: number; color: string; opacity: number };
	background: { color?: string; opacity: number; borderRadius: number };
	align: { horizontal: "left" | "center" | "right"; vertical: "top" | "middle" | "bottom" };
	animation: {
		preset: "fadeIn" | "slideIn" | "typewriter" | "shift" | "ascend" | "movingLetters";
		speed: number;
		duration?: number;
		style?: "character" | "word";
		direction?: "left" | "right" | "up" | "down";
	};
	customFonts: { src: string; family: string; weight?: string | number; style?: string; originalFamily?: string }[];
	cacheEnabled: boolean;
	pixelRatio: number;
}

// Shape asset
export interface ShapeAsset {
	type: "shape";
	shape: "rectangle" | "ellipse" | "polygon" | "star";
	color?: string;
	borderColor?: string;
	borderWidth?: number;
}

// HTML asset
export interface HtmlAsset {
	type: "html";
	html: string;
	css?: string;
}

// Luma asset
export interface LumaAsset {
	type: "luma";
	src: string;
	trim?: number;
}

// Union type for all assets
export type TimelineAsset = VideoAsset | AudioAsset | ImageAsset | TextAsset | RichTextAsset | ShapeAsset | HtmlAsset | LumaAsset;

// Type guards
export function isVideoAsset(asset: TimelineAsset): asset is VideoAsset {
	return asset.type === "video";
}

export function isAudioAsset(asset: TimelineAsset): asset is AudioAsset {
	return asset.type === "audio";
}

export function isImageAsset(asset: TimelineAsset): asset is ImageAsset {
	return asset.type === "image";
}

export function isTextAsset(asset: TimelineAsset): asset is TextAsset {
	return asset.type === "text";
}

export function isRichTextAsset(asset: TimelineAsset): asset is RichTextAsset {
	return asset.type === "rich-text";
}

export function isShapeAsset(asset: TimelineAsset): asset is ShapeAsset {
	return asset.type === "shape";
}

export function isHtmlAsset(asset: TimelineAsset): asset is HtmlAsset {
	return asset.type === "html";
}

export function isLumaAsset(asset: TimelineAsset): asset is LumaAsset {
	return asset.type === "luma";
}

// Helper to extract filename from path
function getFilenameFromPath(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1] || path;
}

// Helper to get display name for asset
export function getAssetDisplayName(asset: TimelineAsset): string {
	switch (asset.type) {
		case "video":
			return asset.src ? getFilenameFromPath(asset.src) : "Video";
		case "audio":
			return asset.src ? getFilenameFromPath(asset.src) : "Audio";
		case "image":
			return asset.src ? getFilenameFromPath(asset.src) : "Image";
		case "text":
			return asset.text || "Text";
		case "rich-text":
			return asset.text || "Rich Text";
		case "shape":
			return asset.shape || "Shape";
		case "html":
			return "HTML";
		case "luma":
			return asset.src ? getFilenameFromPath(asset.src) : "Luma";
		default:
			return "Unknown Asset";
	}
}
