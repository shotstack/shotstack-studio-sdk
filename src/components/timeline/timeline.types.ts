import type { ResolvedClip } from "@schemas/clip";

/** Configuration options for Timeline */
export interface TimelineOptions {
	/** Feature toggles */
	features?: TimelineFeatures;
	/** Interaction configuration */
	interaction?: TimelineInteractionConfig;
	/** Initial pixels per second (zoom level) */
	pixelsPerSecond?: number;
	/** Track height in pixels */
	trackHeight?: number;
}

/** Feature toggles for Timeline */
export interface TimelineFeatures {
	/** Show toolbar with playback controls */
	toolbar?: boolean;
	/** Show time ruler */
	ruler?: boolean;
	/** Show playhead indicator */
	playhead?: boolean;
	/** Enable snap-to-grid/clips */
	snap?: boolean;
	/** Show timing intent badges on clips */
	badges?: boolean;
	/** Enable multi-select with shift/ctrl+click */
	multiSelect?: boolean;
}

/** Interaction configuration */
export interface TimelineInteractionConfig {
	/** Minimum pixels to move before starting drag */
	dragThreshold?: number;
	/** Snap distance in pixels */
	snapThreshold?: number;
	/** Width of resize zone at clip edges */
	resizeZone?: number;
	/** Callback to request timeline re-render */
	onRequestRender?: () => void;
}

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
	visualState: "normal" | "selected" | "dragging" | "resizing";
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
	/** Current playback time in milliseconds */
	time: number;
	/** Whether playback is active */
	isPlaying: boolean;
	/** Total timeline duration in milliseconds */
	duration: number;
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

/** Default feature settings */
export const DEFAULT_FEATURES: Required<TimelineFeatures> = {
	toolbar: true,
	ruler: true,
	playhead: true,
	snap: true,
	badges: true,
	multiSelect: true
};

/** Default interaction settings (excludes optional callback) */
export const DEFAULT_INTERACTION: Omit<Required<TimelineInteractionConfig>, "onRequestRender"> = {
	dragThreshold: 3,
	snapThreshold: 10,
	resizeZone: 12
};

/** Default timeline settings */
export const DEFAULT_PIXELS_PER_SECOND = 50;
export const DEFAULT_TRACK_HEIGHT = 48;
export const DEFAULT_TOOLBAR_HEIGHT = 40;
export const DEFAULT_RULER_HEIGHT = 32;

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
	luma: 48,
	default: 48
};

/** Get track height for an asset type */
export function getTrackHeight(assetType: string): number {
	return TRACK_HEIGHTS[assetType] ?? TRACK_HEIGHTS["default"];
}
