import { EditCommand } from "@core/commands/types";
import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import { Clip } from "@core/schemas/clip";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimeline, ITimelineState, ITimelineRenderer, ITimelineTool, ITimelineFeature, IToolManager, IFeatureManager, ITimelineToolContext, ITimelineFeatureContext } from "../interfaces";
import { TimelineState, StateChanges, RegisteredClip } from "../types";
import { TimelineClip } from "../entities/TimelineClip";

import { ClipRegistryManager } from "./ClipRegistryManager";
import { FeatureManager } from "./FeatureManager";
import { TimelineRenderer } from "./TimelineRenderer";
import { TimelineStateManager } from "./TimelineState";
import { ToolManager } from "./ToolManager";

/**
 * Main Timeline orchestrator class that manages the timeline state,
 * tools, features, and rendering.
 */
export class Timeline extends Entity implements ITimeline {
	public static readonly TimelineSelector = "[data-shotstack-timeline]";

	private state: ITimelineState;
	private renderer: ITimelineRenderer;
	private toolManager: IToolManager;
	private featureManager: IFeatureManager;
	private clipRegistryManager: ClipRegistryManager;
	private edit: Edit;
	private size: Size;
	private pixelsPerSecond: number = 100;
	private animationFrameId: number | null = null;
	private clipIndices = new WeakMap<PIXI.Container, { trackIndex: number; clipIndex: number }>();  // Kept for backward compatibility

	constructor(edit: Edit, size?: Size) {
		super();
		this.edit = edit;
		// Default size: use edit width, height 150
		this.size = size || { width: edit.size.width, height: 150 };

		// Initialize core systems
		this.state = new TimelineStateManager(this.createInitialState());
		this.renderer = new TimelineRenderer(this.size);

		// Initialize clip registry manager as core infrastructure
		this.clipRegistryManager = new ClipRegistryManager(this.state, this.edit);
		
		// Set Timeline reference on ClipRegistryManager
		this.clipRegistryManager.setTimeline(this);

		// Initialize managers with state reference
		this.toolManager = new ToolManager(this.state, this.edit);
		this.featureManager = new FeatureManager(this.state);

		// Set up cross-manager communication
		this.toolManager.setFeatureManager(this.featureManager);

		// Subscribe to state changes for external communication
		this.state.subscribe(this.handleStateChange.bind(this));

		// Subscribe to external events from Edit
		this.setupEditEventListeners();
	}

	public async load(): Promise<void> {
		// Find the timeline container
		const container = document.querySelector<HTMLDivElement>(Timeline.TimelineSelector);
		if (!container) {
			throw new Error(`Timeline container element '${Timeline.TimelineSelector}' not found.`);
		}

		// Initialize renderer
		await this.renderer.load();

		// Add renderer canvas to container
		this.getContainer().addChild(this.renderer.getStage());

		// Enable PIXI event system on the stage and make it interactive
		this.renderer.getStage().eventMode = "static";

		// Set up PIXI event listeners for tool handling
		this.renderer.getStage().on("pointerdown", (event: PIXI.FederatedPointerEvent) => {
			this.handlePixiPointerDown(event);
		});

		// Append the timeline canvas to the DOM
		const { canvas } = this.renderer.getApplication();
		container.appendChild(canvas);

		// Set up cursor element
		this.toolManager.setCursorElement(canvas);

		// Use PIXI events for pointer handling (unified event system)
		this.renderer.getStage().on("pointermove", (event: PIXI.FederatedPointerEvent) => {
			this.handlePixiPointerMove(event);
		});
		this.renderer.getStage().on("pointerup", (event: PIXI.FederatedPointerEvent) => {
			this.handlePixiPointerUp(event);
		});

		// Keep DOM events for wheel and keyboard (better support)
		canvas.addEventListener("wheel", this.handleWheel.bind(this));

		// Set up keyboard events on document (when canvas has focus)
		canvas.tabIndex = 0; // Make canvas focusable
		canvas.addEventListener("keydown", this.handleKeyDown.bind(this));
		canvas.addEventListener("keyup", this.handleKeyUp.bind(this));

		// Load default tools and features
		await this.loadDefaultTools();
		await this.loadDefaultFeatures();

		// Set default tool
		this.toolManager.activate("selection");

		// Load tracks and clips from Edit
		await this.loadEditData();

		// Start animation loop
		this.startAnimationLoop();
	}

