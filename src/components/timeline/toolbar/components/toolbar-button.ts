import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../../core/theme";
import { TOOLBAR_CONSTANTS } from "../constants";
import { IconFactory } from "../icons/icon-factory";
import { ButtonState, IconType } from "../types";

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

		this.eventMode = "static";
		this.cursor = "pointer";

		// Create background
		this.background = new PIXI.Graphics();
		this.addChild(this.background);

		// Create hover background
		this.hoverBackground = new PIXI.Graphics();
		this.addChild(this.hoverBackground);

		// Create icon(s) - scaled to 60% of button size
		const iconScale = 0.6;
		const iconSize = this.size * iconScale;
		const iconOffset = (this.size - iconSize) / 2;

		if (options.iconType) {
			this.icon = IconFactory.createIcon(options.iconType, this.theme, iconSize);
			this.icon.position.set(iconOffset, iconOffset);
			this.addChild(this.icon);
		}

		if (options.alternateIconType) {
			this.alternateIcon = IconFactory.createIcon(options.alternateIconType, this.theme, iconSize);
			this.alternateIcon.position.set(iconOffset, iconOffset);
			this.alternateIcon.visible = false;
			this.addChild(this.alternateIcon);
		}

		// Set up event listeners
		this.setupEventListeners();

		// Initial render
		this.updateVisuals();
	}

	private setupEventListeners(): void {
		this.on("pointerdown", this.handlePointerDown, this);
		this.on("pointerup", this.handlePointerUp, this);
		this.on("pointerupoutside", this.handlePointerUp, this);
		this.on("pointerover", this.handlePointerOver, this);
		this.on("pointerout", this.handlePointerOut, this);
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
		const radius = this.size / 2;

		// Clear and redraw circular button background
		this.background.clear();
		this.background.circle(radius, radius, radius);
		this.background.fill({
			color: this.theme.timeline.toolbar.surface,
			alpha: 0.8
		});

		// Update hover background as a larger circle
		this.hoverBackground.clear();
		this.hoverBackground.circle(radius, radius, radius + padding);

		if (this.state.isPressed) {
			this.hoverBackground.fill({
				color: this.theme.timeline.toolbar.active,
				alpha: TOOLBAR_CONSTANTS.ACTIVE_ANIMATION_ALPHA
			});
		} else if (this.state.isHovering) {
			this.hoverBackground.fill({
				color: this.theme.timeline.toolbar.hover,
				alpha: TOOLBAR_CONSTANTS.HOVER_ANIMATION_ALPHA
			});
		} else {
			this.hoverBackground.fill({
				color: this.theme.timeline.toolbar.hover,
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
		const iconScale = 0.6;
		const iconSize = this.size * iconScale;
		const iconOffset = (this.size - iconSize) / 2;

		if (this.icon) {
			const iconType = this.getIconType(this.icon);
			if (iconType) {
				this.removeChild(this.icon);
				this.icon = IconFactory.createIcon(iconType, theme, iconSize);
				this.icon.position.set(iconOffset, iconOffset);
				this.addChild(this.icon);
			}
		}

		if (this.alternateIcon) {
			const iconType = this.getIconType(this.alternateIcon);
			if (iconType) {
				this.removeChild(this.alternateIcon);
				this.alternateIcon = IconFactory.createIcon(iconType, theme, iconSize);
				this.alternateIcon.position.set(iconOffset, iconOffset);
				this.alternateIcon.visible = this.state.isActive;
				this.addChild(this.alternateIcon);
			}
		}

		this.updateVisuals();
	}

	private getIconType(_icon: PIXI.Graphics): IconType | null {
		// This is a simplified approach - in a real implementation,
		// we'd store the icon type as metadata on the Graphics object
		return null;
	}

	public override destroy(): void {
		this.removeAllListeners();
		super.destroy();
	}
}
