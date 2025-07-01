import * as pixi from "pixi.js";

import { type Clip } from "../schemas/clip";
import { type TextAsset } from "../schemas/text-asset";

/**
 * Configuration options for TextCursor
 */
type TextCursorOptions = {
	width?: number; // Default: 2px
	color?: number; // Default: 0xffffff (white)
	blinkInterval?: number; // Default: 500ms
};

/**
 * TextCursor handles cursor rendering, positioning, and animation for text editing
 * Extracted from TextEditor to follow single responsibility principle
 */
export class TextCursor {
	// Constants (moved from TextEditor)
	private static readonly DEFAULT_BLINK_INTERVAL_MS = 500;
	private static readonly DEFAULT_CURSOR_WIDTH_PX = 2;
	private static readonly DEFAULT_CURSOR_COLOR = 0xffffff;

	// PIXI Objects (following null initialization pattern)
	private cursor: pixi.Graphics | null = null;
	private parent: pixi.Container;
	private textElement: pixi.Text;
	private clipConfig: Clip;

	// Position State
	private textPosition: number = 0; // Character position in text
	private pixelX: number = 0; // Calculated pixel X position
	private pixelY: number = 0; // Calculated pixel Y position
	private currentLine: number = 0; // Current line number (0-based)

	// Animation State
	private isBlinking: boolean = false;
	private blinkInterval: number | null = null;
	private blinkIntervalMs: number = 500; // Configurable blink rate

	// Visual Configuration
	private width: number = 2; // Cursor width in pixels
	private color: number = 0xffffff; // Cursor color (white)
	private isVisible: boolean = true; // Visibility state

	constructor(parent: pixi.Container, textElement: pixi.Text, clipConfig: Clip, options?: TextCursorOptions) {
		// Store references (required dependencies)
		this.parent = parent;
		this.textElement = textElement;
		this.clipConfig = clipConfig;

		// Apply configuration options with defaults
		this.width = options?.width ?? TextCursor.DEFAULT_CURSOR_WIDTH_PX;
		this.color = options?.color ?? TextCursor.DEFAULT_CURSOR_COLOR;
		this.blinkIntervalMs = options?.blinkInterval ?? TextCursor.DEFAULT_BLINK_INTERVAL_MS;

		// Initialize state (following entity patterns)
		this.textPosition = 0;
		this.isBlinking = false;
		this.isVisible = true;
		this.blinkInterval = null;

		// Create PIXI graphics object
		this.createCursor();
	}

	// ------------------------------
	// Public Interface Methods
	// ------------------------------

	/**
	 * Update cursor position based on character position in text
	 */
	public updatePosition(textPosition: number): void {
		if (!this.cursor || !this.textElement) {
			console.warn('TextCursor: Cannot update position, cursor not initialized');
			return;
		}

		this.textPosition = this.validateTextPosition(textPosition);
		this.calculateAndApplyPixelPosition();
	}

	/**
	 * Set cursor to specific pixel coordinates
	 */
	public setPosition(x: number, y: number): void {
		if (!this.cursor) {
			console.warn('TextCursor: Cannot set position, cursor not initialized');
			return;
		}

		this.pixelX = x;
		this.pixelY = y;
		this.updateGraphicsPosition();
	}

	/**
	 * Show the cursor
	 */
	public show(): void {
		this.setVisible(true);
	}

	/**
	 * Hide the cursor
	 */
	public hide(): void {
		this.setVisible(false);
	}

	/**
	 * Set cursor visibility
	 */
	public setVisible(visible: boolean): void {
		this.isVisible = visible;
		if (this.cursor && !this.isBlinking) {
			this.cursor.visible = visible;
		}
	}

	/**
	 * Start blinking animation
	 */
	public startBlinking(): void {
		if (!this.cursor) {
			console.warn('TextCursor: Cannot start blinking, cursor not initialized');
			return;
		}

		if (this.isBlinking) {
			return; // Already blinking
		}

		this.startBlinkingAnimation();
	}

	/**
	 * Stop blinking animation
	 */
	public stopBlinking(): void {
		this.stopBlinkingAnimation();
	}

	/**
	 * Set blink interval in milliseconds
	 */
	public setBlinkInterval(intervalMs: number): void {
		this.blinkIntervalMs = intervalMs;
		if (this.isBlinking) {
			// Restart blinking with new interval
			this.stopBlinking();
			this.startBlinking();
		}
	}

	/**
	 * Clean up resources and dispose of cursor
	 */
	public dispose(): void {
		// Stop animation first (safe to call multiple times)
		this.stopBlinkingAnimation();

		// Remove from parent container safely
		if (this.cursor && this.parent) {
			try {
				this.parent.removeChild(this.cursor);
			} catch (error) {
				console.warn('TextCursor: Error removing cursor from parent:', error);
			}
		}

		// Destroy PIXI object safely
		if (this.cursor) {
			try {
				this.cursor.destroy();
			} catch (error) {
				console.warn('TextCursor: Error destroying cursor graphics:', error);
			} finally {
				this.cursor = null;
			}
		}

		// Reset all state
		this.textPosition = 0;
		this.pixelX = 0;
		this.pixelY = 0;
		this.currentLine = 0;
		this.isVisible = true;
	}

