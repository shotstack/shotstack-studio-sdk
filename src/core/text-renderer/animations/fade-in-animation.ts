import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation } from "./base-animation";

export class FadeInAnimation extends BaseAnimation {
	async generateFrames(text: string): Promise<AnimationFrame[]> {
		await this.initializeSurface();
		if (!this.canvas || !this.font) throw new Error("Canvas or font not initialized");

		const processedText = this.applyTextTransform(text);
		this.calculateFullTextBounds(processedText);
		const baseDuration = this.config.duration || 2;
		const speed = this.config.speed || 1;
		const duration = Math.max(0.1, baseDuration / speed);

		const fps = this.config.fps || 30;
		const totalFrames = Math.ceil(duration * fps);
		const frames: AnimationFrame[] = [];

		const animState = { opacity: 0, scale: 0.8 };
		const tl = gsap.timeline();
		tl.to(animState, { opacity: 1, scale: 1, duration, ease: "power2.out" });

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;
		const shouldWrap = this.layoutEngine.shouldWrapText(processedText, this.font, maxWidth);

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();

			if (shouldWrap || processedText.includes("\n")) {
				const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
				const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);
				textLines.forEach(line => {
					this.canvas?.save();
					if (animState.scale !== 1) {
						this.canvas?.translate(line.x + line.width / 2, line.y);
						this.canvas?.scale(animState.scale, animState.scale);
						this.canvas?.translate(-(line.x + line.width / 2), -line.y);
					}
					this.renderStyledText(line.text, line.x, line.y, animState.opacity);
					this.canvas?.restore();
				});
			} else {
				const w = this.layoutEngine.measureTextWithLetterSpacing(processedText, this.font);
				const x = this.config.width / 2 - w / 2;
				const y = this.config.height / 2;

				this.canvas?.save();
				if (animState.scale !== 1) {
					this.canvas?.translate(this.config.width / 2, this.config.height / 2);
					this.canvas?.scale(animState.scale, animState.scale);
					this.canvas?.translate(-this.config.width / 2, -this.config.height / 2);
				}
				this.renderStyledText(processedText, x, y, animState.opacity);
				this.canvas?.restore();
			}
			frames.push(this.captureFrame(frame, progress * duration));
		}
		return frames;
	}
}
