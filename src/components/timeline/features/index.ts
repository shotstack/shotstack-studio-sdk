// Import the classes for the interface
import type { PlayheadFeature as PlayheadFeatureType } from "./playhead-feature";
import type { RulerFeature as RulerFeatureType } from "./ruler-feature";
import type { ScrollManager as ScrollManagerType } from "./scroll-manager";

export { RulerFeature } from "./ruler-feature";
export { PlayheadFeature } from "./playhead-feature";
export { ScrollManager } from "./scroll-manager";

export type {
	TimelineFeatureEvents,
	RulerFeatureOptions,
	PlayheadFeatureOptions,
	ScrollManagerOptions
} from "./types";

export { TIMELINE_CONSTANTS } from "./types";

export interface TimelineFeatures {
	ruler: RulerFeatureType;
	playhead: PlayheadFeatureType;
	scroll: ScrollManagerType;
}