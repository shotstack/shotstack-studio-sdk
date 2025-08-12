import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation, type AnimationUnit } from "./base-animation";

export class MovingLettersAnimation extends BaseAnimation {
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

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;

		const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
		const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);

		const letterSpacingPx = (this.config.letterSpacing ?? 0) * this.config.fontSize;
		const chars: { char: string; x: number; y: number }[] = [];
		for (const ln of textLines) {
			let cx = ln.x;
			for (const ch of ln.text) {
				chars.push({ char: ch, x: cx, y: ln.y });
				const w = this.layoutEngine.measureTextWithLetterSpacing(ch, this.font);
				cx += w + letterSpacingPx;
			}
		}

		const letterStates: AnimationUnit[] = chars.map(p => {
			const startPos = this.getStartPosition(p.x, p.y, direction);
			return {
				text: p.char,
				x: startPos.x,
				y: startPos.y,
				opacity: 0,
				scale: 1,
				rotation: 0,
				finalX: p.x,
				finalY: p.y
			};
		});

		const tl = gsap.timeline();
		const totalAnimationDuration = duration * 0.8;
		const staggerDelay = totalAnimationDuration / Math.max(letterStates.length, 1);

		letterStates.forEach((state, index) => {
			tl.to(
				state,
				{
					x: state.finalX,
					y: state.finalY,
					opacity: 1,
					duration: 0.8,
					ease: "back.out(1.7)"
				},
				index * staggerDelay
			);
		});

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);
			this.clearCanvas();
			for (const s of letterStates) {
				if (s.opacity > 0.01) this.renderStyledText(s.text, s.x, s.y, s.opacity, s.scale, s.rotation);
			}
			frames.push(this.captureFrame(frame, progress * duration));
		}
		return frames;
	}
}
