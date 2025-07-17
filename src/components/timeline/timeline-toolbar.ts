import * as PIXI from 'pixi.js';
import { TimelineTheme } from '../../core/theme';
import { TimelineLayout } from './timeline-layout';
import { Edit } from '../../core/edit';

export class TimelineToolbar extends PIXI.Container {
	private background: PIXI.Graphics;
	private frameBackButton: PIXI.Container;
	private frameBackIcon: PIXI.Graphics;
	private frameBackHoverBackground: PIXI.Graphics;
	private playPauseButton: PIXI.Container;
	private playIcon: PIXI.Graphics;
	private pauseIcon: PIXI.Graphics;
	private buttonHoverBackground: PIXI.Graphics;
	private frameForwardButton: PIXI.Container;
	private frameForwardIcon: PIXI.Graphics;
	private frameForwardHoverBackground: PIXI.Graphics;
	private timeDisplay: PIXI.Text;
	private cutButton: PIXI.Container;
	
	private isHovering = false;
	private isPressed = false;
	private frameBackHovering = false;
	private frameForwardHovering = false;
	private width: number;
	private height: number;
	private static readonly FRAME_TIME = 16.67; // milliseconds per frame

	constructor(
		private edit: Edit,
		private theme: TimelineTheme,
		private layout: TimelineLayout,
		width: number
	) {
		super();
		this.width = width;
		this.height = layout.toolbarHeight;
		
		// Position at top of timeline
		this.position.set(0, layout.toolbarY);
		
		this.createBackground();
		this.createFrameBackButton();
		this.createPlayPauseButton();
		this.createFrameForwardButton();
		this.createTimeDisplay();
		this.createCutButton();
		
		// Subscribe to edit events
		this.subscribeToEditEvents();
		
		// Set initial state
		this.updatePlayPauseState();
		this.updateTimeDisplay();
	}

	private createBackground(): void {
		this.background = new PIXI.Graphics();
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill({ color: this.theme.colors.toolbar.background });
		
		// Add subtle bottom border to separate from ruler
		this.background.setStrokeStyle({ width: 1, color: this.theme.colors.toolbar.divider, alpha: 0.5 });
		this.background.moveTo(0, this.height - 0.5);
		this.background.lineTo(this.width, this.height - 0.5);
		this.background.stroke();
		
		this.addChild(this.background);
	}

	private createFrameBackButton(): void {
		this.frameBackButton = new PIXI.Container();
		this.frameBackButton.eventMode = 'static';
		this.frameBackButton.cursor = 'pointer';
		
		// Position to the left of play button
		const buttonSize = 24;
		const spacing = 8;
		const playButtonX = this.width / 2 - buttonSize / 2;
		const frameBackX = playButtonX - buttonSize - spacing;
		const centerY = (this.height - buttonSize) / 2;
		this.frameBackButton.position.set(frameBackX, centerY);
		
		// Create hover background
		this.frameBackHoverBackground = new PIXI.Graphics();
		this.frameBackHoverBackground.roundRect(
			-4, -4, 
			buttonSize + 8, buttonSize + 8, 
			4
		);
		this.frameBackHoverBackground.fill({ 
			color: this.theme.colors.toolbar.hover,
			alpha: 0 
		});
		this.frameBackButton.addChild(this.frameBackHoverBackground);
		
		// Create << icon (two triangles pointing left)
		this.frameBackIcon = new PIXI.Graphics();
		this.frameBackIcon.fill({ color: this.theme.colors.ui.icon });
		// First triangle
		this.frameBackIcon.moveTo(11, 4);
		this.frameBackIcon.lineTo(3, 12);
		this.frameBackIcon.lineTo(11, 20);
		this.frameBackIcon.closePath();
		// Second triangle
		this.frameBackIcon.moveTo(20, 4);
		this.frameBackIcon.lineTo(12, 12);
		this.frameBackIcon.lineTo(20, 20);
		this.frameBackIcon.closePath();
		this.frameBackIcon.fill();
		this.frameBackButton.addChild(this.frameBackIcon);
		
		// Add event listeners
		this.frameBackButton.on('pointerdown', this.handleFrameBackClick, this);
		this.frameBackButton.on('pointerover', () => this.handleFrameButtonHover('back'), this);
		this.frameBackButton.on('pointerout', () => this.handleFrameButtonOut('back'), this);
		
		this.addChild(this.frameBackButton);
	}

