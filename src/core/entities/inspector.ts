import * as pixi from "pixi.js";

import { Entity } from "./entity";

type MemoryInfo = {
	totalHeapSize?: number;
	usedHeapSize?: number;
	heapSizeLimit?: number;
};

export class Inspector extends Entity {
	private static readonly Width = 250;
	private static readonly Height = 100;

	public fps: number;
	public playbackTime: number;
	public playbackDuration: number;
	public isPlaying: boolean;

	private background: pixi.Graphics | null;
	private text: pixi.Text | null;

	constructor() {
		super();

		this.background = null;
		this.text = null;

		this.fps = 0;
		this.playbackTime = 0;
		this.playbackDuration = 0;
		this.isPlaying = false;
	}

	public override async load(): Promise<void> {
		const background = new pixi.Graphics();
		background.fillStyle = { color: "#424242", alpha: 0.5 };
		background.rect(0, 0, Inspector.Width, Inspector.Height);
		background.fill();

		this.getContainer().addChild(background);
		this.background = background;

		const text = new pixi.Text();
		text.text = "";
		text.style = {
			fontFamily: "monospace",
			fontSize: 14,
			fill: "#ffffff",
			wordWrap: true,
			wordWrapWidth: Inspector.Width
		};

		this.getContainer().addChild(text);
		this.text = text;
	}

	public override update(_: number, __: number): void {
		if (!this.text) {
			return;
		}

		const memoryInfo = this.getMemoryInfo();

		const stats = [
			`FPS: ${this.fps}`,
			`Playback: ${(this.playbackTime / 1000).toFixed(2)}/${(this.playbackDuration / 1000).toFixed(2)}`,
			`Playing: ${this.isPlaying}`,
			`Total Heap Size: ${memoryInfo.totalHeapSize ? `${this.bytesToMegabytes(memoryInfo.totalHeapSize)}MB` : "N/A"}`,
			`Used Heap Size: ${memoryInfo.usedHeapSize ? `${this.bytesToMegabytes(memoryInfo.usedHeapSize)}MB` : "N/A"}`,
			`Heap Size Limit: ${memoryInfo.heapSizeLimit ? `${this.bytesToMegabytes(memoryInfo.heapSizeLimit)}MB` : "N/A"}`
		];

		this.text.text = stats.join("\n");
	}

	public override draw(): void {}

	public override dispose(): void {
		this.background?.destroy();
		this.background = null;

		this.text?.destroy();
		this.text = null;
	}

	private getMemoryInfo(): MemoryInfo {
		const memoryInfo: MemoryInfo = {};

		if (!("memory" in performance)) {
			return memoryInfo;
		}

		memoryInfo.totalHeapSize = (performance.memory as any).totalJSHeapSize;
		memoryInfo.usedHeapSize = (performance.memory as any).usedJSHeapSize;
		memoryInfo.heapSizeLimit = (performance.memory as any).jsHeapSizeLimit;

		return memoryInfo;
	}

	private bytesToMegabytes(bytes: number): number {
		return Math.round(bytes / 1024 / 1024);
	}
}
