import { Entity } from "@core/shared/entity";
import { Edit } from "@core/edit";
import { VisualTrack, VisualTrackOptions } from "./visual-track";
import { RulerFeature, PlayheadFeature, GridFeature } from "./timeline-features";
import { TimelineLayout } from "./timeline-layout";
import { EditType, TimelineOptions, TimelineV2Options, ClipInfo, DropPosition, ClipConfig } from "./types";
import { ToolManager, SelectionTool } from "./tools";
import * as PIXI from "pixi.js";

export class TimelineV2 extends Entity {
	private currentEditType: EditType | null = null;
	private options: TimelineOptions;
	private visualTracks: VisualTrack[] = [];
	private layout: TimelineLayout;
	private resolvedOptions: TimelineV2Options;
	
	// PIXI app and rendering
	private app!: PIXI.Application;
	private backgroundLayer!: PIXI.Container;
	private trackLayer!: PIXI.Container;
	private clipLayer!: PIXI.Container;
	private selectionLayer!: PIXI.Container;
	private overlayLayer!: PIXI.Container;
	private viewport!: PIXI.Container;
	
	// Timeline features
	private ruler!: RulerFeature;
	private playhead!: PlayheadFeature;
	private grid!: GridFeature;
	
	// Viewport state
	private scrollX = 0;
	private scrollY = 0;
	private zoomLevel = 1;

	// Tool management
	private toolManager!: ToolManager;

	constructor(private edit: Edit, options: TimelineOptions) {
		super();
		this.options = this.mergeWithDefaults(options);
		this.resolvedOptions = this.resolveOptions(this.options);
		this.layout = new TimelineLayout(this.resolvedOptions);
		this.setupEventListener();
		this.setupTools();
	}

	private mergeWithDefaults(options: TimelineOptions): TimelineOptions {
		return {
			width: 1200,
			height: 600,
			pixelsPerSecond: 50,
			trackHeight: TimelineLayout.TRACK_HEIGHT_DEFAULT,
			backgroundColor: 0x2c2c2c,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			...options
		};
	}

	private resolveOptions(options: TimelineOptions): TimelineV2Options {
		return {
			width: options.width ?? 1200,
			height: options.height ?? 600,
			pixelsPerSecond: options.pixelsPerSecond ?? 50,
			trackHeight: options.trackHeight ?? TimelineLayout.TRACK_HEIGHT_DEFAULT,
			backgroundColor: options.backgroundColor,
			antialias: options.antialias ?? true,
			resolution: options.resolution ?? (window.devicePixelRatio || 1)
		};
	}

	public async load(): Promise<void> {
		await this.initializePixiApp();
		await this.setupRenderLayers();
		await this.setupViewport();
		await this.setupTimelineFeatures();
		
		// Activate default tool after PIXI is ready
		this.toolManager.activateTool('selection');
		
		// Try to render initial state from Edit
		console.log('TimelineV2: Getting initial edit state');
		try {
			const currentEdit = this.edit.getEdit();
			if (currentEdit) {
				console.log('TimelineV2: Initial edit state found', currentEdit);
				// Cache the initial state for tools to query
				this.currentEditType = currentEdit;
				await this.rebuildFromEdit(currentEdit);
			} else {
				console.log('TimelineV2: No initial edit state found');
			}
		} catch (error) {
			console.error('TimelineV2: Error getting initial edit state', error);
		}
	}

	private async initializePixiApp(): Promise<void> {
		this.app = new PIXI.Application();
		
		await this.app.init({
			width: this.resolvedOptions.width,
			height: this.resolvedOptions.height,
			backgroundColor: this.resolvedOptions.backgroundColor,
			antialias: this.resolvedOptions.antialias,
			resolution: this.resolvedOptions.resolution,
			autoDensity: true,
			preference: "webgl"
		});

		// Find timeline container element and attach canvas
		const timelineElement = document.querySelector('[data-shotstack-timeline]') as HTMLElement;
		if (!timelineElement) {
			throw new Error('Timeline container element [data-shotstack-timeline] not found');
		}

		timelineElement.appendChild(this.app.canvas);
	}

	private async setupRenderLayers(): Promise<void> {
		// Create ordered layers for proper z-ordering
		this.backgroundLayer = new PIXI.Container();
		this.trackLayer = new PIXI.Container();
		this.clipLayer = new PIXI.Container();
		this.selectionLayer = new PIXI.Container();
		this.overlayLayer = new PIXI.Container();

		// Set up layer properties
		this.backgroundLayer.label = "background-layer";
		this.trackLayer.label = "track-layer";
		this.clipLayer.label = "clip-layer";
		this.selectionLayer.label = "selection-layer";
		this.overlayLayer.label = "overlay-layer";

		// Add layers to stage in correct order
		this.app.stage.addChild(this.backgroundLayer);
		this.app.stage.addChild(this.trackLayer);
		this.app.stage.addChild(this.clipLayer);
		this.app.stage.addChild(this.selectionLayer);
		this.app.stage.addChild(this.overlayLayer);
	}

