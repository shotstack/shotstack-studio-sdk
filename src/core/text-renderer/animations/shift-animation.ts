import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation, type AnimationUnit } from "./base-animation";

export class ShiftAnimation extends BaseAnimation {
	async generateFrames(text: string): Promise<AnimationFrame[]> {
		await this.initializeSurface();
		if (!this.canvas || !this.font) throw new Error("Canvas or font not initialized");

		const processedText = this.applyTextTransform(text);
		const baseDuration = this.config.duration || 3;
		const speed = this.config.speed || 1;
		const duration = Math.max(0.1, baseDuration / speed);

		const fps = this.config.fps || 30;
		const totalFrames = Math.ceil(duration * fps);
		const frames: AnimationFrame[] = [];
		const direction = this.config.direction || "left";
		const animationStyle = (this.config.animationStyle as "character" | "word") || "character";

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;

		const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
		const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);

		let units: AnimationUnit[] = [];

		if (animationStyle === "character") {
			const letterSpacingPx = (this.config.letterSpacing ?? 0) * this.config.fontSize;
			const chars: { text: string; x: number; y: number }[] = [];

			for (const ln of textLines) {
				let cx = ln.x;
				for (const ch of ln.text) {
					chars.push({ text: ch, x: cx, y: ln.y });
					const w = this.layoutEngine.measureTextWithLetterSpacing(ch, this.font);
					cx += w + letterSpacingPx;
				}
			}

			units = chars.map(c => {
				const offset = this.getOffset(direction);
				return {
					text: c.text,
					x: c.x + offset.x,
					y: c.y + offset.y,
					opacity: 0,
					scale: 1,
					rotation: 0,
					finalX: c.x,
					finalY: c.y
				};
			});
		} else {
			const words = this.layoutEngine.calculateWordLayout(processedText, this.font, lines);
			units = words.map(w => {
				const offset = this.getOffset(direction);
				return {
					text: w.word,
					x: w.x + offset.x,
					y: w.y + offset.y,
					opacity: 0,
					scale: 1,
					rotation: 0,
					finalX: w.x,
					finalY: w.y
				};
			});
		}

		const tl = gsap.timeline();
		const individualAnimDuration = duration * 0.3;
		const totalStaggerTime = duration * 0.7;
		const staggerDelay = totalStaggerTime / Math.max(units.length - 1, 1);
		const startDelay = 0.05;

		units.forEach((state, index) => {
			const startTime = startDelay + index * staggerDelay;
			tl.to(
				state,
				{
					x: state.finalX,
					y: state.finalY,
					opacity: 1,
					duration: individualAnimDuration,
					ease: "power2.out"
				},
				startTime
			);
		});

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.time(progress * duration);

			this.clearCanvas();
			for (const s of units) if (s.opacity > 0.01) this.renderStyledText(s.text, s.x, s.y, s.opacity);
			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}

	private getOffset(direction: string): { x: number; y: number } {
		const transforms = {
			left: { x: 30, y: 0 },
			right: { x: -30, y: 0 },
			up: { x: 0, y: 30 },
			down: { x: 0, y: -30 },
			top: { x: 0, y: 30 },
			bottom: { x: 0, y: -30 }
		};
		return transforms[direction as keyof typeof transforms] || transforms.left;
	}
}
