import { Edit } from "@core/edit";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme, TimelineThemeOptions, TimelineThemeResolver } from "../../core/theme";

import { InteractionController } from "./interaction";
import { 
	DragPreviewManager, 
	ViewportManager, 
	VisualTrackManager, 
	TimelineEventHandler, 
	TimelineRenderer,
	TimelineFeatureManager,
	TimelineOptionsManager
} from "./managers";
import { TimelineLayout } from "./timeline-layout";
import { EditType, TimelineOptions, ClipInfo, ClipConfig } from "./types/timeline";
import { VisualTrack } from "./visual/visual-track";


export class Timeline extends Entity {
	private currentEditType: EditType | null = null;
	private layout: TimelineLayout;
	private theme: TimelineTheme;
	private lastPlaybackTime = 0;

	// Timeline constants
	private static readonly TIMELINE_BUFFER_MULTIPLIER = 1.5; // 50% buffer for scrolling

	// Managers
	private interaction!: InteractionController;
	private dragPreviewManager!: DragPreviewManager;
	private viewportManager!: ViewportManager;
	private visualTrackManager!: VisualTrackManager;
	private eventHandler!: TimelineEventHandler;
	private renderer!: TimelineRenderer;
	private featureManager!: TimelineFeatureManager;
	private optionsManager!: TimelineOptionsManager;

	constructor(
		private edit: Edit,
		size: { width: number; height: number },
		themeOptions?: TimelineThemeOptions
	) {
		super();
		
		// Resolve theme from options
		this.theme = TimelineThemeResolver.resolveTheme(themeOptions);
		
		// Create layout first as it's needed by options manager
		this.layout = new TimelineLayout({
			width: size.width,
			height: size.height,
			pixelsPerSecond: 50,
			trackHeight: Math.max(40, this.theme.dimensions?.trackHeight || TimelineLayout.TRACK_HEIGHT_DEFAULT),
			backgroundColor: this.theme.colors.structure.background,
			antialias: true,
			resolution: window.devicePixelRatio || 1
		}, this.theme);
		
		// Initialize options manager
		this.optionsManager = new TimelineOptionsManager(
			size,
			this.theme,
			this.layout,
			(width) => this.featureManager?.getToolbar()?.resize(width)
		);
		
		this.initializeManagers();
		this.setupInteraction();
	}

	private initializeManagers(): void {
		const options = this.optionsManager.getOptions();
		
		// Initialize renderer with required properties
		this.renderer = new TimelineRenderer(
			{
				width: options.width || 800,
				height: options.height || 600,
				backgroundColor: options.backgroundColor || 0x000000,
				antialias: options.antialias ?? true,
				resolution: options.resolution || window.devicePixelRatio || 1
			},
			(deltaTime, elapsed) => this.update(deltaTime, elapsed)
		);

		// Initialize event handler
		this.eventHandler = new TimelineEventHandler(this.edit, {
			onEditChange: this.handleEditChange.bind(this),
			onSeek: (time) => this.edit.seek(time),
			onClipSelected: (trackIndex, clipIndex) => this.visualTrackManager.updateVisualSelection(trackIndex, clipIndex),
			onSelectionCleared: () => this.visualTrackManager.clearVisualSelection(),
			onDragStarted: (trackIndex, clipIndex) => {
				const clipData = this.getClipData(trackIndex, clipIndex);
				if (clipData) {
					this.dragPreviewManager.showDragPreview(trackIndex, clipIndex, clipData);
				}
			},
			onDragEnded: () => this.dragPreviewManager.hideDragPreview()
		});

		this.eventHandler.setupEventListeners();
	}

	public async load(): Promise<void> {
		await this.renderer.initializePixiApp();
		await this.renderer.setupRenderLayers();
		await this.setupViewport();
		await this.setupTimelineFeatures();

		// Activate interaction system after PIXI is ready
		this.interaction.activate();

		// Try to render initial state from Edit
		try {
			const currentEdit = this.edit.getEdit();
			if (currentEdit) {
				// Cache the initial state for tools to query
				this.currentEditType = currentEdit;
				await this.rebuildFromEdit(currentEdit);
			}
		} catch {
			// Silently handle error - timeline will show empty state
		}

		// Start animation loop for continuous rendering
		this.renderer.startAnimationLoop();
	}


