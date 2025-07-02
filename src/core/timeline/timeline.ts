import { Entity } from "@entities/base/entity";
import { Edit } from "@entities/system/edit";
import { type Size } from "@layouts/geometry";
import * as pixi from "pixi.js";


import { TimelineRuler, TimelineTrack } from "./components";
import type {
	TimelineClipData,
	ClipClickEventData,
	ClipSelectedEventData,
	ClipUpdatedEventData,
	TrackDeletedEventData
} from "./timeline-types";
import { isTextAsset, hasSourceUrl } from "./timeline-types";
import { TIMELINE_CONFIG, getAssetColor } from "./timeline-config";

export class Timeline extends Entity {
	private edit: Edit;
	private width: number;
	private height: number;

	// PIXI Application for standalone component functionality
	public application: pixi.Application | null;

	// Core visual components using Entity architecture
	private background: pixi.Graphics | null;
	private ruler: TimelineRuler | null;
	private tracks: TimelineTrack[] = [];
	private playhead: pixi.Graphics | null;
	private trackContainer: pixi.Container | null; // Container for all tracks that can be scrolled

	// Timeline state properties
	private pixelsPerSecondValue: number = TIMELINE_CONFIG.dimensions.defaultPixelsPerSecond;
	private trackHeightValue: number = TIMELINE_CONFIG.dimensions.trackHeight;
	private scrollPositionValue: number = 0;
	private verticalScrollPositionValue: number = 0;
	private visibleHeightValue: number = 0; // Height of the visible area for tracks
	private selectedClipIdValue: string | null = null;
	private isPlayingValue: boolean = false;

	// Performance optimization - debounced refresh
	private refreshTimeout: number | null = null;
	private static readonly REFRESH_DEBOUNCE_MS = 16; // ~60fps
	
	// Store bound event handlers for proper cleanup (following Canvas pattern)
	private readonly boundClipSelectedHandler: (data: ClipSelectedEventData) => void;
	private readonly boundClipUpdatedHandler: (data: ClipUpdatedEventData) => void;
	private readonly boundTrackDeletedHandler: (data: TrackDeletedEventData) => void;
	private readonly boundTimelineClickHandler: (event: pixi.FederatedPointerEvent) => void;

	constructor(edit: Edit, size: Size) {
		super();
		this.edit = edit;
		this.width = size.width;
		this.height = size.height;

		// Initialize all PIXI objects as null (following Inspector pattern)
		this.application = null;
		this.background = null;
		this.ruler = null;
		this.tracks = [];
		this.playhead = null;
		this.trackContainer = null;

		// Store bound event handlers for proper cleanup (following established Canvas pattern)
		this.boundClipSelectedHandler = this.handleClipSelected.bind(this);
		this.boundClipUpdatedHandler = this.handleClipUpdated.bind(this);
		this.boundTrackDeletedHandler = this.handleTrackDeleted.bind(this);
		this.boundTimelineClickHandler = this.handleTimelineClick.bind(this);
		
		// Add event listeners for edit state changes using stored references
		this.edit.events.on("clip:selected", this.boundClipSelectedHandler);
		this.edit.events.on("clip:updated", this.boundClipUpdatedHandler);
		this.edit.events.on("track:deleted", this.boundTrackDeletedHandler);
	}

	public override async load(): Promise<void> {
		// Create and initialize standalone application
		this.application = new pixi.Application();
		await this.application.init({
			width: this.width,
			height: this.height,
			background: `#${TIMELINE_CONFIG.colors.background.toString(16).padStart(6, '0')}`,
			antialias: true
		});

		// Create PIXI objects and Entity components with error handling
		try {
			this.background = new pixi.Graphics();
			this.ruler = new TimelineRuler(this.edit, this.width);
			this.playhead = new pixi.Graphics();
			this.trackContainer = new pixi.Container();
		} catch (error) {
			console.error('Failed to create timeline components:', error);
			throw new Error('Timeline component initialization failed');
		}

		// Set up container hierarchy using Entity's getContainer() for internal organization
		this.getContainer().addChild(this.background);
		this.getContainer().addChild(this.trackContainer);
		this.getContainer().addChild(this.ruler.getContainer());
		this.getContainer().addChild(this.playhead);

		// Load ruler component with error handling
		try {
			await this.ruler.load();
		} catch (error) {
			console.error('Failed to load timeline ruler:', error);
			throw new Error('Timeline ruler initialization failed');
		}

		// Add main container to application stage for standalone functionality
		if (this.application) {
			this.application.stage.addChild(this.getContainer());
		}

		// Calculate the visible height for tracks (total height minus ruler height)
		const rulerHeight = TIMELINE_CONFIG.dimensions.rulerHeight;
		this.visibleHeightValue = this.height - rulerHeight;

		// Create a mask for the track container to enable scrolling
		if (this.trackContainer) {
			const mask = new pixi.Graphics();
			mask.beginFill(0xffffff); // White mask for visibility
			mask.drawRect(0, rulerHeight, this.width, this.visibleHeight);
			mask.endFill();
			this.trackContainer.mask = mask;
			this.getContainer().addChild(mask);

			// Position the track container
			this.trackContainer.position.y = rulerHeight;
		}

		// Initialize background
		this.drawBackground();

		// Set up interaction handlers
		this.setupInteractions();

		// Initial rendering
		this.drawBackground();
		this.buildTracks();
		this.drawPlayhead();
	}