	public update(deltaTime: number, elapsed: number): void {
		// Update playback state from Edit
		// Edit stores time in milliseconds, convert to seconds for Timeline
		const currentPlayback = this.state.getState().playback;
		const newPlayback = {
			currentTime: this.edit.playbackTime / 1000,
			isPlaying: this.edit.isPlaying,
			duration: this.edit.getTotalDuration()
		};

		if (
			currentPlayback.currentTime !== newPlayback.currentTime ||
			currentPlayback.isPlaying !== newPlayback.isPlaying ||
			currentPlayback.duration !== newPlayback.duration
		) {
			this.state.update({ playback: newPlayback });
		}

		// Update active tool
		const activeTool = this.toolManager.getActiveTool();
		if (activeTool) {
			activeTool.update(deltaTime, elapsed);
		}

		// Update all enabled features
		this.featureManager.getAllFeatures().forEach(feature => {
			if (feature.enabled) {
				feature.update(deltaTime, elapsed);
			}
		});
	}

	public draw(): void {
		// Render the timeline
		this.renderer.render(this.state.getState());

		// Let features render their overlays
		this.featureManager.renderOverlays(this.renderer);

		// Draw active tool overlays if any
		const activeTool = this.toolManager.getActiveTool();
		if (activeTool) {
			activeTool.draw();
		}
	}

	public dispose(): void {
		// Stop animation loop
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}

		// Dispose all tools
		this.toolManager.getAllTools().forEach(tool => tool.dispose());

		// Dispose all features
		this.featureManager.getAllFeatures().forEach(feature => feature.dispose());

		// Remove PIXI event listeners
		this.renderer.getStage().off("pointerdown");
		this.renderer.getStage().off("pointermove");
		this.renderer.getStage().off("pointerup");

		// Dispose renderer
		this.renderer.dispose();

		// Remove event listeners
		this.removeEditEventListeners();

		// Remove remaining DOM event listeners
		const { canvas } = this.renderer.getApplication();
		canvas.removeEventListener("wheel", this.handleWheel.bind(this));
		canvas.removeEventListener("keydown", this.handleKeyDown.bind(this));
		canvas.removeEventListener("keyup", this.handleKeyUp.bind(this));

