import { TOOLBAR_CONSTANTS } from "./constants";
import { ComponentPosition, ToolbarLayoutConfig } from "./types";

export class ToolbarLayout {
	private config: ToolbarLayoutConfig;

	constructor(width: number, height: number) {
		this.config = {
			width,
			height,
			buttonSize: Math.round(height * 0.5),
			buttonSpacing: Math.round(height * 0.15),
			edgeMargin: TOOLBAR_CONSTANTS.EDGE_MARGIN
		};
	}

	public getPlaybackControlsPosition(): ComponentPosition {
		// Center playback controls horizontally and vertically
		const controlsWidth = this.calculatePlaybackControlsWidth();
		const x = (this.config.width - controlsWidth) / 2;
		// Center the entire control group vertically
		const y = (this.config.height - this.getMaxButtonHeight()) / 2;

		return { x, y };
	}

	private getMaxButtonHeight(): number {
		// The play button is the tallest
		const regularButtonSize = this.config.buttonSize;
		const playButtonSize = Math.round(regularButtonSize * 1.5);
		return playButtonSize;
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
		// 2 regular buttons + 1 play button (50% larger) with 2 spaces between them
		const regularButtonSize = this.config.buttonSize;
		const playButtonSize = Math.round(regularButtonSize * 1.5);
		return regularButtonSize * 2 + playButtonSize + this.config.buttonSpacing * 2;
	}

	public updateWidth(width: number): void {
		this.config.width = width;
	}

	public getConfig(): ToolbarLayoutConfig {
		return { ...this.config };
	}
}