	private createPlayPauseButton(): void {
		this.playPauseButton = new PIXI.Container();
		this.playPauseButton.eventMode = 'static';
		this.playPauseButton.cursor = 'pointer';
		
		// Center button horizontally and vertically
		const buttonSize = 24;
		const centerX = this.width / 2 - buttonSize / 2;
		const centerY = (this.height - buttonSize) / 2;
		this.playPauseButton.position.set(centerX, centerY);
		
		// Create hover background
		this.buttonHoverBackground = new PIXI.Graphics();
		this.buttonHoverBackground.roundRect(
			-4, -4, 
			buttonSize + 8, buttonSize + 8, 
			4
		);
		this.buttonHoverBackground.fill({ 
			color: this.theme.colors.toolbar.hover,
			alpha: 0 
		});
		this.playPauseButton.addChild(this.buttonHoverBackground);
		
		// Create play icon (triangle)
		this.playIcon = new PIXI.Graphics();
		this.playIcon.setStrokeStyle(0);
		this.playIcon.fill({ color: this.theme.colors.ui.icon });
		this.playIcon.moveTo(6, 4);
		this.playIcon.lineTo(18, 12);
		this.playIcon.lineTo(6, 20);
		this.playIcon.closePath();
		this.playIcon.fill();
		this.playPauseButton.addChild(this.playIcon);
		
		// Create pause icon (two rectangles)
		this.pauseIcon = new PIXI.Graphics();
		this.pauseIcon.fill({ color: this.theme.colors.ui.icon });
		this.pauseIcon.rect(6, 4, 4, 16);
		this.pauseIcon.rect(14, 4, 4, 16);
		this.pauseIcon.fill();
		this.pauseIcon.visible = false;
		this.playPauseButton.addChild(this.pauseIcon);
		
		// Add event listeners
		this.playPauseButton.on('pointerdown', this.handleButtonDown, this);
		this.playPauseButton.on('pointerup', this.handleButtonUp, this);
		this.playPauseButton.on('pointerupoutside', this.handleButtonUp, this);
		this.playPauseButton.on('pointerover', this.handleButtonHover, this);
		this.playPauseButton.on('pointerout', this.handleButtonOut, this);
		
		this.addChild(this.playPauseButton);
	}

	private createFrameForwardButton(): void {
		this.frameForwardButton = new PIXI.Container();
		this.frameForwardButton.eventMode = 'static';
		this.frameForwardButton.cursor = 'pointer';
		
		// Position to the right of play button
		const buttonSize = 24;
		const spacing = 8;
		const playButtonX = this.width / 2 - buttonSize / 2;
		const frameForwardX = playButtonX + buttonSize + spacing;
		const centerY = (this.height - buttonSize) / 2;
		this.frameForwardButton.position.set(frameForwardX, centerY);
		
		// Create hover background
		this.frameForwardHoverBackground = new PIXI.Graphics();
		this.frameForwardHoverBackground.roundRect(
			-4, -4, 
			buttonSize + 8, buttonSize + 8, 
			4
		);
		this.frameForwardHoverBackground.fill({ 
			color: this.theme.colors.toolbar.hover,
			alpha: 0 
		});
		this.frameForwardButton.addChild(this.frameForwardHoverBackground);
		
		// Create >> icon (two triangles pointing right)
		this.frameForwardIcon = new PIXI.Graphics();
		this.frameForwardIcon.fill({ color: this.theme.colors.ui.icon });
		// First triangle
		this.frameForwardIcon.moveTo(4, 4);
		this.frameForwardIcon.lineTo(12, 12);
		this.frameForwardIcon.lineTo(4, 20);
		this.frameForwardIcon.closePath();
		// Second triangle
		this.frameForwardIcon.moveTo(13, 4);
		this.frameForwardIcon.lineTo(21, 12);
		this.frameForwardIcon.lineTo(13, 20);
		this.frameForwardIcon.closePath();
		this.frameForwardIcon.fill();
		this.frameForwardButton.addChild(this.frameForwardIcon);
		
		// Add event listeners
		this.frameForwardButton.on('pointerdown', this.handleFrameForwardClick, this);
		this.frameForwardButton.on('pointerover', () => this.handleFrameButtonHover('forward'), this);
		this.frameForwardButton.on('pointerout', () => this.handleFrameButtonOut('forward'), this);
		
		this.addChild(this.frameForwardButton);
	}

	private createTimeDisplay(): void {
		const textStyle = new PIXI.TextStyle({
			fontFamily: 'monospace',
			fontSize: 14,
			fill: this.theme.colors.ui.text,
		});
		
		this.timeDisplay = new PIXI.Text('0:00 / 0:00', textStyle);
		this.timeDisplay.anchor.set(0, 0.5);
		
		// Position to the right of all buttons
		const buttonSize = 24;
		const buttonSpacing = 8;
		const textSpacing = 16;
		const frameForwardX = this.width / 2 + buttonSize / 2 + buttonSpacing;
		const timeX = frameForwardX + buttonSize + textSpacing;
		this.timeDisplay.position.set(timeX, this.height / 2);
		
		this.addChild(this.timeDisplay);
	}