		// Dispose clip registry manager
		this.clipRegistryManager.dispose();
	}

	public getState(): TimelineState {
		return this.state.getState();
	}

	public setState(updates: Partial<TimelineState>): void {
		this.state.update(updates);
	}

	public registerTool(tool: ITimelineTool): void {
		this.toolManager.register(tool);
	}

	public registerFeature(feature: ITimelineFeature): void {
		this.featureManager.register(feature);
	}

	public activateTool(name: string): void {
		this.toolManager.activate(name);
	}

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.state.update({
			viewport: {
				...this.state.getState().viewport,
				zoom: pixelsPerSecond
			}
		});
	}


	public getRenderer(): ITimelineRenderer {
		return this.renderer;
	}

	public getTimelineDuration(): number {
		// Get duration from edit
		return this.edit.getTotalDuration();
	}

	public getFeature(name: string): ITimelineFeature | null {
		return this.featureManager.getFeature(name);
	}

	// Core registry API methods
	/**
	 * Get stable ID for a clip at the given position
	 */
	public getClipIdAtPosition(trackIndex: number, clipIndex: number): string | null {
		return this.clipRegistryManager.getClipIdAtPosition(trackIndex, clipIndex);
	}

	/**
	 * Find a clip by its stable ID
	 */
	public findClipById(clipId: string): RegisteredClip | null {
		return this.clipRegistryManager.findClipById(clipId);
	}

	/**
	 * Get the visual entity for a clip ID
	 */
	public getClipVisual(clipId: string): TimelineClip | null {
		const registeredClip = this.clipRegistryManager.findClipById(clipId);
		return registeredClip ? registeredClip.visual : null;
	}

	/**
	 * Get the clip registry manager (for internal use by Timeline components)
	 * @internal
	 */
	public getClipRegistryManager(): ClipRegistryManager {
		return this.clipRegistryManager;
	}

	// Query method for tools to find clip at a given PIXI display object
	public findClipAtPoint(target: PIXI.Container): { trackIndex: number; clipIndex: number } | null {
		// Try registry-based lookup first
		const registryState = this.state.getState().clipRegistry;
		
		// Walk up the display list to find a clip container
		let currentTarget: PIXI.Container | null = target;
		while (currentTarget) {
			// Check if this container belongs to a registered clip
			for (const [clipId, registeredClip] of registryState.clips) {
				if (registeredClip.visual && registeredClip.visual.getContainer() === currentTarget) {
					return {
						trackIndex: registeredClip.trackIndex,
						clipIndex: registeredClip.clipIndex
					};
				}
			}
			currentTarget = currentTarget.parent;
		}
		
		// Fall back to WeakMap approach if registry lookup fails
		// This ensures backward compatibility during transition
		currentTarget = target;
		while (currentTarget) {
			const indices = this.clipIndices.get(currentTarget);
			if (indices) {
				return indices;
			}
			currentTarget = currentTarget.parent;
		}
		
		return null;
	}

	private createInitialState(): TimelineState {
		return {
			viewport: {
				scrollX: 0,
				scrollY: 0,
				zoom: this.pixelsPerSecond,
				width: this.size.width,
				height: this.size.height
			},
			selection: {
				selectedClipIds: new Set<string>(),
				selectedTrackIds: new Set<string>(),
				lastSelectedId: null
			},
			playback: {
				currentTime: 0,
				isPlaying: false,
				duration: 0
			},
			features: {
				snapping: {
					enabled: true,
					gridSize: 0.033333 // 1/30 second
				},
				autoScroll: {
					enabled: true,
					threshold: 0.8 // 80% of viewport
				}
			},
			activeTool: "selection",
			toolStates: new Map(),
			clipRegistry: {
				clips: new Map(),
				trackIndex: new Map(),
				generation: 0
			}
		};
	}

	private async loadDefaultTools(): Promise<void> {
		// Create tool context
		const toolContext: ITimelineToolContext = {
			timeline: this,
			edit: this.edit,
			executeCommand: (command: EditCommand | { type: string }) => {
				// Handle simple command objects
				if ('type' in command && command.type === "CLEAR_SELECTION") {
					this.edit.clearSelection();
				} else if ('execute' in command) {
					// Handle proper EditCommand objects - use Edit's executeCommand which provides context
					this.edit.executeEditCommand(command);
				} else {
					console.log("Timeline command:", command);
				}
			}
		};

		// Register selection tool
		const { SelectionTool } = await import("../tools/SelectionTool");
		const selectionTool = new SelectionTool(this.state, toolContext);
		this.toolManager.register(selectionTool);

		// Register resize interceptor (runs before tools)
		const { ResizeInterceptor } = await import("../tools/ResizeInterceptor");
		const resizeInterceptor = new ResizeInterceptor(this.state, toolContext);
		this.toolManager.registerInterceptor(resizeInterceptor);

		// Register drag interceptor (runs after resize but before selection)
		const { DragInterceptor } = await import("../tools/DragInterceptor");
		const dragInterceptor = new DragInterceptor(this.state, toolContext);
		this.toolManager.registerInterceptor(dragInterceptor);
	}

	private async loadDefaultFeatures(): Promise<void> {
		// Create feature context
		const featureContext: ITimelineFeatureContext = {
			timeline: this,
			edit: this.edit
		};

		// Register the zoom feature
		const { ZoomFeature } = await import("../features/ZoomFeature");
		const zoomFeature = new ZoomFeature(this.state, featureContext);
		this.featureManager.register(zoomFeature);
		
		// Register the playhead feature (temporary for testing)
		const { PlayheadFeature } = await import("../features/PlayheadFeature");
		const playheadFeature = new PlayheadFeature(this.state, featureContext);
		this.featureManager.register(playheadFeature);
		
		// Enable features by default
		this.featureManager.enable("zoom");
		this.featureManager.enable("playhead");
	}

	private handleStateChange(state: TimelineState, changes: StateChanges): void {
		// Emit relevant changes to external listeners via Edit.events
		if (changes.selection) {
			this.edit.events.emit("timeline:selectionChanged", { selection: state.selection });
		}
		if (changes.viewport) {
			this.edit.events.emit("timeline:viewportChanged", { viewport: state.viewport });
		}
		if (changes.activeTool) {
			this.edit.events.emit("timeline:toolChanged", {
				previousTool: null, // TODO: Track previous tool
				currentTool: state.activeTool
			});
		}
	}

	private setupEditEventListeners(): void {
		// Listen to clip updates from Edit
		this.edit.events.on("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.on("clip:deleted", this.handleClipDeleted.bind(this));
		this.edit.events.on("track:deleted", this.handleTrackDeleted.bind(this));

		// Listen to selection changes for visual feedback
		this.edit.events.on("clip:selected", this.updateSelectionVisuals.bind(this));
		this.edit.events.on("selection:cleared", this.updateSelectionVisuals.bind(this));
		
		// Listen to registry sync events to update container mappings
		this.edit.events.on("timeline:registrySynced", this.handleRegistrySynced.bind(this));
	}

	private removeEditEventListeners(): void {
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.off("clip:deleted", this.handleClipDeleted.bind(this));
		this.edit.events.off("track:deleted", this.handleTrackDeleted.bind(this));
		this.edit.events.off("clip:selected", this.updateSelectionVisuals.bind(this));
		this.edit.events.off("selection:cleared", this.updateSelectionVisuals.bind(this));
		this.edit.events.off("timeline:registrySynced", this.handleRegistrySynced.bind(this));
	}

	private handleClipUpdated(__data: { clipId: string; clip: Clip }): void {
		// Use registry sync instead of full reload
		this.clipRegistryManager.scheduleSync();
	}

	private handleClipDeleted(data: { clipId: string; trackIndex: number; clipIndex: number }): void {
		// Remove clip from selection if it was selected
		const state = this.state.getState();
		if (state.selection.selectedClipIds.has(data.clipId)) {
			const newSelection = new Set(state.selection.selectedClipIds);
			newSelection.delete(data.clipId);
			this.state.update({
				selection: {
					...state.selection,
					selectedClipIds: newSelection,
					lastSelectedId: state.selection.lastSelectedId === data.clipId ? null : state.selection.lastSelectedId
				}
			});
		}

		// Use registry sync instead of full reload
		this.clipRegistryManager.scheduleSync();
	}

	private handleTrackDeleted(__data: { trackId: string; trackIndex: number }): void {
		// Use registry sync instead of full reload
		this.clipRegistryManager.scheduleSync();
	}

	private handleRegistrySynced(__data: any): void {
		// Update WeakMap with current registry state for backward compatibility
		const registryState = this.state.getState().clipRegistry;
		
		// Clear old mappings
		this.clipIndices = new WeakMap();
		
		// Add current mappings from registry
		for (const [clipId, registeredClip] of registryState.clips) {
			if (registeredClip.visual) {
				const container = registeredClip.visual.getContainer();
				this.clipIndices.set(container, {
					trackIndex: registeredClip.trackIndex,
					clipIndex: registeredClip.clipIndex
				});
			}
		}
	}

	// Handle PIXI pointer events - forward to features and tools
	private handlePixiPointerDown(event: PIXI.FederatedPointerEvent): void {
		// Let features handle it first
		if (this.featureManager.handlePointerDown(event)) {
			return;
		}
		
		// Then forward to tool manager
		this.toolManager.handlePointerDown(event);
	}

	// Handle PIXI pointer move events
	private handlePixiPointerMove(event: PIXI.FederatedPointerEvent): void {
		// Let features handle it first
		if (this.featureManager.handlePointerMove(event)) {
			return;
		}
		
		// Then forward to tool manager
		this.toolManager.handlePointerMove(event);
	}

	// Handle PIXI pointer up events
	private handlePixiPointerUp(event: PIXI.FederatedPointerEvent): void {
		// Let features handle it first
		if (this.featureManager.handlePointerUp(event)) {
			return;
		}
		
		// Then forward to tool manager
		this.toolManager.handlePointerUp(event);
	}


	public handleWheel(event: WheelEvent): void {
		// Create timeline wheel event
		const timelineEvent = {
			deltaX: event.deltaX,
			deltaY: event.deltaY,
			deltaMode: event.deltaMode,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			x: event.offsetX,
			preventDefault: () => event.preventDefault()
		};

		// Let features handle it first
		if (this.featureManager.handleWheel(timelineEvent)) {
			return;
		}
		
		// Then pass to tool manager
		this.toolManager.handleWheel(event);
	}

	public handleKeyDown(event: KeyboardEvent): void {
		// Handle delete key for clip deletion
		if (event.key === "Delete" || event.key === "Backspace") {
			const selected = this.edit.getSelectedClipInfo();
			if (selected) {
				event.preventDefault();
				this.edit.deleteClip(selected.trackIndex, selected.clipIndex);
				return;
			}
		}

		// Pass other keys to tool manager
		this.toolManager.handleKeyDown(event);
	}

	public handleKeyUp(event: KeyboardEvent): void {
		this.toolManager.handleKeyUp(event);
	}

	private async loadEditData(): Promise<void> {
		// Get the current edit data
		const editData = this.edit.getEdit();

		// Ensure we have tracks in the renderer
		for (const [index, track] of editData.timeline.tracks.entries()) {
			const trackId = `track-${index}`;
			if (!this.renderer.getTrack(trackId)) {
				this.renderer.addTrack(trackId, index);
			}
		}

		// Remove tracks that no longer exist
		const trackCount = editData.timeline.tracks.length;
		this.renderer.getTracks().forEach(track => {
			const trackIndex = parseInt(track.getTrackId().replace('track-', ''));
			if (trackIndex >= trackCount) {
				this.renderer.removeTrack(track.getTrackId());
			}
		});

		// For initial load, sync immediately to ensure clips are registered
		// This is important for drag operations that may happen right after load
		await this.clipRegistryManager.syncWithEdit();

		// Trigger a render to show the loaded data
		this.draw();
	}

	private updateSelectionVisuals(): void {
		const selectedInfo = this.edit.getSelectedClipInfo();
		const registryState = this.state.getState().clipRegistry;

		// Update visual state of all clips using registry
		for (const [clipId, registeredClip] of registryState.clips) {
			if (registeredClip.visual) {
				const isSelected = selectedInfo && 
					selectedInfo.trackIndex === registeredClip.trackIndex && 
					selectedInfo.clipIndex === registeredClip.clipIndex;
				registeredClip.visual.setSelected(isSelected || false);
			}
		}

		// Re-render to show selection changes
		this.draw();
	}

	private startAnimationLoop(): void {
		let lastTime = performance.now();

		const animate = (currentTime: number) => {
			const deltaMS = currentTime - lastTime;
			lastTime = currentTime;

			// Convert to PIXI-style deltaTime (frame-based)
			const deltaTime = deltaMS / 16.667;

			this.update(deltaTime, deltaMS);
			this.draw();

			this.animationFrameId = requestAnimationFrame(animate);
		};

		this.animationFrameId = requestAnimationFrame(animate);
	}
}
