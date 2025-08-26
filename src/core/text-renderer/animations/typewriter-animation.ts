import { gsap } from "gsap";
import type { AnimationFrame } from "../types";
import { BaseAnimation } from "./base-animation";

export class TypewriterAnimation extends BaseAnimation {
	async generateFrames(text: string): Promise<AnimationFrame[]> {
		await this.initializeSurface();
		if (!this.canvas || !this.font) throw new Error("Canvas or font not initialized");

		const processed = this.applyTextTransform(text);
		this.calculateFullTextBounds(processed);
		const baseDuration = this.config.duration || 3;
		const speed = this.config.speed || 1;
		const duration = Math.max(0.1, baseDuration / speed);

		const fps = this.config.fps || 30;
		const totalFrames = Math.ceil(duration * fps);
		const frames: AnimationFrame[] = [];

		const animationStyle = (this.config.animationStyle as "character" | "word") || "character";
		const units = animationStyle === "word" ? processed.split(" ") : processed.split("");

		const padding = this.config.fontSize * 0.5;
		const maxWidth = this.config.width - padding * 2;

		const lines = this.layoutEngine.processTextContent(processed, maxWidth, this.font);
		const textLines = this.layoutEngine.calculateMultilineLayout(lines, this.font, this.config.width, this.config.height);

		const tl = gsap.timeline();
		const state = { visible: 0, cursor: true };
		const typingDuration = duration * 0.9;

		tl.to(state, { visible: units.length, duration: typingDuration, ease: "none" });
		tl.to(state, { cursor: false, duration: 0.1, repeat: Math.floor(duration * 4), yoyo: true, ease: "none" }, 0);

		const letterSpacingPx = (this.config.letterSpacing ?? 0) * this.config.fontSize;
		const lineCharPos: { x: number; y: number; ch: string }[] = [];
		for (const ln of textLines) {
			let cx = ln.x;
			for (const ch of ln.text) {
				lineCharPos.push({ ch, x: cx, y: ln.y });
				const w = this.layoutEngine.measureTextWithLetterSpacing(ch, this.font);
				cx += w + letterSpacingPx;
			}
		}

		let charStream = textLines.map(l => l.text).join("\n");
		for (let frame = 0; frame < totalFrames; frame++) {
			const progress = frame / (totalFrames - 1);
			tl.progress(progress);

			this.clearCanvas();

			const visibleCount = Math.floor(state.visible);
			const isNearEnd = frame >= totalFrames - Math.ceil(fps * 0.2);
			const finalCount = isNearEnd ? units.length : visibleCount;

			let display = animationStyle === "word" ? units.slice(0, finalCount).join(" ") : units.slice(0, finalCount).join("");

			if (state.cursor && frame < totalFrames - 2 && !isNearEnd) display += "|";

			const drawLines = this.layoutEngine.processTextContent(display, maxWidth, this.font);
			const drawPos = this.layoutEngine.calculateMultilineLayout(drawLines, this.font, this.config.width, this.config.height);

			for (const ln of drawPos) {
				this.renderStyledText(ln.text, ln.x, ln.y, 1);
			}

			frames.push(this.captureFrame(frame, progress * duration));
		}

		return frames;
	}
}
