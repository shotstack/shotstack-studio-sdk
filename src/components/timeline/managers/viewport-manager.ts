import * as PIXI from "pixi.js";

import { TimelineLayout } from "../timeline-layout";

export interface ViewportState {
	x: number;
	y: number;
	zoom: number;
}

export class ViewportManager {
	private scrollX = 0;
	private scrollY = 0;
	private zoomLevel = 1;

	private viewport!: PIXI.Container;
	private rulerViewport!: PIXI.Container;
	private playheadContainer!: PIXI.Container;

	constructor(
		private layout: TimelineLayout,
		private trackLayer: PIXI.Container,
		private overlayLayer: PIXI.Container,
		private entityContainer: PIXI.Container,
		private onRender: () => void
	) {}

	public async setupViewport(): Promise<void> {
		// Create ruler viewport for horizontal scrolling
		this.rulerViewport = new PIXI.Container();
		this.rulerViewport.label = "ruler-viewport";
		this.overlayLayer.addChild(this.rulerViewport);

		// Create playhead container in overlay layer (above ruler)
		this.playheadContainer = new PIXI.Container();
		this.playheadContainer.label = "playhead-container";
		this.overlayLayer.addChild(this.playheadContainer);

		// Create main viewport for tracks
		this.viewport = new PIXI.Container();
		this.viewport.label = "viewport";

		// Add viewport to track layer for scrolling
		this.trackLayer.addChild(this.viewport);

		// Add our Entity container to viewport (this is where visual tracks will go)
		this.viewport.addChild(this.entityContainer);
	}

	public updateViewportTransform(): void {
		// Apply scroll transform using layout calculations
		const position = this.layout.calculateViewportPosition(this.scrollX, this.scrollY);
		this.viewport.position.set(position.x, position.y);
		this.viewport.scale.set(this.zoomLevel, this.zoomLevel);

		// Sync ruler horizontal scroll (no vertical scroll for ruler)
		this.rulerViewport.position.x = position.x;
		this.rulerViewport.scale.x = this.zoomLevel;

		// Sync playhead horizontal scroll
		this.playheadContainer.position.x = position.x;
		this.playheadContainer.scale.x = this.zoomLevel;
	}

	public setScroll(x: number, y: number): void {
		this.scrollX = x;
		this.scrollY = y;
		this.updateViewportTransform();
		this.onRender();
	}

	public setZoom(zoom: number): void {
		this.zoomLevel = Math.max(0.1, Math.min(10, zoom));
		this.updateViewportTransform();
		this.onRender();
	}

	public getViewport(): ViewportState {
		return {
			x: this.scrollX,
			y: this.scrollY,
			zoom: this.zoomLevel
		};
	}

	public getMainViewport(): PIXI.Container {
		return this.viewport;
	}

	public getRulerViewport(): PIXI.Container {
		return this.rulerViewport;
	}

	public getPlayheadContainer(): PIXI.Container {
		return this.playheadContainer;
	}
}