	private createCutButton(): void {
		this.cutButton = new PIXI.Container();
		this.cutButton.eventMode = 'static';
		this.cutButton.cursor = 'pointer';
		
		const buttonWidth = 60;
		const buttonHeight = 24;
		const cutX = this.width - buttonWidth - 10;
		const centerY = (this.height - buttonHeight) / 2;
		this.cutButton.position.set(cutX, centerY);
		
		const background = new PIXI.Graphics();
		background.roundRect(0, 0, buttonWidth, buttonHeight, 4);
		background.fill({ color: 0x444444 });
		background.stroke({ color: 0x666666, width: 1 });
		this.cutButton.addChild(background);
		
		const textStyle = new PIXI.TextStyle({
			fontFamily: 'Arial',
			fontSize: 12,
			fill: 0xffffff,
		});
		const buttonText = new PIXI.Text('CUT', textStyle);
		buttonText.anchor.set(0.5);
		buttonText.position.set(buttonWidth / 2, buttonHeight / 2);
		this.cutButton.addChild(buttonText);
		
		this.cutButton.on('click', (event) => {
			event.stopPropagation();
			this.performCutClip();
		});
		
		this.cutButton.on('pointerdown', (event) => {
			event.stopPropagation();
		});
		
		this.addChild(this.cutButton);
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

	private handleButtonDown(): void {
		this.isPressed = true;
		this.updateButtonBackground();
	}

	private handleButtonUp(): void {
		if (this.isPressed) {
			// Toggle playback
			if (this.edit.isPlaying) {
				this.edit.pause();
			} else {
				this.edit.play();
			}
		}
		this.isPressed = false;
		this.updateButtonBackground();
	}

	private handleButtonHover(): void {
		this.isHovering = true;
		this.updateButtonBackground();
	}

	private handleButtonOut(): void {
		this.isHovering = false;
		this.isPressed = false;
		this.updateButtonBackground();
	}

	private updateButtonBackground(): void {
		this.buttonHoverBackground.clear();
		this.buttonHoverBackground.roundRect(-4, -4, 32, 32, 4);
		
		if (this.isPressed) {
			this.buttonHoverBackground.fill({ 
				color: this.theme.colors.toolbar.active,
				alpha: 0.3 
			});
		} else if (this.isHovering) {
			this.buttonHoverBackground.fill({ 
				color: this.theme.colors.toolbar.hover,
				alpha: 1 
			});
		} else {
			this.buttonHoverBackground.fill({ 
				color: this.theme.colors.toolbar.hover,
				alpha: 0 
			});
		}
	}

	private handleFrameBackClick = (): void => {
		this.edit.seek(this.edit.playbackTime - TimelineToolbar.FRAME_TIME);
	};

	private handleFrameForwardClick = (): void => {
		this.edit.seek(this.edit.playbackTime + TimelineToolbar.FRAME_TIME);
	};

	private handleFrameButtonHover(button: 'back' | 'forward'): void {
		if (button === 'back') {
			this.frameBackHovering = true;
			this.frameBackHoverBackground.alpha = 1;
		} else {
			this.frameForwardHovering = true;
			this.frameForwardHoverBackground.alpha = 1;
		}
	}

	private handleFrameButtonOut(button: 'back' | 'forward'): void {
		if (button === 'back') {
			this.frameBackHovering = false;
			this.frameBackHoverBackground.alpha = 0;
		} else {
			this.frameForwardHovering = false;
			this.frameForwardHoverBackground.alpha = 0;
		}
	}

	private subscribeToEditEvents(): void {
		// Listen for playback state changes
		this.edit.events.on('playback:play', this.updatePlayPauseState, this);
		this.edit.events.on('playback:pause', this.updatePlayPauseState, this);
		
		// Listen for time updates
		this.edit.events.on('playback:time', this.updateTimeDisplay, this);
		this.edit.events.on('duration:changed', this.updateTimeDisplay, this);
	}

	private updatePlayPauseState = (): void => {
		this.playIcon.visible = !this.edit.isPlaying;
		this.pauseIcon.visible = this.edit.isPlaying;
	};

	public updateTimeDisplay = (): void => {
		const currentTime = this.formatTime(this.edit.playbackTime / 1000);
		const duration = this.formatTime(this.edit.getTotalDuration() / 1000);
		this.timeDisplay.text = `${currentTime} / ${duration}`;
	};

	private formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const tenths = Math.floor((seconds % 1) * 10);
		return `${minutes}:${secs.toString().padStart(2, '0')}.${tenths}`;
	}

