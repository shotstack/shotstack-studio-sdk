import { TOOLBAR_CONSTANTS } from './constants';
import { ComponentPosition, ToolbarLayoutConfig } from './types';

export class ToolbarLayout {
	private config: ToolbarLayoutConfig;
	
	constructor(width: number, height: number) {
		this.config = {
			width,
			height,
			buttonSize: TOOLBAR_CONSTANTS.BUTTON_SIZE,
			buttonSpacing: TOOLBAR_CONSTANTS.BUTTON_SPACING,
			edgeMargin: TOOLBAR_CONSTANTS.EDGE_MARGIN
		};
	}
	
	public getPlaybackControlsPosition(): ComponentPosition {
		// Center playback controls horizontally
		const controlsWidth = this.calculatePlaybackControlsWidth();
		const x = (this.config.width - controlsWidth) / 2;
		const y = (this.config.height - this.config.buttonSize) / 2;
		
		return { x, y };
	}
	
	public getTimeDisplayPosition(playbackControlsWidth: number): ComponentPosition {
		// Position time display to the right of playback controls
		const playbackX = (this.config.width - playbackControlsWidth) / 2;
		const x = playbackX + playbackControlsWidth + TOOLBAR_CONSTANTS.TEXT_SPACING;
		const y = this.config.height / 2;
		
		return { x, y };
	}
	
	public getEditControlsPosition(): ComponentPosition {
		// Position edit controls on the right edge
		const x = this.config.width - TOOLBAR_CONSTANTS.CUT_BUTTON.WIDTH - this.config.edgeMargin;
		const y = (this.config.height - TOOLBAR_CONSTANTS.CUT_BUTTON.HEIGHT) / 2;
		
		return { x, y };
	}
	
	public calculatePlaybackControlsWidth(): number {
		// 3 buttons with 2 spaces between them
		return this.config.buttonSize * 3 + this.config.buttonSpacing * 2;
	}
	
	public updateWidth(width: number): void {
		this.config.width = width;
	}
	
	public getConfig(): ToolbarLayoutConfig {
		return { ...this.config };
	}
}