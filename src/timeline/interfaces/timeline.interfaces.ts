import { EditCommand } from "@core/commands/types";
import { Edit } from "@core/edit";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineState, StateChanges, TimelinePointerEvent, TimelineWheelEvent, RenderLayer } from "../types/timeline.types";


// Tool context interface for dependency injection
export interface ITimelineToolContext {
	timeline: ITimeline;
	edit: Edit;
	executeCommand: (command: EditCommand) => void;
}

// Core Timeline interface
export interface ITimeline extends Entity {
	getState(): TimelineState;
	setState(updates: Partial<TimelineState>): void;
	registerTool(tool: ITimelineTool): void;
	registerFeature(feature: ITimelineFeature): void;
	activateTool(name: string): void;
	getRenderer(): ITimelineRenderer;
	
	// Query methods for tools
	findClipAtPoint(target: PIXI.Container): { trackIndex: number; clipIndex: number } | null;
}

// State management interface
export interface ITimelineState {
	subscribe(listener: (state: TimelineState, changes: StateChanges) => void): () => void;
	update(updates: Partial<TimelineState>): void;
	getState(): TimelineState;
	createSnapshot(): TimelineState;
	restoreSnapshot(snapshot: TimelineState): void;
}

// Tool system interface
export interface ITimelineTool extends Entity {
	readonly name: string;
	readonly cursor: string;

	// Lifecycle
	onActivate(): void;
	onDeactivate(): void;

	// Input handling
	onPointerDown?(event: TimelinePointerEvent): void;
	onPointerMove?(event: TimelinePointerEvent): void;
	onPointerUp?(event: TimelinePointerEvent): void;
	onWheel?(event: TimelineWheelEvent): void;
	onKeyDown?(event: KeyboardEvent): void;
	onKeyUp?(event: KeyboardEvent): void;

	// State updates
	updateState(updates: Partial<TimelineState>): void;
	executeCommand(command: EditCommand): void;
}

// Feature system interface
export interface ITimelineFeature extends Entity {
	readonly name: string;
	readonly enabled: boolean;

	// Lifecycle
	setEnabled(enabled: boolean): void;
	onEnable(): void;
	onDisable(): void;

	// Feature-specific rendering
	renderOverlay(renderer: ITimelineRenderer): void;

	// Coordination
	onToolChanged?(newTool: string, previousTool: string | null): void;
	onStateChanged?(changes: StateChanges): void;
}

// Renderer interface
export interface ITimelineRenderer {
	// Lifecycle
	load(): Promise<void>;
	dispose(): void;

	// Layer management
	createLayer(name: string, zIndex: number): void;
	getLayer(name: RenderLayer | string): PIXI.Container;
	removeLayer(name: string): void;

	// Rendering
	render(state: TimelineState): void;
	clear(): void;
	resize(width: number, height: number): void;

	// Access to PIXI application
	getApplication(): PIXI.Application;
	getStage(): PIXI.Container;

	// Track management
	addTrack(trackId: string, index: number): ITimelineTrack;
	removeTrack(trackId: string): void;
	getTrack(trackId: string): ITimelineTrack | undefined;
	getTracks(): ITimelineTrack[];
}

// Tool Manager interface
export interface IToolManager {
	register(tool: ITimelineTool): void;
	unregister(name: string): void;
	activate(name: string): void;
	getActiveTool(): ITimelineTool | null;
	getAllTools(): Map<string, ITimelineTool>;
	setFeatureManager(featureManager: IFeatureManager): void;
	setCursorElement(element: HTMLElement): void;

	// Input delegation
	handlePointerDown(event: PIXI.FederatedPointerEvent): void;
	handlePointerMove(event: PIXI.FederatedPointerEvent): void;
	handlePointerUp(event: PIXI.FederatedPointerEvent): void;
	handleWheel(event: WheelEvent): void;
	handleKeyDown(event: KeyboardEvent): void;
	handleKeyUp(event: KeyboardEvent): void;
}

// Feature Manager interface
export interface IFeatureManager {
	register(feature: ITimelineFeature): void;
	unregister(name: string): void;
	enable(name: string): void;
	disable(name: string): void;
	getFeature(name: string): ITimelineFeature | null;
	getAllFeatures(): Map<string, ITimelineFeature>;

	// Coordination
	onToolChanged(toolName: string, previousTool: string | null): void;
	onStateChanged(changes: StateChanges): void;
	renderOverlays(renderer: ITimelineRenderer): void;
}

// Timeline Entity interfaces
export interface ITimelineTrack extends Entity {
	getTrackId(): string;
	getIndex(): number;
	getHeight(): number;
	getClips(): ITimelineClip[];
	addClip(clip: ITimelineClip): void;
	removeClip(clipId: string): void;
	updateLayout(): void;
}

export interface ITimelineClip extends Entity {
	getClipId(): string;
	getTrackId(): string;
	getStartTime(): number;
	getDuration(): number;
	getEndTime(): number;
	setStartTime(time: number): void;
	setDuration(duration: number): void;
	getSelected(): boolean;
	setSelected(selected: boolean): void;
}

export interface ITimelineRuler extends Entity {
	setZoom(pixelsPerSecond: number): void;
	setScrollX(scrollX: number): void;
	getTimeAtPosition(x: number): number;
	getPositionAtTime(time: number): number;
}

export interface ITimelinePlayhead extends Entity {
	setTime(time: number): void;
	getTime(): number;
	setVisible(visible: boolean): void;
	setPixelsPerSecond(pixelsPerSecond: number): void;
	setScrollX(scrollX: number): void;
}
