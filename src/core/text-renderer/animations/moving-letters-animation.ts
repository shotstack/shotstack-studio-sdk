import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation, type AnimationUnit } from "./base-animation";

export class MovingLettersAnimation extends BaseAnimation {
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
		const direction = this.config.direction || "left";

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;
		const centerX = this.config.width / 2;
		const centerY = this.config.height / 2;

		const characterLayout = this.layoutEngine.calculateCharacterLayout(
			processedText,
			this.font,
			centerX - this.layoutEngine.measureTextWithLetterSpacing(processedText, this.font) / 2,
			centerY
		);

		const letterStates: AnimationUnit[] = characterLayout.map(layout => {
			const startPos = this.getStartPosition(layout.x, layout.y, direction);

			return {
				text: layout.char,
				x: startPos.x,
				y: startPos.y,
				opacity: 0,
				scale: 1,
				rotation: 0,
				finalX: layout.x,
				finalY: layout.y
			};
		});

		const tl = gsap.timeline();
		const totalAnimationDuration = duration * 0.8;
		const staggerDelay = totalAnimationDuration / letterStates.length;

		letterStates.forEach((state, index) => {
			const letterTl = gsap.timeline();
			const startTime = index * staggerDelay;

			letterTl.to(state, {
				x: state.finalX,
				y: state.finalY,
				opacity: 1,
				duration: 0.8,
				ease: "back.out(1.7)"
			});

			tl.add(letterTl, startTime);
		});

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();

			letterStates.forEach(state => {
				if (state.opacity > 0.01) {
					this.renderStyledText(state.text, state.x, state.y, state.opacity, state.scale, state.rotation);
				}
			});

			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}
}
