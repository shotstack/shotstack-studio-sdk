import { Player } from "@canvas/players/player";
import { Clip } from "@core/schemas/clip";
import * as PIXI from "pixi.js";

// Import TimelineClip type (will be needed for RegisteredClip)
import type { TimelineClip } from "../entities/TimelineClip";

// Clip Registry Types
export interface RegisteredClip {
	id: string;                    // Stable, generated ID
	visual: TimelineClip;          // Visual entity
	trackIndex: number;            // Current position
	clipIndex: number;
	playerSignature: string;       // Hash of player properties
	lastSeen: number;             // Timestamp for lifecycle
}

export interface ClipRegistryState {
	// Stable ID -> Clip metadata
	clips: Map<string, RegisteredClip>;
	// Track index -> Set of clip IDs
	trackIndex: Map<number, Set<string>>;
	// Generation counter for debugging
	generation: number;
}

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
	toolStates: Map<string, unknown>;

	// Clip registry state
	clipRegistry: ClipRegistryState;
};

// State change tracking
export type StateChanges = {
	viewport?: boolean;
	selection?: boolean;
	features?: boolean;
	activeTool?: boolean;
	playback?: boolean;
	clipRegistry?: boolean;
};

// State listener function type
export type StateListener = (state: TimelineState, changes: StateChanges) => void;

// Timeline event types - simplified to extend PIXI events directly
export type TimelinePointerEvent = PIXI.FederatedPointerEvent & {
	// Add timeline-specific properties only if needed
	timelineX?: number;
	timelineY?: number;
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
	"timeline:stateChanged": { property: keyof TimelineState; value: unknown };
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

// Clip and Track operations
export type ClipOperation = {
	type: "move" | "resize" | "create" | "delete";
	clipId: string;
	trackId: string;
	previousState?: Partial<Clip>;
	newState?: Partial<Clip>;
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
