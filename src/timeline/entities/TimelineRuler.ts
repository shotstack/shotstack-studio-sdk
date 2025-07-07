import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelineRuler } from "../interfaces";

/**
 * Timeline ruler showing time markers and scale
 */
export class TimelineRuler extends Entity implements ITimelineRuler {
	private graphics: PIXI.Graphics;
	private labelsContainer: PIXI.Container;
	private pixelsPerSecond: number = 100;
	private scrollX: number = 0;
	private width: number;
	private height: number = 30;
	private labels: PIXI.Text[] = [];

	constructor(width: number) {
		super();
		this.width = width;

		// Create graphics for ruler
		this.graphics = new PIXI.Graphics();
		this.getContainer().addChild(this.graphics);

		// Create container for time labels
		this.labelsContainer = new PIXI.Container();
		this.getContainer().addChild(this.labelsContainer);
	}

	public async load(): Promise<void> {
		this.updateRuler();
	}

	public update(deltaTime: number, elapsed: number): void {
		// Ruler is mostly static, update only if needed
	}

	public draw(): void {
		this.updateRuler();
	}

	public dispose(): void {
		this.graphics.clear();
		this.graphics.destroy();

		// Dispose all labels
		this.labels.forEach(label => label.destroy());
		this.labels = [];

		this.labelsContainer.removeChildren();
		this.labelsContainer.destroy();
	}

	public setZoom(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.updateRuler();
	}

	public setScrollX(scrollX: number): void {
		this.scrollX = scrollX;
		this.updateRuler();
	}

	public getTimeAtPosition(x: number): number {
		return (x + this.scrollX) / this.pixelsPerSecond;
	}

	public getPositionAtTime(time: number): number {
		return time * this.pixelsPerSecond - this.scrollX;
	}

	public setWidth(width: number): void {
		this.width = width;
		this.updateRuler();
	}

	private updateRuler(): void {
		this.graphics.clear();

		// Draw ruler background
		this.graphics.beginFill(0x1a1a1a);
		this.graphics.drawRect(0, 0, this.width, this.height);
		this.graphics.endFill();

		// Draw bottom border
		this.graphics.lineStyle(1, 0x404040);
		this.graphics.moveTo(0, this.height);
		this.graphics.lineTo(this.width, this.height);

		// Clear existing labels
		this.labels.forEach(label => label.destroy());
		this.labels = [];
		this.labelsContainer.removeChildren();

		// Calculate time range visible
		const startTime = this.scrollX / this.pixelsPerSecond;
		const endTime = (this.scrollX + this.width) / this.pixelsPerSecond;

		// Determine appropriate interval based on zoom level
		const interval = this.getTimeInterval();

		// Draw ticks and labels
		let currentTime = Math.floor(startTime / interval) * interval;

		while (currentTime <= endTime) {
			const x = this.getPositionAtTime(currentTime);

			if (x >= 0 && x <= this.width) {
				// Draw major tick
				this.graphics.lineStyle(1, 0x808080);
				this.graphics.moveTo(x, this.height - 10);
				this.graphics.lineTo(x, this.height);

				// Create time label
				const label = new PIXI.Text(this.formatTime(currentTime), {
					fontSize: 10,
					fill: 0xcccccc
				});
				label.anchor.set(0.5, 0);
				label.x = x;
				label.y = 2;

				this.labels.push(label);
				this.labelsContainer.addChild(label);

				// Draw minor ticks
				const minorInterval = interval / 4;
				for (let i = 1; i < 4; i += 1) {
					const minorTime = currentTime + i * minorInterval;
					const minorX = this.getPositionAtTime(minorTime);

					if (minorX >= 0 && minorX <= this.width) {
						this.graphics.lineStyle(1, 0x606060);
						this.graphics.moveTo(minorX, this.height - 5);
						this.graphics.lineTo(minorX, this.height);
					}
				}
			}

			currentTime += interval;
		}
	}

	private getTimeInterval(): number {
		// Calculate appropriate interval based on pixels per second
		const minPixelsBetweenLabels = 60;
		const secondsPerLabel = minPixelsBetweenLabels / this.pixelsPerSecond;

		// Find the nearest "nice" interval
		const intervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];

		for (const interval of intervals) {
			if (interval >= secondsPerLabel) {
				return interval;
			}
		}

		return 600; // 10 minutes as fallback
	}

	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const fraction = Math.floor((seconds % 1) * 100);

		if (seconds < 1) {
			// Show milliseconds for sub-second times
			return `0.${fraction.toString().padStart(2, "0")}`;
		}
		if (seconds < 60) {
			// Show seconds with optional fraction
			return fraction > 0 ? `${secs}.${fraction.toString().padStart(2, "0")}` : `${secs}s`;
		}
		// Show minutes:seconds
		return `${minutes}:${secs.toString().padStart(2, "0")}`;
	}
}
