import * as PIXI from 'pixi.js';

import { Edit } from '../../../../core/edit';
import { TimelineTheme } from '../../../../core/theme';
import { TOOLBAR_CONSTANTS } from '../constants';
import { ToolbarComponent, TimeFormatOptions } from '../types';

export class TimeDisplay extends PIXI.Container implements ToolbarComponent {
	private edit: Edit;
	private theme: TimelineTheme;
	private timeText: PIXI.Text;
	private formatOptions: TimeFormatOptions;
	
	constructor(
		edit: Edit, 
		theme: TimelineTheme,
		formatOptions: TimeFormatOptions = {}
	) {
		super();
		
		this.edit = edit;
		this.theme = theme;
		this.formatOptions = {
			showMilliseconds: false,
			showHours: false,
			...formatOptions
		};
		
		this.createDisplay();
		this.subscribeToEditEvents();
		this.updateTimeDisplay();
	}
	
	private createDisplay(): void {
		const textStyle = new PIXI.TextStyle({
			fontFamily: TOOLBAR_CONSTANTS.TIME_DISPLAY.FONT_FAMILY,
			fontSize: TOOLBAR_CONSTANTS.TIME_DISPLAY.FONT_SIZE,
			fill: this.theme.colors.ui.text,
		});
		
		this.timeText = new PIXI.Text('0:00 / 0:00', textStyle);
		this.timeText.anchor.set(0, 0.5);
		this.addChild(this.timeText);
	}
	
	private subscribeToEditEvents(): void {
		this.edit.events.on('playback:time', this.updateTimeDisplay, this);
		this.edit.events.on('duration:changed', this.updateTimeDisplay, this);
	}
	
	private updateTimeDisplay = (): void => {
		const currentTime = this.formatTime(this.edit.playbackTime / 1000);
		const duration = this.formatTime(this.edit.getTotalDuration() / 1000);
		this.timeText.text = `${currentTime} / ${duration}`;
	};
	
	private formatTime(seconds: number): string {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		const tenths = Math.floor((seconds % 1) * 10);
		
		let formatted = '';
		
		if (this.formatOptions.showHours || hours > 0) {
			formatted += `${hours}:${minutes.toString().padStart(2, '0')}`;
		} else {
			formatted += `${minutes}`;
		}
		
		formatted += `:${secs.toString().padStart(2, '0')}`;
		
		if (this.formatOptions.showMilliseconds) {
			formatted += `.${tenths}`;
		} else {
			// Default behavior from original - show tenths
			formatted += `.${tenths}`;
		}
		
		return formatted;
	}
	
	public update(): void {
		this.updateTimeDisplay();
	}
	
	public resize(_width: number): void {
		// Time display maintains its size
	}
	
	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		this.timeText.style.fill = theme.colors.ui.text;
	}
	
	public destroy(): void {
		this.edit.events.off('playback:time', this.updateTimeDisplay);
		this.edit.events.off('duration:changed', this.updateTimeDisplay);
		
		super.destroy();
	}
	
	public getWidth(): number {
		return this.timeText.width;
	}
}