	public resize(width: number): void {
		this.width = width;
		
		// Redraw background
		this.background.clear();
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill({ color: this.theme.colors.toolbar.background });
		
		// Redraw bottom border
		this.background.setStrokeStyle({ width: 1, color: this.theme.colors.toolbar.divider, alpha: 0.5 });
		this.background.moveTo(0, this.height - 0.5);
		this.background.lineTo(this.width, this.height - 0.5);
		this.background.stroke();
		
		// Reposition all buttons
		const buttonSize = 24;
		const buttonSpacing = 8;
		const playButtonX = this.width / 2 - buttonSize / 2;
		
		// Frame back button
		this.frameBackButton.position.x = playButtonX - buttonSize - buttonSpacing;
		
		// Play/pause button
		this.playPauseButton.position.x = playButtonX;
		
		// Frame forward button
		this.frameForwardButton.position.x = playButtonX + buttonSize + buttonSpacing;
		
		// Time display
		const textSpacing = 16;
		const timeX = this.frameForwardButton.position.x + buttonSize + textSpacing;
		this.timeDisplay.position.x = timeX;
	}

	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		
		// Update background
		this.background.clear();
		this.background.rect(0, 0, this.width, this.height);
		this.background.fill({ color: theme.colors.toolbar.background });
		
		// Update bottom border
		this.background.setStrokeStyle({ width: 1, color: theme.colors.toolbar.divider, alpha: 0.5 });
		this.background.moveTo(0, this.height - 0.5);
		this.background.lineTo(this.width, this.height - 0.5);
		this.background.stroke();
		
		// Update button backgrounds with current state
		this.updateButtonBackground();
		
		// Update frame back button
		this.frameBackHoverBackground.clear();
		this.frameBackHoverBackground.roundRect(-4, -4, 32, 32, 4);
		this.frameBackHoverBackground.fill({ 
			color: theme.colors.toolbar.hover,
			alpha: this.frameBackHovering ? 1 : 0 
		});
		
		this.frameBackIcon.clear();
		this.frameBackIcon.fill({ color: theme.colors.ui.icon });
		// First triangle
		this.frameBackIcon.moveTo(11, 4);
		this.frameBackIcon.lineTo(3, 12);
		this.frameBackIcon.lineTo(11, 20);
		this.frameBackIcon.closePath();
		// Second triangle
		this.frameBackIcon.moveTo(20, 4);
		this.frameBackIcon.lineTo(12, 12);
		this.frameBackIcon.lineTo(20, 20);
		this.frameBackIcon.closePath();
		this.frameBackIcon.fill();
		
		// Update frame forward button
		this.frameForwardHoverBackground.clear();
		this.frameForwardHoverBackground.roundRect(-4, -4, 32, 32, 4);
		this.frameForwardHoverBackground.fill({ 
			color: theme.colors.toolbar.hover,
			alpha: this.frameForwardHovering ? 1 : 0 
		});
		
		this.frameForwardIcon.clear();
		this.frameForwardIcon.fill({ color: theme.colors.ui.icon });
		// First triangle
		this.frameForwardIcon.moveTo(4, 4);
		this.frameForwardIcon.lineTo(12, 12);
		this.frameForwardIcon.lineTo(4, 20);
		this.frameForwardIcon.closePath();
		// Second triangle
		this.frameForwardIcon.moveTo(13, 4);
		this.frameForwardIcon.lineTo(21, 12);
		this.frameForwardIcon.lineTo(13, 20);
		this.frameForwardIcon.closePath();
		this.frameForwardIcon.fill();
		
		// Update play icon
		this.playIcon.clear();
		this.playIcon.fill({ color: theme.colors.ui.icon });
		this.playIcon.moveTo(6, 4);
		this.playIcon.lineTo(18, 12);
		this.playIcon.lineTo(6, 20);
		this.playIcon.closePath();
		this.playIcon.fill();
		
		// Update pause icon
		this.pauseIcon.clear();
		this.pauseIcon.fill({ color: theme.colors.ui.icon });
		this.pauseIcon.rect(6, 4, 4, 16);
		this.pauseIcon.rect(14, 4, 4, 16);
		this.pauseIcon.fill();
		
		// Update text style
		this.timeDisplay.style.fill = theme.colors.ui.text;
	}

	public destroy(): void {
		// Unsubscribe from events
		this.edit.events.off('playback:play', this.updatePlayPauseState);
		this.edit.events.off('playback:pause', this.updatePlayPauseState);
		this.edit.events.off('playback:time', this.updateTimeDisplay);
		this.edit.events.off('duration:changed', this.updateTimeDisplay);
		
		super.destroy();
	}
}