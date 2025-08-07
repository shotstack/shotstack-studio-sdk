import { CanvasKitManager } from "./canvas-kit-manager";
import { FontManager } from "./font-manager";
import { CANVAS_CONFIG } from "./config";
import type { CanvasConfig, TextMetrics, RenderResult } from "./types";
import type { CanvasKit, Surface, Canvas } from "canvaskit-wasm";

export class TextRenderEngine {
	private canvasKitManager: CanvasKitManager;
	private fontManager: FontManager;
	private canvasKit: CanvasKit | null = null;
	private surface: Surface | null = null;
	private canvas: Canvas | null = null;
	private config: CanvasConfig | null = null;
	private pixelRatio: number = 2;

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

		this.canvasKit = await this.canvasKitManager.initialize();

		await this.fontManager.initialize();

		if (this.config.customFonts && this.config.customFonts.length > 0) {
			await this.fontManager.loadCustomFonts(this.config.customFonts);
		}

		const systemFonts = ["Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia", "Verdana"];
		if (!systemFonts.includes(this.config.fontFamily)) {
			try {
				await this.fontManager.loadGoogleFont(this.config.fontFamily, this.config.fontWeight?.toString() || "400");
			} catch (error) {
				console.warn(`Could not load Google Font ${this.config.fontFamily}, using fallback`);
			}
		}

		const width = this.config.width * this.pixelRatio;
		const height = this.config.height * this.pixelRatio;

		this.surface = await this.canvasKitManager.createOffscreenSurface(width, height);
		this.canvas = this.surface.getCanvas();

		this.canvas.scale(this.pixelRatio, this.pixelRatio);

