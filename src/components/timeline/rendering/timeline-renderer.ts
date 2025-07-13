import { Size } from "@core/layouts/geometry";
import { Theme } from "@core/theme/theme-context";
import * as PIXI from "pixi.js";

import { ITimelineRenderer, ITimelineTrack, ITimelineRuler } from "../types/timeline.interfaces";
import { TimelineState, RenderLayer } from "../types/timeline.types";

import { TimelineRuler } from "./timeline-ruler";
import { TimelineTrack } from "./timeline-track";

/**
 * Handles all rendering for the timeline using PIXI.js
 */
export class TimelineRenderer implements ITimelineRenderer {
	private application = new PIXI.Application();
	private layers = new Map<string, PIXI.Container>();
	private tracks = new Map<string, ITimelineTrack>();
	private ruler: ITimelineRuler | null = null;
	private lastZoom = 100;

	private readonly LAYER_CONFIG = [
		{ name: "background", zIndex: 0 },
		{ name: "tracks", zIndex: 1 },
		{ name: "clips", zIndex: 2 },
		{ name: "selection", zIndex: 3 },
		{ name: "overlay", zIndex: 4 },
		{ name: "playhead", zIndex: 5 },
		{ name: "features", zIndex: 6 }
	];

	constructor(private size: Size) {}

	public async load(): Promise<void> {
		await this.application.init({
			width: this.size.width,
			height: this.size.height,
			backgroundColor: Theme.colors.background.primary,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			autoDensity: true
		});

		this.initializeLayers();
		await this.initializeRuler();
	}

	public render(state: TimelineState): void {
		this.applyScroll(state);
		this.updateRuler(state);
		this.updateClipsZoom(state);
		this.tracks.forEach(track => track.draw());
		this.renderBackground();
	}

	public clear(): void {
		this.layers.forEach(layer => layer.removeChildren());
	}

	public resize(width: number, height: number): void {
		this.size = { width, height };
		this.application.renderer.resize(width, height);
	}

	public createLayer(name: string, zIndex: number): void {
		if (this.layers.has(name)) return;

		const layer = new PIXI.Container();
		layer.zIndex = zIndex;
		this.layers.set(name, layer);
		this.application.stage.addChild(layer);
		this.application.stage.sortChildren();
	}

	public getLayer(name: RenderLayer | string): PIXI.Container {
		const layer = this.layers.get(name);
		if (!layer) throw new Error(`Layer "${name}" not found`);
		return layer;
	}

	public removeLayer(name: string): void {
		const layer = this.layers.get(name);
		if (!layer) return;
		this.application.stage.removeChild(layer);
		this.layers.delete(name);
	}

	public getApplication = (): PIXI.Application => this.application;
	public getStage = (): PIXI.Container => this.application.stage;

	public dispose(): void {
		this.tracks.forEach(track => track.dispose());
		this.tracks.clear();
		this.ruler?.dispose();
		this.ruler = null;
		this.clear();
		this.application.destroy(true);
	}

	private initializeLayers(): void {
		this.LAYER_CONFIG.forEach(({ name, zIndex }) => this.createLayer(name, zIndex));
	}

	private async initializeRuler(): Promise<void> {
		this.ruler = new TimelineRuler(this.size.width);
		await this.ruler.load();
		this.getLayer("overlay").addChild(this.ruler.getContainer());
	}

	private renderBackground(): void {
		const layer = this.getLayer("background");
		layer.removeChildren();
		layer.addChild(
			new PIXI.Graphics()
				.rect(0, 0, this.size.width, this.size.height)
				.fill({ color: Theme.colors.background.primary })
				.stroke({ width: Theme.borders.track, color: Theme.colors.borders.secondary })
		);
	}

	private updateRuler(state: TimelineState): void {
		if (!this.ruler) return;
		this.ruler.setZoom(state.viewport.zoom);
		this.ruler.setScrollX(state.viewport.scrollX);
		this.ruler.draw();
	}

	private updateClipsZoom(state: TimelineState): void {
		if (state.viewport.zoom === this.lastZoom) return;
		this.lastZoom = state.viewport.zoom;
		this.tracks.forEach(track => track.getClips().forEach(clip => clip.setPixelsPerSecond(state.viewport.zoom)));
	}

	/**
	 * Apply scroll transforms to timeline layers
	 */
	private applyScroll(state: TimelineState): void {
		const { scrollX, scrollY } = state.viewport;

		// Apply horizontal scroll to tracks and clips layers
		const tracksLayer = this.getLayer("tracks");
		const clipsLayer = this.getLayer("clips");
		
		// Apply simple translation transforms
		tracksLayer.x = -scrollX;
		clipsLayer.x = -scrollX;

		// Apply vertical scroll to track positioning
		// Tracks start below the ruler, so we add the ruler height offset
		const rulerHeight = Theme.dimensions.ruler.height;
		this.tracks.forEach((track, trackId) => {
			const trackIndex = parseInt(trackId.replace("track-", ""), 10);
			const trackY = rulerHeight + (trackIndex * Theme.dimensions.track.height) - scrollY;
			track.getContainer().y = trackY;
		});
	}

	// Track management
	public addTrack(trackId: string, index: number): ITimelineTrack {
		const track = new TimelineTrack(trackId, index);
		this.tracks.set(trackId, track);
		this.getLayer("tracks").addChild(track.getContainer());
		track.load();
		// Override the position set by track's updateLayout to ensure scroll works correctly
		const rulerHeight = Theme.dimensions.ruler.height;
		track.getContainer().y = rulerHeight + (index * Theme.dimensions.track.height);
		return track;
	}

	public removeTrack(trackId: string): void {
		const track = this.tracks.get(trackId);
		if (!track) return;
		this.getLayer("tracks").removeChild(track.getContainer());
		track.dispose();
		this.tracks.delete(trackId);
	}

	public getTrack = (trackId: string): ITimelineTrack | undefined => this.tracks.get(trackId);
	public getTracks = (): ITimelineTrack[] => Array.from(this.tracks.values());
	public getTrackByIndex = (index: number): ITimelineTrack | undefined => this.tracks.get(`track-${index}`);
}
