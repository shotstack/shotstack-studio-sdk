import { Size } from "@core/layouts/geometry";
import * as PIXI from "pixi.js";

import { TimelineTrack, TimelineRuler, TimelinePlayhead } from "../entities";
import { ITimelineRenderer, ITimelineTrack, ITimelineRuler, ITimelinePlayhead } from "../interfaces";
import { TimelineState, RenderLayer } from "../types";

/**
 * Handles all rendering for the timeline using PIXI.js
 */
export class TimelineRenderer implements ITimelineRenderer {
	private application: PIXI.Application;
	private layers: Map<string, PIXI.Container> = new Map();
	private size: Size;
	private tracks: Map<string, ITimelineTrack> = new Map();
	private ruler: ITimelineRuler | null = null;
	private playhead: ITimelinePlayhead | null = null;

	constructor(size: Size) {
		this.size = size;

		// Create PIXI application
		this.application = new PIXI.Application({
			width: size.width,
			height: size.height,
			backgroundColor: 0x1a1a1a,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			autoDensity: true
		});

		// Initialize default layers
		this.initializeLayers();
	}

	public async load(): Promise<void> {
		// Initialize ruler
		this.ruler = new TimelineRuler(this.size.width);
		await this.ruler.load();
		this.getLayer("overlay").addChild(this.ruler.getContainer());

		// Initialize playhead
		this.playhead = new TimelinePlayhead(this.size.height);
		await this.playhead.load();
		this.getLayer("playhead").addChild(this.playhead.getContainer());
	}

	public render(state: TimelineState): void {
		// Update ruler
		if (this.ruler) {
			this.ruler.setZoom(state.viewport.zoom);
			this.ruler.setScrollX(state.viewport.scrollX);
			this.ruler.draw();
		}

		// Update playhead
		if (this.playhead) {
			this.playhead.setTime(state.playback.currentTime);
			this.playhead.setPixelsPerSecond(state.viewport.zoom);
			this.playhead.setScrollX(state.viewport.scrollX);
			this.playhead.draw();
		}

		// Update tracks
		this.tracks.forEach(track => {
			track.draw();
		});

		// Render other elements
		this.renderBackground(state);
		this.renderSelection(state);
	}

	public clear(): void {
		this.layers.forEach(layer => {
			layer.removeChildren();
		});
	}

	public resize(width: number, height: number): void {
		this.size = { width, height };
		this.application.renderer.resize(width, height);
	}

	public createLayer(name: string, zIndex: number): void {
		if (this.layers.has(name)) {
			console.warn(`Layer "${name}" already exists`);
			return;
		}

		const layer = new PIXI.Container();
		layer.zIndex = zIndex;
		this.layers.set(name, layer);
		this.application.stage.addChild(layer);
		this.application.stage.sortChildren();
	}

	public getLayer(name: RenderLayer | string): PIXI.Container {
		const layer = this.layers.get(name);
		if (!layer) {
			throw new Error(`Layer "${name}" not found`);
		}
		return layer;
	}

	public removeLayer(name: string): void {
		const layer = this.layers.get(name);
		if (layer) {
			this.application.stage.removeChild(layer);
			this.layers.delete(name);
		}
	}

	public getApplication(): PIXI.Application {
		return this.application;
	}

	public getStage(): PIXI.Container {
		return this.application.stage;
	}

	public dispose(): void {
		// Dispose tracks
		this.tracks.forEach(track => track.dispose());
		this.tracks.clear();

		// Dispose ruler and playhead
		if (this.ruler) {
			this.ruler.dispose();
			this.ruler = null;
		}
		if (this.playhead) {
			this.playhead.dispose();
			this.playhead = null;
		}

		this.clear();
		this.application.destroy(true);
	}

	private initializeLayers(): void {
		// Create default layers in order
		this.createLayer("background", 0);
		this.createLayer("tracks", 1);
		this.createLayer("clips", 2);
		this.createLayer("selection", 3);
		this.createLayer("playhead", 4);
		this.createLayer("overlay", 5);
		this.createLayer("features", 6);
	}

	private renderBackground(state: TimelineState): void {
		const layer = this.getLayer("background");
		layer.removeChildren();

		// Draw background
		const bg = new PIXI.Graphics();
		bg.beginFill(0x1a1a1a);
		bg.drawRect(0, 0, this.size.width, this.size.height);
		bg.endFill();
		layer.addChild(bg);
	}

	private renderTracks(state: TimelineState): void {
		const layer = this.getLayer("tracks");
		layer.removeChildren();

		// Track rendering will be implemented when we have track entities
	}

	private renderClips(state: TimelineState): void {
		const layer = this.getLayer("clips");
		layer.removeChildren();

		// Clip rendering will be implemented when we have clip entities
	}

	private renderSelection(state: TimelineState): void {
		const layer = this.getLayer("selection");
		layer.removeChildren();

		// Selection rendering will be implemented with selection tool
	}

	// Track management methods
	public addTrack(trackId: string, index: number): ITimelineTrack {
		const track = new TimelineTrack(trackId, index);
		this.tracks.set(trackId, track);
		this.getLayer("tracks").addChild(track.getContainer());
		track.load();
		return track;
	}

	public removeTrack(trackId: string): void {
		const track = this.tracks.get(trackId);
		if (track) {
			this.getLayer("tracks").removeChild(track.getContainer());
			track.dispose();
			this.tracks.delete(trackId);
		}
	}

	public getTrack(trackId: string): ITimelineTrack | undefined {
		return this.tracks.get(trackId);
	}

	public getTracks(): ITimelineTrack[] {
		return Array.from(this.tracks.values());
	}
}
