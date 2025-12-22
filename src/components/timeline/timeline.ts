import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import { injectShotstackStyles } from "@styles/inject";
import type { TimelineOptions, TimelineFeatures, ClipRenderer, ClipInfo } from "@timeline/timeline.types";

import { PlayheadComponent } from "./components/playhead/playhead-component";
import { RulerComponent } from "./components/ruler/ruler-component";
import { ToolbarComponent } from "./components/toolbar/toolbar-component";
import { TrackListComponent } from "./components/track/track-list";
import { TimelineStateManager } from "./core/state/timeline-state";
import { TimelineEntity } from "./core/timeline-entity";
import { InteractionController } from "./interaction/interaction-controller";
import { MediaThumbnailRenderer } from "./renderers/media-thumbnail-renderer";
import { ThumbnailGenerator } from "./services/thumbnail-generator";

/** HTML/CSS-based Timeline component extending TimelineEntity for SDK consistency */
export class Timeline extends TimelineEntity {
	private readonly container: HTMLElement;
	private readonly stateManager: TimelineStateManager;

	// Feature flags
	private features: Required<TimelineFeatures>;

	// Custom renderers
	private clipRenderers = new Map<string, ClipRenderer>();

	// Media thumbnail generation (video and image)
	private thumbnailGenerator: ThumbnailGenerator;
	private mediaThumbnailRenderer: MediaThumbnailRenderer;

	// Components (stored separately from children for typed access)
	private toolbar: ToolbarComponent | null = null;
	private rulerTracksWrapper: HTMLElement | null = null;
	private ruler: RulerComponent | null = null;
	private trackList: TrackListComponent | null = null;
	private playhead: PlayheadComponent | null = null;
	private playheadGhost: HTMLElement | null = null;
	private feedbackLayer: HTMLElement | null = null;
	private interactionController: InteractionController | null = null;

	// Hybrid render loop state
	private animationFrameId: number | null = null;
	private isRenderLoopActive = false;
	private lastFrameTime = 0;
	private isInteracting = false;
	private isLoaded = false;

	// Bound event handlers for cleanup
	private readonly handleTimelineUpdated: () => void;
	private readonly handlePlaybackPlay: () => void;
	private readonly handlePlaybackPause: () => void;
	private readonly handleClipSelected: () => void;
	private readonly handleClipLoadFailed: () => void;

	constructor(
		private readonly edit: Edit,
		container: HTMLElement,
		options: TimelineOptions = {}
	) {
		super("div", "ss-html-timeline");

		this.container = container;

		// Merge default features with provided options
		this.features = {
			toolbar: options.features?.toolbar ?? true,
			ruler: options.features?.ruler ?? true,
			playhead: options.features?.playhead ?? true,
			snap: options.features?.snap ?? true,
			badges: options.features?.badges ?? true,
			multiSelect: options.features?.multiSelect ?? true
		};

		// Configure root element to fill container
		this.element.style.width = "100%";
		this.element.style.height = "100%";

		// Create state manager with placeholder size (will be updated in load())
		this.stateManager = new TimelineStateManager(edit, {
			width: 800, // placeholder, updated in load()
			height: 300, // placeholder, updated in load()
			pixelsPerSecond: options.pixelsPerSecond ?? 50
		});

		// Initialize media thumbnail generation (video and image)
		this.thumbnailGenerator = new ThumbnailGenerator();
		this.mediaThumbnailRenderer = new MediaThumbnailRenderer(this.thumbnailGenerator, () => this.requestRender());
		this.clipRenderers.set("video", this.mediaThumbnailRenderer);
		this.clipRenderers.set("image", this.mediaThumbnailRenderer);

		// Bind event handlers
		this.handleTimelineUpdated = () => {
			// Re-detect luma attachments in case clips were added/removed/moved
			this.stateManager.detectAndAttachLumas();
			this.requestRender();
		};
		this.handlePlaybackPlay = () => this.startRenderLoop();
		this.handlePlaybackPause = () => {
			this.stopRenderLoop();
			this.requestRender(); // Final render to update UI with paused state
		};
		this.handleClipSelected = () => this.requestRender();
		this.handleClipLoadFailed = () => this.requestRender();
	}

	/** Initialize and mount the timeline */
	public async load(): Promise<void> {
		if (this.isLoaded) return;

		// Inject styles
		injectShotstackStyles();

		// Mount to container first so we can measure
		this.container.appendChild(this.element);

		// Get actual size from container
		const rect = this.container.getBoundingClientRect();
		const width = rect.width || 800;
		const height = rect.height || 300;
		this.stateManager.setViewport({ width, height });

		// Build component structure
		this.buildComponents();

		// Set up event listeners for hybrid render loop
		this.setupEventListeners();

		// Initial render (data is derived from Edit on-demand)
		this.update(0, performance.now());
		this.draw();

		this.isLoaded = true;
	}