	// ------------------------------
	// Private Implementation Methods
	// ------------------------------

	/**
	 * Create PIXI Graphics cursor object
	 */
	private createCursor(): void {
		if (!this.textElement) return;

		// Create Graphics object following entity patterns
		this.cursor = new pixi.Graphics();

		// Set fill style (color configurable)
		this.cursor.fillStyle = { color: this.color };

		// Calculate cursor height from font size
		const fontSize = this.textElement.style.fontSize as number;

		// Create cursor rectangle (width configurable)
		this.cursor.rect(0, 0, this.width, fontSize);
		this.cursor.fill();

		// Add to parent container
		this.parent.addChild(this.cursor);

		// Set initial visibility
		this.cursor.visible = this.isVisible;
	}

	/**
	 * Validate and clamp text position to valid range
	 */
	private validateTextPosition(position: number): number {
		if (!this.textElement) return 0;
		return Math.max(0, Math.min(position, this.textElement.text.length));
	}

	/**
	 * Calculate pixel position from text position and apply to graphics
	 */
	private calculateAndApplyPixelPosition(): void {
		// TODO: Investigate PIXI native text measurement utilities
		// PIXI.TextMetrics or text.getBounds() may provide more accurate measurements
		// than the current custom measureText() implementation

		// For now, use similar logic from TextEditor
		this.calculatePixelPositionFromText();
		this.updateGraphicsPosition();
	}

	/**
	 * Calculate pixel coordinates from text position
	 * Based on existing TextEditor logic but simplified
	 */
	private calculatePixelPositionFromText(): void {
		if (!this.textElement) return;

		const { text } = this.textElement;
		const style = this.textElement.style as pixi.TextStyle;

		// Get text up to cursor position
		const textBeforeCursor = text.substring(0, this.textPosition);

		// Count the number of newlines to determine the line number
		const newlineMatches = textBeforeCursor.match(/\n/g);
		this.currentLine = newlineMatches ? newlineMatches.length : 0;

		// Get the current line's content
		const lines = text.split('\n');
		const currentLine = this.currentLine < lines.length ? lines[this.currentLine] : '';

		// Find the character position within the current line
		const lastNewlinePos = textBeforeCursor.lastIndexOf('\n');
		const cursorCharInLine = lastNewlinePos === -1 ? this.textPosition : this.textPosition - lastNewlinePos - 1;

		// Get text up to cursor on the current line
		const textUpToCursor = currentLine.substring(0, cursorCharInLine);

		// Measure width using existing pattern
		const textWidth = this.measureText(textUpToCursor, style);

		// Calculate Y position
		const fontSize = style.fontSize as number;
		const textAsset = this.clipConfig.asset as TextAsset;
		const lineHeight = textAsset.font?.lineHeight ?? 1;
		const actualLineHeight = fontSize * lineHeight;
		this.pixelY = this.currentLine * actualLineHeight;

		// Calculate X position (simplified - assumes left alignment for now)
		this.pixelX = textWidth;
	}

	/**
	 * Apply calculated pixel position to graphics object
	 */
	private updateGraphicsPosition(): void {
		if (!this.cursor) return;

		// Apply calculated pixel position
		this.cursor.position.set(this.pixelX, this.pixelY);
	}

	/**
	 * Start blinking animation using interval
	 */
	private startBlinkingAnimation(): void {
		if (!this.cursor || this.isBlinking) return;

		this.isBlinking = true;
		this.blinkInterval = window.setInterval(() => {
			if (this.cursor && this.isBlinking) {
				this.cursor.visible = !this.cursor.visible;
			}
		}, this.blinkIntervalMs) as unknown as number;
	}

	/**
	 * Stop blinking animation and restore visibility
	 */
	private stopBlinkingAnimation(): void {
		if (this.blinkInterval !== null) {
			window.clearInterval(this.blinkInterval);
			this.blinkInterval = null;
		}
		this.isBlinking = false;

		// Restore visibility to intended state
		if (this.cursor) {
			this.cursor.visible = this.isVisible;
		}
	}

	/**
	 * Measure text width using temporary PIXI Text object
	 * Based on existing measureText pattern from TextEditor
	 */
	private measureText(text: string, style: pixi.TextStyle): number {
		const tempText = new pixi.Text(text, style);
		const { width } = tempText;
		tempText.destroy();
		return width;
	}

	// ------------------------------
	// Debug/Testing Methods
	// ------------------------------

	/**
	 * Check if cursor is properly initialized
	 */
	public isInitialized(): boolean {
		return this.cursor !== null;
	}

	/**
	 * Get current cursor state for debugging
	 */
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