	public override update(deltaTime: number, elapsed: number): void {
		if (!this.playhead) return;
		
		// Update Entity components
		this.ruler?.update(deltaTime, elapsed);
		for (const track of this.tracks) {
			track.update(deltaTime, elapsed);
		}
		
		// Update playhead position based on edit time
		const playheadX = (this.edit.playbackTime / 1000) * this.pixelsPerSecond - this.scrollPosition;

		// Clear and redraw playhead at new position
		this.playhead.clear();
		this.playhead.position.x = Math.max(0, Math.min(this.width, playheadX));

		// Draw playhead line
		this.playhead.strokeStyle = { color: TIMELINE_CONFIG.colors.playhead, width: TIMELINE_CONFIG.dimensions.playheadWidth };
		this.playhead.moveTo(0, 0);
		this.playhead.lineTo(0, this.height);
		this.playhead.stroke();

		// Draw playhead handle
		this.playhead.fillStyle = { color: TIMELINE_CONFIG.colors.playhead };
		this.playhead.circle(0, 15, 5);
		this.playhead.fill();

		// Auto-scroll if needed while playing
		if (this.edit.isPlaying) {
			// If playhead is approaching the right edge of the screen
			const rightEdgeThreshold = this.width - TIMELINE_CONFIG.animation.autoScrollThreshold;

			// If the non-adjusted playhead position is beyond the threshold
			if (playheadX > rightEdgeThreshold) {
				// Adjust the scroll position to keep the playhead within view
				this.scrollPosition += (playheadX - rightEdgeThreshold) * 0.1; // Smooth scrolling

				// Refresh the view since we changed scroll position
				this.refreshView();
			}

			// If playhead is close to the left edge and we're scrolled
			if (playheadX < TIMELINE_CONFIG.animation.autoScrollThreshold && this.scrollPosition > 0) {
				// Scroll back to follow the playhead
				this.scrollPosition = Math.max(0, this.scrollPosition - 10);
				this.refreshView();
			}
		}
	}

	public override draw(): void {
		// This is called by the rendering system
		// Most drawing is done in component-specific methods
	}

	public override dispose(): void {
		// Clean up timers
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
			this.refreshTimeout = null;
		}

		// Remove event listeners first to prevent memory leaks
		this.getContainer().removeAllListeners();
		this.getContainer().eventMode = 'none';
		
		// Remove edit event listeners using stored references (following established pattern)
		this.edit.events.off("clip:selected", this.boundClipSelectedHandler);
		this.edit.events.off("clip:updated", this.boundClipUpdatedHandler);
		this.edit.events.off("track:deleted", this.boundTrackDeletedHandler);
		