	/** Update component state (called each frame during active rendering) */
	public update(_deltaTime: number, _elapsed: number): void {
		// State manager already syncs with Edit via events
		// This method is here for TimelineEntity conformance
		// Children that extend TimelineEntity will be updated via updateChildren()
	}

	/** Render/draw component to DOM (called each frame after update) */
	public draw(): void {
		// Derive state from Edit on-demand (single source of truth)
		const viewport = this.stateManager.getViewport();
		const playback = this.stateManager.getPlayback();
		const tracks = this.stateManager.getTracks();

		// Update CSS variable for clip/playhead positioning
		this.element.style.setProperty("--ss-timeline-pixels-per-second", String(viewport.pixelsPerSecond));

		// Update toolbar
		this.toolbar?.updatePlayState(playback.isPlaying);
		this.toolbar?.updateTimeDisplay(playback.time, playback.duration);
		this.toolbar?.draw();

		// Update ruler and draw
		this.ruler?.updateRuler(viewport.pixelsPerSecond, this.stateManager.getExtendedDuration());
		this.ruler?.draw();

		// Update tracks and draw
		this.trackList?.updateTracks(tracks, this.stateManager.getTimelineWidth(), viewport.pixelsPerSecond);
		this.trackList?.draw();

		// Update playhead
		this.playhead?.setTime(playback.time);
		this.playhead?.draw();
	}

	/** Clean up and unmount the timeline */
	public dispose(): void {
		// Stop animation loop
		this.stopRenderLoop();

		// Remove event listeners
		this.removeEventListeners();

		// Dispose state manager
		this.stateManager.dispose();

		// Dispose components
		this.disposeComponents();

		// Clean up thumbnail generator
		this.thumbnailGenerator.dispose();

		// Clean up custom renderers
		this.clipRenderers.clear();

		// Remove DOM
		this.element.remove();

		this.isLoaded = false;
	}

	// ========== Hybrid Render Loop ==========

	private setupEventListeners(): void {
		// Listen for timeline data changes (single render when idle)
		this.edit.events.on(EditEvent.TimelineUpdated, this.handleTimelineUpdated);

		// Listen for granular clip/track events
		this.edit.events.on(EditEvent.ClipAdded, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.ClipDeleted, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.ClipSplit, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.TrackAdded, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.TrackRemoved, this.handleTimelineUpdated);

		// Listen for playback state changes (start/stop render loop)
		this.edit.events.on(EditEvent.PlaybackPlay, this.handlePlaybackPlay);
		this.edit.events.on(EditEvent.PlaybackPause, this.handlePlaybackPause);

		// Listen for selection changes (from canvas or other sources)
		this.edit.events.on(EditEvent.ClipSelected, this.handleClipSelected);

		// Listen for clip load failures (to show error badge on timeline)
		this.edit.events.on(EditEvent.ClipLoadFailed, this.handleClipLoadFailed);
	}

	private removeEventListeners(): void {
		this.edit.events.off(EditEvent.TimelineUpdated, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipAdded, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipDeleted, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipSplit, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.TrackAdded, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.TrackRemoved, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.PlaybackPlay, this.handlePlaybackPlay);
		this.edit.events.off(EditEvent.PlaybackPause, this.handlePlaybackPause);
		this.edit.events.off(EditEvent.ClipSelected, this.handleClipSelected);
		this.edit.events.off(EditEvent.ClipLoadFailed, this.handleClipLoadFailed);
	}

	/** Start continuous render loop (during playback or interaction) */
	private startRenderLoop(): void {
		if (this.isRenderLoopActive) return;
		this.isRenderLoopActive = true;
		this.lastFrameTime = performance.now();
		this.tick();
	}

	/** Stop continuous render loop */
	private stopRenderLoop(): void {
		this.isRenderLoopActive = false;
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
	}

	/** Animation frame callback */
	private tick = (): void => {
		if (!this.isRenderLoopActive) return;

		const now = performance.now();
		const deltaTime = now - this.lastFrameTime;
		this.lastFrameTime = now;

		this.update(deltaTime, now);
		this.draw();

		// Continue loop if playing or interacting
		if (this.edit.isPlaying || this.isInteracting) {
			this.animationFrameId = requestAnimationFrame(this.tick);
		} else {
			this.isRenderLoopActive = false;
			this.animationFrameId = null;
		}
	};

