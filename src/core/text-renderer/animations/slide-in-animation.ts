import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation } from "./base-animation";

export class SlideInAnimation extends BaseAnimation {
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
		const direction = this.config.direction || "left";

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;

		const linesInit = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
		const metrics = this.layoutEngine.getMultilineMetrics(linesInit, this.font);
		const finalX = (this.config.width - metrics.width) / 2;
		const finalY = this.config.height / 2;

		const startPos = this.getStartPosition(finalX, finalY, direction);
		const animState = { x: startPos.x, y: startPos.y, opacity: 0 };
		const tl = gsap.timeline();
		tl.to(animState, { x: finalX, y: finalY, opacity: 1, duration: duration * 0.8, ease: "power2.out" });

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();

			const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
			const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);

			const offsetX = animState.x - finalX;
			const offsetY = animState.y - finalY;

			for (const line of textLines) {
				this.renderStyledText(line.text, line.x + offsetX, line.y + offsetY, animState.opacity);
			}

			frames.push(this.captureFrame(frame, progress * duration));
		}
		return frames;
	}
}
