import { Edit } from "@core/edit";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { RulerFeature, PlayheadFeature, GridFeature, ScrollManager } from "./timeline-features";
// eslint-disable-next-line import/no-cycle
import { TimelineInteraction } from "./timeline-interaction";
import { TimelineLayout } from "./timeline-layout";
import { TimelineTheme, TimelineThemeOptions, TimelineThemeResolver } from "../../core/theme";
import { TimelineToolbar } from "./timeline-toolbar";
import { EditType, TimelineOptions, ClipInfo, DropPosition, ClipConfig } from "./types";
import { VisualTrack, VisualTrackOptions } from "./visual-track";


export class Timeline extends Entity {
	private currentEditType: EditType | null = null;
	private visualTracks: VisualTrack[] = [];
	private layout: TimelineLayout;
	private pixelsPerSecond: number;
	private trackHeight: number;
	private backgroundColor: number;
	private antialias: boolean;
	private resolution: number;
	private width: number;
	private height: number;
	private theme: TimelineTheme;

	// Timeline constants
	private static readonly TIMELINE_BUFFER_MULTIPLIER = 1.5; // 50% buffer for scrolling

	// PIXI app and rendering
	private app!: PIXI.Application;
	private backgroundLayer!: PIXI.Container;
	private trackLayer!: PIXI.Container;
	private clipLayer!: PIXI.Container;
	private selectionLayer!: PIXI.Container;
	private overlayLayer!: PIXI.Container;
	private viewport!: PIXI.Container;
	private rulerViewport!: PIXI.Container;

	// Timeline features
	private toolbar!: TimelineToolbar;
	private ruler!: RulerFeature;
	private playhead!: PlayheadFeature;
	private grid!: GridFeature;
	private scroll!: ScrollManager;

	// Viewport state
	private scrollX = 0;
	private scrollY = 0;
	private zoomLevel = 1;

	// Interaction management
	private interaction!: TimelineInteraction;

	// Animation loop
	private animationFrameId: number | null = null;
	private lastPlaybackTime = 0;

	constructor(
		private edit: Edit,
		size: { width: number; height: number },
		themeOptions?: TimelineThemeOptions
	) {
		super();
		// Set dimensions from size parameter
		this.width = size.width;
		this.height = size.height;
		
		// Resolve theme from options
		this.theme = TimelineThemeResolver.resolveTheme(themeOptions);
		
		// Set default values for other properties (some from theme)
		this.pixelsPerSecond = 50;
		// Enforce minimum track height of 40px for usability
		const themeTrackHeight = this.theme.dimensions?.trackHeight || TimelineLayout.TRACK_HEIGHT_DEFAULT;
		this.trackHeight = Math.max(40, themeTrackHeight);
		this.backgroundColor = this.theme.colors.structure.background;
		this.antialias = true;
		this.resolution = window.devicePixelRatio || 1;
		
		// Create layout with all required options and theme
		this.layout = new TimelineLayout({
			width: this.width,
			height: this.height,
			pixelsPerSecond: this.pixelsPerSecond,
			trackHeight: this.trackHeight, // This should use the theme value
			backgroundColor: this.backgroundColor,
			antialias: this.antialias,
			resolution: this.resolution
		}, this.theme);
		
		this.setupEventListener();
		this.setupInteraction();
	}


	public async load(): Promise<void> {
		await this.initializePixiApp();
		await this.setupRenderLayers();
		await this.setupViewport();
		await this.setupTimelineFeatures();

		// Activate interaction system after PIXI is ready
		this.interaction.activate();

		// Try to render initial state from Edit
		console.log("TimelineV2: Getting initial edit state");
		try {
			const currentEdit = this.edit.getEdit();
			if (currentEdit) {
				console.log("TimelineV2: Initial edit state found", currentEdit);
				// Cache the initial state for tools to query
				this.currentEditType = currentEdit;
				await this.rebuildFromEdit(currentEdit);
			} else {
				console.log("TimelineV2: No initial edit state found");
			}
		} catch (error) {
			console.error("TimelineV2: Error getting initial edit state", error);
		}

		// Start animation loop for continuous rendering
		this.startAnimationLoop();
	}

