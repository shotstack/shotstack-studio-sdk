import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation, type AnimationUnit } from "./base-animation";

export class AscendAnimation extends BaseAnimation {
	async generateFrames(text: string): Promise<AnimationFrame[]> {
		await this.initializeSurface();
		if (!this.canvas || !this.font) throw new Error("Canvas or font not initialized");

		const processedText = this.applyTextTransform(text);
		this.calculateFullTextBounds(processedText);
		const baseDuration = this.config.duration || 3;
		const speed = this.config.speed || 1;
		const duration = Math.max(0.1, baseDuration / speed);

		const fps = this.config.fps || 30;
		const totalFrames = Math.ceil(duration * fps);
		const frames: AnimationFrame[] = [];
		const direction = this.config.direction || "up";

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;

		const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
		this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);
		const wordLayout = this.layoutEngine.calculateWordLayout(processedText, this.font, lines);

		const yOffset = direction === "up" ? 50 : -50;

		const wordStates: AnimationUnit[] = wordLayout.map(w => ({
			text: w.word,
			x: w.x,
			y: w.y + yOffset,
			opacity: 0,
			scale: 1,
			rotation: 0,
			finalX: w.x,
			finalY: w.y
		}));

		const tl = gsap.timeline();
		const totalAnimationDuration = duration * 0.8;
		const staggerDelay = totalAnimationDuration / Math.max(wordStates.length, 1);

		wordStates.forEach((state, index) => {
			tl.to(
				state,
				{
					y: state.finalY,
					opacity: 1,
					duration: 0.6,
					ease: "power2.out"
				},
				index * staggerDelay
			);
		});

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();
			for (const s of wordStates) {
				if (s.opacity > 0.01) this.renderStyledText(s.text, s.x, s.y, s.opacity);
			}
			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}
}