	private async setupViewport(): Promise<void> {
		// Initialize viewport manager
		this.viewportManager = new ViewportManager(
			this.layout,
			this.renderer.getTrackLayer(),
			this.renderer.getOverlayLayer(),
			this.getContainer(),
			() => this.renderer.render()
		);
		
		await this.viewportManager.setupViewport();

		// Initialize visual track manager
		this.visualTrackManager = new VisualTrackManager(
			this.getContainer(),
			this.layout,
			this.theme,
			() => this.optionsManager.getPixelsPerSecond(),
			() => this.getExtendedTimelineWidth()
		);

		// Initialize drag preview manager
		this.dragPreviewManager = new DragPreviewManager(
			this.getContainer(),
			this.layout,
			() => this.optionsManager.getPixelsPerSecond(),
			() => this.optionsManager.getTrackHeight(),
			() => this.visualTrackManager.getVisualTracks()
		);
		
		// Initialize feature manager
		this.featureManager = new TimelineFeatureManager(
			this.edit,
			this.layout,
			this.renderer,
			this.viewportManager,
			this.eventHandler,
			() => this
		);

		// Initial viewport positioning will be done in setupTimelineFeatures
		// after ruler height is known
	}

	private async setupTimelineFeatures(): Promise<void> {
		const extendedDuration = this.getExtendedTimelineDuration();
		
		await this.featureManager.setupTimelineFeatures(
			this.theme,
			this.optionsManager.getPixelsPerSecond(),
			this.optionsManager.getWidth(),
			this.optionsManager.getHeight(),
			extendedDuration
		);
	}


	private recreateTimelineFeatures(): void {
		const extendedDuration = this.getExtendedTimelineDuration();
		
		this.featureManager.recreateTimelineFeatures(
			this.theme,
			this.optionsManager.getPixelsPerSecond(),
			this.optionsManager.getHeight(),
			extendedDuration
		);
	}

	// Viewport management methods for tools
	public setScroll(x: number, y: number): void {
		this.viewportManager.setScroll(x, y);
	}

	public setZoom(zoom: number): void {
		this.viewportManager.setZoom(zoom);
	}

	public getViewport(): { x: number; y: number; zoom: number } {
		return this.viewportManager.getViewport();
	}

	// Combined getter for PIXI resources
	public getPixiApp(): PIXI.Application {
		return this.renderer.getApp();
	}

	public getTrackLayer(): PIXI.Container {
		return this.renderer.getTrackLayer();
	}

	public getOverlayLayer(): PIXI.Container {
		return this.renderer.getOverlayLayer();
	}

	// Interaction integration methods
	public getClipData(trackIndex: number, clipIndex: number): ClipConfig | null {
		if (!this.currentEditType?.timeline?.tracks) return null;
		const track = this.currentEditType.timeline.tracks[trackIndex];
		return track?.clips?.[clipIndex] || null;
	}


	// Layout access for interactions
	public getLayout(): TimelineLayout {
		return this.layout;
	}

	// Visual tracks access for interactions
	public getVisualTracks(): VisualTrack[] {
		return this.visualTrackManager.getVisualTracks();
	}


	// Edit access for interactions
	public getEdit(): Edit {
		return this.edit;
	}

	// Extended timeline dimensions
	public getExtendedTimelineWidth(): number {
		const calculatedWidth = this.getExtendedTimelineDuration() * this.optionsManager.getPixelsPerSecond();
		const viewportWidth = this.optionsManager.getWidth();
		// Ensure width is at least as wide as the viewport
		return Math.max(calculatedWidth, viewportWidth);
	}

	// Drag ghost control methods for TimelineInteraction
	public hideDragGhost(): void {
		this.dragPreviewManager.hideDragGhost();
	}

	public showDragGhost(trackIndex: number, time: number, freeY?: number): void {
		this.dragPreviewManager.showDragGhost(trackIndex, time, freeY);
	}

	// Playhead control methods
	public setPlayheadTime(time: number): void {
		this.featureManager.getPlayhead().setTime(time);
	}

	public getPlayheadTime(): number {
		return this.featureManager.getPlayhead().getTime();
	}

	public getActualEditDuration(): number {
		// Return the actual edit duration in seconds (without the 1.5x buffer)
		return (this.edit.totalDuration / 1000) || 60;
	}


	private setupInteraction(): void {
		this.interaction = new InteractionController(this);

		// Interaction will be activated in the load() method after PIXI is ready
	}

	private async handleEditChange(editType?: EditType): Promise<void> {
		// Clean up drag preview before rebuilding
		this.dragPreviewManager.hideDragPreview();

		// Get current edit state
		const currentEdit = editType || this.edit.getEdit();
		if (!currentEdit) return;

		// Cache current state
		this.currentEditType = currentEdit;

		// Update ruler with new timeline duration
		this.updateRulerDuration();

		// Rebuild visuals from event data
		this.clearAllVisualState();
		await this.rebuildFromEdit(currentEdit);
	}






	private getExtendedTimelineDuration(): number {
		const duration = (this.edit.totalDuration / 1000) || 60;
		return Math.max(60, duration * Timeline.TIMELINE_BUFFER_MULTIPLIER);
	}

	private updateRulerDuration(): void {
		const extendedDuration = this.getExtendedTimelineDuration();
		const extendedWidth = this.getExtendedTimelineWidth();

		// Update ruler with extended duration
		this.featureManager.updateRuler(this.optionsManager.getPixelsPerSecond(), extendedDuration);

		// Update track widths
		this.visualTrackManager.updateTrackWidths(extendedWidth);
	}


