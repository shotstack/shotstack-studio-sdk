// Timeline v2 Core
export { TimelineV2 } from './timeline-v2';

// Timeline v2 Visual Components
export { VisualClip } from './visual-clip';
export { VisualTrack } from './visual-track';

// Timeline v2 Types
export type { 
	EditType, 
	TimelineOptions,
	TimelineV2Options, 
	ClipConfig,
	ClipInfo, 
	DropPosition
} from './types';

// Timeline v2 Features and Layout
export { RulerFeature, PlayheadFeature, GridFeature, ScrollManager } from './timeline-features';
export { TimelineLayout } from './timeline-layout';

// Timeline v2 Interaction
export { TimelineInteraction } from './timeline-interaction';

// Note: Additional components will be exported as they are implemented
// export { DragTool } from './drag-tool';
// export { SelectionTool } from './selection-tool';
// export { ResizeTool } from './resize-tool';