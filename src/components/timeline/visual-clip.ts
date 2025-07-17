import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { ClipConfig } from "./types";

export interface VisualClipOptions {
	pixelsPerSecond: number;
	trackHeight: number;
	trackIndex: number;
	clipIndex: number;
}

export class VisualClip extends Entity {
	private clipConfig: ClipConfig;
	private options: VisualClipOptions;
	private graphics: PIXI.Graphics;
	private background: PIXI.Graphics;
	private text: PIXI.Text;
	private visualState: {
		mode: "normal" | "selected" | "dragging" | "resizing" | "disabled";
		previewWidth?: number;
	} = { mode: "normal" };

	// Visual constants
	private readonly CLIP_PADDING = 4;
	private readonly BORDER_WIDTH = 2;
	private readonly CORNER_RADIUS = 4;

	constructor(clipConfig: ClipConfig, options: VisualClipOptions) {
		super();
		this.clipConfig = clipConfig;
		this.options = options;
		this.graphics = new PIXI.Graphics();
		this.background = new PIXI.Graphics();
		this.text = new PIXI.Text();

		this.setupContainer();
	}

	public async load(): Promise<void> {
		this.setupGraphics();
		this.updateVisualState();
	}

	private setupContainer(): void {
		const container = this.getContainer();

		// Set up container with label for later tool integration
		container.label = `clip-${this.options.trackIndex}-${this.options.clipIndex}`;

		// Make container interactive for click events
		container.interactive = true;
		container.cursor = "pointer";

		container.addChild(this.background);
		container.addChild(this.graphics);
		container.addChild(this.text);
	}

	private setupGraphics(): void {
		// Set up text style
		this.text.style = new PIXI.TextStyle({
			fontSize: 12,
			fill: 0xffffff,
			fontWeight: "bold",
			wordWrap: false,
			fontFamily: "Arial, sans-serif"
		});

		// Position text
		this.text.anchor.set(0, 0);
		this.text.x = this.CLIP_PADDING;
		this.text.y = this.CLIP_PADDING;
	}

	public updateFromConfig(newConfig: ClipConfig): void {
		this.clipConfig = newConfig;
		this.updateVisualState();
	}

	private updateVisualState(): void {
		this.updatePosition();
		this.updateSize();
		this.updateAppearance();
		this.updateText();
	}

	private updatePosition(): void {
		const container = this.getContainer();
		const startTime = this.clipConfig.start || 0;
		container.x = startTime * this.options.pixelsPerSecond;
		// Clip should be positioned at y=0 relative to its parent track
		// The track itself handles the trackIndex positioning
		container.y = 0;
	}

	private updateSize(): void {
		const width = this.getEffectiveWidth();
		const height = this.options.trackHeight;

		this.drawClipBackground(width, height);
		this.drawClipBorder(width, height);
	}

	private getEffectiveWidth(): number {
		// Use preview width if available, otherwise calculate from duration
		if (this.visualState.previewWidth !== undefined) {
			return this.visualState.previewWidth;
		}

		const duration = this.clipConfig.length || 0;
		const calculatedWidth = duration * this.options.pixelsPerSecond;
		return Math.max(50, calculatedWidth); // Minimum width of 50px
	}

	private drawClipBackground(width: number, height: number): void {
		let color = this.getClipColor();
		const styles = this.getStateStyles();

		// Apply color modifications based on state
		if (styles.colorFactor > 0) {
			color = this.lightenColor(color, styles.colorFactor);
		} else if (styles.colorFactor < 0) {
			color = this.darkenColor(color, Math.abs(styles.colorFactor));
		}

		this.background.clear();
		this.background.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.background.fill({ color, alpha: styles.alpha });
	}

	private drawClipBorder(width: number, height: number): void {
		const styles = this.getStateStyles();
		const isSelected = this.visualState.mode === "selected";
		const borderWidth = isSelected ? this.BORDER_WIDTH * 2 : this.BORDER_WIDTH;

		this.graphics.clear();
		this.graphics.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.graphics.stroke({ width: borderWidth, color: styles.borderColor });

		// Add selection highlight
		if (isSelected) {
			this.graphics.roundRect(
				-this.BORDER_WIDTH,
				-this.BORDER_WIDTH,
				width + this.BORDER_WIDTH * 2,
				height + this.BORDER_WIDTH * 2,
				this.CORNER_RADIUS
			);
			this.graphics.stroke({ width: 1, color: 0x007acc });
		}
	}

	private getClipColor(): number {
		// Color based on asset type
		const assetType = this.clipConfig.asset?.type;
		switch (assetType) {
			case "video":
				return 0x4a90e2;
			case "audio":
				return 0x7ed321;
			case "image":
				return 0xf5a623;
			case "text":
				return 0xd0021b;
			case "shape":
				return 0x9013fe;
			case "html":
				return 0x50e3c2;
			case "luma":
				return 0xb8e986;
			default:
				return 0x8e8e93;
		}
	}

	private updateAppearance(): void {
		const container = this.getContainer();

		// Apply container-level opacity (different from fill alpha)
		container.alpha = this.visualState.mode === "dragging" ? 0.6 : 1.0;

		// Redraw with new styles
		this.updateSize();
	}