	private async setupViewport(): Promise<void> {
		this.viewport = new PIXI.Container();
		this.viewport.label = "viewport";
		
		// Add viewport to track layer for scrolling
		this.trackLayer.addChild(this.viewport);
		
		// Add our Entity container to viewport (this is where visual tracks will go)
		this.viewport.addChild(this.getContainer());
		
		// Initial viewport positioning will be done in setupTimelineFeatures
		// after ruler height is known
	}

	private async setupTimelineFeatures(): Promise<void> {
		// Create ruler feature
		this.ruler = new RulerFeature(this.resolvedOptions.pixelsPerSecond, 60, this.layout.rulerHeight);
		await this.ruler.load();
		this.ruler.getContainer().y = this.layout.rulerY;
		this.backgroundLayer.addChild(this.ruler.getContainer());
		
		// Create playhead feature (should span full height including ruler)
		this.playhead = new PlayheadFeature(this.resolvedOptions.pixelsPerSecond, this.resolvedOptions.height);
		await this.playhead.load();
		this.playhead.getContainer().y = this.layout.playheadY;
		this.overlayLayer.addChild(this.playhead.getContainer());
		
		// Create grid feature (should start below ruler)
		this.grid = new GridFeature(
			this.resolvedOptions.pixelsPerSecond,
			this.layout.getGridWidth(),
			this.layout.getGridHeight(),
			this.layout.trackHeight
		);
		await this.grid.load();
		this.grid.getContainer().y = this.layout.gridY;
		this.backgroundLayer.addChild(this.grid.getContainer());
		
		// Position viewport and apply initial transform
		this.updateViewportTransform();
	}

	private updateViewportTransform(): void {
		// Apply scroll transform using layout calculations
		const position = this.layout.calculateViewportPosition(this.scrollX, this.scrollY);
		this.viewport.position.set(position.x, position.y);
		this.viewport.scale.set(this.zoomLevel, this.zoomLevel);
	}

	// Viewport management methods for tools
	public setScroll(x: number, y: number): void {
		this.scrollX = x;
		this.scrollY = y;
		this.updateViewportTransform();
		this.app.render();
	}

	public setZoom(zoom: number): void {
		this.zoomLevel = Math.max(0.1, Math.min(10, zoom));
		this.updateViewportTransform();
		this.app.render();
	}

	public getViewport(): { x: number; y: number; zoom: number } {
		return {
			x: this.scrollX,
			y: this.scrollY,
			zoom: this.zoomLevel
		};
	}

	// Layer access for tools
	public getBackgroundLayer(): PIXI.Container {
		return this.backgroundLayer;
	}

	public getTrackLayer(): PIXI.Container {
		return this.trackLayer;
	}

	public getClipLayer(): PIXI.Container {
		return this.clipLayer;
	}

	public getSelectionLayer(): PIXI.Container {
		return this.selectionLayer;
	}

	public getOverlayLayer(): PIXI.Container {
		return this.overlayLayer;
	}

	public getPixiApp(): PIXI.Application {
		return this.app;
	}

	// Tool integration methods
	public getClipData(trackIndex: number, clipIndex: number): ClipConfig | null {
		if (!this.currentEditType?.timeline?.tracks) return null;
		const track = this.currentEditType.timeline.tracks[trackIndex];
		return track?.clips?.[clipIndex] || null;
	}

	public calculateDropPosition(globalX: number, globalY: number): DropPosition {
		// Convert global PIXI coordinates to timeline position using layout
		const localPos = this.getContainer().toLocal({ x: globalX, y: globalY });
		const dropInfo = this.layout.calculateDropPosition(localPos.x, localPos.y);
		
		return {
			track: dropInfo.track,
			time: dropInfo.time,
			x: dropInfo.x,
			y: dropInfo.y
		};
	}

	// Layout access for tools
	public getLayout(): TimelineLayout {
		return this.layout;
	}

	// Visual tracks access for tools
	public getVisualTracks(): VisualTrack[] {
		return this.visualTracks;
	}

	// Tool management methods
	public switchTool(toolName: string): boolean {
		return this.toolManager.activateTool(toolName);
	}

	public getActiveTool(): string | undefined {
		return this.toolManager.getActiveToolName();
	}

	public getAvailableTools(): string[] {
		return this.toolManager.getAvailableToolNames();
	}

	// Edit access for tools
	public getEdit(): Edit {
		return this.edit;
	}

	private setupEventListener(): void {
		this.edit.events.on('timeline:updated', this.handleTimelineUpdated.bind(this));
		this.edit.events.on('clip:selected', this.handleClipSelected.bind(this));
		this.edit.events.on('selection:cleared', this.handleSelectionCleared.bind(this));
	}

	private setupTools(): void {
		this.toolManager = new ToolManager();
		
		// Register available tools
		this.toolManager.registerTool(new SelectionTool(this));
		
		// Activate default tool (selection) - but only after PIXI is initialized
		// This will be done in the load() method
	}

