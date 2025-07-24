import * as PIXI from 'pixi.js';

import { Edit } from '../../../../core/edit';
import { TimelineTheme } from '../../../../core/theme';
import { TOOLBAR_CONSTANTS } from '../constants';
import { ToolbarComponent } from '../types';

export class EditControls extends PIXI.Container implements ToolbarComponent {
	private edit: Edit;
	private theme: TimelineTheme;
	private cutButton!: PIXI.Container;
	private cutButtonBackground!: PIXI.Graphics;
	private cutButtonText!: PIXI.Text;
	
	constructor(edit: Edit, theme: TimelineTheme) {
		super();
		
		this.edit = edit;
		this.theme = theme;
		
		this.createCutButton();
	}
	
	private createCutButton(): void {
		this.cutButton = new PIXI.Container();
		this.cutButton.eventMode = 'static';
		this.cutButton.cursor = 'pointer';
		
		const { WIDTH, HEIGHT, FONT_SIZE } = TOOLBAR_CONSTANTS.CUT_BUTTON;
		
		// Create background
		this.cutButtonBackground = new PIXI.Graphics();
		this.cutButtonBackground.roundRect(0, 0, WIDTH, HEIGHT, TOOLBAR_CONSTANTS.BORDER_RADIUS);
		this.cutButtonBackground.fill({ color: this.theme.colors.toolbar.surface || 0x444444 });
		this.cutButtonBackground.stroke({ 
			color: this.theme.colors.structure.border || 0x666666, 
			width: 1 
		});
		this.cutButton.addChild(this.cutButtonBackground);
		
		// Create text
		const textStyle = new PIXI.TextStyle({
			fontFamily: 'Arial',
			fontSize: FONT_SIZE,
			fill: this.theme.colors.ui.text || 0xffffff,
		});
		this.cutButtonText = new PIXI.Text('SPLIT', textStyle);
		this.cutButtonText.anchor.set(0.5);
		this.cutButtonText.position.set(WIDTH / 2, HEIGHT / 2);
		this.cutButton.addChild(this.cutButtonText);
		
		// Add event listeners
		this.cutButton.on('click', this.handleCutClick, this);
		this.cutButton.on('pointerdown', this.handlePointerDown, this);
		this.cutButton.on('pointerover', this.handlePointerOver, this);
		this.cutButton.on('pointerout', this.handlePointerOut, this);
		
		this.addChild(this.cutButton);
	}
	
	private handleCutClick = (event: PIXI.FederatedPointerEvent): void => {
		event.stopPropagation();
		this.performCutClip();
	};
	
	private handlePointerDown = (event: PIXI.FederatedPointerEvent): void => {
		event.stopPropagation();
		this.updateButtonVisual(true, false);
	};
	
	private handlePointerOver = (): void => {
		this.updateButtonVisual(false, true);
	};
	
	private handlePointerOut = (): void => {
		this.updateButtonVisual(false, false);
	};
	
	private updateButtonVisual(pressed: boolean, hovering: boolean): void {
		this.cutButtonBackground.clear();
		this.cutButtonBackground.roundRect(
			0, 0, 
			TOOLBAR_CONSTANTS.CUT_BUTTON.WIDTH, 
			TOOLBAR_CONSTANTS.CUT_BUTTON.HEIGHT, 
			TOOLBAR_CONSTANTS.BORDER_RADIUS
		);
		
		let fillColor = this.theme.colors.toolbar.surface || 0x444444;
		const alpha = 1;
		
		if (pressed) {
			fillColor = this.theme.colors.toolbar.active || 0x333333;
		} else if (hovering) {
			fillColor = this.theme.colors.toolbar.hover || 0x555555;
		}
		
		this.cutButtonBackground.fill({ color: fillColor, alpha });
		this.cutButtonBackground.stroke({ 
			color: this.theme.colors.structure.border || 0x666666, 
			width: 1 
		});
	}
	
	private performCutClip(): void {
		const selectedInfo = this.edit.getSelectedClipInfo();
		if (!selectedInfo) {
			return;
		}

		const { trackIndex, clipIndex } = selectedInfo;
		const playheadTime = this.edit.playbackTime / 1000;
		
		this.edit.splitClip(trackIndex, clipIndex, playheadTime);
	}
	
	public update(): void {
		// Update button state based on selection
		const hasSelection = this.edit.getSelectedClipInfo() !== null;
		this.cutButton.alpha = hasSelection ? 1 : 0.5;
		this.cutButton.eventMode = hasSelection ? 'static' : 'none';
		this.cutButton.cursor = hasSelection ? 'pointer' : 'default';
	}
	
	public resize(_width: number): void {
		// Edit controls maintain their size
	}
	
	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		this.updateButtonVisual(false, false);
		this.cutButtonText.style.fill = theme.colors.ui.text || 0xffffff;
	}
	
	public override destroy(): void {
		this.cutButton.removeAllListeners();
		super.destroy();
	}
	
	public getWidth(): number {
		return TOOLBAR_CONSTANTS.CUT_BUTTON.WIDTH;
	}
}