	private updateText(): void {
		// Get text content based on asset type
		const assetType = this.clipConfig.asset?.type;
		let displayText = "";

		switch (assetType) {
			case "text":
				displayText = (this.clipConfig.asset as any).text || "Text";
				break;
			case "video":
				displayText = (this.clipConfig.asset as any).src ? this.getFilenameFromSrc((this.clipConfig.asset as any).src) : "Video";
				break;
			case "audio":
				displayText = (this.clipConfig.asset as any).src ? this.getFilenameFromSrc((this.clipConfig.asset as any).src) : "Audio";
				break;
			case "image":
				displayText = (this.clipConfig.asset as any).src ? this.getFilenameFromSrc((this.clipConfig.asset as any).src) : "Image";
				break;
			case "shape":
				displayText = (this.clipConfig.asset as any).shape || "Shape";
				break;
			case "html":
				displayText = "HTML";
				break;
			case "luma":
				displayText = "Luma";
				break;
			default:
				displayText = "Clip";
		}

		this.text.text = displayText;

		// Ensure text fits within clip bounds
		const clipWidth = (this.clipConfig.length || 0) * this.options.pixelsPerSecond;
		const maxTextWidth = clipWidth - this.CLIP_PADDING * 2;

		if (this.text.width > maxTextWidth) {
			// Truncate text if too long
			const ratio = maxTextWidth / this.text.width;
			const truncatedLength = Math.floor(displayText.length * ratio) - 3;
			this.text.text = `${displayText.substring(0, Math.max(1, truncatedLength))  }...`;
		}
	}

	private getFilenameFromSrc(src: string): string {
		// Extract filename from URL or path
		const parts = src.split("/");
		return parts[parts.length - 1] || src;
	}

	private darkenColor(color: number, factor: number): number {
		// Extract RGB components
		// eslint-disable-next-line no-bitwise
		const r = (color >> 16) & 0xff;
		// eslint-disable-next-line no-bitwise
		const g = (color >> 8) & 0xff;
		// eslint-disable-next-line no-bitwise
		const b = color & 0xff;

		// Darken each component
		const newR = Math.floor(r * (1 - factor));
		const newG = Math.floor(g * (1 - factor));
		const newB = Math.floor(b * (1 - factor));

		// Combine back to hex
		// eslint-disable-next-line no-bitwise
		return (newR << 16) | (newG << 8) | newB;
	}

	private lightenColor(color: number, factor: number): number {
		// Extract RGB components
		// eslint-disable-next-line no-bitwise
		const r = (color >> 16) & 0xff;
		// eslint-disable-next-line no-bitwise
		const g = (color >> 8) & 0xff;
		// eslint-disable-next-line no-bitwise
		const b = color & 0xff;

		// Lighten each component
		const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
		const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
		const newB = Math.min(255, Math.floor(b + (255 - b) * factor));

		// Combine back to hex
		// eslint-disable-next-line no-bitwise
		return (newR << 16) | (newG << 8) | newB;
	}

	private getStateStyles() {
		switch (this.visualState.mode) {
			case "disabled":
				return { alpha: 0.5, colorFactor: 0, borderColor: 0x666666 };
			case "dragging":
				return { alpha: 0.7, colorFactor: -0.2, borderColor: 0x00ff00 };
			case "resizing":
				return { alpha: 0.9, colorFactor: 0.1, borderColor: 0x00ff00 };
			case "selected":
				return { alpha: 1.0, colorFactor: 0, borderColor: 0x007acc };
			default:
				return { alpha: 1.0, colorFactor: 0, borderColor: 0x333333 };
		}
	}

	// Public state management methods
	public setSelected(selected: boolean): void {
		this.visualState.mode = selected ? "selected" : "normal";
		this.updateVisualState();
	}

	public setDragging(dragging: boolean): void {
		this.visualState.mode = dragging ? "dragging" : "normal";
		this.updateVisualState();
	}

	public setDisabled(disabled: boolean): void {
		this.visualState.mode = disabled ? "disabled" : "normal";
		this.updateVisualState();
	}

	public setResizing(resizing: boolean): void {
		this.visualState.mode = resizing ? "resizing" : "normal";
		if (!resizing) this.visualState.previewWidth = undefined;
		this.updateVisualState();
	}

	public setPreviewWidth(width: number | null): void {
		this.visualState.previewWidth = width || undefined;
		this.updateVisualState();
	}

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.options.pixelsPerSecond = pixelsPerSecond;
		this.updateVisualState();
	}

	// Getters
	public getClipConfig(): ClipConfig {
		return this.clipConfig;
	}

	public getOptions(): VisualClipOptions {
		return this.options;
	}

	public getVisualState() {
		return this.visualState;
	}

	public getSelected(): boolean {
		return this.visualState.mode === "selected";
	}

	public getDragging(): boolean {
		return this.visualState.mode === "dragging";
	}

	public getRightEdgeX(): number {
		const width = this.getEffectiveWidth();
		const startTime = this.clipConfig.start || 0;
		return startTime * this.options.pixelsPerSecond + width;
	}

	// Required Entity methods
	public update(_deltaTime: number, _elapsed: number): void {
		// VisualClip doesn't need frame-based updates
		// All updates are driven by state changes
	}

	public draw(): void {
		// Drawing happens in updateVisualState()
		// This is called when the clip needs to be redrawn
		this.updateVisualState();
	}

	public dispose(): void {
		// Clean up graphics resources
		this.background.destroy();
		this.graphics.destroy();
		this.text.destroy();
	}
}
