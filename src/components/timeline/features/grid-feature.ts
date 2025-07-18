import { EventEmitter } from "@core/events/event-emitter";
import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";
import { TIMELINE_CONSTANTS, GridFeatureOptions } from "./types";

export class GridFeature extends Entity {
	public events: EventEmitter;
	private gridContainer: PIXI.Container;
	private gridLines: PIXI.Graphics;

	private pixelsPerSecond: number;
	private timelineDuration: number; // Duration in seconds
	private timelineHeight: number;
	private trackHeight: number;
	private isVisible = true;
	private theme?: TimelineTheme;

	constructor(options: GridFeatureOptions) {
		super();
		this.events = new EventEmitter();
		this.pixelsPerSecond = options.pixelsPerSecond;
		this.timelineDuration = options.timelineDuration;
		this.timelineHeight = options.timelineHeight;
		this.trackHeight = options.trackHeight;
		this.theme = options.theme;

		this.gridContainer = new PIXI.Container();
		this.gridLines = new PIXI.Graphics();
	}

	async load(): Promise<void> {
		this.setupGrid();
		this.draw();
	}

	private setupGrid(): void {
		this.gridContainer.label = "grid";
		this.gridContainer.addChild(this.gridLines);
		this.getContainer().addChild(this.gridContainer);
	}

	private drawGrid(): void {
		if (!this.isVisible) {
			this.gridLines.clear();
			return;
		}

		this.gridLines.clear();

		// Calculate width based on duration
		const extendedWidth = this.timelineDuration * this.pixelsPerSecond;

		// Vertical grid lines (time markers)
		const gridInterval = this.pixelsPerSecond > TIMELINE_CONSTANTS.GRID.ZOOM_THRESHOLD 
			? TIMELINE_CONSTANTS.GRID.INTERVAL_ZOOMED 
			: TIMELINE_CONSTANTS.GRID.INTERVAL_DEFAULT;
		const gridColor = this.theme?.colors.interaction.snapGuide || 0x333333;

		for (let time = 0; time <= this.timelineDuration; time += gridInterval) {
			const x = time * this.pixelsPerSecond;
			this.gridLines.rect(x, 0, TIMELINE_CONSTANTS.GRID.LINE_WIDTH, this.timelineHeight);
			this.gridLines.fill(gridColor);
		}

		// Horizontal grid lines (track separators)
		const trackCount = Math.ceil(this.timelineHeight / this.trackHeight);

		for (let track = 0; track <= trackCount; track += 1) {
			const y = track * this.trackHeight;
			this.gridLines.rect(0, y, extendedWidth, TIMELINE_CONSTANTS.GRID.LINE_WIDTH);
			this.gridLines.fill(gridColor);
		}
	}

	public updateGrid(pixelsPerSecond: number, timelineDuration: number, timelineHeight: number, trackHeight: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.timelineDuration = timelineDuration;
		this.timelineHeight = timelineHeight;
		this.trackHeight = trackHeight;
		this.draw();
	}

	public setVisible(visible: boolean): void {
		this.isVisible = visible;
		this.draw();
	}

	public isGridVisible(): boolean {
		return this.isVisible;
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Grid is static unless parameters change
	}

	public draw(): void {
		this.drawGrid();
	}

	public dispose(): void {
		this.gridContainer.removeChildren();
		this.events.clear("*");
	}
}