/**
 * Type definitions for timeline assets
 */

import { RichTextAsset } from "@core/schemas/rich-text-asset";

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

// Text asset
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
export type TimelineAsset = VideoAsset | AudioAsset | ImageAsset | TextAsset | ShapeAsset | HtmlAsset | LumaAsset | RichTextAsset;

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

export function isShapeAsset(asset: TimelineAsset): asset is ShapeAsset {
	return asset.type === "shape";
}

export function isHtmlAsset(asset: TimelineAsset): asset is HtmlAsset {
	return asset.type === "html";
}

export function isLumaAsset(asset: TimelineAsset): asset is LumaAsset {
	return asset.type === "luma";
}

export function isRichTextAsset(asset: TimelineAsset): asset is RichTextAsset {
	return asset.type === "rich-text";
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
			return "Rich Text";
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