		// Dispose track entities in reverse order to avoid index issues
		for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
			const track = this.tracks[i];
			if (this.trackContainer && track.getContainer().parent === this.trackContainer) {
				this.trackContainer.removeChild(track.getContainer());
			}
			track.dispose();
		}
		this.tracks.length = 0;
		
		// Dispose ruler entity
		if (this.ruler) {
			if (this.ruler.getContainer().parent) {
				this.ruler.getContainer().parent.removeChild(this.ruler.getContainer());
			}
			this.ruler.dispose();
			this.ruler = null;
		}
		
		// Dispose PIXI graphics objects following Player class pattern
		this.background?.destroy({ children: true });
		this.background = null;
		
		this.playhead?.destroy({ children: true });
		this.playhead = null;
		
		// Handle trackContainer and its mask
		if (this.trackContainer?.mask) {
			const mask = this.trackContainer.mask as pixi.Graphics;
			this.trackContainer.mask = null;
			mask.destroy({ children: true });
		}
		this.trackContainer?.destroy({ children: true });
		this.trackContainer = null;
		
		// Destroy standalone application following Player pattern
		this.application?.destroy(true, {
			children: true,
			texture: true
		});
		this.application = null;
	}

	// State management with validation and notifications (following Edit class patterns)
	public get pixelsPerSecond(): number {
		return this.pixelsPerSecondValue;
	}

	public set pixelsPerSecond(value: number) {
		const validatedValue = Math.max(
			TIMELINE_CONFIG.dimensions.minZoom,
			Math.min(TIMELINE_CONFIG.dimensions.maxZoom, value)
		);
		
		if (this.pixelsPerSecondValue !== validatedValue) {
			this.pixelsPerSecondValue = validatedValue;
			this.onStateChanged('pixelsPerSecond');
		}
	}

	public get scrollPosition(): number {
		return this.scrollPositionValue;
	}

	public set scrollPosition(value: number) {
		const validatedValue = Math.max(0, value);
		
		if (this.scrollPositionValue !== validatedValue) {
			this.scrollPositionValue = validatedValue;
			this.onStateChanged('scrollPosition');
		}
	}

	public get verticalScrollPosition(): number {
		return this.verticalScrollPositionValue;
	}

	public set verticalScrollPosition(value: number) {
		const maxScroll = this.getMaxVerticalScroll();
		const validatedValue = Math.max(0, Math.min(maxScroll, value));
		
		if (this.verticalScrollPositionValue !== validatedValue) {
			this.verticalScrollPositionValue = validatedValue;
			this.onStateChanged('verticalScrollPosition');
		}
	}

	public get selectedClipId(): string | null {
		return this.selectedClipIdValue;
	}

	public set selectedClipId(value: string | null) {
		if (this.selectedClipIdValue !== value) {
			this.selectedClipIdValue = value;
			this.onStateChanged('selectedClipId');
		}
	}

	public get isPlaying(): boolean {
		return this.isPlayingValue;
	}

	public set isPlaying(value: boolean) {
		if (this.isPlayingValue !== value) {
			this.isPlayingValue = value;
			this.onStateChanged('isPlaying');
		}
	}

	public get visibleHeight(): number {
		return this.visibleHeightValue;
	}

	public set visibleHeight(value: number) {
		const validatedValue = Math.max(0, value);
		
		if (this.visibleHeightValue !== validatedValue) {
			this.visibleHeightValue = validatedValue;
			this.onStateChanged('visibleHeight');
		}
	}

	public get trackHeight(): number {
		return this.trackHeightValue;
	}

	public set trackHeight(value: number) {
		const validatedValue = Math.max(1, value);
		
		if (this.trackHeightValue !== validatedValue) {
			this.trackHeightValue = validatedValue;
			this.onStateChanged('trackHeight');
		}
	}

	/**
	 * Handle state changes with notifications (following Edit class EventEmitter pattern)
	 */
	private onStateChanged(property: string): void {
		// Emit state change event for external listeners
		if (this.edit?.events) {
			this.edit.events.emit('timeline:stateChanged' as any, {
				property,
				value: (this as any)[`${property}Value`]
			});
		}

		// Trigger immediate refresh for scroll operations, debounced for heavy operations
		const immediateRefreshProperties = ['scrollPosition', 'verticalScrollPosition'];
		const debouncedRefreshProperties = ['pixelsPerSecond', 'selectedClipId'];
		
		if (immediateRefreshProperties.includes(property)) {
			this.refreshView();
		} else if (debouncedRefreshProperties.includes(property)) {
			this.debouncedRefreshView();
		}
	}

	// Timeline-specific methods
	public setZoom(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		// refreshView is called automatically by the setter
	}

	public setScrollPosition(scrollPosition: number): void {
		this.scrollPosition = scrollPosition;
		// refreshView is called automatically by the setter
	}

	// Private implementation methods
	private drawBackground(): void {
		if (!this.background) return;
		
		this.background.clear();
		this.background.fillStyle = { color: 0x232323 };
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill();
	}

	private buildTracks(): void {
		// Clear existing track entities with proper memory management
		for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
			const track = this.tracks[i];
			try {
				if (this.trackContainer && track.getContainer().parent === this.trackContainer) {
					this.trackContainer.removeChild(track.getContainer());
				}
				track.dispose();
			} catch (error) {
				console.warn('Failed to dispose timeline track:', error);
			}
		}
		this.tracks.length = 0; // Clear array efficiently

		// Get edit data with error handling
		let editData;
		try {
			editData = this.edit.getEdit();
		} catch (error) {
			console.error('Failed to get edit data:', error);
			return; // Graceful degradation
		}

		// Create Entity-based tracks for each track in the edit
		for (let i = 0; i < editData.timeline.tracks.length; i += 1) {
			const trackData = editData.timeline.tracks[i];
			const trackY = i * this.trackHeight - this.verticalScrollPosition;

			// Skip tracks that are completely outside the visible area
			if (trackY + this.trackHeight < 0 || trackY > this.visibleHeight) {
				// eslint-disable-next-line no-continue
				continue;
			}

			// Create TimelineTrack Entity with error handling
			try {
				const track = new TimelineTrack(
					this.edit,
					trackData,
					this.width,
					this.trackHeight,
					this.scrollPosition,
					this.pixelsPerSecond,
					this.selectedClipId
				);

				// Position the track
				track.getContainer().position.y = trackY;

				// Set up track event handling
				track.getContainer().on('clip:click', (data: ClipClickEventData) => {
					this.handleClipClick(data.clipData);
				});

				// Add to timeline and load
				this.trackContainer?.addChild(track.getContainer());
				track.load(); // Load asynchronously without waiting
				this.tracks.push(track);
			} catch (error) {
				console.warn(`Failed to create track ${i}:`, error);
				// Continue with other tracks for graceful degradation
			}
		}
	}



	private drawPlayhead(): void {
		if (!this.playhead) return;
		
		this.playhead.clear();

		// Draw playhead line
		this.playhead.strokeStyle = { color: TIMELINE_CONFIG.colors.playhead, width: TIMELINE_CONFIG.dimensions.playheadWidth };
		this.playhead.moveTo(0, 0);
		this.playhead.lineTo(0, this.height);
		this.playhead.stroke();

		// Draw playhead handle
		this.playhead.fillStyle = { color: TIMELINE_CONFIG.colors.playhead };
		this.playhead.circle(0, 15, 5);
		this.playhead.fill();
	}

	private setupInteractions(): void {
		// Get the container and ensure it can receive events
		const container = this.getContainer();
		container.eventMode = "static";
		container.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);

		// Background should be clickable too
		if (this.background) {
			this.background.eventMode = "static";
			this.background.hitArea = new pixi.Rectangle(0, 0, this.width, this.height);
			this.background.on("pointerdown", this.boundTimelineClickHandler);
		}

		// Ruler should be clickable - set up event handling on ruler Entity
		if (this.ruler) {
			this.ruler.getContainer().eventMode = "static";
			this.ruler.getContainer().on("pointerdown", (event: pixi.FederatedPointerEvent) => {
				this.ruler?.handleClick(event);
			});
		}

		// Direct click handler on container using stored reference
		container.on("pointerdown", this.boundTimelineClickHandler);

		// Scroll horizontally and vertically
		container.on("wheel", event => {
			if (event.ctrlKey) {
				// Zoom in/out
				const oldZoom = this.pixelsPerSecond;
				this.pixelsPerSecond = Math.max(
					TIMELINE_CONFIG.dimensions.minZoom,
					Math.min(
						TIMELINE_CONFIG.dimensions.maxZoom,
						this.pixelsPerSecond * (1 - event.deltaY * TIMELINE_CONFIG.animation.zoomSpeed)
					)
				);

				// Adjust scroll to keep point under cursor stable
				const mouseX = event.getLocalPosition(container).x;
				const timeAtCursor = (mouseX + this.scrollPosition) / oldZoom;
				this.scrollPosition = timeAtCursor * this.pixelsPerSecond - mouseX;
			} else if (event.shiftKey) {
				// Horizontal scroll when holding shift
				this.scrollPosition += event.deltaY;
			} else {
				// Vertical scroll without modifiers
				this.verticalScrollPosition += event.deltaY * TIMELINE_CONFIG.animation.scrollSpeed;
			}

			// Manual refresh removed - state setters handle this automatically
		});
	}

	private getMaxVerticalScroll(): number {
		const editData = this.edit.getEdit();
		const totalTracksHeight = editData.timeline.tracks.length * this.trackHeight;
		return Math.max(0, totalTracksHeight - this.visibleHeight);
	}

	private refreshView(): void {
		this.buildTracks();
		this.ruler?.updateScrollPosition(this.scrollPosition);
		this.ruler?.updatePixelsPerSecond(this.pixelsPerSecond);
	}

	/**
	 * Debounced refresh to prevent excessive redraws (following existing performance patterns)
	 */
	private debouncedRefreshView(): void {
		if (this.refreshTimeout !== null) {
			clearTimeout(this.refreshTimeout);
		}
		
		this.refreshTimeout = window.setTimeout(() => {
			this.refreshView();
			this.refreshTimeout = null;
		}, Timeline.REFRESH_DEBOUNCE_MS);
	}

	private handleTimelineClick(event: pixi.FederatedPointerEvent): void {
		// Get the local position of the click
		const clickX = event.getLocalPosition(this.getContainer()).x;
		const clickY = event.getLocalPosition(this.getContainer()).y;

		// Only move playhead when clicking on ruler or background (not tracks)
		const rulerHeight = 20;
		const isRulerClick = clickY < rulerHeight;

		// Only process clicks on the ruler or background, not on the tracks
		if (isRulerClick) {
			// Calculate time based on click position
			const clickTime = ((clickX + this.scrollPosition) / this.pixelsPerSecond) * 1000;

			// Seek the edit to that time
			this.edit.seek(clickTime);
		}
	}

	// Helper methods
	private getClipColor(assetType: string, isSelected: boolean = false): number {
		return getAssetColor(assetType, isSelected);
	}

	private getClipLabel(clipData: TimelineClipData): string {
		if (isTextAsset(clipData.asset)) {
			return clipData.asset.text.substring(0, 20);
		}

		if (hasSourceUrl(clipData.asset)) {
			const filename = clipData.asset.src.substring(clipData.asset.src.lastIndexOf("/") + 1);
			return filename.substring(0, 20);
		}

		return clipData.asset.type;
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}

	// Event handlers
	private handleClipClick(clipData: TimelineClipData): void {
		// Store the selected clip ID
		this.selectedClipId = this.getClipId(clipData);

		// Find track and clip indices
		const editData = this.edit.getEdit();
		let trackIndex = -1;
		let clipIndex = -1;

		// First, let's find if we can match by reference
		for (let i = 0; i < editData.timeline.tracks.length; i += 1) {
			const track = editData.timeline.tracks[i];
			for (let j = 0; j < track.clips.length; j += 1) {
				// Try to match by start time and asset type which should be unique enough
				if (track.clips[j].start === clipData.start && track.clips[j].asset.type === clipData.asset.type) {
					trackIndex = i;
					clipIndex = j;
					break;
				}
			}
			if (trackIndex !== -1) break;
		}

		if (trackIndex !== -1 && clipIndex !== -1) {
			try {
				// Get the player from the edit
				const clip = this.edit.getClip(trackIndex, clipIndex);

				if (clip) {
					// Notify the edit that this clip is selected
					// We need to directly call the event since setSelectedClip expects a Player object
					this.edit.events.emit("clip:selected", {
						clip,
						trackIndex,
						clipIndex
					});
				}
			} catch (error) {
				console.warn('Failed to handle clip selection:', error);
			}
		}

		// Refresh the timeline to show the selection
		this.refreshView();
	}

	private handleClipSelected(data: ClipSelectedEventData): void {
		// Update selection based on event
		if (data.clip) {
			this.selectedClipId = this.getClipId(data.clip);
		} else {
			this.selectedClipId = null;
		}

		this.refreshView();
	}

	private handleClipUpdated(_data: ClipUpdatedEventData): void {
		this.refreshView();
	}

	private handleTrackDeleted(_data: TrackDeletedEventData): void {
		// Refresh timeline view when tracks are deleted (fixes sync issue)
		this.refreshView();
	}

	// Standalone component interface - provides canvas for developer integration
	public getCanvas(): HTMLCanvasElement {
		if (!this.application) {
			throw new Error("Timeline not loaded - call load() first");
		}
		return this.application.canvas;
	}

	// Helper to generate a unique ID for a clip
	private getClipId(clip: TimelineClipData): string {
		let identifier = "";
		
		if (isTextAsset(clip.asset)) {
			identifier = clip.asset.text;
		} else if (hasSourceUrl(clip.asset)) {
			identifier = clip.asset.src;
		}
		
		return `${clip.start}-${clip.asset.type}-${identifier}`;
	}
}
