import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";

// Core Timeline State
export type TimelineState = {
	// View state
	viewport: {
		scrollX: number;
		scrollY: number;
		zoom: number; // pixels per second
		width: number;
		height: number;
	};

	// Selection state
	selection: {
		selectedClipIds: Set<string>;
		selectedTrackIds: Set<string>;
		lastSelectedId: string | null;
	};

	// Playback state (read-only from Edit)
	playback: {
		currentTime: number;
		isPlaying: boolean;
		duration: number;
	};

	// Feature state
	features: {
		snapping: {
			enabled: boolean;
			gridSize: number;
		};
		autoScroll: {
			enabled: boolean;
			threshold: number;
		};
	};

	// Tool state
	activeTool: string;
	toolStates: Map<string, any>;
};

// State change tracking
export type StateChanges = {
	viewport?: boolean;
	selection?: boolean;
	features?: boolean;
	activeTool?: boolean;
	playback?: boolean;
};

// State listener function type
export type StateListener = (state: TimelineState, changes: StateChanges) => void;

// Timeline event types
export type TimelinePointerEvent = {
	x: number;
	y: number;
	globalX: number;
	globalY: number;
	button: number;
	buttons: number;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	target: any;
	currentTarget: any;
	preventDefault: () => void;
	stopPropagation: () => void;
};

export type TimelineWheelEvent = {
	deltaX: number;
	deltaY: number;
	deltaMode: number;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	preventDefault: () => void;
};

// External events via Edit.events
export type TimelineExternalEvents = {
	// Emitted by timeline for external consumption
	"timeline:stateChanged": { property: keyof TimelineState; value: any };
	"timeline:viewportChanged": { viewport: TimelineState["viewport"] };
	"timeline:selectionChanged": { selection: TimelineState["selection"] };
	"timeline:toolChanged": { previousTool: string | null; currentTool: string };
};

// Tool and Feature Coordination
export type ToolChangeEvent = {
	previousTool: string | null;
	currentTool: string;
};

export type FeatureCoordinator = {
	onToolChanged(event: ToolChangeEvent): void;
	onStateChanged(changes: StateChanges): void;
};

// Timeline initialization options
export type TimelineOptions = {
	edit: Edit;
	size: Size;
	pixelsPerSecond?: number;
	autoScrollEnabled?: boolean;
	snapEnabled?: boolean;
	snapGridSize?: number;
};

// Clip and Track operations
export type ClipOperation = {
	type: "move" | "resize" | "create" | "delete";
	clipId: string;
	trackId: string;
	previousState?: any; // Will be defined when we have clip data types
	newState?: any;
};

export type TrackOperation = {
	type: "create" | "delete" | "reorder";
	trackId: string;
	index?: number;
	previousIndex?: number;
};

// Tool-specific types
export type DragState = {
	isDragging: boolean;
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
	targetClipId?: string;
	targetTrackId?: string;
};

export type ResizeState = {
	isResizing: boolean;
	edge: "left" | "right" | null;
	startX: number;
	originalDuration: number;
	originalStart: number;
	targetClipId?: string;
};

export type SelectionRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

// Rendering layers
export type RenderLayer = "background" | "tracks" | "clips" | "selection" | "playhead" | "overlay" | "features";

// Timeline bounds
export type TimelineBounds = {
	minTime: number;
	maxTime: number;
	minTrack: number;
	maxTrack: number;
};