	/** Request a single render (used when idle and data changes) */
	private requestRender(): void {
		if (this.isRenderLoopActive) return; // Loop already running
		this.update(0, performance.now());
		this.draw();
	}

	/** Mark interaction as started (enables render loop) */
	public beginInteraction(): void {
		this.isInteracting = true;
		this.startRenderLoop();
	}

	/** Mark interaction as ended (may stop render loop) */
	public endInteraction(): void {
		this.isInteracting = false;
		// Loop will stop on next tick if not playing
	}

	// ========== Component Building ==========

	private buildComponents(): void {
		// Clear existing content
		this.element.innerHTML = "";

		const viewport = this.stateManager.getViewport();

		// Build toolbar
		if (this.features.toolbar) {
			this.toolbar = new ToolbarComponent(
				{
					onPlay: () => this.edit.play(),
					onPause: () => this.edit.pause(),
					onSkipBack: () => this.edit.seek(Math.max(0, this.edit.playbackTime - 1000)),
					onSkipForward: () => this.edit.seek(this.edit.playbackTime + 1000),
					onZoomChange: pps => this.setZoom(pps)
				},
				viewport.pixelsPerSecond
			);
			this.element.appendChild(this.toolbar.element);
		}

		// Create wrapper for ruler + tracks + playhead (so playhead can span both)
		this.rulerTracksWrapper = document.createElement("div");
		this.rulerTracksWrapper.className = "ss-ruler-tracks-wrapper";
		this.element.appendChild(this.rulerTracksWrapper);

		// Build ruler
		if (this.features.ruler) {
			this.ruler = new RulerComponent({
				onSeek: timeMs => this.edit.seek(timeMs),
				onWheel: e => {
					if (this.trackList) {
						this.trackList.element.scrollTop += e.deltaY;
						this.trackList.element.scrollLeft += e.deltaX;
					}
				}
			});
			this.rulerTracksWrapper.appendChild(this.ruler.element);
		}

		// Build track list
		this.trackList = new TrackListComponent({
			showBadges: this.features.badges,
			onClipSelect: (trackIndex, clipIndex, addToSelection) => {
				if (this.features.multiSelect && addToSelection) {
					this.stateManager.selectClip(trackIndex, clipIndex, true);
				} else {
					this.stateManager.selectClip(trackIndex, clipIndex, false);
				}
				this.edit.selectClip(trackIndex, clipIndex);
				this.requestRender();
			},
			getClipRenderer: type => this.clipRenderers.get(type),
			getClipError: (trackIndex, clipIndex) => this.edit.getClipError(trackIndex, clipIndex),
			isLumaAttached: (trackIndex, clipIndex) => this.stateManager.isLumaAttached(trackIndex, clipIndex),
			getAttachedLuma: (trackIndex, clipIndex) => this.stateManager.getAttachedLuma(trackIndex, clipIndex),
			onMaskClick: (contentTrackIndex, contentClipIndex) => {
				this.stateManager.toggleLumaVisibility(contentTrackIndex, contentClipIndex);

				// Select the luma clip when toggling mask visibility
				const lumaRef = this.stateManager.getAttachedLuma(contentTrackIndex, contentClipIndex);
				if (lumaRef) {
					this.edit.selectClip(lumaRef.trackIndex, lumaRef.clipIndex);
				}

				this.requestRender();
			},
			isLumaVisibleForEditing: (contentTrackIndex, contentClipIndex) =>
				this.stateManager.isLumaVisibleForEditing(contentTrackIndex, contentClipIndex),
			getContentClipForLuma: (lumaTrack, lumaClip) => this.stateManager.getContentClipForLuma(lumaTrack, lumaClip)
		});

		// Set up scroll sync (also sync playhead)
		this.trackList.setScrollHandler((scrollX, scrollY) => {
			this.stateManager.setScroll(scrollX, scrollY);
			this.ruler?.syncScroll(scrollX);
			// Sync playhead with track scroll
			if (this.playhead) {
				this.playhead.element.style.transform = `translateX(${-scrollX}px)`;
				this.playhead.setScrollX(scrollX);
			}
		});

		this.rulerTracksWrapper.appendChild(this.trackList.element);

		// Build playhead (at wrapper level so it spans ruler + tracks)
		if (this.features.playhead) {
			this.playhead = new PlayheadComponent({
				onSeek: timeMs => this.edit.seek(timeMs)
			});
			this.playhead.setPixelsPerSecond(viewport.pixelsPerSecond);
			this.rulerTracksWrapper.appendChild(this.playhead.element);

			// Build playhead ghost (hover preview)
			this.playheadGhost = document.createElement("div");
			this.playheadGhost.className = "ss-playhead-ghost";
			this.rulerTracksWrapper.appendChild(this.playheadGhost);

			this.rulerTracksWrapper.addEventListener("mousemove", e => {
				if (!this.playheadGhost || !this.rulerTracksWrapper) return;
				const rect = this.rulerTracksWrapper.getBoundingClientRect();
				const scrollX = this.trackList?.element.scrollLeft ?? 0;
				const x = e.clientX - rect.left + scrollX;
				this.playheadGhost.style.left = `${x}px`;
			});
		}

		// Build feedback layer (inside rulerTracksWrapper so coordinates align with tracks)
		this.feedbackLayer = document.createElement("div");
		this.feedbackLayer.className = "ss-feedback-layer";
		this.rulerTracksWrapper.appendChild(this.feedbackLayer);

		// Initialize interaction controller
		this.interactionController = new InteractionController(this.edit, this.stateManager, this.trackList.element, this.feedbackLayer, {
			snapThreshold: this.features.snap ? 10 : 0
		});

		// Auto-detect luma attachments from existing clips (e.g., on template load)
		this.stateManager.detectAndAttachLumas();
	}

