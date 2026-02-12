import { CreateTrackMoveAndDetachLumaCommand } from "@core/commands/create-track-move-and-detach-luma-command";
import type { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import { computeAiAssetNumber, type ResolvedClipWithId } from "@core/shared/ai-asset-utils";
import { inferAssetTypeFromUrl } from "@core/shared/asset-utils";
import { type Seconds, sec } from "@core/timing/types";
import { injectShotstackStyles } from "@styles/inject";
import type { TimelineOptions, TimelineFeatures, ClipRenderer, ClipInfo } from "@timeline/timeline.types";

import { PlayheadComponent } from "./components/playhead/playhead-component";
import { RulerComponent } from "./components/ruler/ruler-component";
import { ToolbarComponent } from "./components/toolbar/toolbar-component";
import { TrackListComponent } from "./components/track/track-list";
import { InteractionController } from "./interaction/interaction-controller";
import { MediaThumbnailRenderer } from "./media-thumbnail-renderer";
import { ThumbnailGenerator } from "./thumbnail-generator";
import { TimelineStateManager } from "./timeline-state";

export class Timeline {
	public readonly element: HTMLElement;
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

	private thumbnailRenderPending = false;

	// Bound event handlers for cleanup
	private readonly handleTimelineUpdated: () => void;
	private readonly handlePlaybackPlay: () => void;
	private readonly handlePlaybackPause: () => void;
	private readonly handleClipSelected: () => void;
	private readonly handleClipLoadFailed: () => void;
	private readonly handleClipUpdated: () => void;
	private readonly handleRulerMouseMove: (e: MouseEvent) => void;

	constructor(
		private readonly edit: Edit,
		container: HTMLElement,
		options: TimelineOptions = {}
	) {
		this.element = document.createElement("div");
		this.element.className = "ss-html-timeline";
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
		this.mediaThumbnailRenderer = new MediaThumbnailRenderer(this.thumbnailGenerator, () => {
			if (!this.thumbnailRenderPending) {
				this.thumbnailRenderPending = true;
				requestAnimationFrame(() => {
					this.thumbnailRenderPending = false;
					this.requestRender();
				});
			}
		});
		this.clipRenderers.set("video", this.mediaThumbnailRenderer);
		this.clipRenderers.set("image", this.mediaThumbnailRenderer);

		// Bind event handlers
		this.handleTimelineUpdated = () => {
			this.requestRender();
		};
		this.handlePlaybackPlay = () => this.startRenderLoop();
		this.handlePlaybackPause = () => {
			this.stopRenderLoop();
			this.requestRender(); // Final render to update UI with paused state
		};
		this.handleClipSelected = () => this.requestRender();
		this.handleClipLoadFailed = () => this.requestRender();
		this.handleClipUpdated = () => this.requestRender();
		this.handleRulerMouseMove = (e: MouseEvent) => {
			if (!this.playheadGhost || !this.rulerTracksWrapper) return;
			const rect = this.rulerTracksWrapper.getBoundingClientRect();
			const scrollX = this.trackList?.element.scrollLeft ?? 0;
			const x = e.clientX - rect.left + scrollX;
			this.playheadGhost.style.left = `${x}px`;
		};
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
		this.draw();

		this.isLoaded = true;
	}

	/** Render/draw component to DOM (called each frame after update) */
	/** @internal */
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

	/**
	 * Pre-compute AI asset numbers for all clips.
	 */
	private computeAiAssetNumbers(): Map<string, number> {
		const numbers = new Map<string, number>();
		const allClips = this.edit.getResolvedEdit()?.timeline.tracks.flatMap(t => t.clips) ?? [];

		// Compute number for each clip (only AI assets will get numbers)
		for (const clip of allClips) {
			const clipWithId = clip as ResolvedClipWithId;
			if ("id" in clip && typeof clipWithId.id === "string") {
				const number = computeAiAssetNumber(allClips, clipWithId.id);
				if (number !== null) {
					numbers.set(clipWithId.id, number);
				}
			}
		}

		return numbers;
	}

	private setupEventListeners(): void {
		// Listen for timeline data changes (single render when idle)
		this.edit.events.on(EditEvent.TimelineUpdated, this.handleTimelineUpdated);

		// Listen for granular clip/track events
		this.edit.events.on(EditEvent.ClipAdded, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.ClipDeleted, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.ClipRestored, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.ClipSplit, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.TrackAdded, this.handleTimelineUpdated);
		this.edit.events.on(EditEvent.TrackRemoved, this.handleTimelineUpdated);

		// Listen for playback state changes (start/stop render loop)
		this.edit.events.on(EditEvent.PlaybackPlay, this.handlePlaybackPlay);
		this.edit.events.on(EditEvent.PlaybackPause, this.handlePlaybackPause);

		// Listen for selection changes (from canvas or other sources)
		this.edit.events.on(EditEvent.ClipSelected, this.handleClipSelected);

		// Listen for clip updates
		this.edit.events.on(EditEvent.ClipUpdated, this.handleClipUpdated);

		// Listen for clip load failures (to show error badge on timeline)
		this.edit.events.on(EditEvent.ClipLoadFailed, this.handleClipLoadFailed);
	}

	private removeEventListeners(): void {
		this.edit.events.off(EditEvent.TimelineUpdated, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipAdded, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipDeleted, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipRestored, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.ClipSplit, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.TrackAdded, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.TrackRemoved, this.handleTimelineUpdated);
		this.edit.events.off(EditEvent.PlaybackPlay, this.handlePlaybackPlay);
		this.edit.events.off(EditEvent.PlaybackPause, this.handlePlaybackPause);
		this.edit.events.off(EditEvent.ClipSelected, this.handleClipSelected);
		this.edit.events.off(EditEvent.ClipUpdated, this.handleClipUpdated);
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
		this.lastFrameTime = now;

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
		this.draw();
	}

	/** Mark interaction as started (enables render loop) */
	/** @internal */
	public beginInteraction(): void {
		this.isInteracting = true;
		this.startRenderLoop();
	}

	/** Mark interaction as ended (may stop render loop) */
	/** @internal */
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
					onSkipBack: () => this.edit.seek(sec(Math.max(0, this.edit.playbackTime - 1))),
					onSkipForward: () => this.edit.seek(sec(this.edit.playbackTime + 1)),
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
				onSeek: timeSec => this.edit.seek(sec(timeSec)),
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
				this.requestRender();
			},
			getClipRenderer: type => this.clipRenderers.get(type),
			getClipError: (trackIndex, clipIndex) => this.edit.getClipError(trackIndex, clipIndex),
			hasAttachedLuma: (trackIndex, clipIndex) => this.stateManager.hasAttachedLuma(trackIndex, clipIndex),
			findAttachedLuma: (trackIndex, clipIndex) => this.stateManager.findAttachedLuma(trackIndex, clipIndex),
			onMaskClick: (contentTrackIndex, contentClipIndex) => {
				const contentClip = this.edit.getResolvedClip(contentTrackIndex, contentClipIndex);
				const clipId = this.edit.getClipId(contentTrackIndex, contentClipIndex);
				const lumaRef = this.stateManager.findAttachedLuma(contentTrackIndex, contentClipIndex);
				if (!lumaRef || !contentClip || !clipId) return;

				const startTime = contentClip.start;
				const newTrackIndex = contentTrackIndex + 1;

				// Determine target asset type from URL
				const lumaClip = this.edit.getResolvedClip(lumaRef.trackIndex, lumaRef.clipIndex);
				const src = (lumaClip?.asset as { src?: string })?.src || "";
				const targetType = inferAssetTypeFromUrl(src);

				// Single compound command for atomic undo
				const cmd = new CreateTrackMoveAndDetachLumaCommand(newTrackIndex, lumaRef.trackIndex, lumaRef.clipIndex, sec(startTime), targetType);
				this.edit.executeEditCommand(cmd);

				this.stateManager.clearLumaVisibilityForClipId(clipId);

				this.requestRender();
			},
			isLumaVisibleForEditing: (contentTrackIndex, contentClipIndex) =>
				this.stateManager.isLumaVisibleForEditing(contentTrackIndex, contentClipIndex),
			findContentForLuma: (lumaTrack, lumaClip) => this.stateManager.findContentForLuma(lumaTrack, lumaClip),
			aiAssetNumbers: this.computeAiAssetNumbers()
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
				onSeek: timeSec => this.edit.seek(sec(timeSec))
			});
			this.playhead.setPixelsPerSecond(viewport.pixelsPerSecond);
			this.rulerTracksWrapper.appendChild(this.playhead.element);

			// Build playhead ghost (hover preview)
			this.playheadGhost = document.createElement("div");
			this.playheadGhost.className = "ss-playhead-ghost";
			this.rulerTracksWrapper.appendChild(this.playheadGhost);

			this.rulerTracksWrapper.addEventListener("mousemove", this.handleRulerMouseMove);
		}

		// Build feedback layer (inside rulerTracksWrapper so coordinates align with tracks)
		this.feedbackLayer = document.createElement("div");
		this.feedbackLayer.className = "ss-feedback-layer";
		this.rulerTracksWrapper.appendChild(this.feedbackLayer);

		// Initialize interaction controller
		this.interactionController = new InteractionController(this.edit, this.stateManager, this.trackList.element, this.feedbackLayer, {
			snapThreshold: this.features.snap ? 10 : 0,
			onRequestRender: () => this.requestRender()
		});
		this.interactionController.mount();

		this.stateManager.setInteractionQuery({
			isDragging: (t, c) => this.interactionController?.isDragging(t, c) ?? false,
			isResizing: (t, c) => this.interactionController?.isResizing(t, c) ?? false
		});
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

		// Remove mousemove listener before removing element
		this.rulerTracksWrapper?.removeEventListener("mousemove", this.handleRulerMouseMove);
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

	public scrollTo(time: Seconds): void {
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

	/** @internal */
	public getEdit(): Edit {
		return this.edit;
	}

	/** @internal */
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
