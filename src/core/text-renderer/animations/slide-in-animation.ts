import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation } from "./base-animation";

export class SlideInAnimation extends BaseAnimation {
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
		const shouldWrap = this.layoutEngine.shouldWrapText(processedText, this.font, maxWidth);

		let finalX: number;
		let finalY: number;
		let textWidth: number;

		if (shouldWrap || processedText.includes("\n")) {
			const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
			const metrics = this.layoutEngine.getMultilineMetrics(lines, this.font);
			textWidth = metrics.width;
			finalX = (this.config.width - textWidth) / 2;
			finalY = this.config.height / 2;
		} else {
			textWidth = this.layoutEngine.measureTextWithLetterSpacing(processedText, this.font);
			finalX = (this.config.width - textWidth) / 2;
			finalY = this.config.height / 2;
		}

		const startPos = this.getStartPosition(finalX, finalY, direction);

		const animState = {
			x: startPos.x,
			y: startPos.y,
			opacity: 0
		};

		const tl = gsap.timeline();

		tl.to(animState, {
			x: finalX,
			y: finalY,
			opacity: 1,
			duration: duration * 0.8,
			ease: "power2.out"
		});

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();

			if (shouldWrap || processedText.includes("\n")) {
				const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
				const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);

				const offsetX = animState.x - finalX;
				const offsetY = animState.y - finalY;

				textLines.forEach(line => {
					this.renderStyledText(line.text, line.x + offsetX, line.y + offsetY, animState.opacity);
				});
			} else {
				this.renderStyledText(processedText, animState.x, animState.y, animState.opacity);
			}

			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}
}