	private disposeComponents(): void {
		this.interactionController?.dispose();
		this.interactionController = null;

		this.toolbar?.dispose();
		this.toolbar = null;

		this.ruler?.dispose();
		this.ruler = null;

		this.playhead?.dispose();
		this.playhead = null;

		this.trackList?.dispose();
		this.trackList = null;

		this.rulerTracksWrapper?.remove();
		this.rulerTracksWrapper = null;

		this.feedbackLayer?.remove();
		this.feedbackLayer = null;
	}

	// ========== Public API ==========

	public setZoom(pixelsPerSecond: number): void {
		this.stateManager.setPixelsPerSecond(pixelsPerSecond);
		this.toolbar?.setZoom(pixelsPerSecond);
		this.playhead?.setPixelsPerSecond(pixelsPerSecond);
		this.requestRender();
	}

	public zoomIn(): void {
		const current = this.stateManager.getViewport().pixelsPerSecond;
		this.setZoom(Math.min(200, current * 1.2));
	}

	public zoomOut(): void {
		const current = this.stateManager.getViewport().pixelsPerSecond;
		this.setZoom(Math.max(10, current / 1.2));
	}

	public scrollTo(time: number): void {
		if (!this.trackList) return;

		const pps = this.stateManager.getViewport().pixelsPerSecond;
		this.trackList.setScrollPosition(time * pps, 0);
	}

	/** Recalculate size from container and re-render */
	public resize(): void {
		const rect = this.container.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return;

		this.stateManager.setViewport({ width: rect.width, height: rect.height });
		this.requestRender();
	}

	public selectClip(trackIndex: number, clipIndex: number): void {
		this.stateManager.selectClip(trackIndex, clipIndex, false);
		this.edit.selectClip(trackIndex, clipIndex);
		this.requestRender();
	}

	public clearSelection(): void {
		this.stateManager.clearSelection();
		this.edit.clearSelection();
		this.requestRender();
	}

	public enableFeature(feature: keyof TimelineFeatures): void {
		this.features[feature] = true;
		this.disposeComponents();
		this.buildComponents();
		this.requestRender();
	}

	public disableFeature(feature: keyof TimelineFeatures): void {
		this.features[feature] = false;
		this.disposeComponents();
		this.buildComponents();
		this.requestRender();
	}

	public registerClipRenderer(type: string, renderer: ClipRenderer): void {
		this.clipRenderers.set(type, renderer);
	}

	public getEdit(): Edit {
		return this.edit;
	}

	public findClipAtPosition(x: number, y: number): ClipInfo | null {
		if (!this.trackList) return null;

		const rect = this.trackList.element.getBoundingClientRect();
		const relativeX = x - rect.left;
		const relativeY = y - rect.top;
		const viewport = this.stateManager.getViewport();
		const trackHeight = 64; // TODO: get from theme

		const clipState = this.trackList.findClipAtPosition(relativeX, relativeY, trackHeight, viewport.pixelsPerSecond);

		if (clipState) {
			return {
				trackIndex: clipState.trackIndex,
				clipIndex: clipState.clipIndex,
				config: clipState.config
			};
		}

		return null;
	}
}