	private clearAllVisualState(): void {
		// Make sure drag preview is cleaned up
		this.dragPreviewManager.hideDragPreview();

		// Clear all visual timeline components
		this.visualTrackManager.clearAllVisualState();
	}

	private async rebuildFromEdit(editType: EditType): Promise<void> {
		await this.visualTrackManager.rebuildFromEdit(editType, this.optionsManager.getPixelsPerSecond());
		// Force a render
		this.renderer.render();
	}


	// Public API for tools to query cached state
	public findClipAtPosition(x: number, y: number): ClipInfo | null {
		if (!this.currentEditType) return null;
		return this.visualTrackManager.findClipAtPosition(x, y);
	}

	// Theme management methods
	public setTheme(themeOptions: TimelineThemeOptions): void {
		this.theme = TimelineThemeResolver.resolveTheme(themeOptions);
		
		// Update options manager with new theme
		this.optionsManager.updateFromTheme(this.theme);
		
		// Update toolbar theme
		if (this.featureManager.getToolbar()) {
			this.featureManager.getToolbar().updateTheme(this.theme);
		}
		
		// Recreate timeline features with new theme and dimensions
		this.recreateTimelineFeatures();
		
		// Rebuild visuals with new theme
		if (this.currentEditType) {
			this.clearAllVisualState();
			this.rebuildFromEdit(this.currentEditType);
		}
		
		// Update PIXI app background
		this.renderer.updateBackgroundColor(this.optionsManager.getBackgroundColor());
		this.renderer.render();
	}

	public getTheme(): TimelineTheme {
		return this.theme;
	}

	// Getters for current state
	public getCurrentEditType(): EditType | null {
		return this.currentEditType;
	}

	public getOptions(): TimelineOptions {
		return this.optionsManager.getOptions();
	}

	public setOptions(options: Partial<TimelineOptions>): void {
		this.optionsManager.setOptions(options);
	}

	// Required Entity methods
	public update(_deltaTime: number, _elapsed: number): void {
		// Sync playhead with Edit playback time
		if (this.edit.isPlaying || this.lastPlaybackTime !== this.edit.playbackTime) {
			this.featureManager.getPlayhead().setTime(this.edit.playbackTime / 1000);
			this.lastPlaybackTime = this.edit.playbackTime;
			
			// Update toolbar time display
			if (this.featureManager.getToolbar()) {
				this.featureManager.getToolbar().updateTimeDisplay();
			}
		}
	}

	public draw(): void {
		// Render the PIXI application
		this.renderer.draw();
	}




	// Methods for TimelineReference interface
	public getTimeDisplay(): { updateTimeDisplay(): void } {
		return this.featureManager.getToolbar();
	}

	public updateTime(time: number, emit?: boolean): void {
		this.setPlayheadTime(time);
		if (emit) {
			this.edit.seek(time * 1000); // Convert to milliseconds
		}
	}

	public get timeRange(): { startTime: number; endTime: number } {
		return {
			startTime: 0,
			endTime: this.getExtendedTimelineDuration()
		};
	}

	public get viewportHeight(): number {
		return this.optionsManager.getHeight();
	}

	public get zoomLevelIndex(): number {
		// Convert zoom level to index (simplified - you may want to map this to actual zoom levels)
		const viewport = this.viewportManager.getViewport();
		return Math.round(Math.log2(viewport.zoom) + 5);
	}

	public zoomIn(): void {
		this.optionsManager.zoomIn();
		this.onZoomChanged();
	}

	public zoomOut(): void {
		this.optionsManager.zoomOut();
		this.onZoomChanged();
	}

	private onZoomChanged(): void {
		const pixelsPerSecond = this.optionsManager.getPixelsPerSecond();
		
		// Update visual tracks without rebuilding to preserve event handlers
		this.visualTrackManager.updatePixelsPerSecond(pixelsPerSecond);
		
		// Update track widths to match new zoom level
		const extendedWidth = this.getExtendedTimelineWidth();
		this.visualTrackManager.updateTrackWidths(extendedWidth);
		
		// Update timeline features
		this.featureManager.updateRuler(pixelsPerSecond, this.getExtendedTimelineDuration());
		this.featureManager.updatePlayhead(pixelsPerSecond, this.optionsManager.getHeight());
		
		// Force a render
		this.renderer.render();
	}

	public dispose(): void {
		// Clean up managers
		this.dragPreviewManager.dispose();
		this.visualTrackManager.dispose();
		this.eventHandler.dispose();
		this.featureManager.dispose();

		// Clean up interaction system
		if (this.interaction) {
			this.interaction.dispose();
		}

		// Destroy renderer
		this.renderer.dispose();
	}
}
