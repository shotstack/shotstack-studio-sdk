import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../core/theme";

import { CLIP_CONSTANTS, COLOR_FACTORS } from "./constants";
import { ClipConfig } from "./types";
import { getAssetDisplayName, TimelineAsset } from "./types/assets";

export interface VisualClipOptions {
	pixelsPerSecond: number;
	trackHeight: number;
	trackIndex: number;
	clipIndex: number;
	theme: TimelineTheme;
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

	// Visual constants (some from theme)
	private readonly CLIP_PADDING = CLIP_CONSTANTS.PADDING;
	private get BORDER_WIDTH() { return this.options.theme.dimensions?.borderWidth || CLIP_CONSTANTS.BORDER_WIDTH; }
	private get CORNER_RADIUS() { return this.options.theme.dimensions?.clipRadius || CLIP_CONSTANTS.CORNER_RADIUS; }

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
		// Set up text style using theme colors
		this.text.style = new PIXI.TextStyle({
			fontSize: CLIP_CONSTANTS.TEXT_FONT_SIZE,
			fill: this.options.theme.colors.ui.text,
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

	private setVisualState(updates: Partial<typeof this.visualState>): void {
		// Create new state object instead of mutating
		this.visualState = {
			...this.visualState,
			...updates
		};
		this.updateVisualState();
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
		return Math.max(CLIP_CONSTANTS.MIN_WIDTH, calculatedWidth);
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
		const borderWidth = isSelected ? this.BORDER_WIDTH * CLIP_CONSTANTS.SELECTED_BORDER_MULTIPLIER : this.BORDER_WIDTH;

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
			this.graphics.stroke({ width: 1, color: this.options.theme.colors.interaction.focus });
		}
	}

	private getClipColor(): number {
		// Color based on asset type using theme
		const assetType = this.clipConfig.asset?.type;
		const themeAssets = this.options.theme.colors.assets;
		
		switch (assetType) {
			case "video":
				return themeAssets.video;
			case "audio":
				return themeAssets.audio;
			case "image":
				return themeAssets.image;
			case "text":
				return themeAssets.text;
			case "shape":
				return themeAssets.shape;
			case "html":
				return themeAssets.html;
			case "luma":
				return themeAssets.luma;
			default:
				// Handle transition and other unknown types
				if (assetType === "transition") {
					return themeAssets.transition;
				}
				return themeAssets.default;
		}
	}

	private updateAppearance(): void {
		const container = this.getContainer();

		// Apply container-level opacity using theme values
		const dragOpacity = this.options.theme.opacity?.drag || CLIP_CONSTANTS.DRAG_OPACITY;
		container.alpha = this.visualState.mode === "dragging" ? dragOpacity : CLIP_CONSTANTS.DEFAULT_ALPHA;

		// Redraw with new styles
		this.updateSize();
	}

	private updateText(): void {
		// Get text content using type-safe helper
		const displayText = this.clipConfig.asset ? 
			getAssetDisplayName(this.clipConfig.asset as TimelineAsset) : 
			"Clip";

		this.text.text = displayText;

		// Ensure text fits within clip bounds
		const clipWidth = (this.clipConfig.length || 0) * this.options.pixelsPerSecond;
		const maxTextWidth = clipWidth - this.CLIP_PADDING * 2;

		if (this.text.width > maxTextWidth) {
			// Truncate text if too long
			const ratio = maxTextWidth / this.text.width;
			const truncatedLength = Math.floor(displayText.length * ratio) - CLIP_CONSTANTS.TEXT_TRUNCATE_SUFFIX_LENGTH;
			this.text.text = `${displayText.substring(0, Math.max(1, truncatedLength))}...`;
		}
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
		const {theme} = this.options;
		const disabledOpacity = theme.opacity?.disabled || CLIP_CONSTANTS.DISABLED_OPACITY;
		const hoverOpacity = theme.opacity?.hover || CLIP_CONSTANTS.HOVER_OPACITY;
		
		switch (this.visualState.mode) {
			case "disabled":
				return { alpha: disabledOpacity, colorFactor: 0, borderColor: theme.colors.interaction.hover };
			case "dragging":
				return { alpha: hoverOpacity, colorFactor: COLOR_FACTORS.DARKEN_DRAG, borderColor: theme.colors.interaction.drag };
			case "resizing":
				return { alpha: CLIP_CONSTANTS.RESIZE_OPACITY, colorFactor: COLOR_FACTORS.LIGHTEN_RESIZE, borderColor: theme.colors.interaction.dropZone };
			case "selected":
				return { alpha: CLIP_CONSTANTS.DEFAULT_ALPHA, colorFactor: 0, borderColor: theme.colors.interaction.selected };
			default:
				return { alpha: CLIP_CONSTANTS.DEFAULT_ALPHA, colorFactor: 0, borderColor: theme.colors.structure.border };
		}
	}

	// Public state management methods
	public setSelected(selected: boolean): void {
		this.setVisualState({ mode: selected ? "selected" : "normal" });
	}

	public setDragging(dragging: boolean): void {
		this.setVisualState({ mode: dragging ? "dragging" : "normal" });
	}

	public setDisabled(disabled: boolean): void {
		this.setVisualState({ mode: disabled ? "disabled" : "normal" });
	}

	public setResizing(resizing: boolean): void {
		this.setVisualState({
			mode: resizing ? "resizing" : "normal",
			...(resizing ? {} : { previewWidth: undefined })
		});
	}

	public setPreviewWidth(width: number | null): void {
		this.setVisualState({ previewWidth: width || undefined });
	}

	public setPixelsPerSecond(pixelsPerSecond: number): void {
		this.updateOptions({ pixelsPerSecond });
	}

	public updateOptions(updates: Partial<VisualClipOptions>): void {
		// Create new options object with updates
		this.options = {
			...this.options,
			...updates
		};
		this.updateVisualState();
	}

	// Getters
	public getClipConfig(): ClipConfig {
		return this.clipConfig;
	}

	public getOptions(): VisualClipOptions {
		// Return a defensive copy to prevent external mutations
		return { ...this.options };
	}

	public getVisualState(): { mode: "normal" | "selected" | "dragging" | "resizing" | "disabled"; previewWidth?: number } {
		// Return a defensive copy to prevent external mutations
		return { ...this.visualState };
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
