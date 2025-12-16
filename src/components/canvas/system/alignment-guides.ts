import * as pixi from "pixi.js";

const GUIDE_COLOR = 0xff00ff; // Bright magenta
const GUIDE_WIDTH = 2;
const DASH_LENGTH = 6;
const GAP_LENGTH = 4;

export class AlignmentGuides {
	private graphics: pixi.Graphics;
	private canvasWidth: number;
	private canvasHeight: number;

	constructor(container: pixi.Container, canvasWidth: number, canvasHeight: number) {
		this.canvasWidth = canvasWidth;
		this.canvasHeight = canvasHeight;

		this.graphics = new pixi.Graphics();
		this.graphics.zIndex = 999999; // Above everything
		container.addChild(this.graphics);
	}

	clear(): void {
		this.graphics.clear();
	}

	/**
	 * Draw a solid guide line for canvas alignment (extends full canvas width/height)
	 */
	drawCanvasGuide(axis: "x" | "y", position: number): void {
		this.graphics.strokeStyle = { width: GUIDE_WIDTH, color: GUIDE_COLOR };

		if (axis === "x") {
			// Vertical line at x position
			this.graphics.moveTo(position, 0);
			this.graphics.lineTo(position, this.canvasHeight);
		} else {
			// Horizontal line at y position
			this.graphics.moveTo(0, position);
			this.graphics.lineTo(this.canvasWidth, position);
		}
		this.graphics.stroke();
	}

	/**
	 * Draw a dotted guide line for clip-to-clip alignment (bounded to clip area)
	 */
	drawClipGuide(axis: "x" | "y", position: number, start: number, end: number): void {
		if (axis === "x") {
			// Vertical dotted line
			this.drawDashedLine(position, start, position, end);
		} else {
			// Horizontal dotted line
			this.drawDashedLine(start, position, end, position);
		}
	}

	private drawDashedLine(x1: number, y1: number, x2: number, y2: number): void {
		const dx = x2 - x1;
		const dy = y2 - y1;
		const length = Math.sqrt(dx * dx + dy * dy);
		const dashCount = Math.floor(length / (DASH_LENGTH + GAP_LENGTH));

		const unitX = dx / length;
		const unitY = dy / length;

		this.graphics.strokeStyle = { width: GUIDE_WIDTH, color: GUIDE_COLOR };

		for (let i = 0; i < dashCount; i += 1) {
			const startOffset = i * (DASH_LENGTH + GAP_LENGTH);
			const endOffset = startOffset + DASH_LENGTH;

			const startX = x1 + unitX * startOffset;
			const startY = y1 + unitY * startOffset;
			const endX = x1 + unitX * Math.min(endOffset, length);
			const endY = y1 + unitY * Math.min(endOffset, length);

			this.graphics.moveTo(startX, startY);
			this.graphics.lineTo(endX, endY);
		}
		this.graphics.stroke();
	}

	dispose(): void {
		this.graphics.destroy();
	}
}
