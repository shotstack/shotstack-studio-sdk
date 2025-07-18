import * as PIXI from 'pixi.js';

import { Edit } from '../../../../core/edit';
import { TimelineTheme } from '../../../../core/theme';
import { TOOLBAR_CONSTANTS } from '../constants';
import { ToolbarComponent } from '../types';

import { ToolbarButton } from './toolbar-button';

export class PlaybackControls extends PIXI.Container implements ToolbarComponent {
	private edit: Edit;
	private theme: TimelineTheme;
	
	private frameBackButton!: ToolbarButton;
	private playPauseButton!: ToolbarButton;
	private frameForwardButton!: ToolbarButton;
	
	constructor(edit: Edit, theme: TimelineTheme) {
		super();
		
		this.edit = edit;
		this.theme = theme;
		
		this.createButtons();
		this.subscribeToEditEvents();
		this.updatePlayPauseState();
	}
	
	private createButtons(): void {
		const buttonSize = TOOLBAR_CONSTANTS.BUTTON_SIZE;
		const spacing = TOOLBAR_CONSTANTS.BUTTON_SPACING;
		
		// Frame back button
		this.frameBackButton = new ToolbarButton({
			iconType: 'frame-back',
			onClick: () => this.handleFrameBack(),
			tooltip: 'Previous frame',
			theme: this.theme
		});
		this.frameBackButton.position.x = 0;
		this.addChild(this.frameBackButton);
		
		// Play/Pause button
		this.playPauseButton = new ToolbarButton({
			iconType: 'play',
			alternateIconType: 'pause',
			onClick: () => this.handlePlayPause(),
			tooltip: 'Play/Pause',
			theme: this.theme
		});
		this.playPauseButton.position.x = buttonSize + spacing;
		this.addChild(this.playPauseButton);
		
		// Frame forward button
		this.frameForwardButton = new ToolbarButton({
			iconType: 'frame-forward',
			onClick: () => this.handleFrameForward(),
			tooltip: 'Next frame',
			theme: this.theme
		});
		this.frameForwardButton.position.x = (buttonSize + spacing) * 2;
		this.addChild(this.frameForwardButton);
	}
	
	private handleFrameBack(): void {
		this.edit.seek(this.edit.playbackTime - TOOLBAR_CONSTANTS.FRAME_TIME_MS);
	}
	
	private handlePlayPause(): void {
		if (this.edit.isPlaying) {
			this.edit.pause();
		} else {
			this.edit.play();
		}
	}
	
	private handleFrameForward(): void {
		this.edit.seek(this.edit.playbackTime + TOOLBAR_CONSTANTS.FRAME_TIME_MS);
	}
	
	private subscribeToEditEvents(): void {
		this.edit.events.on('playback:play', this.updatePlayPauseState);
		this.edit.events.on('playback:pause', this.updatePlayPauseState);
	}
	
	private updatePlayPauseState = (): void => {
		this.playPauseButton.setActive(this.edit.isPlaying);
	};
	
	public update(): void {
		// Update any dynamic state if needed
	}
	
	public resize(_width: number): void {
		// Controls maintain fixed size, no resize needed
	}
	
	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		this.frameBackButton.updateTheme(theme);
		this.playPauseButton.updateTheme(theme);
		this.frameForwardButton.updateTheme(theme);
	}
	
	public override destroy(): void {
		this.edit.events.off('playback:play', this.updatePlayPauseState);
		this.edit.events.off('playback:pause', this.updatePlayPauseState);
		
		this.frameBackButton.destroy();
		this.playPauseButton.destroy();
		this.frameForwardButton.destroy();
		
		super.destroy();
	}
	
	public getWidth(): number {
		const buttonSize = TOOLBAR_CONSTANTS.BUTTON_SIZE;
		const spacing = TOOLBAR_CONSTANTS.BUTTON_SPACING;
		return buttonSize * 3 + spacing * 2;
	}
}