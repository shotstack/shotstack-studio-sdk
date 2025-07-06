// Timeline standalone component exports
export { Timeline } from "./timeline";
export type {
	TimelineClipData,
	TimelineTrackData,
	TimelineAsset,
	TimelinePointerEvent,
	TimelineWheelEvent,
	TimelineState,
	AssetType,
	ClipClickEventData,
	ClipSelectedEventData,
	ClipUpdatedEventData,
	TimelineEventMap,
	TimelineEventEmitter,
	TimelineRulerOptions,
	TimelineTrackOptions,
	TimelineClipOptions
} from "./timeline-types";

// Export component classes for advanced usage
export { TimelineRuler } from "./elements/timeline-ruler";
export { TimelineTrack } from "./elements/timeline-track";
export { TimelineClip } from "./elements/timeline-clip";

// Export type guards for external use
export { isTextAsset, isVideoAsset, isImageAsset, isAudioAsset, isLumaAsset, hasSourceUrl } from "./timeline-types";

// Export configuration
export { TIMELINE_CONFIG, getAssetColor } from "./timeline-config";
export type { TimelineConfig } from "./timeline-types";
