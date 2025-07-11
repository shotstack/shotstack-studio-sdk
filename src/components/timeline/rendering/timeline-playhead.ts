import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelinePlayhead } from "../types/timeline.interfaces";

/**
 * Timeline playhead indicator showing current time position
 */
export class TimelinePlayhead extends Entity implements ITimelinePlayhead {
	private graphics!: PIXI.Graphics;
	private handle!: PIXI.Graphics;
	private time = 0;
	private pixelsPerSecond = 100;
	private scrollX = 0;
	private height: number;
	private visible = true;

	private readonly config = {
		color: 0xff0000,
		lineWidth: 2,
		handle: { width: 12, height: 10 },
		hitAreaPadding: 4,
		visibilityBounds: { min: -10, max: 5000 }
	};

	constructor(height: number) {
		super();
		this.height = height;
		this.setupGraphics();
	}

	private setupGraphics(): void {
		this.graphics = new PIXI.Graphics();
		this.handle = new PIXI.Graphics();
		this.handle.eventMode = "static";
		this.handle.cursor = "pointer";
		this.getContainer().addChild(this.graphics, this.handle);
	}

	public async load(): Promise<void> {
		this.draw();
	}

	public update(): void {} // Position updates happen via setters

	public draw(): void {
		this.updatePlayhead();
	}

	public dispose(): void {
		[this.graphics, this.handle].forEach(g => {
			g?.clear();
			g?.destroy();
		});
	}

	public setTime(time: number): this {
		this.time = Math.max(0, time);
		this.updatePosition();
		return this;
	}

	public getTime(): number {
		return this.time;
	}

	public setVisible(visible: boolean): this {
		this.visible = visible;
		this.getContainer().visible = visible;
		return this;
	}

	public setPixelsPerSecond(pixelsPerSecond: number): this {
		this.pixelsPerSecond = pixelsPerSecond;
		this.updatePosition();
		return this;
	}

	public setScrollX(scrollX: number): this {
		this.scrollX = scrollX;
		this.updatePosition();
		return this;
	}

	public setHeight(height: number): this {
		this.height = height;
		this.updatePlayhead();
		return this;
	}

	private updatePlayhead(): void {
		this.graphics.clear();
		this.handle.clear();

		const { color, lineWidth, handle, hitAreaPadding } = this.config;

		// Draw playhead line
		this.graphics.moveTo(0, 0).lineTo(0, this.height).stroke({ width: lineWidth, color });

		// Draw handle (triangle)
		const halfWidth = handle.width / 2;
		this.handle.poly([0, 0, -halfWidth, -handle.height, halfWidth, -handle.height]).fill({ color });

		// Set hit area
		this.handle.hitArea = new PIXI.Rectangle(
			-halfWidth - hitAreaPadding,
			-handle.height - hitAreaPadding,
			handle.width + hitAreaPadding * 2,
			handle.height + hitAreaPadding * 2
		);

		this.updatePosition();
	}

	private updatePosition(): void {
		const x = this.time * this.pixelsPerSecond - this.scrollX;
		this.getContainer().x = x;
		this.getContainer().visible = this.visible && x >= this.config.visibilityBounds.min && x <= this.config.visibilityBounds.max;
	}
}
