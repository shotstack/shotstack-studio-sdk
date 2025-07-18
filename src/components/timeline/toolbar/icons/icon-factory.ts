import * as PIXI from 'pixi.js';

import { TimelineTheme } from '../../../../core/theme';
import { TOOLBAR_CONSTANTS } from '../constants';
import { IconType } from '../types';

export class IconFactory {
	static createIcon(type: IconType, theme: TimelineTheme): PIXI.Graphics {
		switch (type) {
			case 'play':
				return this.createPlayIcon(theme);
			case 'pause':
				return this.createPauseIcon(theme);
			case 'frame-back':
				return this.createFrameBackIcon(theme);
			case 'frame-forward':
				return this.createFrameForwardIcon(theme);
			default:
				throw new Error(`Unknown icon type: ${type}`);
		}
	}

	static createPlayIcon(theme: TimelineTheme): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { PLAY } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		icon.moveTo(PLAY.LEFT, PLAY.TOP);
		icon.lineTo(PLAY.RIGHT, PLAY.MIDDLE);
		icon.lineTo(PLAY.LEFT, PLAY.BOTTOM);
		icon.closePath();
		icon.fill();
		
		return icon;
	}

	static createPauseIcon(theme: TimelineTheme): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { PAUSE } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		icon.rect(PAUSE.RECT1_X, PAUSE.TOP, PAUSE.WIDTH, PAUSE.HEIGHT);
		icon.rect(PAUSE.RECT2_X, PAUSE.TOP, PAUSE.WIDTH, PAUSE.HEIGHT);
		icon.fill();
		
		return icon;
	}

	static createFrameBackIcon(theme: TimelineTheme): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { FRAME_STEP } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		
		// First triangle
		icon.moveTo(FRAME_STEP.TRIANGLE1.BACK.LEFT, FRAME_STEP.TOP);
		icon.lineTo(FRAME_STEP.TRIANGLE1.BACK.RIGHT, FRAME_STEP.TRIANGLE1.BACK.MIDDLE);
		icon.lineTo(FRAME_STEP.TRIANGLE1.BACK.LEFT, FRAME_STEP.BOTTOM);
		icon.closePath();
		
		// Second triangle
		icon.moveTo(FRAME_STEP.TRIANGLE2.BACK.LEFT, FRAME_STEP.TOP);
		icon.lineTo(FRAME_STEP.TRIANGLE2.BACK.RIGHT, FRAME_STEP.TRIANGLE2.BACK.MIDDLE);
		icon.lineTo(FRAME_STEP.TRIANGLE2.BACK.LEFT, FRAME_STEP.BOTTOM);
		icon.closePath();
		
		icon.fill();
		
		return icon;
	}

	static createFrameForwardIcon(theme: TimelineTheme): PIXI.Graphics {
		const icon = new PIXI.Graphics();
		const { FRAME_STEP } = TOOLBAR_CONSTANTS.ICON;
		
		icon.fill({ color: theme.colors.ui.icon });
		
		// First triangle
		icon.moveTo(FRAME_STEP.TRIANGLE1.FORWARD.LEFT, FRAME_STEP.TOP);
		icon.lineTo(FRAME_STEP.TRIANGLE1.FORWARD.RIGHT, FRAME_STEP.TRIANGLE1.FORWARD.MIDDLE);
		icon.lineTo(FRAME_STEP.TRIANGLE1.FORWARD.LEFT, FRAME_STEP.BOTTOM);
		icon.closePath();
		
		// Second triangle
		icon.moveTo(FRAME_STEP.TRIANGLE2.FORWARD.LEFT, FRAME_STEP.TOP);
		icon.lineTo(FRAME_STEP.TRIANGLE2.FORWARD.RIGHT, FRAME_STEP.TRIANGLE2.FORWARD.MIDDLE);
		icon.lineTo(FRAME_STEP.TRIANGLE2.FORWARD.LEFT, FRAME_STEP.BOTTOM);
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