	private async handleTimelineUpdated(event: { current: EditType }): Promise<void> {
		// Cache current state from event
		this.currentEditType = event.current;
		
		// Rebuild visuals from event data
		this.clearAllVisualState();
		await this.rebuildFromEdit(event.current);
		this.restoreUIState(); // Selection, scroll position, etc.
	}

	private handleClipSelected(event: { clip: any; trackIndex: number; clipIndex: number }): void {
		this.updateVisualSelection(event.trackIndex, event.clipIndex);
	}

	private handleSelectionCleared(): void {
		this.clearVisualSelection();
	}


	private updateVisualSelection(trackIndex: number, clipIndex: number): void {
		// Clear all existing selections first
		this.clearVisualSelection();
		
		// Set the specified clip as selected
		const track = this.visualTracks[trackIndex];
		if (track) {
			const clip = track.getClip(clipIndex);
			if (clip) {
				clip.setSelected(true);
			}
		}
	}

	private clearVisualSelection(): void {
		// Clear selection from all clips
		this.visualTracks.forEach(track => {
			const clips = track.getClips();
			clips.forEach(clip => {
				clip.setSelected(false);
			});
		});
	}

	private clearAllVisualState(): void {
		// Clear all visual timeline components
		const container = this.getContainer();
		
		// Dispose all visual tracks
		this.visualTracks.forEach(track => {
			container.removeChild(track.getContainer());
			track.dispose();
		});
		
		this.visualTracks = [];
	}

	private async rebuildFromEdit(editType: EditType): Promise<void> {
		// Create visual representation directly from event payload
		if (!editType?.timeline?.tracks) {
			return;
		}

		const container = this.getContainer();

		// Create visual tracks
		for (let trackIndex = 0; trackIndex < editType.timeline.tracks.length; trackIndex++) {
			const trackData = editType.timeline.tracks[trackIndex];
			
			const visualTrackOptions: VisualTrackOptions = {
				pixelsPerSecond: this.resolvedOptions.pixelsPerSecond,
				trackHeight: this.layout.trackHeight,
				trackIndex,
				width: this.resolvedOptions.width
			};
			
			const visualTrack = new VisualTrack(visualTrackOptions);
			await visualTrack.load();
			
			// Rebuild track with track data
			visualTrack.rebuildFromTrackData(trackData, this.resolvedOptions.pixelsPerSecond);
			
			// Add to container and track array
			container.addChild(visualTrack.getContainer());
			this.visualTracks.push(visualTrack);
		}
		
		// Force a render
		this.app.render();
	}


	private restoreUIState(): void {
		// Restore UI state like selection, scroll position, etc.
		// This will be implemented as features are added
	}

	// Public API for tools to query cached state
	public findClipAtPosition(x: number, y: number): ClipInfo | null {
		if (!this.currentEditType) return null;
		return this.hitTestEditType(this.currentEditType, x, y);
	}


	private hitTestEditType(_editType: EditType, x: number, y: number): ClipInfo | null {
		// Hit test using visual tracks for accurate positioning
		const trackIndex = Math.floor(y / this.layout.trackHeight);
		
		if (trackIndex < 0 || trackIndex >= this.visualTracks.length) {
			return null;
		}

		const visualTrack = this.visualTracks[trackIndex];
		const relativeY = y - (trackIndex * this.layout.trackHeight);
		
		const result = visualTrack.findClipAtPosition(x, relativeY);
		if (result) {
			return {
				trackIndex,
				clipIndex: result.clipIndex,
				clipConfig: result.clip.getClipConfig(),
				x: result.clip.getClipConfig().start * this.resolvedOptions.pixelsPerSecond,
				y: trackIndex * this.layout.trackHeight,
				width: result.clip.getClipConfig().length * this.resolvedOptions.pixelsPerSecond,
				height: this.layout.trackHeight
			};
		}

		return null;
	}


	// Getters for current state
	public getCurrentEditType(): EditType | null {
		return this.currentEditType;
	}

	public getOptions(): TimelineOptions {
		return this.options;
	}

	public setOptions(options: Partial<TimelineOptions>): void {
		this.options = { ...this.options, ...options };
	}

	// Required Entity methods
	public update(_deltaTime: number, _elapsed: number): void {
		// Timeline v2 doesn't need frame-based updates
		// All updates are event-driven
	}

	public draw(): void {
		// Timeline v2 doesn't need frame-based drawing
		// All drawing is event-driven through rebuilds
	}

	public dispose(): void {
		this.edit.events.off('timeline:updated', this.handleTimelineUpdated.bind(this));
		
		// Clean up tools
		if (this.toolManager) {
			this.toolManager.dispose();
		}
		
		// Clean up visual tracks
		this.clearAllVisualState();
		
		// Dispose timeline features
		if (this.ruler) {
			this.ruler.dispose();
		}
		if (this.playhead) {
			this.playhead.dispose();
		}
		if (this.grid) {
			this.grid.dispose();
		}
		
		// Destroy PIXI application
		if (this.app) {
			this.app.destroy(true);
		}
	}
}