import type { CanvasKit, Font, Paint } from "canvaskit-wasm";

export class TextMeasurement {
	private canvasKit: CanvasKit;
	private paint: Paint;

	constructor(canvasKit: CanvasKit) {
		this.canvasKit = canvasKit;
		this.paint = new canvasKit.Paint();
	}

	measureText(text: string, font: Font): { width: number; height: number } {
		if (!text) {
			return { width: 0, height: 0 };
		}

		const glyphIDs = font.getGlyphIDs(text);
		const glyphWidths = font.getGlyphWidths(glyphIDs, this.paint);

		let totalWidth = 0;
		for (let i = 0; i < glyphWidths.length; i++) {
			totalWidth += glyphWidths[i];
		}

		const metrics = font.getMetrics();
		const height = metrics.descent - metrics.ascent;

		return {
			width: totalWidth,
			height: height
		};
	}

	measureTextWithSpacing(text: string, font: Font, letterSpacing: number): number {
		if (!text) return 0;

		let totalWidth = 0;

		for (let i = 0; i < text.length; i++) {
			const charMetrics = this.measureText(text[i], font);
			totalWidth += charMetrics.width;

			if (i < text.length - 1 && letterSpacing) {
				totalWidth += letterSpacing;
			}
		}

		return totalWidth;
	}

	getGlyphBounds(text: string, font: Font): Float32Array {
		const glyphIDs = font.getGlyphIDs(text);
		const bounds = font.getGlyphBounds(glyphIDs, this.paint);
		return bounds;
	}

	cleanup(): void {
		if (this.paint) {
			this.paint.delete();
		}
	}
}
