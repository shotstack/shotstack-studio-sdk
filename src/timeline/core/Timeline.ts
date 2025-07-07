import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import { Entity } from "@core/shared/entity";

import { ITimeline, ITimelineState, ITimelineRenderer, ITimelineTool, ITimelineFeature, IToolManager, IFeatureManager } from "../interfaces";
import { TimelineState, TimelineOptions, StateChanges } from "../types";

import { FeatureManager } from "./FeatureManager";
import { TimelineRenderer } from "./TimelineRenderer";
import { TimelineStateManager } from "./TimelineState";
import { ToolManager } from "./ToolManager";

/**
 * Main Timeline orchestrator class that manages the timeline state,
 * tools, features, and rendering.
 */
export class Timeline extends Entity implements ITimeline {
	private state: ITimelineState;
	private renderer: ITimelineRenderer;
	private toolManager: IToolManager;
	private featureManager: IFeatureManager;
	private edit: Edit;
	private size: Size;
	private options: TimelineOptions;

	constructor(options: TimelineOptions) {
		super();
		this.options = options;
		this.edit = options.edit;
		this.size = options.size;

		// Initialize core systems
		this.state = new TimelineStateManager(this.createInitialState());
		this.renderer = new TimelineRenderer(this.size);

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
		// Initialize renderer
		await this.renderer.load();

		// Add renderer canvas to container
		this.getContainer().addChild(this.renderer.getStage());

		// Load default tools and features
		await this.loadDefaultTools();
		await this.loadDefaultFeatures();

		// Set default tool
		this.toolManager.activate("selection");
	}

	public update(deltaTime: number, elapsed: number): void {
		// Update playback state from Edit
		const currentPlayback = this.state.getState().playback;
		const newPlayback = {
			currentTime: this.edit.playbackTime,
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
		// Dispose all tools
		this.toolManager.getAllTools().forEach(tool => tool.dispose());

		// Dispose all features
		this.featureManager.getAllFeatures().forEach(feature => feature.dispose());

		// Dispose renderer
		this.renderer.dispose();

		// Remove event listeners
		this.removeEditEventListeners();
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

	public getRenderer(): ITimelineRenderer {
		return this.renderer;
	}

	private createInitialState(): TimelineState {
		return {
			viewport: {
				scrollX: 0,
				scrollY: 0,
				zoom: this.options.pixelsPerSecond || 100,
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
					enabled: this.options.snapEnabled ?? true,
					gridSize: this.options.snapGridSize || 0.033333 // 1/30 second
				},
				autoScroll: {
					enabled: this.options.autoScrollEnabled ?? true,
					threshold: 0.8 // 80% of viewport
				}
			},
			activeTool: "selection",
			toolStates: new Map()
		};
	}

	private async loadDefaultTools(): Promise<void> {
		// Default tools will be loaded here
		// For now, we'll add them in a later task
	}

	private async loadDefaultFeatures(): Promise<void> {
		// Default features will be loaded here
		// For now, we'll add them in a later task
	}

	private handleStateChange(state: TimelineState, changes: StateChanges): void {
		// Emit relevant changes to external listeners via Edit.events
		if (changes.selection) {
			(this.edit.events as any).emit("timeline:selectionChanged", { selection: state.selection });
		}
		if (changes.viewport) {
			(this.edit.events as any).emit("timeline:viewportChanged", { viewport: state.viewport });
		}
		if (changes.activeTool) {
			(this.edit.events as any).emit("timeline:toolChanged", {
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
	}

	private removeEditEventListeners(): void {
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.off("clip:deleted", this.handleClipDeleted.bind(this));
		this.edit.events.off("track:deleted", this.handleTrackDeleted.bind(this));
	}

	private handleClipUpdated(data: any): void {
		// Handle clip updates
		// This will trigger a re-render in the next draw cycle
	}

	private handleClipDeleted(data: any): void {
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
	}

	private handleTrackDeleted(data: any): void {
		// Handle track deletion
		// This will be implemented when we have track management
	}

	// Public methods for input handling (delegated to tool manager)
	public handlePointerDown(event: PointerEvent): void {
		this.toolManager.handlePointerDown(event);
	}

	public handlePointerMove(event: PointerEvent): void {
		this.toolManager.handlePointerMove(event);
	}

	public handlePointerUp(event: PointerEvent): void {
		this.toolManager.handlePointerUp(event);
	}

	public handleWheel(event: WheelEvent): void {
		this.toolManager.handleWheel(event);
	}

	public handleKeyDown(event: KeyboardEvent): void {
		this.toolManager.handleKeyDown(event);
	}

	public handleKeyUp(event: KeyboardEvent): void {
		this.toolManager.handleKeyUp(event);
	}
}
