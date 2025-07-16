// Timeline v2 Core
export { TimelineV2 } from './timeline-v2';

// Timeline v2 Visual Components
export { VisualClip } from './visual-clip';
export { VisualTrack } from './visual-track';

// Timeline v2 Types
export type { 
	EditType, 
	TimelineV2Options, 
	ClipInfo, 
	DropPosition, 
	TimelineV2Tool 
} from './types';

// Timeline v2 Features
export { RulerFeature, PlayheadFeature, GridFeature } from './timeline-features';

// Note: Additional components will be exported as they are implemented
// export { DragTool } from './drag-tool';
// export { SelectionTool } from './selection-tool';
// export { ResizeTool } from './resize-tool';