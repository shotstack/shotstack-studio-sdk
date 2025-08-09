import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation, type AnimationUnit } from "./base-animation";

export class AscendAnimation extends BaseAnimation {
	async generateFrames(text: string): Promise<AnimationFrame[]> {
		await this.initializeSurface();

		if (!this.canvas || !this.font) {
			throw new Error("Canvas or font not initialized");
		}

		const processedText = this.applyTextTransform(text);
		const duration = this.config.duration || 3;
		const fps = this.config.fps || 30;
		const totalFrames = Math.ceil(duration * fps);
		const frames: AnimationFrame[] = [];
		const direction = this.config.direction || "up";

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;
		const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);

		const wordLayout = this.layoutEngine.calculateWordLayout(processedText, this.font, lines);

		const yOffset = direction === "up" ? 50 : -50;

		const wordStates: AnimationUnit[] = wordLayout.map(layout => ({
			text: layout.word,
			x: layout.x,
			y: layout.y + yOffset,
			opacity: 0,
			scale: 1,
			rotation: 0,
			finalX: layout.x,
			finalY: layout.y
		}));

		const tl = gsap.timeline();
		const totalAnimationDuration = duration * 0.8;
		const staggerDelay = totalAnimationDuration / wordStates.length;

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

			wordStates.forEach(state => {
				if (state.opacity > 0.01) {
					this.renderStyledText(state.text, state.x, state.y, state.opacity);
				}
			});

			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}
}
