import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelineRuler } from "../types/timeline.interfaces";

/**
 * Timeline ruler showing time markers and scale
 */
export class TimelineRuler extends Entity implements ITimelineRuler {
	private graphics = new PIXI.Graphics();
	private labelsContainer = new PIXI.Container();
	private labels: PIXI.Text[] = [];
	private pixelsPerSecond = 100;
	private scrollX = 0;
	private height = 30;

	private readonly config = {
		backgroundColor: 0x1a1a1a,
		borderColor: 0x404040,
		majorTickColor: 0x808080,
		minorTickColor: 0x606060,
		labelColor: 0xcccccc,
		labelSize: 10,
		majorTickHeight: 10,
		minorTickHeight: 5,
		labelOffset: 2,
		minPixelsBetweenLabels: 60,
		intervals: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
	};

	constructor(private width: number) {
		super();
		this.getContainer().addChild(this.graphics, this.labelsContainer);
	}

	public async load(): Promise<void> {
		this.draw();
	}

	public update(__deltaTime: number, __elapsed: number): void {}

	public draw(): void {
		this.updateRuler();
	}

	public dispose(): void {
		[this.graphics, this.labelsContainer].forEach(item => {
			item.removeChildren();
			item.destroy();
		});
		this.labels.forEach(label => label.destroy());
		this.labels = [];
	}

	public setZoom(pixelsPerSecond: number): this {
		this.pixelsPerSecond = pixelsPerSecond;
		return this;
	}

	public setScrollX(scrollX: number): this {
		this.scrollX = scrollX;
		return this;
	}

	public setWidth(width: number): this {
		this.width = width;
		this.updateRuler();
		return this;
	}

	public getTimeAtPosition = (x: number): number => (x + this.scrollX) / this.pixelsPerSecond;
	public getPositionAtTime = (time: number): number => time * this.pixelsPerSecond - this.scrollX;

	private updateRuler(): void {
		this.clearGraphics();
		this.drawBackground();
		this.drawTimeMarkers();
	}

	private clearGraphics(): void {
		this.graphics.clear();
		this.labels.forEach(label => label.destroy());
		this.labels = [];
		this.labelsContainer.removeChildren();
	}

	private drawBackground(): void {
		const { backgroundColor, borderColor } = this.config;
		this.graphics
			.rect(0, 0, this.width, this.height)
			.fill({ color: backgroundColor })
			.moveTo(0, this.height)
			.lineTo(this.width, this.height)
			.stroke({ width: 1, color: borderColor });
	}

	private drawTimeMarkers(): void {
		const startTime = this.scrollX / this.pixelsPerSecond;
		const endTime = (this.scrollX + this.width) / this.pixelsPerSecond;
		const interval = this.getTimeInterval();
		let currentTime = Math.floor(startTime / interval) * interval;

		while (currentTime <= endTime) {
			const x = this.getPositionAtTime(currentTime);
			if (x >= 0 && x <= this.width) {
				this.drawMajorTick(x, currentTime);
				this.drawMinorTicks(currentTime, interval);
			}
			currentTime += interval;
		}
	}

	private drawMajorTick(x: number, time: number): void {
		const { majorTickColor, majorTickHeight, labelColor, labelSize, labelOffset } = this.config;

		this.graphics
			.moveTo(x, this.height - majorTickHeight)
			.lineTo(x, this.height)
			.stroke({ width: 1, color: majorTickColor });

		const label = new PIXI.Text({
			text: this.formatTime(time),
			style: { fontSize: labelSize, fill: labelColor }
		});
		label.anchor.set(0.5, 0);
		label.position.set(x, labelOffset);
		this.labels.push(label);
		this.labelsContainer.addChild(label);
	}

	private drawMinorTicks(majorTime: number, interval: number): void {
		const { minorTickColor, minorTickHeight } = this.config;
		const minorInterval = interval / 4;

		for (let i = 1; i < 4; i += 1) {
			const x = this.getPositionAtTime(majorTime + i * minorInterval);
			if (x >= 0 && x <= this.width) {
				this.graphics
					.moveTo(x, this.height - minorTickHeight)
					.lineTo(x, this.height)
					.stroke({ width: 1, color: minorTickColor });
			}
		}
	}

	private getTimeInterval(): number {
		const { minPixelsBetweenLabels, intervals } = this.config;
		const secondsPerLabel = minPixelsBetweenLabels / this.pixelsPerSecond;
		return intervals.find(interval => interval >= secondsPerLabel) || intervals[intervals.length - 1];
	}

	private formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const ms = Math.floor((seconds % 1) * 100);

		if (seconds < 1) return `0.${ms.toString().padStart(2, "0")}`;
		if (seconds < 60) return ms > 0 ? `${secs}.${ms.toString().padStart(2, "0")}` : `${secs}s`;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}
}
