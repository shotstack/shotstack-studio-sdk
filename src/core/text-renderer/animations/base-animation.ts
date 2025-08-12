import { gsap } from "gsap";
import type { CanvasKit, Surface, Canvas, Font, Paint } from "canvaskit-wasm";
import type { CanvasConfig, AnimationFrame } from "../types";
import { TextLayoutEngine } from "../text-layout-engine";
import { TextStyleManager } from "../text-style-manager";
import { CanvasKitManager } from "../canvas-kit-manager";

export interface AnimationState {
	progress: number;
	currentFrame: number;
	totalFrames: number;
	isComplete: boolean;
}
export interface AnimationUnit {
	text: string;
	x: number;
	y: number;
	opacity: number;
	scale: number;
	rotation: number;
	finalX: number;
	finalY: number;
}

export abstract class BaseAnimation {
	protected canvasKit: CanvasKit;
	protected config: CanvasConfig;

	protected surface: Surface | null = null;
	protected canvas: Canvas | null = null;

	protected layoutEngine: TextLayoutEngine;
	protected styleManager: TextStyleManager;
	protected timeline: gsap.core.Timeline;
	protected frames: AnimationFrame[] = [];
	protected pixelRatio: number = 2;
	protected font: Font | null = null;

	constructor(canvasKit: CanvasKit, config: CanvasConfig) {
		this.canvasKit = canvasKit;
		this.config = config;
		this.pixelRatio = config.pixelRatio || 2;
		this.layoutEngine = new TextLayoutEngine(canvasKit, config);
		this.styleManager = new TextStyleManager(canvasKit, config);
		this.timeline = gsap.timeline({ paused: true });
	}

	protected async initializeSurface(): Promise<void> {
		const width = this.config.width * this.pixelRatio;
		const height = this.config.height * this.pixelRatio;

		const manager = CanvasKitManager.getInstance();
		this.surface = await manager.createOffscreenSurface(width, height);
		this.canvas = this.surface.getCanvas();
		this.canvas.scale(this.pixelRatio, this.pixelRatio);

		this.font = await this.styleManager.createStyledFont();
	}

	abstract generateFrames(text: string): Promise<AnimationFrame[]>;

	protected clearCanvas(): void {
		if (!this.canvas || !this.canvasKit) return;
		const bg = (this.config as any).backgroundColor as string | undefined;
		const bgOpacity = (this.config as any).backgroundOpacity as number | undefined;

		if (bg && bg !== "transparent") {
			const paint = new this.canvasKit.Paint();
			const color = this.styleManager.parseColor(bg);
			if (bgOpacity !== undefined) color[3] = Math.max(0, Math.min(1, bgOpacity)) * color[3];
			paint.setColor(color);

			const radius = (this.config as any).borderRadius ?? 0;
			if (radius > 0) {
				const path = this.styleManager.createRoundedRectPath(0, 0, this.config.width, this.config.height, radius);
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

	protected captureFrame(frameNumber: number, timestamp: number): AnimationFrame {
		if (!this.surface || !this.canvasKit) throw new Error("Surface not initialized");

		this.surface.flush();
		const snapshot = this.surface.makeImageSnapshot();
		if (!snapshot) throw new Error("Failed to create snapshot");

		try {
			const width = this.config.width * this.pixelRatio;
			const height = this.config.height * this.pixelRatio;

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
				if (!result) throw new Error("Failed to read pixels from image");
				const bytes = mallocObj.toTypedArray();
				const imageData = new ImageData(new Uint8ClampedArray(bytes), width, height);
				return { frameNumber, timestamp, imageData };
			} finally {
				this.canvasKit.Free(mallocObj);
			}
		} finally {
			snapshot.delete();
		}
	}

	protected parseColor(color: string): Float32Array {
		return this.styleManager.parseColor(color);
	}

	protected applyTextTransform(text: string): string {
		return this.styleManager.applyTextTransform(text);
	}

	protected getStartPosition(finalX: number, finalY: number, direction?: string): { x: number; y: number } {
		const offset = 50;
		switch (direction) {
			case "left":
				return { x: -offset, y: finalY };
			case "right":
				return { x: this.config.width + offset, y: finalY };
			case "up":
			case "top":
				return { x: finalX, y: -offset };
			case "down":
			case "bottom":
				return { x: finalX, y: this.config.height + offset };
			default:
				return { x: finalX, y: finalY };
		}
	}

	protected renderStyledText(text: string, x: number, y: number, opacity: number = 1, scale: number = 1, rotation: number = 0): void {
		if (!this.canvas || !this.canvasKit || !this.font) return;

		this.canvas.save();

		if (scale !== 1 || rotation !== 0) {
			this.canvas.translate(x, y);
			if (scale !== 1) this.canvas.scale(scale, scale);
			if (rotation !== 0) this.canvas.rotate((rotation * 180) / Math.PI, 0, 0);
			this.canvas.translate(-x, -y);
		}

		const bounds = { x, y: y - this.config.fontSize, width: this.config.width, height: this.config.fontSize };
		const combinedAlpha = (this.config.opacity ?? 1) * opacity;

		const renderLetters = (canvas: Canvas, t: string, lx: number, ly: number, paint: Paint, font: Font) => {
			if (combinedAlpha < 1) paint.setAlphaf(combinedAlpha);
			this.styleManager.renderTextWithLetterSpacing(canvas, t, lx, ly, paint, font);
		};

		if (this.config.shadow && combinedAlpha > 0.01) {
			this.styleManager.renderTextShadow(this.canvas, text, x, y, this.font, (c, t, lx, ly, p, f) => {
				if (combinedAlpha < 1) p.setAlphaf((this.config.shadow?.opacity ?? 1) * combinedAlpha);
				this.styleManager.renderTextWithLetterSpacing(c, t, lx, ly, p, f);
			});
		}

		if (this.config.stroke && this.config.stroke.width > 0 && combinedAlpha > 0.01) {
			this.styleManager.renderTextStroke(this.canvas, text, x, y, this.font, (c, t, lx, ly, p, f) => {
				if (combinedAlpha < 1) p.setAlphaf((this.config.stroke?.opacity ?? 1) * combinedAlpha);
				this.styleManager.renderTextWithLetterSpacing(c, t, lx, ly, p, f);
			});
		}

		const fillPaint = new this.canvasKit.Paint();
		this.styleManager.applyTextStyles(fillPaint, bounds);
		if (combinedAlpha < 1) fillPaint.setAlphaf(combinedAlpha);
		this.styleManager.renderTextWithLetterSpacing(this.canvas, text, x, y, fillPaint, this.font);

		const textWidth = this.layoutEngine.measureTextWithLetterSpacing(text, this.font);
		this.styleManager.applyTextDecoration(this.canvas, text, x, y, textWidth, this.font);

		fillPaint.delete();
		this.canvas.restore();
	}

	cleanup(): void {
		if (this.font) {
			this.font.delete();
			this.font = null;
		}
		if (this.surface) {
			this.surface.delete();
			this.surface = null;
		}
		this.canvas = null;
		this.layoutEngine.cleanup();
		this.styleManager.cleanup();
		this.timeline.kill();
		this.frames = [];
	}
}
