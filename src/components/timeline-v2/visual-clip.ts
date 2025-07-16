import { Entity } from "@core/shared/entity";
import { ClipConfig } from "./types";
import * as PIXI from "pixi.js";

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
		mode: 'normal' | 'selected' | 'dragging' | 'resizing' | 'disabled';
		previewWidth?: number;
	} = { mode: 'normal' };

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
		container.cursor = 'pointer';
		
		container.addChild(this.background);
		container.addChild(this.graphics);
		container.addChild(this.text);
	}

	private setupGraphics(): void {
		// Set up text style
		this.text.style = new PIXI.TextStyle({
			fontSize: 12,
			fill: 0xffffff,
			fontWeight: 'bold',
			wordWrap: false,
			fontFamily: 'Arial, sans-serif'
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
		let alpha = 0.8;
		
		// Modify appearance based on state
		switch (this.visualState.mode) {
			case 'disabled':
				alpha = 0.5;
				break;
			case 'dragging':
				// Darken the color slightly during drag and make it more transparent
				color = this.darkenColor(color, 0.2);
				alpha = 0.7;
				break;
			case 'resizing':
				// Slightly lighten the color during resize to show preview
				color = this.lightenColor(color, 0.1);
				alpha = 0.9;
				break;
			case 'selected':
			case 'normal':
			default:
				// Keep default alpha and color
				break;
		}
		
		this.background.clear();
		this.background.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.background.fill({ color, alpha });
	}

	private drawClipBorder(width: number, height: number): void {
		const borderColor = this.getBorderColor();
		const isSelected = this.visualState.mode === 'selected';
		const borderWidth = isSelected ? this.BORDER_WIDTH * 2 : this.BORDER_WIDTH;
		
		this.graphics.clear();
		this.graphics.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.graphics.stroke({ width: borderWidth, color: borderColor });
		
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
			case 'video':
				return 0x4A90E2;
			case 'audio':
				return 0x7ED321;
			case 'image':
				return 0xF5A623;
			case 'text':
				return 0xD0021B;
			case 'shape':
				return 0x9013FE;
			case 'html':
				return 0x50E3C2;
			case 'luma':
				return 0xB8E986;
			default:
				return 0x8E8E93;
		}
	}

	private getBorderColor(): number {
		switch (this.visualState.mode) {
			case 'selected':
				return 0x007acc;
			case 'dragging':
				return 0x00ff00;
			case 'disabled':
				return 0x666666;
			case 'resizing':
				return 0x00ff00; // Green border for resize
			case 'normal':
			default:
				return 0x333333;
		}
	}

	private updateAppearance(): void {
		const container = this.getContainer();
		
		// Update opacity based on state
		switch (this.visualState.mode) {
			case 'disabled':
				container.alpha = 0.5;
				break;
			case 'dragging':
				container.alpha = 0.6; // Make it more noticeably transparent during drag
				break;
			default:
				container.alpha = 1.0;
				break;
		}
		
		// Also update the border color to show drag state
		this.updateSize(); // This will redraw with the new border color
	}

	private updateText(): void {
		// Get text content based on asset type
		const assetType = this.clipConfig.asset?.type;
		let displayText = '';
		
		switch (assetType) {
			case 'text':
				displayText = (this.clipConfig.asset as any).text || 'Text';
				break;
			case 'video':
				displayText = (this.clipConfig.asset as any).src ? 
					this.getFilenameFromSrc((this.clipConfig.asset as any).src) : 'Video';
				break;
			case 'audio':
				displayText = (this.clipConfig.asset as any).src ? 
					this.getFilenameFromSrc((this.clipConfig.asset as any).src) : 'Audio';
				break;
			case 'image':
				displayText = (this.clipConfig.asset as any).src ? 
					this.getFilenameFromSrc((this.clipConfig.asset as any).src) : 'Image';
				break;
			case 'shape':
				displayText = (this.clipConfig.asset as any).shape || 'Shape';
				break;
			case 'html':
				displayText = 'HTML';
				break;
			case 'luma':
				displayText = 'Luma';
				break;
			default:
				displayText = 'Clip';
		}
		
		this.text.text = displayText;
		
		// Ensure text fits within clip bounds
		const clipWidth = (this.clipConfig.length || 0) * this.options.pixelsPerSecond;
		const maxTextWidth = clipWidth - (this.CLIP_PADDING * 2);
		
		if (this.text.width > maxTextWidth) {
			// Truncate text if too long
			const ratio = maxTextWidth / this.text.width;
			const truncatedLength = Math.floor(displayText.length * ratio) - 3;
			this.text.text = displayText.substring(0, Math.max(1, truncatedLength)) + '...';
		}
	}

	private getFilenameFromSrc(src: string): string {
		// Extract filename from URL or path
		const parts = src.split('/');
		return parts[parts.length - 1] || src;
	}

	private darkenColor(color: number, factor: number): number {
		// Extract RGB components
		const r = (color >> 16) & 0xFF;
		const g = (color >> 8) & 0xFF;
		const b = color & 0xFF;
		
		// Darken each component
		const newR = Math.floor(r * (1 - factor));
		const newG = Math.floor(g * (1 - factor));
		const newB = Math.floor(b * (1 - factor));
		
		// Combine back to hex
		return (newR << 16) | (newG << 8) | newB;
	}

	private lightenColor(color: number, factor: number): number {
		// Extract RGB components
		const r = (color >> 16) & 0xFF;
		const g = (color >> 8) & 0xFF;
		const b = color & 0xFF;
		
		// Lighten each component
		const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
		const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
		const newB = Math.min(255, Math.floor(b + (255 - b) * factor));
		
		// Combine back to hex
		return (newR << 16) | (newG << 8) | newB;
	}


	// Public state management methods
	public setSelected(selected: boolean): void {
		if (selected) {
			this.visualState.mode = 'selected';
		} else if (this.visualState.mode === 'selected') {
			this.visualState.mode = 'normal';
		}
		this.updateVisualState();
	}

	public setDragging(dragging: boolean): void {
		if (dragging) {
			this.visualState.mode = 'dragging';
		} else if (this.visualState.mode === 'dragging') {
			this.visualState.mode = 'normal';
		}
		this.updateVisualState();
	}

	public setDisabled(disabled: boolean): void {
		if (disabled) {
			this.visualState.mode = 'disabled';
		} else if (this.visualState.mode === 'disabled') {
			this.visualState.mode = 'normal';
		}
		this.updateVisualState();
	}

	public setResizing(resizing: boolean): void {
		if (resizing) {
			this.visualState.mode = 'resizing';
		} else if (this.visualState.mode === 'resizing') {
			this.visualState.mode = 'normal';
			this.visualState.previewWidth = undefined;
		}
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

	public getSelected(): boolean {
		return this.visualState.mode === 'selected';
	}

	public getDragging(): boolean {
		return this.visualState.mode === 'dragging';
	}

	public getDisabled(): boolean {
		return this.visualState.mode === 'disabled';
	}

	public getResizing(): boolean {
		return this.visualState.mode === 'resizing';
	}

	public getPreviewWidth(): number | null {
		return this.visualState.previewWidth || null;
	}

	public getRightEdgeX(): number {
		const width = this.getEffectiveWidth();
		const startTime = this.clipConfig.start || 0;
		return (startTime * this.options.pixelsPerSecond) + width;
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