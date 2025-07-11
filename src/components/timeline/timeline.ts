import { EditCommand } from "@core/commands/types";
import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { FeatureManager } from "./features/feature-manager";
import { TimelineRenderer } from "./rendering/timeline-renderer";
import { ClipRegistryManager } from "./state/clip-registry";
import { TimelineStateManager } from "./state/timeline-state";
import { ToolManager } from "./tools/tool-manager";
import {
	ITimeline,
	ITimelineState,
	ITimelineRenderer,
	ITimelineTool,
	ITimelineFeature,
	IToolManager,
	IFeatureManager,
	ITimelineToolContext,
	ITimelineFeatureContext
} from "./types/timeline.interfaces";
import { TimelineState, StateChanges } from "./types/timeline.types";

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
	private size: Size;
	private pixelsPerSecond: number = 100;
	private animationFrameId: number | null = null;
	private lastSelectedClipId: string | null = null;

	constructor(
		private edit: Edit,
		size?: Size
	) {
		super();
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

		// Set up event system
		const stage = this.renderer.getStage();
		stage.eventMode = "static";

		// Set up PIXI event listeners
		stage.on("pointerdown", (event: PIXI.FederatedPointerEvent) => this.handlePixiPointerDown(event));
		stage.on("pointermove", (event: PIXI.FederatedPointerEvent) => this.handlePixiPointerMove(event));
		stage.on("pointerup", (event: PIXI.FederatedPointerEvent) => this.handlePixiPointerUp(event));

		// Append canvas and set up DOM events
		const { canvas } = this.renderer.getApplication();
		container.appendChild(canvas);
		this.toolManager.setCursorElement(canvas);

		// Set up DOM event listeners
		canvas.tabIndex = 0;
		canvas.addEventListener("wheel", this.handleWheel.bind(this));
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

		// Update active tool and enabled features
		this.toolManager.getActiveTool()?.update(deltaTime, elapsed);
		
		this.featureManager.getAllFeatures().forEach(feature => {
			if (feature.enabled) {
				feature.update(deltaTime, elapsed);
			}
		});
	}

	public draw(): void {
		this.renderer.render(this.state.getState());
		this.featureManager.renderOverlays(this.renderer);
		this.toolManager.getActiveTool()?.draw();
	}

	public dispose(): void {
		// Stop animation loop
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}

		// Dispose managers
		this.toolManager.getAllTools().forEach(tool => tool.dispose());
		this.featureManager.getAllFeatures().forEach(feature => feature.dispose());

		// Remove event listeners
		const stage = this.renderer.getStage();
		stage.off("pointerdown");
		stage.off("pointermove");
		stage.off("pointerup");

		const { canvas } = this.renderer.getApplication();
		canvas.removeEventListener("wheel", this.handleWheel.bind(this));
		canvas.removeEventListener("keydown", this.handleKeyDown.bind(this));
		canvas.removeEventListener("keyup", this.handleKeyUp.bind(this));

		this.removeEditEventListeners();
		this.renderer.dispose();
		this.clipRegistryManager.dispose();
	}

	public getState = (): TimelineState => this.state.getState();
	public setState = (updates: Partial<TimelineState>): void => this.state.update(updates);
	public registerTool = (tool: ITimelineTool): void => this.toolManager.register(tool);
	public registerFeature = (feature: ITimelineFeature): void => this.featureManager.register(feature);
	public activateTool = (name: string): void => this.toolManager.activate(name);

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.state.update({
			viewport: {
				...this.state.getState().viewport,
				zoom: pixelsPerSecond
			}
		});
	}

	public getRenderer = (): ITimelineRenderer => this.renderer;
	public getTimelineDuration = (): number => this.edit.getTotalDuration();
	public getFeature = (name: string): ITimelineFeature | null => this.featureManager.getFeature(name);
	public getClipRegistry = (): ClipRegistryManager => this.clipRegistryManager;

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
				snapping: { enabled: true, gridSize: 0.033333 },
				autoScroll: { enabled: true, threshold: 0.8 }
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
			clipRegistry: this.clipRegistryManager,
			executeCommand: (command: EditCommand | { type: string }) => {
				// Handle simple command objects
				if ("type" in command && command.type === "CLEAR_SELECTION") {
					this.edit.clearSelection();
				} else if ("execute" in command) {
					// Handle proper EditCommand objects - use Edit's executeCommand which provides context
					this.edit.executeEditCommand(command);
				} else {
					console.log("Timeline command:", command);
				}
			}
		};

		// Register selection tool
		const { SelectionTool } = await import("./tools/selection-tool");
		const selectionTool = new SelectionTool(this.state, toolContext);
		this.toolManager.register(selectionTool);

		// Register resize interceptor (runs before tools)
		const { ResizeInterceptor } = await import("./tools/resize-tool");
		const resizeInterceptor = new ResizeInterceptor(this.state, toolContext);
		this.toolManager.registerInterceptor(resizeInterceptor);

		// Register drag interceptor (runs after resize but before selection)
		const { DragInterceptor } = await import("./tools/drag-tool");
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
		const { ZoomFeature } = await import("./features/zoom-feature");
		const zoomFeature = new ZoomFeature(this.state, featureContext);
		this.featureManager.register(zoomFeature);

		// Register the playhead feature (temporary for testing)
		const { PlayheadFeature } = await import("./features/playhead-feature");
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
		// Listen to selection changes for visual feedback
		this.edit.events.on("clip:selected", this.updateSelectionVisuals.bind(this));
		this.edit.events.on("selection:cleared", this.updateSelectionVisuals.bind(this));

		// Listen to clip deletion to update selection state
		this.edit.events.on("clip:deleted", this.handleClipDeleted.bind(this));
	}

	private removeEditEventListeners(): void {
		this.edit.events.off("clip:selected", this.updateSelectionVisuals.bind(this));
		this.edit.events.off("selection:cleared", this.updateSelectionVisuals.bind(this));
		this.edit.events.off("clip:deleted", this.handleClipDeleted.bind(this));
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
		// ClipRegistryManager handles its own sync for clip deletions
	}

	// Handle PIXI pointer events - forward to features and tools
	private handlePixiPointerDown(event: PIXI.FederatedPointerEvent): void {
		if (!this.featureManager.handlePointerDown(event)) {
			this.toolManager.handlePointerDown(event);
		}
	}

	private handlePixiPointerMove(event: PIXI.FederatedPointerEvent): void {
		if (!this.featureManager.handlePointerMove(event)) {
			this.toolManager.handlePointerMove(event);
		}
	}

	private handlePixiPointerUp(event: PIXI.FederatedPointerEvent): void {
		if (!this.featureManager.handlePointerUp(event)) {
			this.toolManager.handlePointerUp(event);
		}
	}

	public handleWheel(event: WheelEvent): void {
		const { deltaX, deltaY, deltaMode, ctrlKey, shiftKey, altKey, metaKey, offsetX: x } = event;
		const timelineEvent = {
			deltaX, deltaY, deltaMode, ctrlKey, shiftKey, altKey, metaKey, x,
			preventDefault: () => event.preventDefault()
		};

		if (!this.featureManager.handleWheel(timelineEvent)) {
			this.toolManager.handleWheel(event);
		}
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

	public handleKeyUp = (event: KeyboardEvent): void => this.toolManager.handleKeyUp(event);

	private async loadEditData(): Promise<void> {
		const editData = this.edit.getEdit();

		// Ensure we have tracks in the renderer
		editData.timeline.tracks.forEach((_, index) => {
			const trackId = `track-${index}`;
			if (!this.renderer.getTrack(trackId)) {
				this.renderer.addTrack(trackId, index);
			}
		});

		// Remove tracks that no longer exist
		const trackCount = editData.timeline.tracks.length;
		this.renderer.getTracks().forEach(track => {
			const trackIndex = parseInt(track.getTrackId().replace("track-", ""), 10);
			if (trackIndex >= trackCount) {
				this.renderer.removeTrack(track.getTrackId());
			}
		});

		await this.clipRegistryManager.syncWithEdit();
	}

	private updateSelectionVisuals(): void {
		const selectedInfo = this.edit.getSelectedClipInfo();
		const registryState = this.state.getState().clipRegistry;

		// Find the currently selected clip ID
		let currentSelectedClipId: string | null = null;
		if (selectedInfo) {
			for (const [clipId, registeredClip] of registryState.clips) {
				if (registeredClip.trackIndex === selectedInfo.trackIndex && 
					registeredClip.clipIndex === selectedInfo.clipIndex) {
					currentSelectedClipId = clipId;
					break;
				}
			}
		}

		// Update selection state if changed
		if (this.lastSelectedClipId !== currentSelectedClipId) {
			if (this.lastSelectedClipId) {
				registryState.clips.get(this.lastSelectedClipId)?.visual?.setSelected(false);
			}
			if (currentSelectedClipId) {
				registryState.clips.get(currentSelectedClipId)?.visual?.setSelected(true);
			}
			this.lastSelectedClipId = currentSelectedClipId;
		}
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
