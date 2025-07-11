import { Player } from "@canvas/players/player";
import { EditCommand } from "@core/commands/types";
import { Edit } from "@core/edit";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineState, StateChanges, TimelinePointerEvent, TimelineWheelEvent, RenderLayer } from "../types/timeline.types";

// Tool context interface for dependency injection
export interface ITimelineToolContext {
	timeline: ITimeline;
	edit: Edit & {
		// Expose the methods that DragInterceptor needs
		findClipIndices(player: Player): { trackIndex: number; clipIndex: number } | null;
		getPlayerClip(trackIndex: number, clipIndex: number): Player | null;
	};
	clipRegistry: import("../core/ClipRegistryManager").ClipRegistryManager;
	executeCommand: (command: EditCommand | { type: string }) => void;
}

// Feature context interface for dependency injection
export interface ITimelineFeatureContext {
	timeline: ITimeline;
	edit: Edit;
}

// Core Timeline interface
export interface ITimeline extends Entity {
	getState(): TimelineState;
	setState(updates: Partial<TimelineState>): void;
	registerTool(tool: ITimelineTool): void;
	registerFeature(feature: ITimelineFeature): void;
	activateTool(name: string): void;
	getRenderer(): ITimelineRenderer;

	// Get the clip registry - the single source of truth for all clip operations
	getClipRegistry(): import("../core/ClipRegistryManager").ClipRegistryManager;

	// Core timeline properties
	setPixelsPerSecond(pixelsPerSecond: number): void;
	getTimelineDuration(): number;

	// Feature access
	getFeature(name: string): ITimelineFeature | null;
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

// Tool interceptor interface for passive tools that intercept events
export interface IToolInterceptor {
	readonly name: string;
	readonly priority: number; // Higher priority interceptors run first

	// Attempt to intercept and handle the event
	// Returns true if handled (prevents further processing)
	interceptPointerDown?(event: TimelinePointerEvent): boolean;
	interceptPointerMove?(event: TimelinePointerEvent): boolean;
	interceptPointerUp?(event: TimelinePointerEvent): boolean;

	// Get cursor for current context (returns null if no specific cursor)
	getCursor?(event: TimelinePointerEvent): string | null;
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
	getTrackByIndex(index: number): ITimelineTrack | undefined;
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

	// Interceptor management
	registerInterceptor(interceptor: IToolInterceptor): void;
	unregisterInterceptor(name: string): void;

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

	// Event handling
	handleWheel(event: TimelineWheelEvent): boolean;
	handleKeyDown(event: KeyboardEvent): boolean;
	handleKeyUp(event: KeyboardEvent): boolean;
	handlePointerDown(event: TimelinePointerEvent): boolean;
	handlePointerMove(event: TimelinePointerEvent): boolean;
	handlePointerUp(event: TimelinePointerEvent): boolean;
}

// Timeline Entity interfaces
export interface ITimelineTrack extends Entity {
	getTrackId(): string;
	getIndex(): number;
	getHeight(): number;
	getClips(): ITimelineClip[];
	addClip(clip: ITimelineClip): void;
	removeClip(clipId: string): void;
	detachClip(clipId: string): void;
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
	setPixelsPerSecond(pixelsPerSecond: number): void;
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
