import type { Seconds } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

/** Visual state for clips */
export type ClipVisualState = "normal" | "selected" | "dragging" | "resizing";

/** Internal state for a clip */
export interface ClipState {
	/** Unique identifier for keyed updates */
	id: string;
	/** Track index */
	trackIndex: number;
	/** Clip index within track */
	clipIndex: number;
	/** Resolved clip configuration */
	config: ResolvedClip;
	/** Visual state */
	visualState: ClipVisualState;
	/** Whether this clip has visual focus (e.g. hover-to-highlight from source popup) */
	isFocused: boolean;
	/** Original timing intent before resolution */
	timingIntent: {
		start: "auto" | number;
		length: "auto" | "end" | number;
	};
}

/** Internal state for a track */
export interface TrackState {
	/** Track index */
	index: number;
	/** Clips in this track */
	clips: ClipState[];
	/** Primary asset type (from first clip, determines track height) */
	primaryAssetType: string;
}

/** Viewport state */
export interface ViewportState {
	/** Horizontal scroll position in pixels */
	scrollX: number;
	/** Vertical scroll position in pixels */
	scrollY: number;
	/** Zoom level (pixels per second) */
	pixelsPerSecond: number;
	/** Viewport width */
	width: number;
	/** Viewport height */
	height: number;
}

/** Playback state */
export interface PlaybackState {
	/** Current playback time in seconds */
	time: Seconds;
	/** Whether playback is active */
	isPlaying: boolean;
	/** Total timeline duration in seconds */
	duration: Seconds;
}

/** Clip info for interactions */
export interface ClipInfo {
	trackIndex: number;
	clipIndex: number;
	config: ResolvedClip;
}

/** Custom clip renderer interface */
export interface ClipRenderer {
	/** Render custom content inside clip element */
	render(clip: ResolvedClip, element: HTMLElement): void;
	/** Optional cleanup when clip is removed */
	dispose?(element: HTMLElement): void;
}

export interface InteractionQuery {
	isDragging(trackIndex: number, clipIndex: number): boolean;
	isResizing(trackIndex: number, clipIndex: number): boolean;
}

/** Default timeline settings */
export const DEFAULT_PIXELS_PER_SECOND = 50;

/** Track heights by asset type */
export const TRACK_HEIGHTS: Record<string, number> = {
	video: 72,
	image: 72,
	audio: 48,
	text: 36,
	"rich-text": 36,
	shape: 36,
	caption: 36,
	html: 48,
	luma: 72,
	svg: 72,
	default: 48
};

/** Get track height for an asset type */
export function getTrackHeight(assetType: string): number {
	return TRACK_HEIGHTS[assetType] ?? TRACK_HEIGHTS["default"];
}
