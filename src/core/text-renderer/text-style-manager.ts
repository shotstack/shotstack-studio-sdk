import type { CanvasKit, Paint, Font, Canvas } from "canvaskit-wasm";
import type { CanvasConfig } from "./types";
import { GradientBuilder } from "./gradient-builder";
import { TextMeasurement } from "./text-measurement";

export class TextStyleManager {
	private canvasKit: CanvasKit;
	private config: CanvasConfig;
	private gradientBuilder: GradientBuilder;
	private textMeasurement: TextMeasurement;

	constructor(canvasKit: CanvasKit, config: CanvasConfig) {
		this.canvasKit = canvasKit;
		this.config = config;
		this.gradientBuilder = new GradientBuilder(canvasKit);
		this.textMeasurement = new TextMeasurement(canvasKit);
	}

	applyTextStyles(paint: Paint, bounds?: { x: number; y: number; width: number; height: number }): void {
		if (this.config.gradient && bounds) {
			const shader = this.gradientBuilder.createGradient(this.config.gradient, bounds);
			paint.setShader(shader);
		} else {
			paint.setColor(this.parseColor(this.config.color));
		}

		if (this.config.opacity !== undefined && this.config.opacity < 1) {
			paint.setAlphaf(this.config.opacity);
		}

		paint.setAntiAlias(true);
	}

	createStyledFont(typeface?: any): Font {
		const font = new this.canvasKit.Font(typeface);
		font.setSize(this.config.fontSize);

		if (this.config.fontWeight) {
			const weight = typeof this.config.fontWeight === "string" ? parseInt(this.config.fontWeight) : this.config.fontWeight;

			if (weight > 500) {
				font.setEmbolden(true);
			}
		}

		if (this.config.fontStyle === "italic" || this.config.fontStyle === "oblique") {
			font.setSkewX(-0.25);
		}

		return font;
	}

	renderTextWithLetterSpacing(canvas: Canvas, text: string, x: number, y: number, paint: Paint, font: Font): void {
		if (!this.config.letterSpacing || this.config.letterSpacing === 0) {
			canvas.drawText(text, x, y, paint, font);
			return;
		}

		const letterSpacing = this.config.letterSpacing * this.config.fontSize;
		let currentX = x;

		for (const char of text) {
			canvas.drawText(char, currentX, y, paint, font);

			const charMetrics = this.textMeasurement.measureText(char, font);
			currentX += charMetrics.width + letterSpacing;
		}
	}

	applyTextDecoration(canvas: Canvas, text: string, x: number, y: number, width: number, font: Font): void {
		if (!this.config.textDecoration || this.config.textDecoration === "none") {
			return;
		}

		const paint = new this.canvasKit.Paint();
		paint.setColor(this.parseColor(this.config.color));
		paint.setStyle(this.canvasKit.PaintStyle.Stroke);
		paint.setStrokeWidth(Math.max(1, this.config.fontSize / 20));
		paint.setAntiAlias(true);

		let decorationY = y;

		if (this.config.textDecoration === "underline") {
			decorationY += this.config.fontSize * 0.15;
		} else if (this.config.textDecoration === "line-through") {
			decorationY -= this.config.fontSize * 0.3;
		}

		const path = new this.canvasKit.Path();
		path.moveTo(x, decorationY);
		path.lineTo(x + width, decorationY);

		canvas.drawPath(path, paint);

		path.delete();
		paint.delete();
	}

	renderTextShadow(
		canvas: Canvas,
		text: string,
		x: number,
		y: number,
		font: Font,
		renderTextFn: (canvas: Canvas, text: string, x: number, y: number, paint: Paint, font: Font) => void
	): void {
		if (!this.config.shadow) {
			return;
		}

		const shadowPaint = new this.canvasKit.Paint();
		const shadowColor = this.parseColor(this.config.shadow.color);
		shadowColor[3] = this.config.shadow.opacity;
		shadowPaint.setColor(shadowColor);
		shadowPaint.setAntiAlias(true);

		if (this.config.shadow.blur > 0) {
			const blurFilter = this.canvasKit.MaskFilter.MakeBlur(this.canvasKit.BlurStyle.Normal, this.config.shadow.blur / 2, false);
			shadowPaint.setMaskFilter(blurFilter);
		}

		renderTextFn(canvas, text, x + this.config.shadow.offsetX, y + this.config.shadow.offsetY, shadowPaint, font);

		shadowPaint.delete();
	}

	renderTextStroke(
		canvas: Canvas,
		text: string,
		x: number,
		y: number,
		font: Font,
		renderTextFn: (canvas: Canvas, text: string, x: number, y: number, paint: Paint, font: Font) => void
	): void {
		if (!this.config.stroke || this.config.stroke.width <= 0) {
			return;
		}

		const strokePaint = new this.canvasKit.Paint();
		const strokeColor = this.parseColor(this.config.stroke.color);
		strokeColor[3] = this.config.stroke.opacity;
		strokePaint.setColor(strokeColor);
		strokePaint.setStyle(this.canvasKit.PaintStyle.Stroke);
		strokePaint.setStrokeWidth(this.config.stroke.width);
		strokePaint.setAntiAlias(true);

		strokePaint.setStrokeJoin(this.canvasKit.StrokeJoin.Round);
		strokePaint.setStrokeCap(this.canvasKit.StrokeCap.Round);

		renderTextFn(canvas, text, x, y, strokePaint, font);

		strokePaint.delete();
	}

	private parseColor(color: string): Float32Array {
		if (color.startsWith("#")) {
			const hex = color.replace("#", "");
			const r = parseInt(hex.slice(0, 2), 16) / 255;
			const g = parseInt(hex.slice(2, 4), 16) / 255;
			const b = parseInt(hex.slice(4, 6), 16) / 255;
			const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

			return this.canvasKit.Color4f(r, g, b, a);
		}

		if (color.startsWith("rgba")) {
			const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/);
			if (match) {
				return this.canvasKit.Color4f(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255, parseFloat(match[4] || "1"));
			}
		}

		if (color.startsWith("rgb")) {
			const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
			if (match) {
				return this.canvasKit.Color4f(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255, 1);
			}
		}

		return this.canvasKit.Color4f(1, 1, 1, 1);
	}

	applyTextTransform(text: string): string {
		switch (this.config.textTransform) {
			case "uppercase":
				return text.toUpperCase();
			case "lowercase":
				return text.toLowerCase();
			case "capitalize":
				return text
					.split(" ")
					.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
					.join(" ");
			default:
				return text;
		}
	}

	createRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): any {
		const path = new this.canvasKit.Path();

		if (radius <= 0) {
			path.addRect([x, y, x + width, y + height]);
		} else {
			const r = Math.min(radius, width / 2, height / 2);
			path.moveTo(x + r, y);
			path.lineTo(x + width - r, y);
			path.arcToTangent(x + width, y, x + width, y + r, r);
			path.lineTo(x + width, y + height - r);
			path.arcToTangent(x + width, y + height, x + width - r, y + height, r);
			path.lineTo(x + r, y + height);
			path.arcToTangent(x, y + height, x, y + height - r, r);
			path.lineTo(x, y + r);
			path.arcToTangent(x, y, x + r, y, r);
			path.close();
		}

		return path;
	}

	cleanup(): void {
		if (this.textMeasurement) {
			this.textMeasurement.cleanup();
		}
	}
}
