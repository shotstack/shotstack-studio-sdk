import { CanvasKitManager } from "./canvas-kit-manager";
import { FontManager } from "./font-manager";
import { TextLayoutEngine } from "./text-layout-engine";
import { TextStyleManager } from "./text-style-manager";
import { CANVAS_CONFIG } from "./config";
import type { CanvasConfig, RenderResult, GradientConfig } from "./types";
import type { AnimationType } from "./config";
import type { CanvasKit, Surface, Canvas, Paint, Font, Typeface } from "canvaskit-wasm";
import { TextMeasurement } from "./text-measurement";
import { AnimationEngine } from "./animations";

type BackgroundLike =
	| {
			color: string;
			opacity?: number;
			borderRadius?: number;
	  }
	| undefined;

type StyleLike =
	| {
			gradient?: GradientConfig;
	  }
	| undefined;

export class TextRenderEngine {
	private canvasKitManager: CanvasKitManager;
	private textMeasurement: TextMeasurement | null = null;
	private fontManager: FontManager;
	private layoutEngine: TextLayoutEngine | null = null;
	private styleManager: TextStyleManager | null = null;
	private canvasKit: CanvasKit | null = null;
	private surface: Surface | null = null;
	private canvas: Canvas | null = null;
	private config: CanvasConfig | null = null;
	private pixelRatio: number = 2;
	private animationEngine: AnimationEngine | null = null;

	constructor() {
		this.canvasKitManager = CanvasKitManager.getInstance();
		this.fontManager = FontManager.getInstance();
	}

	async initialize(config: Partial<CanvasConfig>): Promise<void> {
		console.log("🎨 Initializing Text Render Engine...");

		this.config = {
			...CANVAS_CONFIG.DEFAULTS,
			...config
		} as CanvasConfig;

		this.pixelRatio = this.config.pixelRatio || 2;

		// Safely read an optional "background" object from the incoming config
		const bg: BackgroundLike = (config as unknown as { background?: BackgroundLike })?.background;
		if (bg && bg.color) {
			const hex = bg.color;
			const op = typeof bg.opacity === "number" ? Math.max(0, Math.min(1, bg.opacity)) : 1;
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			(this.config as CanvasConfig).backgroundColor = `rgba(${r}, ${g}, ${b}, ${op})`;
			if (typeof bg.borderRadius === "number") {
				(this.config as CanvasConfig).borderRadius = bg.borderRadius;
			}
		}

		// Safely read an optional "style.gradient" and map to config.gradient
		const styleLike: StyleLike = (config as unknown as { style?: StyleLike })?.style;
		if (styleLike?.gradient) {
			(this.config as CanvasConfig).gradient = styleLike.gradient;
		}

		this.canvasKit = await this.canvasKitManager.initialize();

		await this.fontManager.initialize();
		if (this.config.timelineFonts?.length) {
			await this.fontManager.loadTimelineFonts(this.config.timelineFonts);
		}

		this.textMeasurement = new TextMeasurement(this.canvasKit!);
		console.log("✅ TextMeasurement initialized");

		this.layoutEngine = new TextLayoutEngine(this.canvasKit!, this.config);
		this.styleManager = new TextStyleManager(this.canvasKit!, this.config);

		if (this.config.customFonts && this.config.customFonts.length > 0) {
			await this.fontManager.loadCustomFonts(this.config.customFonts);
		}

		await this.fontManager.ensureFamilyAvailable(
			this.config.fontFamily,
			this.config.fontWeight?.toString() || "400",
			this.config.fontStyle === "italic" ? "italic" : this.config.fontStyle === "oblique" ? "oblique" : "normal"
		);

		try {
			const weight = this.config.fontWeight?.toString() || "400";
			const stylePrefix = this.config.fontStyle === "italic" ? "italic " : this.config.fontStyle === "oblique" ? "oblique " : "";
			// Uses the DOM Font Loading API (augmented in your ambient types)
			await document.fonts?.load?.(`${stylePrefix}${weight} ${this.config.fontSize}px "${this.config.fontFamily}"`);
		} catch {
			/* ignore */
		}

		if (config.animation?.preset) {
			this.animationEngine = new AnimationEngine(this.canvasKit!, this.config);
			console.log(`🎬 Animation engine initialized for ${config.animation.preset}`);
		}

		const wantsCanvas2D = (this.config.renderer ?? "auto") === "canvas2d";
		if (!wantsCanvas2D) {
			const width = this.config.width * this.pixelRatio;
			const height = this.config.height * this.pixelRatio;

			this.surface = await this.canvasKitManager.createOffscreenSurface(width, height);
			this.canvas = this.surface.getCanvas();
			this.canvas.scale(this.pixelRatio, this.pixelRatio);

			console.log(`📐 Canvas initialized: ${this.config.width}x${this.config.height} @ ${this.pixelRatio}x DPI`);
		} else {
			console.log("🖌️ Skipping Skia surface (renderer=canvas2d).");
		}
	}

