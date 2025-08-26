import type { CanvasKit } from "canvaskit-wasm";
import type { CanvasConfig, AnimationFrame, RenderResult } from "../types";
import type { AnimationType } from "../config";
import { TypewriterAnimation } from "./typewriter-animation";
import { MovingLettersAnimation } from "./moving-letters-animation";
import { FadeInAnimation } from "./fade-in-animation";
import { SlideInAnimation } from "./slide-in-animation";
import { AscendAnimation } from "./ascend-animation";
import { ShiftAnimation } from "./shift-animation";
import { BaseAnimation } from "./base-animation";
import { FrameCache } from "./frame-cache";

export class AnimationEngine {
	private canvasKit: CanvasKit;
	private config: CanvasConfig;
	private frameCache: FrameCache;
	private currentAnimation: BaseAnimation | null = null;
	private animationType: AnimationType | null = null;

	constructor(canvasKit: CanvasKit, config: CanvasConfig) {
		this.canvasKit = canvasKit;
		this.config = config;
		this.frameCache = new FrameCache();
	}

	async generateAnimation(text: string, animationType: AnimationType): Promise<RenderResult> {
		const cacheKey = this.frameCache.generateKey(text, animationType, this.config);
		const cachedFrames = this.frameCache.get(cacheKey);

		if (cachedFrames) {
			console.log(`📦 Using cached frames for ${animationType} animation`);
			return {
				type: "animation",
				data: cachedFrames,
				metadata: {
					width: this.config.width,
					height: this.config.height,
					duration: this.config.duration,
					frameCount: cachedFrames.length,
					fps: this.config.fps
				}
			};
		}

		console.log(`🎬 Generating ${animationType} animation for: "${text}"`);

		if (this.currentAnimation) {
			this.currentAnimation.cleanup();
		}

		this.currentAnimation = this.createAnimation(animationType);
		this.animationType = animationType;

		try {
			const startTime = performance.now();
			const frames = await this.currentAnimation.generateFrames(text);
			const generationTime = performance.now() - startTime;

			console.log(`✅ Generated ${frames.length} frames in ${generationTime.toFixed(2)}ms`);

			this.frameCache.set(cacheKey, frames);

			return {
				type: "animation",
				data: frames,
				metadata: {
					width: this.config.width,
					height: this.config.height,
					duration: this.config.duration,
					frameCount: frames.length,
					fps: this.config.fps,
					generationTime
				}
			};
		} catch (error) {
			console.error(`❌ Animation generation failed:`, error);
			throw error;
		}
	}

	private createAnimation(type: AnimationType): BaseAnimation {
		switch (type) {
			case "typewriter":
				return new TypewriterAnimation(this.canvasKit, this.config);
			case "movingLetters":
				return new MovingLettersAnimation(this.canvasKit, this.config);
			case "fadeIn":
				return new FadeInAnimation(this.canvasKit, this.config);
			case "slideIn":
				return new SlideInAnimation(this.canvasKit, this.config);
			case "ascend":
				return new AscendAnimation(this.canvasKit, this.config);
			case "shift":
				return new ShiftAnimation(this.canvasKit, this.config);
			default:
				throw new Error(`Unknown animation type: ${type}`);
		}
	}

	getFrameAtTime(frames: AnimationFrame[], time: number): AnimationFrame | null {
		if (frames.length === 0) return null;

		let closestFrame = frames[0];
		let minDiff = Math.abs(frames[0].timestamp - time);

		for (const frame of frames) {
			const diff = Math.abs(frame.timestamp - time);
			if (diff < minDiff) {
				minDiff = diff;
				closestFrame = frame;
			}
		}

		return closestFrame;
	}

	async exportAsVideo(frames: AnimationFrame[]): Promise<Blob> {
		console.warn("Video export not yet implemented");
		return new Blob();
	}

	clearCache(): void {
		this.frameCache.clear();
		console.log("🧹 Animation cache cleared");
	}

	getCacheStats(): { size: number; maxSize: number; hitRate: number } {
		return this.frameCache.getStats();
	}

	cleanup(): void {
		if (this.currentAnimation) {
			this.currentAnimation.cleanup();
			this.currentAnimation = null;
		}
		this.frameCache.clear();
	}
}
