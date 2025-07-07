import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ITimelineClip } from "../interfaces";

/**
 * Represents a clip in the timeline
 */
export class TimelineClip extends Entity implements ITimelineClip {
	private clipId: string;
	private trackId: string;
	private startTime: number;
	private duration: number;
	private selected: boolean = false;
	private graphics: PIXI.Graphics;
	private label: PIXI.Text;
	private pixelsPerSecond: number = 100;
	private clipColor: number = 0x4444ff;
	private clipData: any; // Will be replaced with proper type

	constructor(clipId: string, trackId: string, startTime: number, duration: number, clipData?: any) {
		super();
		this.clipId = clipId;
		this.trackId = trackId;
		this.startTime = startTime;
		this.duration = duration;
		this.clipData = clipData;

		// Create graphics for clip
		this.graphics = new PIXI.Graphics();
		this.getContainer().addChild(this.graphics);

		// Create label using PIXI v8 API
		this.label = new PIXI.Text({
			text: "",
			style: {
				fontSize: 12,
				fill: 0xffffff
			}
		});
		this.label.anchor.set(0, 0.5);
		this.getContainer().addChild(this.label);

		// Make interactive
		this.getContainer().eventMode = "static";
		this.getContainer().cursor = "pointer";
	}

	public async load(): Promise<void> {
		// Set clip color based on type if available
		if (this.clipData?.asset?.type) {
			this.clipColor = this.getColorForAssetType(this.clipData.asset.type);
		}

		// Set label text
		if (this.clipData?.asset?.text) {
			this.label.text = this.clipData.asset.text;
		} else if (this.clipData?.asset?.src) {
			// Extract filename from src
			const filename = this.clipData.asset.src.split("/").pop() || "";
			this.label.text = filename;
		}

		this.updateVisuals();
	}

	public update(_deltaTime: number, _elapsed: number): void {
		// Update any animations or states
	}

	public draw(): void {
		this.updateVisuals();
	}

	public dispose(): void {
		this.graphics.clear();
		this.graphics.destroy();
		this.label.destroy();
	}

	public getClipId(): string {
		return this.clipId;
	}

	public getTrackId(): string {
		return this.trackId;
	}

	public getStartTime(): number {
		return this.startTime;
	}

	public getDuration(): number {
		return this.duration;
	}

	public getEndTime(): number {
		return this.startTime + this.duration;
	}

	public setStartTime(time: number): void {
		this.startTime = Math.max(0, time);
		this.updatePosition();
	}

	public setDuration(duration: number): void {
		this.duration = Math.max(0.1, duration); // Minimum duration
		this.updateVisuals();
	}

	public getSelected(): boolean {
		return this.selected;
	}

	public setSelected(selected: boolean): void {
		this.selected = selected;
		this.updateVisuals();
	}

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.pixelsPerSecond = pixelsPerSecond;
		this.updateVisuals();
	}

	private updateVisuals(): void {
		this.graphics.clear();

		const width = this.duration * this.pixelsPerSecond;
		const height = 50; // Fixed height for clips
		const cornerRadius = 4;

		// Draw clip background using PIXI v8 API
		this.graphics
			.roundRect(0, 5, width, height, cornerRadius)
			.fill({ color: this.clipColor, alpha: 0.8 });

		// Draw selection border if selected
		if (this.selected) {
			this.graphics
				.roundRect(-1, 4, width + 2, height + 2, cornerRadius)
				.stroke({ width: 2, color: 0xffff00 });
		}

		// Update label position and truncate if needed
		this.label.x = 5;
		this.label.y = 30;

		// Truncate label if it's too wide
		const maxWidth = width - 10;
		if (this.label.width > maxWidth && maxWidth > 0) {
			const originalText = this.label.text;
			let truncated = originalText;
			while (this.label.width > maxWidth && truncated.length > 0) {
				truncated = truncated.slice(0, -1);
				this.label.text = `${truncated  }...`;
			}
		}

		this.updatePosition();
	}

	private updatePosition(): void {
		this.getContainer().x = this.startTime * this.pixelsPerSecond;
	}

	private getColorForAssetType(type: string): number {
		const colors: Record<string, number> = {
			video: 0x4444ff,
			audio: 0x44ff44,
			image: 0xff44ff,
			text: 0xffaa44,
			html: 0x44ffff,
			luma: 0xff4444,
			shape: 0xaaaa44
		};

		return colors[type] || 0x888888;
	}
}
