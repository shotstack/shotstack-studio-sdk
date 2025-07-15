import { Clip } from "@core/schemas/clip";
import { Entity } from "@core/shared/entity";
import { Theme } from "@core/theme/theme-context";
import * as PIXI from "pixi.js";

import { ITimelineClip } from "../types/timeline.interfaces";

/**
 * Represents a clip in the timeline
 */
export class TimelineClip extends Entity implements ITimelineClip {
	private clipId: string;
	private trackId: string;
	private startTime: number;
	private duration: number;
	private selected: boolean = false;
	private hovered: boolean = false;
	private graphics: PIXI.Graphics;
	private label: PIXI.Text;
	private pixelsPerSecond: number = 100;
	private clipColor: number = 0x4444ff;
	private clipData: Clip | undefined;

	private static readonly ASSET_COLORS: Record<string, number> = {
		video: 0x4444ff,
		audio: 0x44ff44,
		image: 0xff44ff,
		text: 0xffaa44,
		html: 0x44ffff,
		luma: 0xff4444,
		shape: 0xaaaa44
	};

	private readonly VISUAL = {
		height: Theme.dimensions.clip.height,
		cornerRadius: Theme.dimensions.clip.cornerRadius,
		alpha: Theme.opacity.clip,
		selectionColor: Theme.colors.ui.selection,
		labelPaddingX: Theme.dimensions.clip.labelPaddingX,
		labelY: Theme.dimensions.clip.labelOffsetY,
		clipY: Theme.dimensions.clip.offsetY
	} as const;

	constructor(clipId: string, trackId: string, startTime: number, duration: number, clipData?: Clip) {
		super();
		this.clipId = clipId;
		this.trackId = trackId;
		this.startTime = startTime;
		this.duration = duration;
		this.clipData = clipData;

		// Set container label for identification by event delegation
		this.getContainer().label = clipId;

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

		// Add hover event listeners
		this.getContainer().on("pointerover", this.onPointerOver, this);
		this.getContainer().on("pointerout", this.onPointerOut, this);
	}

	public async load(): Promise<void> {
		this.updateColorFromAsset();
		this.updateLabelFromAsset();
		this.updateVisuals();
	}

	public update(__deltaTime: number, __elapsed: number): void {
		// Update any animations or states
	}

	public draw(): void {
		this.updateVisuals();
	}

	public dispose(): void {
		// Remove event listeners
		this.getContainer().off("pointerover", this.onPointerOver, this);
		this.getContainer().off("pointerout", this.onPointerOut, this);
		
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

	public setStart(time: number): void {
		this.setStartTime(time);
	}

	public setClipData(clipData: Clip): void {
		this.clipData = clipData;
		this.updateColorFromAsset();
		this.updateLabelFromAsset();
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

	private onPointerOver(): void {
		if (!this.selected) {
			this.hovered = true;
			this.updateVisuals();
		}
	}

	private onPointerOut(): void {
		this.hovered = false;
		this.updateVisuals();
	}

	private updateVisuals(): void {
		this.graphics.clear();

		const width = this.duration * this.pixelsPerSecond;
		const { height, cornerRadius, alpha, selectionColor, labelPaddingX, labelY, clipY } = this.VISUAL;

		// Draw clip background using PIXI v8 API
		this.graphics.roundRect(0, clipY, width, height, cornerRadius).fill({ color: this.clipColor, alpha });

		// Draw selection/hover border
		if (this.selected || this.hovered) {
			const strokeWidth = 2;
			const strokeOffset = 1;
			const selectionRadius = cornerRadius + strokeOffset + strokeWidth / 2;
			this.graphics.roundRect(-strokeOffset, clipY - strokeOffset, width + strokeOffset * 2, height + strokeOffset * 2, selectionRadius).stroke({ width: strokeWidth, color: selectionColor });
		}

		// Update label position and truncate if needed
		this.label.x = labelPaddingX;
		this.label.y = labelY;

		// Truncate label if it's too wide
		const maxWidth = width - labelPaddingX * 2;
		if (this.label.width > maxWidth && maxWidth > 0) {
			const originalText = this.label.text;
			let truncated = originalText;
			while (this.label.width > maxWidth && truncated.length > 0) {
				truncated = truncated.slice(0, -1);
				this.label.text = `${truncated}...`;
			}
		}

		this.updatePosition();
	}

	private updatePosition(): void {
		this.getContainer().x = this.startTime * this.pixelsPerSecond;
	}

	private updateColorFromAsset(): void {
		if (this.clipData?.asset?.type) {
			const assetType = this.clipData.asset.type as keyof typeof Theme.colors.clips;
			this.clipColor = Theme.colors.clips[assetType] || Theme.colors.clips.default;
		} else {
			this.clipColor = Theme.colors.clips.default;
		}
	}

	private updateLabelFromAsset(): void {
		if (!this.clipData?.asset) return;

		const { asset } = this.clipData;
		if (asset.type === "text" && "text" in asset) {
			this.label.text = asset.text;
		} else if ("src" in asset) {
			this.label.text = asset.src.split("/").pop() || "";
		}
	}
}