	async render(text?: string): Promise<RenderResult> {
		if (this.config?.animation?.preset) {
			return this.renderAnimation(text);
		}
		return this.renderText(text);
	}

	private checkImageDataContent(imageData: ImageData): boolean {
		const d = imageData.data;
		for (let i = 3; i < Math.min(4000, d.length); i += 4) {
			if (d[i] !== 0) return true;
		}
		return false;
	}

	async renderText(text?: string): Promise<RenderResult> {
		if (!this.config) throw new Error("Engine not initialized");
		const mode = this.config.renderer ?? "auto";

		const textToRender = this.styleManager ? this.styleManager.applyTextTransform(text || this.config.text) : text || this.config.text;

		if (mode === "canvas2d" || !this.canvasKit || !this.canvas) {
			const fallbackImageData = await this.renderTextWithCanvas2D(textToRender);
			return {
				type: "image",
				data: fallbackImageData,
				metadata: { width: this.config.width, height: this.config.height }
			};
		}

		const ck = this.canvasKit;

		const renderOnceWithTypeface = async (family: string): Promise<ImageData | null> => {
			let tf: Typeface | null = await this.canvasKitManager.getTypefaceForFont(family, this.config!.fontWeight, this.config!.fontStyle);

			if (!tf) {
				const mgr = this.canvasKitManager.getFontManager();
				if (mgr && mgr.countFamilies?.() > 0) {
					const fam0 = mgr.getFamilyName?.(0);
					if (fam0) {
						tf =
							mgr.matchFamilyStyle?.(fam0, {
								weight: ck!.FontWeight.Normal,
								width: ck!.FontWidth.Normal,
								slant: ck!.FontSlant.Upright
							}) ?? null;
					}
				}
			}

			const font = new ck!.Font(tf ?? null, this.config!.fontSize);
			try {
				this.clearCanvas();

				const padding = this.config!.fontSize * 0.5;
				const maxWidth = this.config!.width - padding * 2;

				const shouldWrap = this.layoutEngine!.shouldWrapText(textToRender, font, maxWidth);
				if (shouldWrap || textToRender.includes("\n")) {
					await this.renderMultilineText(textToRender, font, maxWidth);
				} else {
					await this.renderSingleLineText(textToRender, font);
				}

				const imageData = this.getImageData();

				const data = imageData.data;
				for (let i = 3; i < Math.min(4000, data.length); i += 4) {
					if (data[i] !== 0) {
						return imageData;
					}
				}
				return null;
			} finally {
				font.delete();
			}
		};

		const firstFamily = this.config.fontFamily || "Arial";
		const firstPass = await renderOnceWithTypeface(firstFamily);
		if (firstPass) {
			return {
				type: "image",
				data: firstPass,
				metadata: { width: this.config.width, height: this.config.height }
			};
		}

		const fallbackPass = await renderOnceWithTypeface("Roboto");
		if (fallbackPass) {
			return {
				type: "image",
				data: fallbackPass,
				metadata: { width: this.config.width, height: this.config.height }
			};
		}

		console.warn("⚠️ CanvasKit produced empty content twice, using Canvas2D fallback");
		const fallbackImageData = await this.renderTextWithCanvas2D(textToRender);
		return {
			type: "image",
			data: fallbackImageData,
			metadata: { width: this.config.width, height: this.config.height }
		};
	}

	async renderAnimation(text?: string): Promise<RenderResult> {
		if (!this.animationEngine || !this.config?.animation?.preset) {
			throw new Error("Animation not configured");
		}
		const textToRender = text || this.config.text;
		const animationType = this.config.animation.preset as AnimationType;
		console.log(`🎬 Rendering ${animationType} animation for: "${textToRender}"`);
		return this.animationEngine.generateAnimation(textToRender, animationType);
	}

