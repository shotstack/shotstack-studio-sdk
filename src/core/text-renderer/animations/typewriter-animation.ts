import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation } from "./base-animation";

export class TypewriterAnimation extends BaseAnimation {
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

		const animationStyle = this.config.animationStyle || "character";
		const units = animationStyle === "word" ? processedText.split(" ") : processedText.split("");

		const animState = {
			unitsVisible: 0,
			cursorVisible: true
		};

		const tl = gsap.timeline();

		const speed = this.config.speed || 1;
		const typingDuration = (duration * 0.9) / speed;

		tl.to(animState, {
			unitsVisible: units.length,
			duration: typingDuration,
			ease: "none"
		});

		tl.to(
			animState,
			{
				cursorVisible: false,
				duration: 0.1,
				repeat: Math.floor(duration * 4),
				yoyo: true,
				ease: "none"
			},
			0
		);

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;
		const lines = this.layoutEngine.processTextContent(processedText, maxWidth, this.font);
		const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);

		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();

			const unitsToShow = Math.floor(animState.unitsVisible);
			const isNearEnd = frame >= totalFrames - Math.ceil(fps * 0.2);
			const finalUnitsToShow = isNearEnd ? units.length : unitsToShow;

			let displayText: string;
			if (animationStyle === "word") {
				displayText = units.slice(0, finalUnitsToShow).join(" ");
			} else {
				displayText = units.slice(0, finalUnitsToShow).join("");
			}

			const showCursor = animState.cursorVisible && frame < totalFrames - 10 && !isNearEnd;
			const finalDisplayText = showCursor ? displayText + "|" : displayText;

			if (textLines.length > 0) {
				const line = textLines[0];
				this.renderStyledText(finalDisplayText, line.x, line.y);
			}

			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}
}
