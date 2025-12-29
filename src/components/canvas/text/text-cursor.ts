import { type Clip , type TextAsset } from "@schemas";
import * as pixi from "pixi.js";

type TextCursorOptions = {
	width?: number;
	color?: number;
	blinkInterval?: number;
};

export class TextCursor {
	private static readonly DEFAULT_BLINK_INTERVAL_MS = 500;
	private static readonly DEFAULT_CURSOR_WIDTH_PX = 2;
	private static readonly DEFAULT_CURSOR_COLOR = 0xffffff;

	private cursor: pixi.Graphics | null = null;
	private parent: pixi.Container;
	private textElement: pixi.Text;
	private clipConfig: Clip;

	private textPosition: number = 0;
	private pixelX: number = 0;
	private pixelY: number = 0;
	private currentLine: number = 0;

	private isBlinking: boolean = false;
	private blinkInterval: number | null = null;
	private blinkIntervalMs: number = 500;

	private width: number = 2;
	private color: number = 0xffffff;
	private isVisible: boolean = true;

	constructor(parent: pixi.Container, textElement: pixi.Text, clipConfig: Clip, options?: TextCursorOptions) {
		this.parent = parent;
		this.textElement = textElement;
		this.clipConfig = clipConfig;

		this.width = options?.width ?? TextCursor.DEFAULT_CURSOR_WIDTH_PX;
		this.color = options?.color ?? TextCursor.DEFAULT_CURSOR_COLOR;
		this.blinkIntervalMs = options?.blinkInterval ?? TextCursor.DEFAULT_BLINK_INTERVAL_MS;

		this.textPosition = 0;
		this.isBlinking = false;
		this.isVisible = true;
		this.blinkInterval = null;

		this.createCursor();
	}

	public updatePosition(textPosition: number): void {
		if (!this.cursor || !this.textElement) {
			console.warn("TextCursor: Cannot update position, cursor not initialized");
			return;
		}

		this.textPosition = this.validateTextPosition(textPosition);
		this.calculateAndApplyPixelPosition();
	}

	public setPosition(x: number, y: number): void {
		if (!this.cursor) {
			console.warn("TextCursor: Cannot set position, cursor not initialized");
			return;
		}

		this.pixelX = x;
		this.pixelY = y;
		this.updateGraphicsPosition();
	}

	public show(): void {
		this.setVisible(true);
	}

	public hide(): void {
		this.setVisible(false);
	}

	public setVisible(visible: boolean): void {
		this.isVisible = visible;
		if (this.cursor && !this.isBlinking) {
			this.cursor.visible = visible;
		}
	}

	public startBlinking(): void {
		if (!this.cursor) {
			console.warn("TextCursor: Cannot start blinking, cursor not initialized");
			return;
		}

		if (this.isBlinking) {
			return;
		}

		this.startBlinkingAnimation();
	}

	public stopBlinking(): void {
		this.stopBlinkingAnimation();
	}

	public setBlinkInterval(intervalMs: number): void {
		this.blinkIntervalMs = intervalMs;
		if (this.isBlinking) {
			this.stopBlinking();
			this.startBlinking();
		}
	}

	public dispose(): void {
		this.stopBlinkingAnimation();

		if (this.cursor && this.parent) {
			try {
				this.parent.removeChild(this.cursor);
			} catch (error) {
				console.warn("TextCursor: Error removing cursor from parent:", error);
			}
		}

		if (this.cursor) {
			try {
				this.cursor.destroy();
			} catch (error) {
				console.warn("TextCursor: Error destroying cursor graphics:", error);
			} finally {
				this.cursor = null;
			}
		}

		this.textPosition = 0;
		this.pixelX = 0;
		this.pixelY = 0;
		this.currentLine = 0;
		this.isVisible = true;
	}

	private createCursor(): void {
		if (!this.textElement) return;

		this.cursor = new pixi.Graphics();

		this.cursor.fillStyle = { color: this.color };

		const fontSize = this.textElement.style.fontSize as number;

		this.cursor.rect(0, 0, this.width, fontSize);
		this.cursor.fill();

		this.parent.addChild(this.cursor);

		this.cursor.visible = this.isVisible;
	}

	private validateTextPosition(position: number): number {
		if (!this.textElement) return 0;
		return Math.max(0, Math.min(position, this.textElement.text.length));
	}

	private calculateAndApplyPixelPosition(): void {
		this.calculatePixelPositionFromText();
		this.updateGraphicsPosition();
	}

	private calculatePixelPositionFromText(): void {
		if (!this.textElement) return;

		const { text } = this.textElement;
		const style = this.textElement.style as pixi.TextStyle;

		const textBeforeCursor = text.substring(0, this.textPosition);

		const newlineMatches = textBeforeCursor.match(/\n/g);
		this.currentLine = newlineMatches ? newlineMatches.length : 0;

		const lines = text.split("\n");
		const currentLine = this.currentLine < lines.length ? lines[this.currentLine] : "";

		const lastNewlinePos = textBeforeCursor.lastIndexOf("\n");
		const cursorCharInLine = lastNewlinePos === -1 ? this.textPosition : this.textPosition - lastNewlinePos - 1;

		const textUpToCursor = currentLine.substring(0, cursorCharInLine);

		let textWidth: number;
		if (textUpToCursor.length > 0 && textUpToCursor.endsWith(" ")) {
			textWidth = this.measureText(`${textUpToCursor}x`, style) - this.measureText("x", style);
		} else {
			textWidth = this.measureText(textUpToCursor, style);
		}

		const actualLineHeight = style.lineHeight as number;
		this.pixelY = this.currentLine * actualLineHeight;

		const textAsset = this.clipConfig.asset as TextAsset;
		const alignment = textAsset.alignment?.horizontal ?? "center";

		let cursorX = textWidth;

		if (alignment !== "left") {
			const lineWidth = this.measureText(currentLine, style);
			const containerWidth = this.textElement.width;

			let lineOffset = 0;
			if (alignment === "center") {
				lineOffset = (containerWidth - lineWidth) / 2;
			} else if (alignment === "right") {
				lineOffset = containerWidth - lineWidth;
			}

			cursorX = lineOffset + textWidth;
		}

		this.pixelX = cursorX;
	}

	private updateGraphicsPosition(): void {
		if (!this.cursor) return;

		this.cursor.position.set(this.pixelX, this.pixelY);
	}

	private startBlinkingAnimation(): void {
		if (!this.cursor || this.isBlinking) return;

		this.isBlinking = true;
		this.blinkInterval = window.setInterval(() => {
			if (this.cursor && this.isBlinking) {
				this.cursor.visible = !this.cursor.visible;
			}
		}, this.blinkIntervalMs) as unknown as number;
	}

	private stopBlinkingAnimation(): void {
		if (this.blinkInterval !== null) {
			window.clearInterval(this.blinkInterval);
			this.blinkInterval = null;
		}
		this.isBlinking = false;

		if (this.cursor) {
			this.cursor.visible = this.isVisible;
		}
	}

	private measureText(text: string, style: pixi.TextStyle): number {
		const tempText = new pixi.Text(text, style);
		const { width } = tempText;
		tempText.destroy();
		return width;
	}

	public isInitialized(): boolean {
		return this.cursor !== null;
	}

	public getState(): object {
		return {
			isInitialized: this.isInitialized(),
			isBlinking: this.isBlinking,
			isVisible: this.isVisible,
			textPosition: this.textPosition,
			pixelPosition: { x: this.pixelX, y: this.pixelY },
			currentLine: this.currentLine
		};
	}
}
