import { EditCommand } from "@core/commands/types";
import { EventEmitter } from "@core/events/event-emitter";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";
import { TimelineLayout } from "../timeline-layout";
import { ClipConfig, TimelineOptions } from "../types/timeline";

// Visual component interfaces
export interface VisualClip {
	getContainer(): PIXI.Container;
	getClipConfig(): ClipConfig | null;
	setResizing(resizing: boolean): void;
	setPreviewWidth(width: number | null): void;
}

export interface VisualTrack {
	getClips(): VisualClip[];
	getClip(index: number): VisualClip | null;
}

// Edit interface
export interface EditInterface {
	clearSelection(): void;
	selectClip(trackIndex: number, clipIndex: number): void;
	executeEditCommand(command: EditCommand): void;
	events: EventEmitter;
}

// ClipConfig is imported from ../types/timeline which uses Zod schema

// Core interfaces for dependency injection
export interface TimelineInterface {
	getPixiApp(): PIXI.Application;
	getLayout(): TimelineLayout;
	getTheme(): TimelineTheme;
	getOptions(): TimelineOptions;
	getVisualTracks(): VisualTrack[];
	getClipData(trackIndex: number, clipIndex: number): ClipConfig | null;
	getPlayheadTime(): number;
	getExtendedTimelineWidth(): number;
	getContainer(): PIXI.Container;
	getEdit(): EditInterface;
	showDragGhost(track: number, time: number, freeY?: number): void;
	hideDragGhost(): void;
}

// State types using discriminated unions
export type InteractionState =
	| { type: "idle" }
	| { type: "selecting"; startPos: Point; clipInfo: ClipInfo }
	| { type: "dragging"; dragInfo: DragInfo }
	| { type: "resizing"; resizeInfo: ResizeInfo };

export interface Point {
	x: number;
	y: number;
}

export interface ClipInfo {
	trackIndex: number;
	clipIndex: number;
}

export interface DragInfo {
	trackIndex: number;
	clipIndex: number;
	startTime: number;
	offsetX: number;
	offsetY: number;
}

export interface ResizeInfo {
	trackIndex: number;
	clipIndex: number;
	originalLength: number;
	startX: number;
}

export interface DropZone {
	type: "above" | "between" | "below";
	position: number;
}

// Snap-related types
export interface SnapPoint {
	time: number;
	type: "clip-start" | "clip-end" | "playhead";
	trackIndex?: number;
	clipIndex?: number;
}

export interface SnapResult {
	time: number;
	snapped: boolean;
	snapType?: "clip-start" | "clip-end" | "playhead";
}

export interface AlignmentInfo {
	time: number;
	tracks: number[];
	isPlayhead: boolean;
}

// Threshold configuration
export interface InteractionThresholds {
	drag: {
		base: number;
		small: number;
	};
	resize: {
		min: number;
		max: number;
		ratio: number;
	};
	dropZone: {
		ratio: number;
	};
	snap: {
		pixels: number;
		time: number;
	};
}

// Event types
export interface InteractionEvents {
	"drag:started": DragInfo;
	"drag:moved": {
		trackIndex: number;
		clipIndex: number;
		startTime: number;
		offsetX: number;
		offsetY: number;
		currentTime: number;
		currentTrack: number;
	};
	"drag:ended": void;
	"resize:started": ResizeInfo;
	"resize:updated": { width: number };
	"resize:ended": { newLength: number };
}

// Handler interfaces
export interface InteractionHandler {
	activate(): void;
	deactivate(): void;
	dispose(): void;
}
