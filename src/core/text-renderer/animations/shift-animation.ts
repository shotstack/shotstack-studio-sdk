import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation, type AnimationUnit } from "./base-animation";

export class ShiftAnimation extends BaseAnimation {
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
		const animationStyle = this.config.animationStyle || "character";

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;
		const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);

		let units: AnimationUnit[] = [];

		if (animationStyle === "character") {
			const centerX = this.config.width / 2;
			const centerY = this.config.height / 2;
			const textWidth = this.layoutEngine.measureTextWithLetterSpacing(processedText, this.font);
			const startX = centerX - textWidth / 2;

			const charLayout = this.layoutEngine.calculateCharacterLayout(processedText, this.font, startX, centerY);

			units = charLayout.map(layout => {
				const offset = this.getOffset(direction);
				return {
					text: layout.char,
					x: layout.x + offset.x,
					y: layout.y + offset.y,
					opacity: 0,
					scale: 1,
					rotation: 0,
					finalX: layout.x,
					finalY: layout.y
				};
			});
		} else {
			const wordLayout = this.layoutEngine.calculateWordLayout(processedText, this.font, lines);
			units = wordLayout.map(layout => {
				const offset = this.getOffset(direction);
				return {
					text: layout.word,
					x: layout.x + offset.x,
					y: layout.y + offset.y,
					opacity: 0,
					scale: 1,
					rotation: 0,
					finalX: layout.x,
					finalY: layout.y
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
			const currentTime = progress * duration;
			tl.time(currentTime);

			this.clearCanvas();

			units.forEach(state => {
				if (state.opacity > 0.01) {
					this.renderStyledText(state.text, state.x, state.y, state.opacity);
				}
			});

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
