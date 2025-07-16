import { Entity } from "@core/shared/entity";
import { ClipSchema } from "@core/schemas/clip";
import * as PIXI from "pixi.js";
import { z } from "zod";

type ClipConfig = z.infer<typeof ClipSchema>;

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
	private isSelected: boolean = false;
	private isDragging: boolean = false;
	private isDisabled: boolean = false;

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
		container.y = this.options.trackIndex * this.options.trackHeight;
	}

	private updateSize(): void {
		const duration = this.clipConfig.length || 0;
		const width = Math.max(50, duration * this.options.pixelsPerSecond); // Minimum width
		const height = this.options.trackHeight;

		this.drawClipBackground(width, height);
		this.drawClipBorder(width, height);
	}

	private drawClipBackground(width: number, height: number): void {
		const color = this.getClipColor();
		
		this.background.clear();
		this.background.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.background.fill({ color, alpha: this.isDisabled ? 0.5 : 0.8 });
	}

	private drawClipBorder(width: number, height: number): void {
		const borderColor = this.getBorderColor();
		const borderWidth = this.isSelected ? this.BORDER_WIDTH * 2 : this.BORDER_WIDTH;
		
		this.graphics.clear();
		this.graphics.roundRect(0, 0, width, height, this.CORNER_RADIUS);
		this.graphics.stroke({ width: borderWidth, color: borderColor });
		
		// Add selection highlight
		if (this.isSelected) {
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
		if (this.isSelected) {
			return 0x007acc;
		}
		if (this.isDragging) {
			return 0x00ff00;
		}
		if (this.isDisabled) {
			return 0x666666;
		}
		return 0x333333;
	}

	private updateAppearance(): void {
		const container = this.getContainer();
		
		// Update opacity based on state
		if (this.isDisabled) {
			container.alpha = 0.5;
		} else if (this.isDragging) {
			container.alpha = 0.8;
		} else {
			container.alpha = 1.0;
		}
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


	// Public state management methods
	public setSelected(selected: boolean): void {
		this.isSelected = selected;
		this.updateVisualState();
	}

	public setDragging(dragging: boolean): void {
		this.isDragging = dragging;
		this.updateVisualState();
	}

	public setDisabled(disabled: boolean): void {
		this.isDisabled = disabled;
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
		return this.isSelected;
	}

	public getDragging(): boolean {
		return this.isDragging;
	}

	public getDisabled(): boolean {
		return this.isDisabled;
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