import { Entity } from "@core/shared/entity";
import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";
import { CLIP_CONSTANTS } from "../constants";
import { SelectionOverlayRenderer } from "../managers/selection-overlay-renderer";
import { getAssetDisplayName, TimelineAsset } from "../types/assets";
import { ClipConfig } from "../types/timeline";

export interface VisualClipOptions {
	pixelsPerSecond: number;
	trackHeight: number;
	trackIndex: number;
	clipIndex: number;
	theme: TimelineTheme;
	selectionRenderer?: SelectionOverlayRenderer;
}

export class VisualClip extends Entity {
	private clipConfig: ClipConfig;
	private options: VisualClipOptions;
	private graphics: PIXI.Graphics;
	private background: PIXI.Graphics;
	private text: PIXI.Text;
	private selectionRenderer: SelectionOverlayRenderer | undefined;
	private lastGlobalX: number = -1;
	private lastGlobalY: number = -1;
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
		this.selectionRenderer = options.selectionRenderer;
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
		this.updateAppearance();
		this.updateSize();
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
		const color = this.getClipColor();
		const styles = this.getStateStyles();

		this.background.clear();
		this.background.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.background.fill({ color, alpha: styles.alpha });
	}

	private drawClipBorder(width: number, height: number): void {
		const styles = this.getStateStyles();
		
		// Always draw the basic border in the clip container
		const borderWidth = this.BORDER_WIDTH;
		this.graphics.clear();
		this.graphics.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.graphics.stroke({ width: borderWidth, color: styles.borderColor });

		// Handle selection highlight via renderer
		this.updateSelectionState(width, height);
	}

	private updateSelectionState(width: number, height: number): void {
		if (!this.selectionRenderer) return;

		const isSelected = this.visualState.mode === "selected";
		const clipId = this.getClipId();
		
		if (!isSelected) {
			this.selectionRenderer.clearSelection(clipId);
			return;
		}

		// Calculate global position only if position has changed
		const container = this.getContainer();
		const globalPos = container.toGlobal(new PIXI.Point(0, 0));
		
		// Convert to overlay coordinates
		const overlayContainer = this.selectionRenderer.getOverlay();
		const overlayPos = overlayContainer.toLocal(globalPos);
		
		// Update selection via renderer
		this.selectionRenderer.renderSelection(clipId, {
			x: overlayPos.x,
			y: overlayPos.y,
			width,
			height,
			cornerRadius: this.CORNER_RADIUS,
			borderWidth: this.BORDER_WIDTH
		}, isSelected);
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


	private getStateStyles() {
		const {theme} = this.options;
		const disabledOpacity = theme.opacity?.disabled || CLIP_CONSTANTS.DISABLED_OPACITY;
		const dragOpacity = theme.opacity?.drag || CLIP_CONSTANTS.DRAG_OPACITY;
		
		switch (this.visualState.mode) {
			case "disabled":
				return { alpha: disabledOpacity, borderColor: theme.colors.interaction.hover };
			case "dragging":
				return { alpha: dragOpacity, borderColor: theme.colors.interaction.drag };
			case "resizing":
				return { alpha: CLIP_CONSTANTS.RESIZE_OPACITY, borderColor: theme.colors.interaction.dropZone };
			case "selected":
				return { alpha: CLIP_CONSTANTS.DEFAULT_ALPHA, borderColor: theme.colors.interaction.selected };
			default:
				return { alpha: CLIP_CONSTANTS.DEFAULT_ALPHA, borderColor: theme.colors.structure.border };
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
		
		// Update selection state with new dimensions
		if (this.visualState.mode === "selected") {
			const width = this.getEffectiveWidth();
			const height = this.options.trackHeight;
			this.updateSelectionState(width, height);
		}
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
	
	public getClipId(): string {
		return `${this.options.trackIndex}-${this.options.clipIndex}`;
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
		// Update selection position if selected and position has changed
		if (this.visualState.mode === "selected" && this.selectionRenderer) {
			const container = this.getContainer();
			const globalPos = container.toGlobal(new PIXI.Point(0, 0));
			
			// Check if position has actually changed to avoid unnecessary updates
			if (globalPos.x !== this.lastGlobalX || globalPos.y !== this.lastGlobalY) {
				this.lastGlobalX = globalPos.x;
				this.lastGlobalY = globalPos.y;
				
				const width = this.getEffectiveWidth();
				const height = this.options.trackHeight;
				this.updateSelectionState(width, height);
			}
		}
	}


	public draw(): void {
		// Draw is called by the Entity system
		// Currently empty as updates happen immediately via state changes
		// This prevents redundant drawing when draw() is called repeatedly
	}

	public dispose(): void {
		// Clean up selection via renderer
		if (this.selectionRenderer) {
			this.selectionRenderer.clearSelection(this.getClipId());
		}
		
		// Clean up graphics resources
		this.background.destroy();
		this.graphics.destroy();
		this.text.destroy();
	}
}
