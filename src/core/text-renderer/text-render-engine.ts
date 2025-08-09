import { CanvasKitManager } from "./canvas-kit-manager";
import { FontManager } from "./font-manager";
import { TextLayoutEngine } from "./text-layout-engine";
import { TextStyleManager } from "./text-style-manager";
import { CANVAS_CONFIG } from "./config";
import type { CanvasConfig, RenderResult } from "./types";
import type { AnimationType } from "./config";
import type { CanvasKit, Surface, Canvas, Paint, Font } from "canvaskit-wasm";
import { TextMeasurement } from "./text-measurement";
import { AnimationEngine } from "./animations";

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

		this.canvasKit = await this.canvasKitManager.initialize();

		await this.fontManager.initialize();

		this.layoutEngine = new TextLayoutEngine(this.canvasKit, this.config);
		this.styleManager = new TextStyleManager(this.canvasKit, this.config);
		this.textMeasurement = new TextMeasurement(this.canvasKit);

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

		if (config.animation?.preset) {
			this.animationEngine = new AnimationEngine(this.canvasKit, this.config);
			console.log(`🎬 Animation engine initialized for ${config.animation.preset}`);
		}

		const width = this.config.width * this.pixelRatio;
		const height = this.config.height * this.pixelRatio;

		this.surface = await this.canvasKitManager.createOffscreenSurface(width, height);
		this.canvas = this.surface.getCanvas();

		this.canvas.scale(this.pixelRatio, this.pixelRatio);

		console.log(`📐 Canvas initialized: ${this.config.width}x${this.config.height} @ ${this.pixelRatio}x DPI`);
	}

	async render(text?: string): Promise<RenderResult> {
		if (this.config?.animation?.preset) {
			return this.renderAnimation(text);
		}

		return this.renderText(text);
	}

	async renderText(text?: string): Promise<RenderResult> {
		if (!this.canvasKit || !this.canvas || !this.config || !this.layoutEngine || !this.styleManager) {
			throw new Error("Engine not initialized");
		}

		const textToRender = this.styleManager.applyTextTransform(text || this.config.text);

		this.clearCanvas();

		const font = this.styleManager.createStyledFont();

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;

		const shouldWrap = this.layoutEngine.shouldWrapText(textToRender, font, maxWidth);

		if (shouldWrap || textToRender.includes("\n")) {
			await this.renderMultilineText(textToRender, font, maxWidth);
		} else {
			await this.renderSingleLineText(textToRender, font);
		}

		font.delete();

		const imageData = this.getImageData();

		return {
			type: "image",
			data: imageData,
			metadata: {
				width: this.config.width,
				height: this.config.height
			}
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
		if (!this.canvas || !this.canvasKit || !this.config || !this.styleManager || !this.layoutEngine) {
			return;
		}

		const textWidth = this.layoutEngine.measureTextWithLetterSpacing(text, font);
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
				y = this.config.height / 2;
		}

		const bounds = {
			x: x,
			y: y - fontMetrics.ascent,
			width: textWidth,
			height: fontMetrics.ascent + fontMetrics.descent
		};

		this.renderStyledText(text, x, y, font, bounds);
	}

	private async renderMultilineText(text: string, font: Font, maxWidth: number): Promise<void> {
		if (!this.canvas || !this.canvasKit || !this.config || !this.layoutEngine || !this.styleManager) {
			return;
		}

		const lines = this.layoutEngine.processTextContent(text, maxWidth, font);

		const textLines = this.layoutEngine.calculateMultilineLayout(lines, font, this.config.width, this.config.height);

		const bounds = this.layoutEngine.getTextBounds(textLines);

		textLines.forEach(line => {
			this.renderStyledText(line.text, line.x, line.y, font, bounds);
		});
	}

	private renderStyledText(text: string, x: number, y: number, font: Font, bounds: { x: number; y: number; width: number; height: number }): void {
		if (!this.canvas || !this.canvasKit || !this.styleManager) {
			return;
		}

		const renderTextFn = (canvas: Canvas, text: string, x: number, y: number, paint: Paint, font: Font) => {
			this.styleManager!.renderTextWithLetterSpacing(canvas, text, x, y, paint, font);
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
		return this.canvasKit !== null && this.surface !== null;
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
