export { RulerFeature } from "./ruler-feature";
export { PlayheadFeature } from "./playhead-feature";
export { GridFeature } from "./grid-feature";
export { ScrollManager } from "./scroll-manager";

export type {
	TimelineFeatureEvents,
	RulerFeatureOptions,
	PlayheadFeatureOptions,
	GridFeatureOptions,
	ScrollManagerOptions
} from "./types";

export { TIMELINE_CONSTANTS } from "./types";

// Import the classes for the interface
import type { RulerFeature as RulerFeatureType } from "./ruler-feature";
import type { PlayheadFeature as PlayheadFeatureType } from "./playhead-feature";
import type { GridFeature as GridFeatureType } from "./grid-feature";
import type { ScrollManager as ScrollManagerType } from "./scroll-manager";

export interface TimelineFeatures {
	ruler: RulerFeatureType;
	playhead: PlayheadFeatureType;
	grid: GridFeatureType;
	scroll: ScrollManagerType;
}