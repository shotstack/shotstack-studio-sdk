import * as PIXI from 'pixi.js';
import { TimelineTheme } from '../../../../core/theme';
import { TOOLBAR_CONSTANTS } from '../constants';
import { ButtonState, IconType } from '../types';
import { IconFactory } from '../icons/icon-factory';

export interface ToolbarButtonOptions {
	size?: number;
	onClick: () => void;
	tooltip?: string;
	iconType?: IconType;
	alternateIconType?: IconType;
	theme: TimelineTheme;
}

export class ToolbarButton extends PIXI.Container {
	private background: PIXI.Graphics;
	private hoverBackground: PIXI.Graphics;
	private icon?: PIXI.Graphics;
	private alternateIcon?: PIXI.Graphics;
	private state: ButtonState = {
		isHovering: false,
		isPressed: false,
		isActive: false
	};
	
	private size: number;
	private theme: TimelineTheme;
	private onClick: () => void;
	
	constructor(options: ToolbarButtonOptions) {
		super();
		
		this.size = options.size || TOOLBAR_CONSTANTS.BUTTON_SIZE;
		this.theme = options.theme;
		this.onClick = options.onClick;
		
		this.eventMode = 'static';
		this.cursor = 'pointer';
		
		// Create background
		this.background = new PIXI.Graphics();
		this.addChild(this.background);
		
		// Create hover background
		this.hoverBackground = new PIXI.Graphics();
		this.addChild(this.hoverBackground);
		
		// Create icon(s)
		if (options.iconType) {
			this.icon = IconFactory.createIcon(options.iconType, this.theme);
			this.addChild(this.icon);
		}
		
		if (options.alternateIconType) {
			this.alternateIcon = IconFactory.createIcon(options.alternateIconType, this.theme);
			this.alternateIcon.visible = false;
			this.addChild(this.alternateIcon);
		}
		
		// Set up event listeners
		this.setupEventListeners();
		
		// Initial render
		this.updateVisuals();
	}
	
	private setupEventListeners(): void {
		this.on('pointerdown', this.handlePointerDown, this);
		this.on('pointerup', this.handlePointerUp, this);
		this.on('pointerupoutside', this.handlePointerUp, this);
		this.on('pointerover', this.handlePointerOver, this);
		this.on('pointerout', this.handlePointerOut, this);
	}
	
	private handlePointerDown(): void {
		this.state.isPressed = true;
		this.updateVisuals();
	}
	
	private handlePointerUp(): void {
		if (this.state.isPressed) {
			this.onClick();
		}
		this.state.isPressed = false;
		this.updateVisuals();
	}
	
	private handlePointerOver(): void {
		this.state.isHovering = true;
		this.updateVisuals();
	}
	
	private handlePointerOut(): void {
		this.state.isHovering = false;
		this.state.isPressed = false;
		this.updateVisuals();
	}
	
	private updateVisuals(): void {
		const padding = TOOLBAR_CONSTANTS.BUTTON_HOVER_PADDING;
		const totalSize = this.size + padding * 2;
		
		// Update hover background
		this.hoverBackground.clear();
		this.hoverBackground.roundRect(
			-padding, 
			-padding, 
			totalSize, 
			totalSize, 
			TOOLBAR_CONSTANTS.BORDER_RADIUS
		);
		
		if (this.state.isPressed) {
			this.hoverBackground.fill({ 
				color: this.theme.colors.toolbar.active,
				alpha: TOOLBAR_CONSTANTS.ACTIVE_ANIMATION_ALPHA 
			});
		} else if (this.state.isHovering) {
			this.hoverBackground.fill({ 
				color: this.theme.colors.toolbar.hover,
				alpha: TOOLBAR_CONSTANTS.HOVER_ANIMATION_ALPHA 
			});
		} else {
			this.hoverBackground.fill({ 
				color: this.theme.colors.toolbar.hover,
				alpha: 0 
			});
		}
	}
	
	public setActive(active: boolean): void {
		this.state.isActive = active;
		
		// Toggle icon visibility if we have alternate icon
		if (this.icon && this.alternateIcon) {
			this.icon.visible = !active;
			this.alternateIcon.visible = active;
		}
	}
	
	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		
		// Recreate icons with new theme
		if (this.icon) {
			const iconType = this.getIconType(this.icon);
			if (iconType) {
				this.removeChild(this.icon);
				this.icon = IconFactory.createIcon(iconType, theme);
				this.addChild(this.icon);
			}
		}
		
		if (this.alternateIcon) {
			const iconType = this.getIconType(this.alternateIcon);
			if (iconType) {
				this.removeChild(this.alternateIcon);
				this.alternateIcon = IconFactory.createIcon(iconType, theme);
				this.alternateIcon.visible = this.state.isActive;
				this.addChild(this.alternateIcon);
			}
		}
		
		this.updateVisuals();
	}
	
	private getIconType(icon: PIXI.Graphics): IconType | null {
		// This is a simplified approach - in a real implementation,
		// we'd store the icon type as metadata on the Graphics object
		return null;
	}
	
	public destroy(): void {
		this.removeAllListeners();
		super.destroy();
	}
}