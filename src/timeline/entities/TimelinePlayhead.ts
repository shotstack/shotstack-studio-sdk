import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelinePlayhead } from "../interfaces";

/**
 * Timeline playhead indicator showing current time position
 */
export class TimelinePlayhead extends Entity implements ITimelinePlayhead {
	private graphics: PIXI.Graphics;
	private handle: PIXI.Graphics;
	private time: number = 0;
	private pixelsPerSecond: number = 100;
	private scrollX: number = 0;
	private height: number;
	private visible: boolean = true;

	constructor(height: number) {
		super();
		this.height = height;

		// Create playhead line
		this.graphics = new PIXI.Graphics();
		this.getContainer().addChild(this.graphics);

		// Create playhead handle
		this.handle = new PIXI.Graphics();
		this.getContainer().addChild(this.handle);

		// Make handle interactive
		this.handle.eventMode = "static";
		this.handle.cursor = "pointer";
	}

	public async load(): Promise<void> {
		this.updatePlayhead();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Update position based on current time
		this.updatePosition();
	}

	public draw(): void {
		this.updatePlayhead();
	}

	public dispose(): void {
		this.graphics.clear();
		this.graphics.destroy();
		this.handle.clear();
		this.handle.destroy();
	}

	public setTime(time: number): void {
		this.time = Math.max(0, time);
		this.updatePosition();
	}

	public getTime(): number {
		return this.time;
	}

	public setVisible(visible: boolean): void {
		this.visible = visible;
		this.getContainer().visible = visible;
	}

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.updatePosition();
	}

	public setScrollX(scrollX: number): void {
		this.scrollX = scrollX;
		this.updatePosition();
	}

	public setHeight(height: number): void {
		this.height = height;
		this.updatePlayhead();
	}

	private updatePlayhead(): void {
		// Clear previous graphics
		this.graphics.clear();
		this.handle.clear();

		if (!this.visible) return;

		// Draw playhead line with PIXI v8 chaining syntax
		this.graphics
			.moveTo(0, 0)
			.lineTo(0, this.height)
			.stroke({ width: 2, color: 0xff0000 });

		// Draw playhead handle (triangle at top) with PIXI v8 chaining syntax
		this.handle
			.poly([0, 0, -6, -10, 6, -10])
			.fill({ color: 0xff0000 });

		// Make handle draggable area larger
		this.handle.hitArea = new PIXI.Rectangle(-10, -15, 20, 20);

		this.updatePosition();
	}

	private updatePosition(): void {
		const x = this.time * this.pixelsPerSecond - this.scrollX;
		this.getContainer().x = x;

		// Hide if outside visible area
		this.getContainer().visible = this.visible && x >= -10 && x <= 5000; // Assuming max width
	}
}
