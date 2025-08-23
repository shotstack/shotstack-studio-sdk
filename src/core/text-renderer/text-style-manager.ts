import type { CanvasKit, Paint, Font, Canvas } from "canvaskit-wasm";
import type { CanvasConfig } from "./types";
import { GradientBuilder } from "./gradient-builder";
import { TextMeasurement } from "./text-measurement";
import { CanvasKitManager } from "./canvas-kit-manager";

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

	setConfig(config: CanvasConfig) {
		this.config = config;
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

	async createStyledFont(typeface?: any): Promise<Font> {
		const ck = this.canvasKit;
		const ckManager = CanvasKitManager.getInstance();

		let tf = await ckManager.getTypefaceForFont(this.config.fontFamily, this.config.fontWeight, this.config.fontStyle);

		if (!tf) {
			try {
				const fontMgr = ckManager.getFontManager();
				if (fontMgr && fontMgr.countFamilies() > 0) {
					const weightEnum = this.getWeightEnum(this.config.fontWeight);
					const style = {
						weight: weightEnum,
						width: ck.FontWidth.Normal,
						slant: this.getSlantEnum(this.config.fontStyle)
					} as any;
					tf = fontMgr.matchFamilyStyle(this.config.fontFamily, style) ?? null;
				}
			} catch (e) {
				console.warn("Font matching fallback failed:", e);
			}
		}

		if (!tf && typeface) tf = typeface;

		const font = new ck.Font(tf ?? null);
		font.setSize(this.config.fontSize);
		this.applyFontStyles(font);
		return font;
	}

	private applyFontStyles(font: Font): void {
		if (this.config.fontWeight) {
			const w = typeof this.config.fontWeight === "string" ? parseInt(this.config.fontWeight, 10) : this.config.fontWeight;
			if (!Number.isNaN(w) && w > 500) font.setEmbolden(true);
		}
		if (this.config.fontStyle === "italic" || this.config.fontStyle === "oblique") {
			font.setSkewX(-0.25);
		}
	}

	private getWeightEnum(weight?: string | number) {
		const ck = this.canvasKit;
		if (typeof weight === "string") {
			const s = weight.toLowerCase();
			if (s === "normal") return ck.FontWeight.Normal;
			if (s === "bold") return ck.FontWeight.Bold;
			const n = parseInt(weight, 10);
			if (!Number.isNaN(n)) weight = n;
			else return ck.FontWeight.Normal;
		}
		const n = Math.max(1, Math.min(1000, (weight as number) ?? 400));
		if (n <= 100) return ck.FontWeight.Thin;
		if (n <= 200) return ck.FontWeight.ExtraLight;
		if (n <= 300) return ck.FontWeight.Light;
		if (n <= 400) return ck.FontWeight.Normal;
		if (n <= 500) return ck.FontWeight.Medium;
		if (n <= 600) return ck.FontWeight.SemiBold;
		if (n <= 700) return ck.FontWeight.Bold;
		if (n <= 800) return ck.FontWeight.ExtraBold;
		if (n <= 900) return ck.FontWeight.Black;
		return ck.FontWeight.ExtraBlack;
	}

	private getSlantEnum(style?: string) {
		const ck = this.canvasKit;
		if (style === "italic") return ck.FontSlant.Italic;
		if (style === "oblique") return ck.FontSlant.Oblique;
		return ck.FontSlant.Upright;
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
		if (!this.config.textDecoration || this.config.textDecoration === "none") return;

		const paint = new this.canvasKit.Paint();
		const color = this.parseColor(this.config.color);
		color[3] = (this.config.opacity ?? 1) * color[3];
		paint.setColor(color);
		paint.setStyle(this.canvasKit.PaintStyle.Stroke);
		paint.setStrokeWidth(Math.max(1, this.config.fontSize / 20));
		paint.setAntiAlias(true);

		let decorationY = y;
		if (this.config.textDecoration === "underline") decorationY += this.config.fontSize * 0.15;
		else if (this.config.textDecoration === "line-through") decorationY -= this.config.fontSize * 0.3;

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
		const sh = this.config.shadow;
		if (!sh) return;

		const paint = new this.canvasKit.Paint();
		const color = this.parseColor(sh.color);
		color[3] = (sh.opacity ?? 1) * (this.config.opacity ?? 1);
		paint.setColor(color);
		paint.setAntiAlias(true);

		if (sh.blur > 0) {
			const blur = this.canvasKit.MaskFilter.MakeBlur(this.canvasKit.BlurStyle.Normal, sh.blur / 2, false);
			paint.setMaskFilter(blur);
		}

		renderTextFn(canvas, text, x + (sh.offsetX ?? 0), y + (sh.offsetY ?? 0), paint, font);
		paint.delete();
	}

	renderTextStroke(
		canvas: Canvas,
		text: string,
		x: number,
		y: number,
		font: Font,
		renderTextFn: (canvas: Canvas, text: string, x: number, y: number, paint: Paint, font: Font) => void
	): void {
		const st = this.config.stroke;
		if (!st || st.width <= 0) return;

		const paint = new this.canvasKit.Paint();
		const color = this.parseColor(st.color);
		color[3] = (st.opacity ?? 1) * (this.config.opacity ?? 1);
		paint.setColor(color);
		paint.setStyle(this.canvasKit.PaintStyle.Stroke);
		paint.setStrokeWidth(st.width);
		paint.setAntiAlias(true);
		paint.setStrokeJoin(this.canvasKit.StrokeJoin.Round);
		paint.setStrokeCap(this.canvasKit.StrokeCap.Round);

		renderTextFn(canvas, text, x, y, paint, font);
		paint.delete();
	}

	parseColor(color: string): Float32Array {
		if (color.startsWith("#")) {
			const hex = color.replace("#", "");
			const r = parseInt(hex.slice(0, 2), 16) / 255;
			const g = parseInt(hex.slice(2, 4), 16) / 255;
			const b = parseInt(hex.slice(4, 6), 16) / 255;
			const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
			return this.canvasKit.Color4f(r, g, b, a);
		}
		const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*(\d*\.?\d+)?\)/);
		if (rgba) {
			return this.canvasKit.Color4f(parseInt(rgba[1]) / 255, parseInt(rgba[2]) / 255, parseInt(rgba[3]) / 255, parseFloat(rgba[4] || "1"));
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
					.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
		this.textMeasurement.cleanup();
	}
}
