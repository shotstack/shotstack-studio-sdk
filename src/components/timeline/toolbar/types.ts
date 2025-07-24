import * as PIXI from 'pixi.js';

import { Edit } from '../../../core/edit';
import { TimelineTheme } from '../../../core/theme';
import { TimelineLayout } from '../timeline-layout';

// Button types
export type ButtonType = 'play-pause' | 'frame-back' | 'frame-forward' | 'cut';

export interface ButtonConfig {
	type: ButtonType;
	tooltip?: string;
	onClick: () => void;
	size?: number;
}

export interface IconButtonConfig extends ButtonConfig {
	getIcon: (theme: TimelineTheme) => PIXI.Graphics;
	getAlternateIcon?: (theme: TimelineTheme) => PIXI.Graphics;
}

export interface TextButtonConfig extends ButtonConfig {
	text: string;
	width: number;
	height: number;
}

// State types
export type ToolbarState = 
	| { type: 'idle' }
	| { type: 'playing' }
	| { type: 'paused' };

export interface ButtonState {
	isHovering: boolean;
	isPressed: boolean;
	isActive: boolean;
}

// Component interfaces
export interface ToolbarComponent {
	update(): void;
	resize(width: number): void;
	updateTheme(theme: TimelineTheme): void;
	destroy(): void;
}

export interface ToolbarOptions {
	edit: Edit;
	theme: TimelineTheme;
	layout: TimelineLayout;
	width: number;
}

// Layout types
export interface ToolbarLayoutConfig {
	width: number;
	height: number;
	buttonSize: number;
	buttonSpacing: number;
	edgeMargin: number;
}

export interface ComponentPosition {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

// Event types
export interface ToolbarEventMap {
	'button:click': { button: ButtonType };
	'button:hover': { button: ButtonType; hovering: boolean };
	'state:change': { state: ToolbarState };
}

// Icon types
export type IconType = 'play' | 'pause' | 'frame-back' | 'frame-forward' | 'cut';

export interface IconConfig {
	type: IconType;
	color: number;
	size?: number;
}

// Time formatting
export interface TimeFormatOptions {
	showMilliseconds?: boolean;
	showHours?: boolean;
}