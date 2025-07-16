import { Entity } from "@core/shared/entity";
import { Edit } from "@core/edit";
import { EditSchema } from "@schemas/edit";
import { TimelineUpdatedEvent } from "@core/commands/types";
import { VisualClip, VisualClipOptions } from "./visual-clip";
import { VisualTrack, VisualTrackOptions } from "./visual-track";
import { RulerFeature, PlayheadFeature, GridFeature } from "./timeline-features";
import { z } from "zod";
import * as PIXI from "pixi.js";

type EditType = z.infer<typeof EditSchema>;

export interface TimelineOptions {
	width?: number;
	height?: number;
	pixelsPerSecond?: number;
	trackHeight?: number;
	theme?: "light" | "dark";
	backgroundColor?: number;
	antialias?: boolean;
	resolution?: number;
}

export interface ClipInfo {
	trackIndex: number;
	clipIndex: number;
	clipConfig: any;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DropPosition {
	track: number;
	time: number;
	x: number;
	y: number;
}

export class TimelineV2 extends Entity {
	private currentEditType: EditType | null = null;
	private options: TimelineOptions;
	private visualTracks: VisualTrack[] = [];
	
	// PIXI app and rendering
	private app: PIXI.Application;
	private backgroundLayer: PIXI.Container;
	private trackLayer: PIXI.Container;
	private clipLayer: PIXI.Container;
	private selectionLayer: PIXI.Container;
	private overlayLayer: PIXI.Container;
	private viewport: PIXI.Container;
	
	// Timeline features
	private ruler: RulerFeature;
	private playhead: PlayheadFeature;
	private grid: GridFeature;
	
	// Viewport state
	private scrollX = 0;
	private scrollY = 0;
	private zoomLevel = 1;

	constructor(private edit: Edit, options: TimelineOptions) {
		super();
		this.options = {
			width: 1200,
			height: 600,
			pixelsPerSecond: 50,
			trackHeight: 80,
			theme: "light",
			backgroundColor: 0x2c2c2c,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			...options
		};
		this.setupEventListener();
	}

	public async load(): Promise<void> {
		await this.initializePixiApp();
		await this.setupRenderLayers();
		await this.setupViewport();
		await this.setupTimelineFeatures();
	}

	private async initializePixiApp(): Promise<void> {
		this.app = new PIXI.Application();
		
		await this.app.init({
			width: this.options.width!,
			height: this.options.height!,
			backgroundColor: this.options.backgroundColor,
			antialias: this.options.antialias,
			resolution: this.options.resolution,
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
		
		this.updateViewportTransform();
	}

	private async setupTimelineFeatures(): Promise<void> {
		// Create ruler feature
		this.ruler = new RulerFeature(this.options.pixelsPerSecond!, 60, 40);
		await this.ruler.load();
		this.backgroundLayer.addChild(this.ruler.getContainer());
		
		// Create playhead feature
		this.playhead = new PlayheadFeature(this.options.pixelsPerSecond!, this.options.height!);
		await this.playhead.load();
		this.overlayLayer.addChild(this.playhead.getContainer());
		
		// Create grid feature
		this.grid = new GridFeature(
			this.options.pixelsPerSecond!,
			this.options.width!,
			this.options.height!,
			this.options.trackHeight!
		);
		await this.grid.load();
		this.backgroundLayer.addChild(this.grid.getContainer());
	}

	private updateViewportTransform(): void {
		this.viewport.position.set(-this.scrollX, -this.scrollY);
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

	private setupEventListener(): void {
		this.edit.events.on('timeline:updated', this.handleTimelineUpdated.bind(this));
	}

	private async handleTimelineUpdated(event: TimelineUpdatedEvent): Promise<void> {
		// Cache current state from event
		this.currentEditType = event.current.timeline;
		
		// Rebuild visuals from event data
		this.clearAllVisualState();
		await this.rebuildFromEdit(event.current.timeline);
		this.restoreUIState(); // Selection, scroll position, etc.
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
		if (!editType?.timeline?.tracks) return;

		const container = this.getContainer();

		// Create visual tracks
		for (let trackIndex = 0; trackIndex < editType.timeline.tracks.length; trackIndex++) {
			const trackData = editType.timeline.tracks[trackIndex];
			
			const visualTrackOptions: VisualTrackOptions = {
				pixelsPerSecond: this.options.pixelsPerSecond!,
				trackHeight: this.options.trackHeight || 60,
				trackIndex,
				width: this.options.width!
			};
			
			const visualTrack = new VisualTrack(visualTrackOptions);
			await visualTrack.load();
			
			// Rebuild track with track data
			visualTrack.rebuildFromTrackData(trackData, this.options.pixelsPerSecond!);
			
			// Add to container and track array
			container.addChild(visualTrack.getContainer());
			this.visualTracks.push(visualTrack);
		}
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

	public calculateDropPosition(x: number, y: number): DropPosition | null {
		if (!this.currentEditType) return null;
		return this.calculateDropFromEditType(this.currentEditType, x, y);
	}

	private hitTestEditType(_editType: EditType, x: number, y: number): ClipInfo | null {
		// Hit test using visual tracks for accurate positioning
		const trackHeight = 60; // Default track height
		const trackIndex = Math.floor(y / trackHeight);
		
		if (trackIndex < 0 || trackIndex >= this.visualTracks.length) {
			return null;
		}

		const visualTrack = this.visualTracks[trackIndex];
		const relativeY = y - (trackIndex * trackHeight);
		
		const result = visualTrack.findClipAtPosition(x, relativeY);
		if (result) {
			return {
				trackIndex,
				clipIndex: result.clipIndex,
				clipConfig: result.clip.getClipConfig(),
				x: result.clip.getClipConfig().start * this.options.pixelsPerSecond!,
				y: trackIndex * trackHeight,
				width: result.clip.getClipConfig().length * this.options.pixelsPerSecond!,
				height: trackHeight
			};
		}

		return null;
	}

	private calculateDropFromEditType(editType: EditType, x: number, y: number): DropPosition | null {
		// Calculate where a clip would be dropped based on position
		if (!editType?.timeline?.tracks) return null;

		const trackHeight = 60; // Default track height
		const trackIndex = Math.floor(y / trackHeight);
		
		if (trackIndex < 0 || trackIndex >= editType.timeline.tracks.length) {
			return null;
		}

		// Convert x position to time
		const timeAtX = x / this.options.pixelsPerSecond!;

		return {
			track: trackIndex,
			time: Math.max(0, timeAtX), // Ensure time is not negative
			x,
			y: trackIndex * trackHeight
		};
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