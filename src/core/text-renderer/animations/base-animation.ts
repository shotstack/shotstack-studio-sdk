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

		this.font = this.styleManager.createStyledFont();
	}

	abstract generateFrames(text: string): Promise<AnimationFrame[]>;

	protected clearCanvas(): void {
		if (!this.canvas || !this.canvasKit) return;

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

	protected captureFrame(frameNumber: number, timestamp: number): AnimationFrame {
		if (!this.surface || !this.canvasKit) {
			throw new Error("Surface not initialized");
		}

		this.surface.flush();
		const snapshot = this.surface.makeImageSnapshot();

		if (!snapshot) {
			throw new Error("Failed to create snapshot");
		}

		try {
			const width = this.config.width * this.pixelRatio;
			const height = this.config.height * this.pixelRatio;

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

				const imageData = new ImageData(new Uint8ClampedArray(bytes), width, height);

				return {
					frameNumber,
					timestamp,
					imageData
				};
			} finally {
				this.canvasKit.Free(mallocObj);
			}
		} finally {
			snapshot.delete();
		}
	}

	protected parseColor(color: string): Float32Array {
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
			if (scale !== 1) {
				this.canvas.scale(scale, scale);
			}
			if (rotation !== 0) {
				const angleInDegrees = rotation * (180 / Math.PI);
				this.canvas.rotate(angleInDegrees, 0, 0);
			}
			this.canvas.translate(-x, -y);
		}

		const paint = new this.canvasKit.Paint();
		paint.setColor(this.parseColor(this.config.color));
		paint.setAntiAlias(true);

		if (opacity < 1) {
			paint.setAlphaf(opacity);
		}

		if (this.config.shadow && opacity > 0.01) {
			const shadowPaint = new this.canvasKit.Paint();
			const shadowColor = this.parseColor(this.config.shadow.color);
			shadowColor[3] = this.config.shadow.opacity * opacity;
			shadowPaint.setColor(shadowColor);
			shadowPaint.setAntiAlias(true);

			if (this.config.shadow.blur > 0) {
				const blurFilter = this.canvasKit.MaskFilter.MakeBlur(this.canvasKit.BlurStyle.Normal, this.config.shadow.blur / 2, false);
				shadowPaint.setMaskFilter(blurFilter);
			}

			this.canvas.drawText(text, x + this.config.shadow.offsetX, y + this.config.shadow.offsetY, shadowPaint, this.font);

			shadowPaint.delete();
		}

		if (this.config.stroke && this.config.stroke.width > 0 && opacity > 0.01) {
			const strokePaint = new this.canvasKit.Paint();
			const strokeColor = this.parseColor(this.config.stroke.color);
			strokeColor[3] = this.config.stroke.opacity * opacity;
			strokePaint.setColor(strokeColor);
			strokePaint.setStyle(this.canvasKit.PaintStyle.Stroke);
			strokePaint.setStrokeWidth(this.config.stroke.width);
			strokePaint.setAntiAlias(true);

			this.canvas.drawText(text, x, y, strokePaint, this.font);
			strokePaint.delete();
		}

		this.styleManager.renderTextWithLetterSpacing(this.canvas, text, x, y, paint, this.font);

		paint.delete();
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