	private async renderSingleLineText(text: string, font: Font): Promise<void> {
		if (!this.canvas || !this.canvasKit || !this.config || !this.styleManager || !this.layoutEngine) return;

		console.log(`Rendering single line text: "${text}"`);

		let textWidth = 0;
		try {
			textWidth = this.layoutEngine.measureTextWithLetterSpacing(text, font);
			console.log(`Measured text width via layoutEngine: ${textWidth}`);

			if (textWidth <= 0 && this.textMeasurement) {
				console.warn("Text width is 0, trying textMeasurement fallback");
				const fallbackMetrics = this.textMeasurement.measureText(text, font);
				textWidth = fallbackMetrics.width;
				console.log(`Fallback text width via textMeasurement: ${textWidth}`);
			}

			if (textWidth <= 0 && this.textMeasurement && this.config.letterSpacing) {
				console.warn("Using letter spacing measurement fallback");
				textWidth = this.textMeasurement.measureTextWithSpacing(text, font, this.config.letterSpacing * this.config.fontSize);
				console.log(`Letter spacing fallback width: ${textWidth}`);
			}

			if (textWidth <= 0) {
				textWidth = text.length * this.config.fontSize * 0.6;
				console.log(`Using estimated text width: ${textWidth}`);
			}
		} catch (error) {
			console.error("Text measurement failed:", error);
			textWidth = text.length * this.config.fontSize * 0.6;
		}

		const fontMetrics = this.fontManager.getFontMetrics(this.config.fontFamily, this.config.fontSize);

		let x = 0;
		let y = 0;

		switch (this.config.textAlign) {
			case "left":
				x = this.config.fontSize * 0.5;
				break;
			case "center":
				x = (this.config.width - textWidth) / 2;
				break;
			case "right":
				x = this.config.width - textWidth - this.config.fontSize * 0.5;
				break;
		}

		switch (this.config.textBaseline) {
			case "top":
				y = fontMetrics.ascent;
				break;
			case "middle":
				y = this.config.height / 2 + fontMetrics.ascent / 2;
				break;
			case "bottom":
				y = this.config.height - fontMetrics.descent;
				break;
			default:
				y = this.config.height / 2 + fontMetrics.ascent / 2;
		}

		console.log(`Text position: x=${x}, y=${y}, width=${textWidth}`);
		console.log(`Canvas dimensions: ${this.config.width}x${this.config.height}`);
		console.log(`Font size: ${this.config.fontSize}, Font family: ${this.config.fontFamily}`);

		const bounds = {
			x,
			y: y - fontMetrics.ascent,
			width: textWidth,
			height: fontMetrics.ascent + fontMetrics.descent
		};

		const testPaint = new this.canvasKit.Paint();
		testPaint.setColor(this.canvasKit.Color4f(1, 1, 1, 1));
		testPaint.setAntiAlias(true);

		console.log("Drawing test text...");
		this.canvas.drawText(text, x, y, testPaint, font);

		testPaint.delete();

		this.renderStyledText(text, x, y, font, bounds);
	}

	private async renderMultilineText(text: string, font: Font, maxWidth: number): Promise<void> {
		if (!this.canvas || !this.canvasKit || !this.config || !this.layoutEngine || !this.styleManager) return;

		const lines = this.layoutEngine.processTextContent(text, maxWidth, font);
		const textLines = this.layoutEngine.calculateMultilineLayout(lines, font, this.config.width, this.config.height);
		const bounds = this.layoutEngine.getTextBounds(textLines);

		textLines.forEach(line => {
			this.renderStyledText(line.text, line.x, line.y, font, bounds);
		});
	}

	private renderStyledText(text: string, x: number, y: number, font: Font, bounds: { x: number; y: number; width: number; height: number }): void {
		if (!this.canvas || !this.canvasKit || !this.styleManager) return;

		const renderTextFn = (canvas: Canvas, t: string, lx: number, ly: number, p: Paint, f: Font) => {
			this.styleManager!.renderTextWithLetterSpacing(canvas, t, lx, ly, p, f);
		};

		if (this.config?.shadow) {
			this.styleManager.renderTextShadow(this.canvas, text, x, y, font, renderTextFn);
		}

		if (this.config?.stroke) {
			this.styleManager.renderTextStroke(this.canvas, text, x, y, font, renderTextFn);
		}

		const paint = new this.canvasKit.Paint();
		this.styleManager.applyTextStyles(paint, bounds);

		renderTextFn(this.canvas, text, x, y, paint, font);

		const textWidth = this.layoutEngine?.measureTextWithLetterSpacing(text, font) || 0;
		this.styleManager.applyTextDecoration(this.canvas, text, x, y, textWidth, font);

		paint.delete();
	}

