import { AssetSchema } from "@schemas/asset";
import { ClipSchema } from "@schemas/clip";
import { TrackSchema } from "@schemas/track";
import * as pixi from "pixi.js";
import { z } from "zod";

// Use existing Zod schemas and infer types
export type TimelineClipData = z.infer<typeof ClipSchema>;
export type TimelineTrackData = z.infer<typeof TrackSchema>;
export type TimelineAsset = z.infer<typeof AssetSchema>;

// Extract asset type from the asset union
export type AssetType = TimelineAsset["type"];

export type TimelinePointerEvent = pixi.FederatedPointerEvent & {
	// Additional timeline-specific event properties if needed
};

export type TimelineWheelEvent = WheelEvent & {
	// Additional timeline-specific wheel event properties if needed
};

export type TimelineEventHandlers = {
	onClipClick?: (clipData: TimelineClipData, event: TimelinePointerEvent) => void;
	onTrackClick?: (trackData: TimelineTrackData, event: TimelinePointerEvent) => void;
	onRulerClick?: (time: number, event: TimelinePointerEvent) => void;
	onWheel?: (event: TimelineWheelEvent) => void;
};

// Event data types for better type safety
export type ClipClickEventData = {
	clipData: TimelineClipData;
	event: TimelinePointerEvent;
	trackIndex: number;
};

export type ClipSelectedEventData = {
	clip: TimelineClipData;
	trackIndex: number;
	clipIndex: number;
};

export type ClipUpdatedEventData = {
	previous: TimelineClipData;
	current: TimelineClipData;
	trackIndex: number;
	clipIndex: number;
};

export type TrackDeletedEventData = {
	trackIndex: number;
	deletedClips: number;
};

export type ClipDeletedEventData = {
	trackIndex: number;
	clipIndex: number;
	clipId: string;
};

// Type guards for timeline asset types
export function isTextAsset(asset: TimelineAsset): asset is TimelineAsset & { type: "text"; text: string } {
	return asset.type === "text";
}

export function isVideoAsset(asset: TimelineAsset): asset is TimelineAsset & { type: "video"; src: string } {
	return asset.type === "video";
}

export function isImageAsset(asset: TimelineAsset): asset is TimelineAsset & { type: "image"; src: string } {
	return asset.type === "image";
}

export function isAudioAsset(asset: TimelineAsset): asset is TimelineAsset & { type: "audio"; src: string } {
	return asset.type === "audio";
}

export function isLumaAsset(asset: TimelineAsset): asset is TimelineAsset & { type: "luma"; src: string } {
	return asset.type === "luma";
}

export function hasSourceUrl(asset: TimelineAsset): asset is TimelineAsset & { src: string } {
	return "src" in asset && typeof asset.src === "string";
}

// Utility types for enhanced type safety
export type TimelineEventMap = {
	"clip:click": ClipClickEventData;
	"clip:selected": ClipSelectedEventData;
	"clip:updated": ClipUpdatedEventData;
	"clip:deleted": ClipDeletedEventData;
	"track:deleted": TrackDeletedEventData;
	"ruler:click": { time: number; event: TimelinePointerEvent };
	"track:click": { trackData: TimelineTrackData; event: TimelinePointerEvent };
};

// Type-safe event emitter type
export type TimelineEventEmitter = {
	on<K extends keyof TimelineEventMap>(event: K, listener: (data: TimelineEventMap[K]) => void): void;
	off<K extends keyof TimelineEventMap>(event: K, listener: (data: TimelineEventMap[K]) => void): void;
	emit<K extends keyof TimelineEventMap>(event: K, data: TimelineEventMap[K]): void;
};

// Component constructor options for better type safety
export type TimelineRulerOptions = {
	edit: import("@core/edit").Edit;
	width: number;
	scrollPosition?: number;
	pixelsPerSecond?: number;
};

export type TimelineTrackOptions = {
	edit: import("@core/edit").Edit;
	trackData: TimelineTrackData;
	width: number;
	height: number;
	scrollPosition: number;
	pixelsPerSecond: number;
	selectedClipId: string | null;
};

export type TimelineClipOptions = {
	clipData: TimelineClipData;
	trackHeight: number;
	scrollPosition: number;
	pixelsPerSecond: number;
	selectedClipId: string | null;
};

export type TimelineState = {
	selectedClipId: string | null;
	scrollPosition: number;
	verticalScrollPosition: number;
	pixelsPerSecond: number;
	isPlaying: boolean;
	visibleHeight: number;
};

export type TimelineConfig = {
	colors: {
		background: number;
		ruler: number;
		track: number;
		playhead: number;
		textPrimary: number;
		textSecondary: number;
		selectionBorder: number;
		separator: number;
		rulerTicks: number;
		// Asset colors
		video: number;
		audio: number;
		image: number;
		text: number;
		shape: number;
		html: number;
		luma: number;
		default: number;
	};
	dimensions: {
		rulerHeight: number;
		trackHeight: number;
		playheadWidth: number;
		minZoom: number;
		maxZoom: number;
		defaultPixelsPerSecond: number;
	};
	animation: {
		scrollSpeed: number;
		autoScrollThreshold: number;
		zoomSpeed: number;
	};
};
