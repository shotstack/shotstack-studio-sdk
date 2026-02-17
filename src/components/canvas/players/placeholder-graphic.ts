import * as pixi from "pixi.js";

/**
 * Create a placeholder graphic for unresolved assets.
 */
export function createPlaceholderGraphic(width: number, height: number): pixi.Graphics {
	const graphics = new pixi.Graphics();
	graphics.fillStyle = { color: "#cccccc", alpha: 0.5 };
	graphics.rect(0, 0, width, height);
	graphics.fill();

	graphics.strokeStyle = { color: "#999999", width: 2 };
	graphics.moveTo(0, 0);
	graphics.lineTo(width, height);
	graphics.moveTo(width, 0);
	graphics.lineTo(0, height);
	graphics.stroke();

	return graphics;
}