	private async renderTextWithCanvas2D(text: string): Promise<ImageData> {
		console.log("🎨 Using Canvas2D fallback for text rendering");

		const widthPx = this.config!.width * this.pixelRatio;
		const heightPx = this.config!.height * this.pixelRatio;

		const canvas = document.createElement("canvas");
		canvas.width = widthPx;
		canvas.height = heightPx;

		const ctx = canvas.getContext("2d")!;
		ctx.scale(this.pixelRatio, this.pixelRatio);

		if (this.config!.backgroundColor && this.config!.backgroundColor !== "transparent") {
			ctx.fillStyle = this.config!.backgroundColor;
			if (this.config!.borderRadius && this.config!.borderRadius > 0) {
				const radius = this.config!.borderRadius;
				ctx.beginPath();
				ctx.moveTo(radius, 0);
				ctx.lineTo(this.config!.width - radius, 0);
				ctx.quadraticCurveTo(this.config!.width, 0, this.config!.width, radius);
				ctx.lineTo(this.config!.width, this.config!.height - radius);
				ctx.quadraticCurveTo(this.config!.width, this.config!.height, this.config!.width - radius, this.config!.height);
				ctx.lineTo(radius, this.config!.height);
				ctx.quadraticCurveTo(0, this.config!.height, 0, this.config!.height - radius);
				ctx.lineTo(0, radius);
				ctx.quadraticCurveTo(0, 0, radius, 0);
				ctx.closePath();
				ctx.fill();
			} else {
				ctx.fillRect(0, 0, this.config!.width, this.config!.height);
			}
		}

		const weightPart =
			typeof this.config!.fontWeight === "string" || typeof this.config!.fontWeight === "number" ? String(this.config!.fontWeight) : "400";
		const stylePart = this.config!.fontStyle === "italic" ? "italic " : this.config!.fontStyle === "oblique" ? "oblique " : "";
		ctx.font = `${stylePart}${weightPart} ${this.config!.fontSize}px ${this.config!.fontFamily}`;

		const letterSpacingPx = (this.config!.letterSpacing ?? 0) * this.config!.fontSize;
		const finalText = this.styleManager ? this.styleManager.applyTextTransform(text) : text;

		const padding = this.config!.fontSize * 0.5;
		const maxWidth = this.config!.width - padding * 2;

		// 1) Wrap into multiple lines
		const lines = this.wrapCanvas2D(ctx, finalText, maxWidth, letterSpacingPx);

		// 2) Metrics for vertical alignment
		const metrics = ctx.measureText("M");
		const ascent = metrics.actualBoundingBoxAscent || this.config!.fontSize * 0.8;
		const descent = metrics.actualBoundingBoxDescent || this.config!.fontSize * 0.2;
		const lineHeightPx = (this.config!.lineHeight ?? 1.2) * this.config!.fontSize;
		const blockHeight = lines.length * lineHeightPx;

		// 3) Compute starting baseline Y based on textBaseline
		let startY: number;
		switch (this.config!.textBaseline) {
			case "top":
				startY = padding + ascent;
				break;
			case "middle":
				startY = this.config!.height / 2 - blockHeight / 2 + ascent;
				break;
			case "bottom":
				startY = this.config!.height - padding - (blockHeight - lineHeightPx + descent);
				break;
			case "hanging":
			case "alphabetic":
			default:
				startY = this.config!.height / 2 - blockHeight / 2 + ascent;
				break;
		}

		// 4) Draw each line with full styling
		for (let i = 0; i < lines.length; i += 1) {
			const lineText = lines[i];
			const lineWidth = this.measureCanvas2DWidth(ctx, lineText, letterSpacingPx);

			let x = 0;
			switch (this.config!.textAlign) {
				case "left":
					x = padding;
					break;
				case "center":
					x = (this.config!.width - lineWidth) / 2;
					break;
				case "right":
					x = this.config!.width - padding - lineWidth;
					break;
			}
			const y = startY + i * lineHeightPx;

			// shadow/fill/gradient for this line
			this.apply2DPaint(ctx, { localX: x, totalWidth: this.config!.width, totalHeight: this.config!.height });

			if (this.config?.stroke?.width) {
				ctx.save();
				ctx.lineWidth = this.config.stroke.width;
				ctx.strokeStyle = this.withOpacity(this.config.stroke.color, this.config.stroke.opacity ?? 1);
				this.drawTextWithLetterSpacing(ctx, lineText, x, y, letterSpacingPx, true);
				ctx.restore();
			}

			// fill
			this.drawTextWithLetterSpacing(ctx, lineText, x, y, letterSpacingPx, false);

			// decoration per line
			if (this.config!.textDecoration && this.config!.textDecoration !== "none") {
				const lineYUnderline = y + this.config!.fontSize * 0.15;
				const lineYStrike = y - this.config!.fontSize * 0.3;

				ctx.save();
				ctx.lineWidth = Math.max(1, Math.round(this.config!.fontSize * 0.06));
				ctx.strokeStyle = this.withOpacity(this.config!.color, 1);
				if (this.config!.textDecoration === "underline") {
					ctx.beginPath();
					ctx.moveTo(x, lineYUnderline);
					ctx.lineTo(x + lineWidth, lineYUnderline);
					ctx.stroke();
				} else if (this.config!.textDecoration === "line-through") {
					ctx.beginPath();
					ctx.moveTo(x, lineYStrike);
					ctx.lineTo(x + lineWidth, lineYStrike);
					ctx.stroke();
				}
				ctx.restore();
			}
		}

		return ctx.getImageData(0, 0, canvas.width, canvas.height);
	}