	private async initializePixiApp(): Promise<void> {
		this.app = new PIXI.Application();

		await this.app.init({
			width: this.width,
			height: this.height,
			backgroundColor: this.backgroundColor,
			antialias: this.antialias,
			resolution: this.resolution,
			autoDensity: true,
			preference: "webgl"
		});

		// Find timeline container element and attach canvas
		const timelineElement = document.querySelector("[data-shotstack-timeline]") as HTMLElement;
		if (!timelineElement) {
			throw new Error("Timeline container element [data-shotstack-timeline] not found");
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
		// Create ruler viewport for horizontal scrolling
		this.rulerViewport = new PIXI.Container();
		this.rulerViewport.label = "ruler-viewport";
		this.overlayLayer.addChild(this.rulerViewport);

		// Create main viewport for tracks
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
		// Get extended duration for timeline display
		const extendedDuration = this.getExtendedTimelineDuration();

		// Create toolbar
		this.toolbar = new TimelineToolbar(this.edit, this.theme, this.layout, this.width);
		this.app.stage.addChild(this.toolbar);

		// Create ruler feature with extended duration for display
		this.ruler = new RulerFeature(this.pixelsPerSecond, extendedDuration, this.layout.rulerHeight, this.theme);
		await this.ruler.load();
		this.ruler.getContainer().y = this.layout.rulerY;
		this.rulerViewport.addChild(this.ruler.getContainer());

		// Connect ruler seek events
		this.ruler.events.on("ruler:seeked", this.handleSeek.bind(this));

		// Create playhead feature (should span full height including ruler)
		this.playhead = new PlayheadFeature(this.pixelsPerSecond, this.height, this.theme);
		await this.playhead.load();
		this.playhead.getContainer().y = this.layout.playheadY;
		this.overlayLayer.addChild(this.playhead.getContainer());

		// Connect playhead seek events
		this.playhead.events.on("playhead:seeked", this.handleSeek.bind(this));

		// Create grid feature with extended duration
		this.grid = new GridFeature(this.pixelsPerSecond, extendedDuration, this.layout.getGridHeight(), this.layout.trackHeight, this.theme);
		await this.grid.load();
		this.grid.getContainer().y = this.layout.gridY;
		this.backgroundLayer.addChild(this.grid.getContainer());

		// Create scroll manager for handling scroll events
		this.scroll = new ScrollManager(this);
		await this.scroll.load();

		// Position viewport and apply initial transform
		this.updateViewportTransform();
	}

	private updateViewportTransform(): void {
		// Apply scroll transform using layout calculations
		const position = this.layout.calculateViewportPosition(this.scrollX, this.scrollY);
		this.viewport.position.set(position.x, position.y);
		this.viewport.scale.set(this.zoomLevel, this.zoomLevel);

		// Sync ruler horizontal scroll (no vertical scroll for ruler)
		this.rulerViewport.position.x = position.x;
		this.rulerViewport.scale.x = this.zoomLevel;
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

	// Interaction integration methods
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

	// Layout access for interactions
	public getLayout(): TimelineLayout {
		return this.layout;
	}

	// Visual tracks access for interactions
	public getVisualTracks(): VisualTrack[] {
		return this.visualTracks;
	}

	// Interaction management methods - simplified API
	public isInteractionActive(): boolean {
		return this.interaction !== undefined;
	}

	// Edit access for interactions
	public getEdit(): Edit {
		return this.edit;
	}

	// Extended timeline dimensions
	public getExtendedTimelineWidth(): number {
		return this.getExtendedTimelineDuration() * this.pixelsPerSecond;
	}

	// Drag ghost control methods for TimelineInteraction
	public hideDragGhost(): void {
		if (this.dragPreviewContainer) {
			this.dragPreviewContainer.visible = false;
		}
	}

	public showDragGhost(trackIndex: number, time: number): void {
		if (!this.dragPreviewContainer || !this.draggedClipInfo) return;

		// Make visible and update position
		this.dragPreviewContainer.visible = true;
		this.drawDragPreview(trackIndex, time);
	}

	// Playhead control methods
	public setPlayheadTime(time: number): void {
		this.playhead.setTime(time);
	}

	public getPlayheadTime(): number {
		return this.playhead.getTime();
	}

	private setupEventListener(): void {
		this.edit.events.on("timeline:updated", this.handleTimelineUpdated.bind(this));
		this.edit.events.on("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.on("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.on("selection:cleared", this.handleSelectionCleared.bind(this));
		this.edit.events.on("drag:started", this.handleDragStarted.bind(this));
		this.edit.events.on("drag:moved", this.handleDragMoved.bind(this));
		this.edit.events.on("drag:ended", this.handleDragEnded.bind(this));
		this.edit.events.on("track:created-and-clip:moved", this.handleTrackCreatedAndClipMoved.bind(this));
	}

	private setupInteraction(): void {
		this.interaction = new TimelineInteraction(this);

		// Interaction will be activated in the load() method after PIXI is ready
	}

	private async handleTimelineUpdated(event: { current: EditType }): Promise<void> {
		// Cache current state from event
		this.currentEditType = event.current;

		// Update ruler with new timeline duration
		this.updateRulerDuration();

		// Rebuild visuals from event data
		this.clearAllVisualState();
		await this.rebuildFromEdit(event.current);
		this.restoreUIState(); // Selection, scroll position, etc.
	}

	private async handleClipUpdated(_event: { current: any; previous: any }): Promise<void> {
		// Clean up drag preview before rebuilding
		this.hideDragPreview();

		// For clip updates, we need to rebuild the timeline from the current Edit state
		// since the MoveClipCommand has already updated the underlying data
		try {
			const currentEdit = this.edit.getEdit();
			if (currentEdit) {
				this.currentEditType = currentEdit;

				// Update ruler in case timeline duration changed
				this.updateRulerDuration();

				this.clearAllVisualState();
				await this.rebuildFromEdit(currentEdit);
				this.restoreUIState();
			}
		} catch (_error) {
			// Ignore error silently
		}
	}

	private handleClipSelected(event: { clip: any; trackIndex: number; clipIndex: number }): void {
		this.updateVisualSelection(event.trackIndex, event.clipIndex);
	}

	private handleSelectionCleared(): void {
		this.clearVisualSelection();
	}

	private handleDragStarted(event: { trackIndex: number; clipIndex: number; startTime: number; offsetX: number; offsetY: number }): void {
		this.showDragPreview(event.trackIndex, event.clipIndex);
	}

	private handleDragMoved(_event: {
		trackIndex: number;
		clipIndex: number;
		startTime: number;
		offsetX: number;
		offsetY: number;
		currentTime: number;
		currentTrack: number;
	}): void {
		// Visual state is now handled by TimelineInteraction
		// This handler is kept for potential future use
	}

	private handleDragEnded(): void {
		this.hideDragPreview();
	}

	private async handleTrackCreatedAndClipMoved(_event: {
		trackInsertionIndex: number;
		clipMove: { from: { trackIndex: number; clipIndex: number }; to: { trackIndex: number; start: number } };
	}): Promise<void> {
		// Clean up drag preview before rebuilding
		this.hideDragPreview();

		// Rebuild timeline visuals after track creation and clip move
		const currentEdit = this.edit.getEdit();
		if (currentEdit) {
			this.currentEditType = currentEdit;
			this.updateRulerDuration();
			this.clearAllVisualState();
			await this.rebuildFromEdit(currentEdit);
			this.restoreUIState();
		}
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

	// Drag preview overlay system
	private dragPreviewContainer: PIXI.Container | null = null;
	private dragPreviewGraphics: PIXI.Graphics | null = null;
	private draggedClipInfo: { trackIndex: number; clipIndex: number; clipConfig: any } | null = null;

	private showDragPreview(trackIndex: number, clipIndex: number): void {
		// Get the clip data for creating the preview
		const clipData = this.getClipData(trackIndex, clipIndex);
		if (!clipData) {
			console.warn("Clip data not found for drag preview:", trackIndex, clipIndex);
			return;
		}

		// Store dragged clip info
		this.draggedClipInfo = { trackIndex, clipIndex, clipConfig: clipData };

		// Create drag preview container and graphics
		this.dragPreviewContainer = new PIXI.Container();
		this.dragPreviewGraphics = new PIXI.Graphics();

		// Add graphics to container
		this.dragPreviewContainer.addChild(this.dragPreviewGraphics);
		// Add to the main container so it scrolls with content
		this.getContainer().addChild(this.dragPreviewContainer);

		// Set the original clip to semi-transparent
		const track = this.visualTracks[trackIndex];
		if (track) {
			const clip = track.getClip(clipIndex);
			if (clip) {
				clip.setDragging(true);
			}
		}

		// Draw initial preview at original position
		this.drawDragPreview(trackIndex, clipData.start || 0);
	}

	private drawDragPreview(trackIndex: number, time: number): void {
		if (!this.dragPreviewContainer || !this.dragPreviewGraphics || !this.draggedClipInfo) return;

		const {clipConfig} = this.draggedClipInfo;
		const layout = this.getLayout();

		// Calculate position and size
		const x = layout.getXAtTime(time);
		// Use same positioning as visual tracks (relative to container, not including ruler)
		const y = trackIndex * layout.trackHeight;
		const width = (clipConfig.length || 0) * this.pixelsPerSecond;
		const height = this.trackHeight;

		// Clear and redraw existing graphics (much faster than recreating)
		this.dragPreviewGraphics.clear();
		this.dragPreviewGraphics.roundRect(0, 0, width, height, 4);

		// Use original clip color, darkened for drag appearance
		const baseColor = this.getClipColor(clipConfig.asset?.type);
		const dragColor = this.darkenColor(baseColor, 0.3);

		this.dragPreviewGraphics.fill({ color: dragColor, alpha: 0.7 });
		this.dragPreviewGraphics.stroke({ width: 2, color: 0x00ff00 });

		// Position the container
		this.dragPreviewContainer.x = x;
		this.dragPreviewContainer.y = y;
	}

	private handleSeek(event: { time: number }): void {
		// Convert timeline seconds to edit milliseconds
		this.edit.seek(this.secondsToMs(event.time));
	}

	private secondsToMs(seconds: number): number {
		return seconds * 1000;
	}

	private msToSeconds(ms: number): number {
		return ms / 1000;
	}

	private getExtendedTimelineDuration(): number {
		const duration = this.msToSeconds(this.edit.totalDuration) || 60;
		return Math.max(60, duration * Timeline.TIMELINE_BUFFER_MULTIPLIER);
	}

	private updateRulerDuration(): void {
		const extendedDuration = this.getExtendedTimelineDuration();
		const extendedWidth = this.getExtendedTimelineWidth();

		// Update ruler and grid with extended duration
		this.ruler.updateRuler(this.pixelsPerSecond, extendedDuration);
		this.grid.updateGrid(this.pixelsPerSecond, extendedDuration, this.layout.getGridHeight(), this.layout.trackHeight);

		// Update track widths
		this.visualTracks.forEach(track => {
			track.setWidth(extendedWidth);
		});
	}

	private hideDragPreview(): void {
		// Remove overlay container
		if (this.dragPreviewContainer) {
			// Make sure to destroy the graphics first
			if (this.dragPreviewGraphics) {
				this.dragPreviewGraphics.destroy();
				this.dragPreviewGraphics = null;
			}

			// Remove from parent and destroy container
			if (this.dragPreviewContainer.parent) {
				this.dragPreviewContainer.parent.removeChild(this.dragPreviewContainer);
			}
			this.dragPreviewContainer.destroy({ children: true });
			this.dragPreviewContainer = null;
		}

		// Reset original clip appearance if it still exists
		if (this.draggedClipInfo && this.visualTracks.length > this.draggedClipInfo.trackIndex) {
			const track = this.visualTracks[this.draggedClipInfo.trackIndex];
			if (track) {
				const clip = track.getClip(this.draggedClipInfo.clipIndex);
				if (clip) {
					clip.setDragging(false);
				}
			}
		}

		this.draggedClipInfo = null;
	}

	private clearAllVisualState(): void {
		// Make sure drag preview is cleaned up
		this.hideDragPreview();

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
		for (let trackIndex = 0; trackIndex < editType.timeline.tracks.length; trackIndex += 1) {
			const trackData = editType.timeline.tracks[trackIndex];

			const visualTrackOptions: VisualTrackOptions = {
				pixelsPerSecond: this.pixelsPerSecond,
				trackHeight: this.layout.trackHeight,
				trackIndex,
				width: this.getExtendedTimelineWidth(),
				theme: this.theme
			};

			const visualTrack = new VisualTrack(visualTrackOptions);
			await visualTrack.load();

			// Rebuild track with track data
			visualTrack.rebuildFromTrackData(trackData, this.pixelsPerSecond);

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
		const relativeY = y - trackIndex * this.layout.trackHeight;

		const result = visualTrack.findClipAtPosition(x, relativeY);
		if (result) {
			return {
				trackIndex,
				clipIndex: result.clipIndex,
				clipConfig: result.clip.getClipConfig(),
				x: (result.clip.getClipConfig().start || 0) * this.pixelsPerSecond,
				y: trackIndex * this.layout.trackHeight,
				width: (result.clip.getClipConfig().length || 0) * this.pixelsPerSecond,
				height: this.layout.trackHeight
			};
		}

		return null;
	}

	// Theme management methods
	public setTheme(themeOptions: TimelineThemeOptions): void {
		this.theme = TimelineThemeResolver.resolveTheme(themeOptions);
		
		// Update backgroundColor from theme
		this.backgroundColor = this.theme.colors.structure.background;
		
		// Update trackHeight from theme (with minimum of 40px)
		const themeTrackHeight = this.theme.dimensions?.trackHeight || TimelineLayout.TRACK_HEIGHT_DEFAULT;
		this.trackHeight = Math.max(40, themeTrackHeight);
		
		// Update layout with new options and theme
		this.layout.updateOptions(this.getOptions() as Required<TimelineOptions>, this.theme);
		
		// Update toolbar theme
		if (this.toolbar) {
			this.toolbar.updateTheme(this.theme);
		}
		
		// Recreate timeline features with new theme and dimensions
		if (this.ruler) {
			this.ruler.dispose();
			const extendedDuration = this.getExtendedTimelineDuration();
			const rulerHeight = this.theme.dimensions?.rulerHeight || this.layout.rulerHeight;
			this.ruler = new RulerFeature(this.pixelsPerSecond, extendedDuration, rulerHeight, this.theme);
			this.ruler.load();
			this.ruler.getContainer().y = this.layout.rulerY;
			this.rulerViewport.addChild(this.ruler.getContainer());
			this.ruler.events.on("ruler:seeked", this.handleSeek.bind(this));
		}
		
		if (this.playhead) {
			this.playhead.dispose();
			this.playhead = new PlayheadFeature(this.pixelsPerSecond, this.height, this.theme);
			this.playhead.load();
			this.playhead.getContainer().y = this.layout.playheadY;
			this.overlayLayer.addChild(this.playhead.getContainer());
			this.playhead.events.on("playhead:seeked", this.handleSeek.bind(this));
		}
		
		if (this.grid) {
			this.grid.dispose();
			const extendedDuration = this.getExtendedTimelineDuration();
			this.grid = new GridFeature(this.pixelsPerSecond, extendedDuration, this.layout.getGridHeight(), this.layout.trackHeight, this.theme);
			this.grid.load();
			this.grid.getContainer().y = this.layout.gridY;
			this.backgroundLayer.addChild(this.grid.getContainer());
		}
		
		// Rebuild visuals with new theme
		if (this.currentEditType) {
			this.clearAllVisualState();
			this.rebuildFromEdit(this.currentEditType);
		}
		
		// Update PIXI app background
		if (this.app) {
			this.app.renderer.background.color = this.backgroundColor;
		}
		
		this.app.render();
	}

	public getTheme(): TimelineTheme {
		return this.theme;
	}

	// Getters for current state
	public getCurrentEditType(): EditType | null {
		return this.currentEditType;
	}

	public getOptions(): TimelineOptions {
		return {
			width: this.width,
			height: this.height,
			pixelsPerSecond: this.pixelsPerSecond,
			trackHeight: this.trackHeight,
			backgroundColor: this.backgroundColor,
			antialias: this.antialias,
			resolution: this.resolution
		};
	}

	public setOptions(options: Partial<TimelineOptions>): void {
		if (options.width !== undefined) {
			this.width = options.width;
			// Update toolbar width
			if (this.toolbar) {
				this.toolbar.resize(this.width);
			}
		}
		if (options.height !== undefined) this.height = options.height;
		if (options.pixelsPerSecond !== undefined) this.pixelsPerSecond = options.pixelsPerSecond;
		if (options.trackHeight !== undefined) this.trackHeight = options.trackHeight;
		if (options.backgroundColor !== undefined) this.backgroundColor = options.backgroundColor;
		if (options.antialias !== undefined) this.antialias = options.antialias;
		if (options.resolution !== undefined) this.resolution = options.resolution;
		
		// Update layout with new options
		this.layout.updateOptions(this.getOptions() as Required<TimelineOptions>);
	}

	// Required Entity methods
	public update(_deltaTime: number, _elapsed: number): void {
		// Sync playhead with Edit playback time
		if (this.edit.isPlaying || this.lastPlaybackTime !== this.edit.playbackTime) {
			this.playhead.setTime(this.msToSeconds(this.edit.playbackTime));
			this.lastPlaybackTime = this.edit.playbackTime;
			
			// Update toolbar time display
			if (this.toolbar) {
				this.toolbar.updateTimeDisplay();
			}
		}
	}

	public draw(): void {
		// Render the PIXI application
		this.app.render();
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

	// Helper methods for drag preview styling
	private getClipColor(assetType?: string): number {
		// Match VisualClip color logic
		switch (assetType) {
			case "video":
				return 0x4a90e2;
			case "audio":
				return 0x7ed321;
			case "image":
				return 0xf5a623;
			case "text":
				return 0xd0021b;
			case "shape":
				return 0x9013fe;
			case "html":
				return 0x50e3c2;
			case "luma":
				return 0xb8e986;
			default:
				return 0x8e8e93;
		}
	}

	private darkenColor(color: number, factor: number): number {
		// Extract RGB components
		// eslint-disable-next-line no-bitwise
		const r = (color >> 16) & 0xff;
		// eslint-disable-next-line no-bitwise
		const g = (color >> 8) & 0xff;
		// eslint-disable-next-line no-bitwise
		const b = color & 0xff;

		// Darken each component
		const newR = Math.floor(r * (1 - factor));
		const newG = Math.floor(g * (1 - factor));
		const newB = Math.floor(b * (1 - factor));

		// Combine back to hex
		// eslint-disable-next-line no-bitwise
		return (newR << 16) | (newG << 8) | newB;
	}

	public dispose(): void {
		// Stop animation loop
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}

		// Clean up drag preview if still active
		this.hideDragPreview();

		this.edit.events.off("timeline:updated", this.handleTimelineUpdated.bind(this));
		this.edit.events.off("clip:updated", this.handleClipUpdated.bind(this));
		this.edit.events.off("clip:selected", this.handleClipSelected.bind(this));
		this.edit.events.off("selection:cleared", this.handleSelectionCleared.bind(this));
		this.edit.events.off("drag:started", this.handleDragStarted.bind(this));
		this.edit.events.off("drag:moved", this.handleDragMoved.bind(this));
		this.edit.events.off("drag:ended", this.handleDragEnded.bind(this));
		this.edit.events.off("track:created-and-clip:moved", this.handleTrackCreatedAndClipMoved.bind(this));

		// Clean up interaction system
		if (this.interaction) {
			this.interaction.dispose();
		}

		// Clean up visual tracks
		this.clearAllVisualState();

		// Dispose timeline features
		if (this.toolbar) {
			this.toolbar.destroy();
		}
		if (this.ruler) {
			this.ruler.dispose();
		}
		if (this.playhead) {
			this.playhead.dispose();
		}
		if (this.grid) {
			this.grid.dispose();
		}
		if (this.scroll) {
			this.scroll.dispose();
		}

		// Destroy PIXI application
		if (this.app) {
			this.app.destroy(true);
		}
	}
}
