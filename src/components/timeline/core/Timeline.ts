import { EditCommand } from "@core/commands/types";
import { Edit } from "@core/edit";
import { Size } from "@core/layouts/geometry";
import { Clip } from "@core/schemas/clip";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimeline, ITimelineState, ITimelineRenderer, ITimelineTool, ITimelineFeature, IToolManager, IFeatureManager, ITimelineToolContext, ITimelineFeatureContext } from "../interfaces";
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
	private animationFrameId: number | null = null;
	private clipIndices = new WeakMap<PIXI.Container, { trackIndex: number; clipIndex: number }>();

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

	// Query method for tools to find clip at a given PIXI display object
	public findClipAtPoint(target: PIXI.Container): { trackIndex: number; clipIndex: number } | null {
		// Walk up the display list to find a clip container
		let currentTarget: PIXI.Container | null = target;
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
			toolStates: new Map()
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
					// Handle proper EditCommand objects
					command.execute();
				} else {
					console.log("Timeline command:", command);
				}
			}
		};

		// Register the selection tool
		const { SelectionTool } = await import("../tools/SelectionTool");
		const selectionTool = new SelectionTool(this.state, toolContext);
		this.toolManager.register(selectionTool);

		// Selection is now handled by SelectionTool
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
	}

	private removeEditEventListeners(): void {
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.off("clip:deleted", this.handleClipDeleted.bind(this));
		this.edit.events.off("track:deleted", this.handleTrackDeleted.bind(this));
		this.edit.events.off("clip:selected", this.updateSelectionVisuals.bind(this));
		this.edit.events.off("selection:cleared", this.updateSelectionVisuals.bind(this));
	}

	private handleClipUpdated(__data: { clipId: string; clip: Clip }): void {
		// Reload edit data to reflect changes
		this.loadEditData();
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

		// Reload edit data to reflect deletion
		this.loadEditData();
	}

	private handleTrackDeleted(__data: { trackId: string; trackIndex: number }): void {
		// Reload edit data to reflect track deletion
		this.loadEditData();
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
				const timelineClip = new TimelineClip(clipId, trackId, clip.start || 0, clip.length || 1, clip);

				// Load the clip
				await timelineClip.load();

				// Set the zoom level from state
				timelineClip.setPixelsPerSecond(this.state.getState().viewport.zoom);

				// Add clip to track
				timelineTrack.addClip(timelineClip);

				// Store clip indices in WeakMap for type-safe lookup
				const container = timelineClip.getContainer();
				this.clipIndices.set(container, { trackIndex: index, clipIndex });
			}
		}

		// Trigger a render to show the loaded data
		this.draw();
	}

	private updateSelectionVisuals(): void {
		const selectedInfo = this.edit.getSelectedClipInfo();

		// Update visual state of all clips
		this.renderer.getTracks().forEach(track => {
			track.getClips().forEach(clip => {
				// Get indices from WeakMap instead of parsing strings
				const container = clip.getContainer();
				const indices = this.clipIndices.get(container);
				if (indices) {
					const isSelected = selectedInfo && selectedInfo.trackIndex === indices.trackIndex && selectedInfo.clipIndex === indices.clipIndex;
					clip.setSelected(isSelected || false);
				}
			});
		});

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
