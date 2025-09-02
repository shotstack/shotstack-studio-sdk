import type { CanvasKit, Font, Paint } from "canvaskit-wasm";
import type { CanvasConfig, TextMetrics } from "./types";
import { FontManager } from "./font-manager";

export interface TextLine {
	text: string;
	width: number;
	x: number;
	y: number;
}
export interface CharacterLayout {
	char: string;
	x: number;
	y: number;
	width: number;
}
export interface WordLayout {
	word: string;
	x: number;
	y: number;
	width: number;
}

export class TextLayoutEngine {
	private canvasKit: CanvasKit;
	private fontManager: FontManager;
	private config: CanvasConfig;
	private paint: Paint | null = null;

	constructor(canvasKit: CanvasKit, config: CanvasConfig) {
		this.canvasKit = canvasKit;
		this.config = config;
		this.fontManager = FontManager.getInstance();
		this.paint = new canvasKit.Paint();
	}

	private measureText(text: string, font: Font): { width: number } {
		if (!this.paint) this.paint = new this.canvasKit.Paint();
		const glyphIDs = font.getGlyphIDs(text);
		const glyphWidths = font.getGlyphWidths(glyphIDs, this.paint);
		let totalWidth = 0;
		for (let i = 0; i < glyphWidths.length; i++) totalWidth += glyphWidths[i];
		return { width: totalWidth };
	}

	wrapText(text: string, maxWidth: number, font: Font): string[] {
		const words = text.split(" ");
		const lines: string[] = [];
		let currentLine = "";

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word;
			const metrics = this.measureText(testLine, font);
			if (metrics.width > maxWidth && currentLine) {
				lines.push(currentLine);
				currentLine = word;
			} else {
				currentLine = testLine;
			}
		}
		if (currentLine) lines.push(currentLine);
		return lines.length > 0 ? lines : [text];
	}

	calculateMultilineLayout(lines: string[], font: Font, containerWidth: number, containerHeight: number): TextLine[] {
		const lineHeight = this.config.fontSize * (this.config.lineHeight || 1.2);
		const fm = this.fontManager.getFontMetrics(this.config.fontFamily, this.config.fontSize);

		let startY: number;
		switch (this.config.textBaseline) {
			case "top":
				startY = fm.ascent;
				break;
			case "bottom":
				startY = containerHeight - (lines.length - 1) * lineHeight - fm.descent;
				break;
			case "middle":
			default:
				const block = lines.length * lineHeight;
				startY = containerHeight / 2 - block / 2 + fm.ascent;
				break;
		}

		const textLines: TextLine[] = [];
		lines.forEach((line, index) => {
			const metrics = this.measureText(line, font);
			let x: number;
			switch (this.config.textAlign) {
				case "left":
					x = 0;
					break;
				case "right":
					x = containerWidth - metrics.width;
					break;
				case "center":
				default:
					x = (containerWidth - metrics.width) / 2;
					break;
			}
			textLines.push({ text: line, width: metrics.width, x, y: startY + index * lineHeight });
		});
		return textLines;
	}

	calculateCharacterLayout(text: string, font: Font, startX: number, startY: number): CharacterLayout[] {
		const characters: CharacterLayout[] = [];
		let currentX = startX;
		const letterSpacing = (this.config.letterSpacing || 0) * this.config.fontSize;

		for (const char of text) {
			const charWidth = this.measureText(char, font).width;
			characters.push({ char, x: currentX, y: startY, width: charWidth });
			currentX += charWidth + letterSpacing;
		}
		return characters;
	}

	calculateWordLayout(text: string, font: Font, lines: string[]): WordLayout[] {
		const words: WordLayout[] = [];
		const lineHeight = this.config.fontSize * (this.config.lineHeight || 1.2);
		const containerWidth = this.config.width;
		const containerHeight = this.config.height;

		const totalHeight = lines.length * lineHeight;
		let startY: number;
		switch (this.config.textBaseline) {
			case "top":
				startY = this.config.fontSize;
				break;
			case "bottom":
				startY = containerHeight - totalHeight + this.config.fontSize;
				break;
			case "middle":
			default:
				startY = (containerHeight - totalHeight) / 2 + this.config.fontSize;
				break;
		}

		lines.forEach((line, lineIndex) => {
			const lineWords = line.split(" ");
			const lineMetrics = this.measureText(line, font);
			let lineStartX: number;
			switch (this.config.textAlign) {
				case "left":
					lineStartX = 0;
					break;
				case "right":
					lineStartX = containerWidth - lineMetrics.width;
					break;
				case "center":
				default:
					lineStartX = (containerWidth - lineMetrics.width) / 2;
					break;
			}

			let currentX = lineStartX;
			const y = startY + lineIndex * lineHeight;

			lineWords.forEach((word, wi) => {
				const wordWidth = this.measureText(word, font).width;
				words.push({ word, x: currentX, y, width: wordWidth });
				if (wi < lineWords.length - 1) {
					const spaceWidth = this.measureText(" ", font).width;
					currentX += wordWidth + spaceWidth;
				} else {
					currentX += wordWidth;
				}
			});
		});

		return words;
	}

	measureTextWithLetterSpacing(text: string, font: Font): number {
		if (!this.config.letterSpacing || this.config.letterSpacing === 0) {
			return this.measureText(text, font).width;
		}
		const letterSpacing = this.config.letterSpacing * this.config.fontSize;
		let totalWidth = 0;
		for (let i = 0; i < text.length; i++) {
			totalWidth += this.measureText(text[i], font).width;
			if (i < text.length - 1) totalWidth += letterSpacing;
		}
		return totalWidth;
	}

	shouldWrapText(text: string, font: Font, maxWidth: number): boolean {
		const textWidth = this.measureTextWithLetterSpacing(text, font);
		return textWidth > maxWidth || text.includes("\n");
	}

	getMultilineMetrics(lines: string[], font: Font): TextMetrics {
		const lineHeight = this.config.fontSize * (this.config.lineHeight || 1.2);
		const fontMetrics = this.fontManager.getFontMetrics(this.config.fontFamily, this.config.fontSize);
		let maxWidth = 0;
		lines.forEach(line => {
			const width = this.measureTextWithLetterSpacing(line, font);
			maxWidth = Math.max(maxWidth, width);
		});
		return { width: maxWidth, height: lines.length * lineHeight, ascent: fontMetrics.ascent, descent: fontMetrics.descent, lineHeight };
	}

	processTextContent(text: string, maxWidth: number, font: Font): string[] {
		const paragraphs = text.split("\n");
		const allLines: string[] = [];
		paragraphs.forEach(paragraph => {
			if (paragraph.trim()) {
				const wrapped = this.wrapText(paragraph, maxWidth, font);
				allLines.push(...wrapped);
			} else {
				allLines.push("");
			}
		});
		return allLines;
	}

	getTextBounds(lines: TextLine[]): { x: number; y: number; width: number; height: number } {
		if (lines.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		lines.forEach(line => {
			minX = Math.min(minX, line.x);
			maxX = Math.max(maxX, line.x + line.width);
			minY = Math.min(minY, line.y - this.config.fontSize);
			maxY = Math.max(maxY, line.y);
		});
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	}

	cleanup(): void {
		if (this.paint) {
			this.paint.delete();
			this.paint = null;
		}
	}
}
