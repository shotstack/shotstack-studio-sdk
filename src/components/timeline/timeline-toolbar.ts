import * as PIXI from 'pixi.js';

import { Edit } from '../../core/edit';
import { TimelineTheme } from '../../core/theme';

import { TimelineLayout } from './timeline-layout';
import { 
	TOOLBAR_CONSTANTS,
	PlaybackControls,
	TimeDisplay,
	EditControls,
	ToolbarLayout
} from './toolbar';

export class TimelineToolbar extends PIXI.Container {
	private background!: PIXI.Graphics;
	private playbackControls!: PlaybackControls;
	private timeDisplay!: TimeDisplay;
	private editControls!: EditControls;
	private toolbarLayout!: ToolbarLayout;
	
	private _width: number;
	private _height: number;
	
	public override get width(): number {
		return this._width;
	}
	
	public override get height(): number {
		return this._height;
	}

	constructor(
		private edit: Edit,
		private theme: TimelineTheme,
		private layout: TimelineLayout,
		width: number
	) {
		super();
		this._width = width;
		this._height = layout.toolbarHeight;
		
		// Position at top of timeline
		this.position.set(0, layout.toolbarY);
		
		// Initialize layout manager
		this.toolbarLayout = new ToolbarLayout(width, this._height);
		
		// Create components
		this.createBackground();
		this.createComponents();
		this.positionComponents();
		
		// Subscribe to edit events for updates
		this.subscribeToEditEvents();
	}

	private createBackground(): void {
		this.background = new PIXI.Graphics();
		this.drawBackground();
		this.addChild(this.background);
	}
	
	private drawBackground(): void {
		this.background.clear();
		this.background.rect(0, 0, this._width, this._height);
		this.background.fill({ color: this.theme.colors.toolbar.background });
		
		// Add subtle bottom border to separate from ruler
		this.background.setStrokeStyle({ 
			width: 1, 
			color: this.theme.colors.toolbar.divider, 
			alpha: TOOLBAR_CONSTANTS.DIVIDER_ALPHA 
		});
		this.background.moveTo(0, this._height - 0.5);
		this.background.lineTo(this._width, this._height - 0.5);
		this.background.stroke();
	}

	private createComponents(): void {
		// Create playback controls
		this.playbackControls = new PlaybackControls(this.edit, this.theme);
		this.addChild(this.playbackControls);
		
		// Create time display
		this.timeDisplay = new TimeDisplay(this.edit, this.theme);
		this.addChild(this.timeDisplay);
		
		// Create edit controls
		this.editControls = new EditControls(this.edit, this.theme);
		this.addChild(this.editControls);
	}
	
	private positionComponents(): void {
		// Position playback controls
		const playbackPos = this.toolbarLayout.getPlaybackControlsPosition();
		this.playbackControls.position.set(playbackPos.x, playbackPos.y);
		
		// Position time display
		const timePos = this.toolbarLayout.getTimeDisplayPosition(
			this.playbackControls.getWidth()
		);
		this.timeDisplay.position.set(timePos.x, timePos.y);
		
		// Position edit controls
		const editPos = this.toolbarLayout.getEditControlsPosition();
		this.editControls.position.set(editPos.x, editPos.y);
	}
	
	private subscribeToEditEvents(): void {
		// Listen for selection changes to update edit controls
		this.edit.events.on('clip:selected', this.updateEditControls);
		this.edit.events.on('selection:cleared', this.updateEditControls);
	}
	
	private updateEditControls = (): void => {
		this.editControls.update();
	};
	
	public resize(width: number): void {
		this._width = width;
		
		// Update layout
		this.toolbarLayout.updateWidth(width);
		
		// Redraw background
		this.drawBackground();
		
		// Reposition components
		this.positionComponents();
		
		// Notify components of resize
		this.playbackControls.resize(width);
		this.timeDisplay.resize(width);
		this.editControls.resize(width);
	}
	
	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		
		// Update background
		this.drawBackground();
		
		// Update all components
		this.playbackControls.updateTheme(theme);
		this.timeDisplay.updateTheme(theme);
		this.editControls.updateTheme(theme);
	}
	
	public updateTimeDisplay = (): void => {
		this.timeDisplay.update();
	};
	
	public override destroy(): void {
		// Unsubscribe from events
		this.edit.events.off('clip:selected', this.updateEditControls);
		this.edit.events.off('selection:cleared', this.updateEditControls);
		
		// Destroy components
		this.playbackControls.destroy();
		this.timeDisplay.destroy();
		this.editControls.destroy();
		
		super.destroy();
	}
}