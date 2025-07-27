import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";
import { CLIP_CONSTANTS } from "../constants";

export interface SelectionBounds {
	x: number;
	y: number;
	width: number;
	height: number;
	cornerRadius: number;
	borderWidth: number;
}

export class SelectionOverlayRenderer {
	private selectionGraphics: Map<string, PIXI.Graphics> = new Map();

	constructor(
		private overlay: PIXI.Container,
		private theme: TimelineTheme
	) {}

	public renderSelection(clipId: string, bounds: SelectionBounds, isSelected: boolean): void {
		if (!isSelected) {
			this.clearSelection(clipId);
			return;
		}

		let graphics = this.selectionGraphics.get(clipId);
		if (!graphics) {
			graphics = new PIXI.Graphics();
			graphics.label = `selection-border-${clipId}`;
			this.selectionGraphics.set(clipId, graphics);
			this.overlay.addChild(graphics);
		}

		// Update position
		graphics.position.set(bounds.x, bounds.y);

		// Clear and redraw
		graphics.clear();

		// Draw selection border
		graphics.setStrokeStyle({
			width: bounds.borderWidth * CLIP_CONSTANTS.SELECTED_BORDER_MULTIPLIER,
			color: this.theme.colors.interaction.selected
		});
		graphics.roundRect(0, 0, bounds.width, bounds.height, bounds.cornerRadius);
		graphics.stroke();
	}

	public clearSelection(clipId: string): void {
		const graphics = this.selectionGraphics.get(clipId);
		if (graphics) {
			this.overlay.removeChild(graphics);
			graphics.destroy();
			this.selectionGraphics.delete(clipId);
		}
	}

	public clearAllSelections(): void {
		this.selectionGraphics.forEach((_graphics, clipId) => {
			this.clearSelection(clipId);
		});
	}

	public updateTheme(theme: TimelineTheme): void {
		this.theme = theme;
		// Force redraw of all selections with new theme
		this.selectionGraphics.forEach(graphics => {
			graphics.clear(); // Will be redrawn on next render
		});
	}

	public getOverlay(): PIXI.Container {
		return this.overlay;
	}

	public dispose(): void {
		this.clearAllSelections();
	}
}