	private drawTextWithLetterSpacing(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, letterSpacingPx: number, doStroke: boolean) {
		if (!letterSpacingPx) {
			if (doStroke) ctx.strokeText(text, x, y);
			else ctx.fillText(text, x, y);
			return;
		}
		let cursor = x;
		for (const ch of text) {
			if (doStroke) ctx.strokeText(ch, cursor, y);
			else ctx.fillText(ch, cursor, y);
			cursor += ctx.measureText(ch).width + letterSpacingPx;
		}
	}

	private measureCanvas2DWidth(ctx: CanvasRenderingContext2D, text: string, letterSpacingPx: number): number {
		if (!letterSpacingPx) return ctx.measureText(text).width;
		let w = 0;
		for (const ch of text) {
			w += ctx.measureText(ch).width + letterSpacingPx;
		}
		if (text.length > 0) w -= letterSpacingPx;
		return w;
	}

	private apply2DPaint(ctx: CanvasRenderingContext2D, opts: { localX: number; totalWidth: number; totalHeight: number }) {
		const sh = this.config!.shadow;
		if (sh) {
			ctx.shadowColor = this.withOpacity(sh.color, sh.opacity ?? 1);
			ctx.shadowBlur = sh.blur ?? 0;
			ctx.shadowOffsetX = sh.offsetX ?? 0;
			ctx.shadowOffsetY = sh.offsetY ?? 0;
		} else {
			ctx.shadowColor = "rgba(0,0,0,0)";
			ctx.shadowBlur = 0;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
		}

		const grad = this.config!.gradient;
		if (grad && grad.type === "linear" && grad.stops?.length) {
			const angle = ((grad.angle ?? 0) * Math.PI) / 180;
			const cx = this.config!.width / 2;
			const cy = this.config!.height / 2;
			const dx = Math.cos(angle) * (this.config!.width / 2);
			const dy = Math.sin(angle) * (this.config!.height / 2);

			const g = ctx.createLinearGradient(cx - dx - opts.localX, cy - dy, cx + dx - opts.localX, cy + dy);
			for (const stop of grad.stops) g.addColorStop(stop.offset, stop.color);
			ctx.fillStyle = g;
		} else {
			ctx.fillStyle = this.config!.color;
		}
	}

	private withOpacity(hexOrCss: string, opacity: number) {
		if (!hexOrCss.startsWith("#")) return hexOrCss;

		let r: number, g: number, b: number;
		if (hexOrCss.length === 4) {
			r = parseInt(hexOrCss[1] + hexOrCss[1], 16);
			g = parseInt(hexOrCss[2] + hexOrCss[2], 16);
			b = parseInt(hexOrCss[3] + hexOrCss[3], 16);
		} else {
			r = parseInt(hexOrCss.slice(1, 3), 16);
			g = parseInt(hexOrCss.slice(3, 5), 16);
			b = parseInt(hexOrCss.slice(5, 7), 16);
		}
		return `rgba(${r},${g},${b},${opacity})`;
	}

