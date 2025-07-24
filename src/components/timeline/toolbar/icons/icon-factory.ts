import * as PIXI from 'pixi.js';

import { TimelineTheme } from '../../../../core/theme';
import { TOOLBAR_CONSTANTS } from '../constants';
import { IconType } from '../types';

export class IconFactory {
	static createIcon(type: IconType, theme: TimelineTheme, size?: number): PIXI.Graphics {
		const scale = size ? size / TOOLBAR_CONSTANTS.BUTTON_SIZE : 1;
		
		switch (type) {
			case 'play':
				return this.createPlayIcon(theme, scale);
			case 'pause':
				return this.createPauseIcon(theme, scale);
			case 'frame-back':
				return this.createFrameBackIcon(theme, scale);
			case 'frame-forward':
				return this.createFrameForwardIcon(theme, scale);
			default:
				throw new Error(`Unknown icon type: ${type}`);
		}
	}

	static createPlayIcon(theme: TimelineTheme, scale: number = 1): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { PLAY } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		icon.moveTo(PLAY.LEFT * scale, PLAY.TOP * scale);
		icon.lineTo(PLAY.RIGHT * scale, PLAY.MIDDLE * scale);
		icon.lineTo(PLAY.LEFT * scale, PLAY.BOTTOM * scale);
		icon.closePath();
		icon.fill();
		
		return icon;
	}

	static createPauseIcon(theme: TimelineTheme, scale: number = 1): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { PAUSE } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		icon.rect(PAUSE.RECT1_X * scale, PAUSE.TOP * scale, PAUSE.WIDTH * scale, PAUSE.HEIGHT * scale);
		icon.rect(PAUSE.RECT2_X * scale, PAUSE.TOP * scale, PAUSE.WIDTH * scale, PAUSE.HEIGHT * scale);
		icon.fill();
		
		return icon;
	}

	static createFrameBackIcon(theme: TimelineTheme, scale: number = 1): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { FRAME_STEP } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		
		// First triangle
		icon.moveTo(FRAME_STEP.TRIANGLE1.BACK.LEFT * scale, FRAME_STEP.TOP * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE1.BACK.RIGHT * scale, FRAME_STEP.TRIANGLE1.BACK.MIDDLE * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE1.BACK.LEFT * scale, FRAME_STEP.BOTTOM * scale);
		icon.closePath();
		
		// Second triangle
		icon.moveTo(FRAME_STEP.TRIANGLE2.BACK.LEFT * scale, FRAME_STEP.TOP * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE2.BACK.RIGHT * scale, FRAME_STEP.TRIANGLE2.BACK.MIDDLE * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE2.BACK.LEFT * scale, FRAME_STEP.BOTTOM * scale);
		icon.closePath();
		
		icon.fill();
		
		return icon;
	}

	static createFrameForwardIcon(theme: TimelineTheme, scale: number = 1): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { FRAME_STEP } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		
		// First triangle
		icon.moveTo(FRAME_STEP.TRIANGLE1.FORWARD.LEFT * scale, FRAME_STEP.TOP * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE1.FORWARD.RIGHT * scale, FRAME_STEP.TRIANGLE1.FORWARD.MIDDLE * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE1.FORWARD.LEFT * scale, FRAME_STEP.BOTTOM * scale);
		icon.closePath();
		
		// Second triangle
		icon.moveTo(FRAME_STEP.TRIANGLE2.FORWARD.LEFT * scale, FRAME_STEP.TOP * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE2.FORWARD.RIGHT * scale, FRAME_STEP.TRIANGLE2.FORWARD.MIDDLE * scale);
		icon.lineTo(FRAME_STEP.TRIANGLE2.FORWARD.LEFT * scale, FRAME_STEP.BOTTOM * scale);
		icon.closePath();
		
		icon.fill();
		
		return icon;
	}

	static updateIconColor(icon: PIXI.Graphics, _theme: TimelineTheme): void {
		// Clear and redraw with new color
		const bounds = icon.getBounds();
		icon.clear();
		icon.position.set(bounds.x, bounds.y);
		
		// This is a simplified update - in practice, we'd need to store
		// the icon type and recreate it with the new theme
	}
}