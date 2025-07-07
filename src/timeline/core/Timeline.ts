import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import { Entity } from "@core/shared/entity";

import { ITimeline, ITimelineState, ITimelineRenderer, ITimelineTool, ITimelineFeature, IToolManager, IFeatureManager } from "../interfaces";
import { TimelineState, StateChanges } from "../types";

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
	private edit: Edit;
	private size: Size;
	private pixelsPerSecond: number = 100;
	private autoScrollEnabled: boolean = true;
	private snapEnabled: boolean = true;
	private snapGridSize: number = 0.033333; // 1/30 second
	private animationFrameId: number | null = null;

	constructor(edit: Edit, size?: Size) {
		super();
		this.edit = edit;
		// Default size: use edit width, height 150
		this.size = size || { width: edit.size.width, height: 150 };

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
		// Find the timeline container
		const container = document.querySelector<HTMLDivElement>(Timeline.TimelineSelector);
		if (!container) {
			throw new Error(`Timeline container element '${Timeline.TimelineSelector}' not found.`);
		}

		// Initialize renderer
		await this.renderer.load();

		// Add renderer canvas to container
		this.getContainer().addChild(this.renderer.getStage());

		// Append the timeline canvas to the DOM
		const { canvas } = this.renderer.getApplication();
		container.appendChild(canvas);

		// Set up cursor element
		this.toolManager.setCursorElement(canvas);

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

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.state.update({
			viewport: {
				...this.state.getState().viewport,
				zoom: pixelsPerSecond
			}
		});
	}

	public setAutoScroll(enabled: boolean): void {
		this.autoScrollEnabled = enabled;
		this.state.update({
			features: {
				...this.state.getState().features,
				autoScroll: {
					...this.state.getState().features.autoScroll,
					enabled
				}
			}
		});
	}

	public setSnapping(enabled: boolean, gridSize?: number): void {
		this.snapEnabled = enabled;
		if (gridSize !== undefined) {
			this.snapGridSize = gridSize;
		}
		this.state.update({
			features: {
				...this.state.getState().features,
				snapping: {
					enabled: this.snapEnabled,
					gridSize: this.snapGridSize
				}
			}
		});
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
					enabled: this.snapEnabled,
					gridSize: this.snapGridSize
				},
				autoScroll: {
					enabled: this.autoScrollEnabled,
					threshold: 0.8 // 80% of viewport
				}
			},
			activeTool: "selection",
			toolStates: new Map()
		};
	}

	private async loadDefaultTools(): Promise<void> {
		// Register the selection tool
		const { SelectionTool } = await import("../tools/SelectionTool");
		const selectionTool = new SelectionTool(this.state, command => {
			console.log("Timeline command:", command);
			// TODO: Connect to Edit's command system when available
		});
		this.toolManager.register(selectionTool);
	}

	private async loadDefaultFeatures(): Promise<void> {
		// Default features will be loaded here
		// Example: this.featureManager.register(new SnappingFeature(this.state));
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

	private handleClipUpdated(_data: any): void {
		// Reload edit data to reflect changes
		this.loadEditData();
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
		
		// Reload edit data to reflect deletion
		this.loadEditData();
	}

	private handleTrackDeleted(_data: any): void {
		// Reload edit data to reflect track deletion
		this.loadEditData();
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

	private async loadEditData(): Promise<void> {
		// Get the current edit data
		const editData = this.edit.getEdit();
		
		// Clear existing tracks
		this.renderer.getTracks().forEach(track => {
			this.renderer.removeTrack(track.getTrackId());
		});
		
		// Import TimelineClip entity
		const { TimelineClip } = await import("../entities/TimelineClip");
		
		// Load tracks and clips
		for (const [index, track] of editData.timeline.tracks.entries()) {
			// Create track in renderer
			const trackId = `track-${index}`;
			const timelineTrack = this.renderer.addTrack(trackId, index);
			
			// Create and add clips to the track
			for (const [clipIndex, clip] of track.clips.entries()) {
				const clipId = `clip-${index}-${clipIndex}`;
				const timelineClip = new TimelineClip(
					clipId,
					trackId,
					clip.start || 0,
					clip.length || 1,
					clip
				);
				
				// Load the clip
				await timelineClip.load();
				
				// Set the zoom level
				timelineClip.setPixelsPerSecond(this.pixelsPerSecond);
				
				// Add clip to track
				timelineTrack.addClip(timelineClip);
			}
		}
		
		// Trigger a render to show the loaded data
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