	private clearCanvas(): void {
		if (!this.canvas || !this.canvasKit || !this.config || !this.styleManager) return;

		if (this.config.backgroundColor && this.config.backgroundColor !== "transparent") {
			const paint = new this.canvasKit.Paint();
			paint.setColor(this.parseColor(this.config.backgroundColor));

			if (this.config.borderRadius && this.config.borderRadius > 0) {
				const path = this.styleManager.createRoundedRectPath(0, 0, this.config.width, this.config.height, this.config.borderRadius);
				this.canvas.drawPath(path, paint);
				path.delete();
			} else {
				this.canvas.drawRect(this.canvasKit.XYWHRect(0, 0, this.config.width, this.config.height), paint);
			}

			paint.delete();
		} else {
			this.canvas.clear(this.canvasKit.TRANSPARENT);
		}
	}

	private wrapCanvas2D(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, letterSpacingPx: number): string[] {
		const lines: string[] = [];
		const paragraphs = String(text).split(/\r?\n/);

		for (const para of paragraphs) {
			if (!para) {
				lines.push("");
				continue;
			}
			const words = para.split(" ");
			let line = "";

			for (const word of words) {
				const tentative = line ? `${line} ${word}` : word;
				const w = this.measureCanvas2DWidth(ctx, tentative, letterSpacingPx);
				if (w <= maxWidth || !line) {
					line = tentative;
				} else {
					lines.push(line);
					line = word;
				}
			}
			lines.push(line);
		}
		return lines;
	}

	private parseColor(color: string): Float32Array {
		if (!this.canvasKit) throw new Error("CanvasKit not initialized");

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

		return this.canvasKit.Color4f(1, 1, 1, 1);
	}

	private getImageData(): ImageData {
		if (!this.surface || !this.canvasKit) throw new Error("Surface not initialized");

		this.surface.flush();

		const snapshot = this.surface.makeImageSnapshot();
		if (!snapshot) throw new Error("Failed to create image snapshot");

		try {
			const width = this.config!.width * this.pixelRatio;
			const height = this.config!.height * this.pixelRatio;

			console.log(`Creating ImageData: ${width}x${height}`);

			const imageInfo = {
				width,
				height,
				colorType: this.canvasKit.ColorType.RGBA_8888,
				alphaType: this.canvasKit.AlphaType.Premul,
				colorSpace: this.canvasKit.ColorSpace.SRGB
			};

			const bytesPerRow = 4 * width;
			const totalBytes = bytesPerRow * height;

			const mallocObj = this.canvasKit.Malloc(Uint8Array, totalBytes);

			try {
				const result = snapshot.readPixels(0, 0, imageInfo, mallocObj, bytesPerRow);
				if (!result) {
					throw new Error("Failed to read pixels from image");
				}

				const bytes = mallocObj.toTypedArray();

				let hasContent = false;
				for (let i = 3; i < bytes.length; i += 4) {
					if (bytes[i] !== 0) {
						hasContent = true;
						break;
					}
				}
				console.log(`ImageData has content: ${hasContent}`);

				const clamped = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength);
				return new ImageData(clamped, width, height);
			} finally {
				this.canvasKit.Free(mallocObj);
			}
		} finally {
			snapshot.delete();
		}
	}

	cleanup(): void {
		if (this.surface) {
			this.surface.delete();
			this.surface = null;
		}
		if (this.textMeasurement) {
			this.textMeasurement.cleanup();
			this.textMeasurement = null;
		}
		if (this.layoutEngine) {
			this.layoutEngine.cleanup();
			this.layoutEngine = null;
		}
		if (this.styleManager) {
			this.styleManager.cleanup();
			this.styleManager = null;
		}
		if (this.animationEngine) {
			this.animationEngine.cleanup();
			this.animationEngine = null;
		}
		this.canvas = null;
		this.canvasKit = null;
		this.config = null;

		console.log("🧹 Text Render Engine cleaned up");
	}

	getConfig(): CanvasConfig | null {
		return this.config;
	}

	isInitialized(): boolean {
		return this.canvasKit !== null && (this.surface !== null || (this.config?.renderer ?? "auto") === "canvas2d");
	}

	getAnimationEngine(): AnimationEngine | null {
		return this.animationEngine;
	}

	updateConfig(config: Partial<CanvasConfig>): void {
		if (!this.config) {
			throw new Error("Engine not initialized");
		}

		this.config = {
			...this.config,
			...config
		};

		if (config.animation?.preset && this.canvasKit) {
			this.animationEngine = new AnimationEngine(this.canvasKit, this.config);
		}
	}
}