		console.log(`📐 Canvas initialized: ${this.config.width}x${this.config.height} @ ${this.pixelRatio}x DPI`);
	}

	async renderText(text?: string): Promise<RenderResult> {
		if (!this.canvasKit || !this.canvas || !this.config) {
			throw new Error("Engine not initialized");
		}

		const textToRender = text || this.config.text;

		this.clearCanvas();

		const paint = new this.canvasKit.Paint();
		paint.setColor(this.parseColor(this.config.color));
		paint.setAntiAlias(true);

		const font = new this.canvasKit.Font();
		font.setSize(this.config.fontSize);

		if (this.config.fontWeight && parseInt(this.config.fontWeight.toString()) > 500) {
			font.setEmbolden(true);
		}

		if (this.config.fontStyle === "italic") {
			font.setSkewX(-0.25);
		}

		const textMetrics = this.measureText(textToRender, font);
		const position = this.calculateTextPosition(textMetrics);

		const transformedText = this.applyTextTransform(textToRender);

		if (this.config.shadow) {
			this.renderShadow(transformedText, position, font);
		}

		this.canvas.drawText(transformedText, position.x, position.y, paint, font);

		if (this.config.stroke && this.config.stroke.width > 0) {
			this.renderStroke(transformedText, position, font);
		}

		if (this.config.textDecoration && this.config.textDecoration !== "none") {
			this.applyTextDecoration(transformedText, position, textMetrics);
		}

		const imageData = this.getImageData();

		paint.delete();
		font.delete();

		return {
			type: "image",
			data: imageData,
			metadata: {
				width: this.config.width,
				height: this.config.height
			}
		};
	}

	private clearCanvas(): void {
		if (!this.canvas || !this.canvasKit || !this.config) return;

		const paint = new this.canvasKit.Paint();

		if (this.config.backgroundColor && this.config.backgroundColor !== "transparent") {
			paint.setColor(this.parseColor(this.config.backgroundColor));
			this.canvas.drawRect(this.canvasKit.XYWHRect(0, 0, this.config.width, this.config.height), paint);
		} else {
			this.canvas.clear(this.canvasKit.TRANSPARENT);
		}

		paint.delete();
	}

	private measureText(text: string, font: any): TextMetrics {
		if (!this.canvasKit) {
			throw new Error("CanvasKit not initialized");
		}

		const metrics = font.measureText(text);
		const fontMetrics = this.fontManager.getFontMetrics(this.config!.fontFamily, this.config!.fontSize);

		return {
			width: metrics.width,
			height: fontMetrics.ascent + fontMetrics.descent,
			ascent: fontMetrics.ascent,
			descent: fontMetrics.descent,
			lineHeight: fontMetrics.lineHeight
		};
	}

	private calculateTextPosition(metrics: TextMetrics): { x: number; y: number } {
		if (!this.config) throw new Error("Config not initialized");

		let x = 0;
		let y = 0;

		switch (this.config.textAlign) {
			case "left":
				x = 0;
				break;
			case "center":
				x = (this.config.width - metrics.width) / 2;
				break;
			case "right":
				x = this.config.width - metrics.width;
				break;
		}

		switch (this.config.textBaseline) {
			case "top":
				y = metrics.ascent;
				break;
			case "middle":
				y = this.config.height / 2 + metrics.ascent / 2;
				break;
			case "bottom":
				y = this.config.height - metrics.descent;
				break;
			default:
				y = this.config.height / 2;
		}

		return { x, y };
	}

	private applyTextTransform(text: string): string {
		if (!this.config) return text;

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

	private renderShadow(text: string, position: { x: number; y: number }, font: any): void {
		if (!this.canvas || !this.canvasKit || !this.config?.shadow) return;

		const paint = new this.canvasKit.Paint();
		const shadowColor = this.parseColor(this.config.shadow.color);
		shadowColor[3] = this.config.shadow.opacity;
		paint.setColor(shadowColor);

		paint.setMaskFilter(this.canvasKit.MaskFilter.MakeBlur(this.canvasKit.BlurStyle.Normal, this.config.shadow.blur, false));

		this.canvas.drawText(text, position.x + this.config.shadow.offsetX, position.y + this.config.shadow.offsetY, paint, font);

		paint.delete();
	}

	private renderStroke(text: string, position: { x: number; y: number }, font: any): void {
		if (!this.canvas || !this.canvasKit || !this.config?.stroke) return;

		const paint = new this.canvasKit.Paint();
		const strokeColor = this.parseColor(this.config.stroke.color);
		strokeColor[3] = this.config.stroke.opacity;
		paint.setColor(strokeColor);
		paint.setStyle(this.canvasKit.PaintStyle.Stroke);
		paint.setStrokeWidth(this.config.stroke.width);

		this.canvas.drawText(text, position.x, position.y, paint, font);

		paint.delete();
	}

	private applyTextDecoration(text: string, position: { x: number; y: number }, metrics: TextMetrics): void {
		if (!this.canvas || !this.canvasKit || !this.config) return;

		const paint = new this.canvasKit.Paint();
		paint.setColor(this.parseColor(this.config.color));
		paint.setStrokeWidth(Math.max(2, this.config.fontSize / 20));

		let y = position.y;

		if (this.config.textDecoration === "underline") {
			y += metrics.descent;
		} else if (this.config.textDecoration === "line-through") {
			y -= metrics.ascent / 2;
		}

		const path = new this.canvasKit.Path();
		path.moveTo(position.x, y);
		path.lineTo(position.x + metrics.width, y);

		this.canvas.drawPath(path, paint);

		path.delete();
		paint.delete();
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
		if (!this.surface || !this.canvasKit) {
			throw new Error("Surface not initialized");
		}

		this.surface.flush();

		const snapshot = this.surface.makeImageSnapshot();
		if (!snapshot) {
			throw new Error("Failed to create image snapshot");
		}

		try {
			const width = this.config!.width * this.pixelRatio;
			const height = this.config!.height * this.pixelRatio;

			const imageInfo = {
				width: width,
				height: height,
				colorType: this.canvasKit.ColorType.RGBA_8888,
				alphaType: this.canvasKit.AlphaType.Unpremul,
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

				return new ImageData(new Uint8ClampedArray(bytes), width, height);
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
		this.canvas = null;
		this.canvasKit = null;
		this.config = null;

		console.log("🧹 Text Render Engine cleaned up");
	}

	getConfig(): CanvasConfig | null {
		return this.config;
	}

	isInitialized(): boolean {
		return this.canvasKit !== null && this.surface !== null;
	}
}
