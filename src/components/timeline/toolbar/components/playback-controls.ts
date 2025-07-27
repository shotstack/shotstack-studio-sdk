import * as PIXI from "pixi.js";

import { Edit } from "../../../../core/edit";
import { TimelineTheme } from "../../../../core/theme";
import { TOOLBAR_CONSTANTS } from "../constants";
import { ToolbarComponent, IconType } from "../types";

import { ToolbarButton } from "./toolbar-button";

export class PlaybackControls extends PIXI.Container implements ToolbarComponent {
	private edit: Edit;
	private theme: TimelineTheme;
	private toolbarHeight: number;

	private frameBackButton!: ToolbarButton;
	private playPauseButton!: ToolbarButton;
	private frameForwardButton!: ToolbarButton;

	constructor(edit: Edit, theme: TimelineTheme, toolbarHeight?: number) {
		super();

		this.edit = edit;
		this.theme = theme;
		this.toolbarHeight = toolbarHeight || 36; // Default height

		this.createButtons();
		this.subscribeToEditEvents();
		this.updatePlayPauseState();
	}

	private createButtons(): void {
		const sizes = this.calculateButtonSizes();
		const centerY = (sizes.playButton - sizes.regularButton) / 2;

		// Create buttons with their configurations
		const createButton = (iconType: IconType, onClick: () => void, tooltip: string, size: number) =>
			new ToolbarButton({ iconType, onClick, tooltip, theme: this.theme, size });

		// Frame back button
		this.frameBackButton = createButton("frame-back", () => this.handleFrameBack(), "Previous frame", sizes.regularButton);
		this.frameBackButton.position.set(0, centerY);

		// Play/Pause button
		this.playPauseButton = new ToolbarButton({
			iconType: "play",
			alternateIconType: "pause",
			onClick: () => this.handlePlayPause(),
			tooltip: "Play/Pause",
			theme: this.theme,
			size: sizes.playButton
		});
		this.playPauseButton.position.set(sizes.regularButton + sizes.spacing, 0);

		// Frame forward button
		this.frameForwardButton = createButton("frame-forward", () => this.handleFrameForward(), "Next frame", sizes.regularButton);
		this.frameForwardButton.position.set(sizes.regularButton + sizes.spacing + sizes.playButton + sizes.spacing, centerY);

		// Add all buttons
		this.addChild(this.frameBackButton, this.playPauseButton, this.frameForwardButton);
	}

	private calculateButtonSizes() {
		const regularButton = Math.round(this.toolbarHeight * 0.5);
		return {
			regularButton,
			playButton: Math.round(regularButton * 1.5),
			spacing: Math.round(this.toolbarHeight * 0.15)
		};
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
		this.edit.events.on("playback:play", this.updatePlayPauseState);
		this.edit.events.on("playback:pause", this.updatePlayPauseState);
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
		this.edit.events.off("playback:play", this.updatePlayPauseState);
		this.edit.events.off("playback:pause", this.updatePlayPauseState);

		this.frameBackButton.destroy();
		this.playPauseButton.destroy();
		this.frameForwardButton.destroy();

		super.destroy();
	}

	public getWidth(): number {
		const sizes = this.calculateButtonSizes();
		return sizes.regularButton * 2 + sizes.playButton + sizes.spacing * 2;
	}
}
