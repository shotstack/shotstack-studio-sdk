import * as pixi from "pixi.js";

import { type Clip } from "../schemas/clip";
import { type TextAsset } from "../schemas/text-asset";

import type { TextPlayer } from "./text-player";
import { TextCursor } from "./text-cursor";

/**
 * Enum for horizontal alignment options
 */
export enum HorizontalAlignment {
	LEFT = "left",
	CENTER = "center",
	RIGHT = "right"
}

/**
 * Enum for vertical alignment options
 */
export enum VerticalAlignment {
	TOP = "top",
	CENTER = "center",
	BOTTOM = "bottom"
}

/**
 * TextEditor handles the editing functionality for text elements
 */
export class TextEditor {
	// UI Constants
	private static readonly DOUBLE_CLICK_THRESHOLD_MS = 300;
	private static readonly EDITING_BG_PADDING_PX = 5;
	private static readonly EDITING_BG_ALPHA = 0.2;
	private static readonly FOCUS_DELAY_MS = 50;
	private static readonly CLICK_HANDLER_DELAY_MS = 100;

	// Core properties
	private parent: TextPlayer;
	private targetText: pixi.Text;
	private clipConfig: Clip;
	private isEditing: boolean = false;
	private lastClickTime: number = 0;

	// UI components
	private editingContainer: pixi.Container | null = null;
	private editableText: pixi.Text | null = null;
	private textCursor: TextCursor | null = null;
	private hiddenInput: HTMLTextAreaElement | null = null;
	private cursorPosition: number = 0;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

	// ------------------------------
	// Lifecycle Methods
	// ------------------------------

	constructor(parent: TextPlayer, targetText: pixi.Text, clipConfig: Clip) {
		this.parent = parent;
		this.targetText = targetText;
		this.clipConfig = clipConfig;

		// Set up event listeners using class properties
		this.parent.getContainer().eventMode = "static";
		this.parent.getContainer().on("click", this.checkForDoubleClick);
		window.addEventListener("keydown", this.handleKeyDown);
	}

	public dispose(): void {
		// Clean up event listeners
		this.parent.getContainer().off("click", this.checkForDoubleClick);
		window.removeEventListener("keydown", this.handleKeyDown);

		this.stopEditing();

		if (this.outsideClickHandler) {
			window.removeEventListener("click", this.outsideClickHandler);
			this.outsideClickHandler = null;
		}
	}

	// ------------------------------
	// Editing State Management
	// ------------------------------

	private startEditing(): void {
		if (this.isEditing || !this.targetText) return;

		// Store initial configuration before editing
		const initialConfig = structuredClone(this.clipConfig);

		// Hide the original text while in editing mode
		this.targetText.visible = false;

		// Create editing environment
		this.createEditingEnvironment();

		// Handle clicks outside to end editing
		this.setupOutsideClickHandler(initialConfig);

		// Set editing mode
		this.isEditing = true;
	}

	private stopEditing(saveChanges = false, initialConfig?: Clip): void {
		if (!this.isEditing) return;

		// Get the current edited text
		let newText = "";
		if (this.editableText) {
			newText = this.editableText.text;
		}

		// Clean up editing UI
		if (this.editingContainer) {
			this.parent.getContainer().removeChild(this.editingContainer);
			this.editingContainer.destroy();
			this.editingContainer = null;
		}

		this.editableText = null;

		// Clean up TextCursor
		if (this.textCursor) {
			this.textCursor.dispose();
			this.textCursor = null;
		}

		// Remove hidden input
		if (this.hiddenInput) {
			this.hiddenInput.remove();
			this.hiddenInput = null;
		}

		// Make original text visible again
		this.targetText.visible = true;

		// Save changes if requested - TextPlayer.updateTextContent will handle positioning
		if (saveChanges && initialConfig && newText !== "") {
			this.parent.updateTextContent(newText, initialConfig);
		}

		// Reset cursor position
		this.cursorPosition = 0;

		// Exit editing mode
		this.isEditing = false;
	}

	// ------------------------------
	// Event Handlers
	// ------------------------------

	// Define event handlers as class properties using arrow functions
	private checkForDoubleClick = (event: pixi.FederatedPointerEvent): void => {
		const currentTime = Date.now();
		const isDoubleClick = currentTime - this.lastClickTime < TextEditor.DOUBLE_CLICK_THRESHOLD_MS;

		if (isDoubleClick) {
			this.startEditing();
		}

		this.lastClickTime = currentTime;
	};

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (!this.isEditing || !this.editableText || !this.hiddenInput) return;

		// Don't handle key events if we're not the target
		if (document.activeElement !== this.hiddenInput) return;

		let handled = false;

		// Get current text and cursor information
		const { text } = this.editableText;
		const lines = text.split("\n");

		// Find current line and position within line
		const textBeforeCursor = text.substring(0, this.cursorPosition);
		const newlineMatches = textBeforeCursor.match(/\n/g);
		const currentLineIndex = newlineMatches ? newlineMatches.length : 0;
		const lastNewlinePos = textBeforeCursor.lastIndexOf("\n");
		const cursorPosInLine = lastNewlinePos === -1 ? this.cursorPosition : this.cursorPosition - lastNewlinePos - 1;

		// Special keys
		switch (event.key) {
			case "Escape":
				// Cancel editing
				this.stopEditing(false);
				event.preventDefault();
				return;

			case "Enter":
				// Add a new line
				this.handleEnter();
				event.preventDefault();
				return;

			case "ArrowLeft":
				// Move cursor left
				this.cursorPosition = Math.max(0, this.cursorPosition - 1);
				handled = true;
				break;

			case "ArrowRight":
				// Move cursor right
				this.cursorPosition = Math.min(this.editableText.text.length, this.cursorPosition + 1);
				handled = true;
				break;

			case "ArrowUp":
				// Move cursor to previous line at same horizontal position if possible
				if (currentLineIndex > 0) {
					const prevLineIndex = currentLineIndex - 1;
					const prevLine = lines[prevLineIndex];
					const prevLinePos = Math.min(cursorPosInLine, prevLine.length);

					// Calculate position in the text
					let newPosition = 0;
					for (let i = 0; i < prevLineIndex; i += 1) {
						newPosition += lines[i].length + 1; // +1 for newline
					}
					newPosition += prevLinePos;

					this.cursorPosition = newPosition;
					handled = true;
				}
				break;

			case "ArrowDown":
				// Move cursor to next line at same horizontal position if possible
				if (currentLineIndex < lines.length - 1) {
					const nextLineIndex = currentLineIndex + 1;
					const nextLine = lines[nextLineIndex];
					const nextLinePos = Math.min(cursorPosInLine, nextLine.length);

					// Calculate position in the text
					let newPosition = 0;
					for (let i = 0; i < nextLineIndex; i += 1) {
						newPosition += lines[i].length + 1; // +1 for newline
					}
					newPosition += nextLinePos;

					this.cursorPosition = newPosition;
					handled = true;
				}
				break;

			case "Delete":
				this.handleDelete();
				handled = true;
				break;

			default:
				// Other keys are handled by input event
				break;
		}

		if (handled) {
			this.textCursor?.updatePosition(this.cursorPosition);
			this.syncTextareaSelection();
			event.preventDefault();
		}
	};


	private handleInput = (event: Event): void => {
		if (!this.isEditing || !this.editableText || !this.hiddenInput) return;

		// Get the browser's current selection (caret position)
		const selectionStart = this.hiddenInput.selectionStart || 0;

		// Update the visible text
		this.editableText.text = this.hiddenInput.value;

		// Update text alignment if line count changes
		this.updateTextAlignment();

		// Update cursor position to the browser's current selection
		this.cursorPosition = selectionStart;

		// Update cursor position
		this.textCursor?.updatePosition(this.cursorPosition);
	};

	private setupOutsideClickHandler(initialConfig: Clip): void {
		// Create the handler as an arrow function to maintain context
		this.outsideClickHandler = (e: MouseEvent) => {
			// Check if click is outside our element
			const container = this.parent.getContainer();
			const bounds = container.getBounds();
			const x = e.clientX;
			const y = e.clientY;

			if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) {
				this.stopEditing(true, initialConfig);
				if (this.outsideClickHandler) {
					window.removeEventListener("click", this.outsideClickHandler);
					this.outsideClickHandler = null;
				}
			}
		};

		// Add a slight delay to avoid immediate triggering
		setTimeout(() => {
			if (this.outsideClickHandler) {
				window.addEventListener("click", this.outsideClickHandler);
			}
		}, TextEditor.CLICK_HANDLER_DELAY_MS);
	}

	// ------------------------------
	// UI Setup Methods
	// ------------------------------

	private createEditingEnvironment(): void {
		// Create editing container with background and editable text
		this.setupEditingContainer();

		// Initialize cursor position to the end of text
		this.cursorPosition = this.targetText.text.length;

		// Create and setup TextCursor
		if (this.editingContainer && this.editableText) {
			this.textCursor = new TextCursor(
				this.editingContainer,
				this.editableText,
				this.clipConfig
			);

			// Position cursor at the end of text initially and start blinking
			this.textCursor.updatePosition(this.cursorPosition);
			this.textCursor.startBlinking();
		}

		// Create and setup hidden input
		this.setupHiddenInput();

		// Ensure proper alignment of the editing container
		this.updateTextAlignment();
	}

	private setupEditingContainer(): void {
		this.editingContainer = new pixi.Container();
		this.parent.getContainer().addChild(this.editingContainer);

		// Create background highlight for editing
		const editBg = new pixi.Graphics();
		editBg.fillStyle = { color: 0x000000, alpha: TextEditor.EDITING_BG_ALPHA };
		editBg.rect(
			-TextEditor.EDITING_BG_PADDING_PX,
			-TextEditor.EDITING_BG_PADDING_PX,
			this.targetText.width + 2 * TextEditor.EDITING_BG_PADDING_PX,
			this.targetText.height + 2 * TextEditor.EDITING_BG_PADDING_PX
		);
		editBg.fill();
		this.editingContainer.addChild(editBg);

		// Create a new text that will be edited
		this.editableText = new pixi.Text(this.targetText.text, this.targetText.style as pixi.TextStyle);
		this.editableText.eventMode = "static";
		this.editableText.cursor = "text";
		this.editingContainer.addChild(this.editableText);

	}



	private setupHiddenInput(): void {
		// Create a hidden textarea element to capture keyboard input
		this.hiddenInput = document.createElement("textarea");
		this.hiddenInput.value = this.targetText.text;
		this.hiddenInput.style.position = "absolute";
		this.hiddenInput.style.opacity = "0.01";
		this.hiddenInput.style.pointerEvents = "none";
		this.hiddenInput.style.zIndex = "999";
		this.hiddenInput.style.left = "0";
		this.hiddenInput.style.top = "0";
		document.body.appendChild(this.hiddenInput);

		// Directly set input handlers using class property
		this.hiddenInput.addEventListener("input", this.handleInput);

		// Force focus after a short delay
		setTimeout(() => {
			this.hiddenInput?.focus();
		}, TextEditor.FOCUS_DELAY_MS);
	}

	// ------------------------------
	// Text Editing Methods
	// ------------------------------

	private handleEnter(): void {
		if (!this.editableText || !this.hiddenInput) return;

		// Insert a newline at cursor position
		const { text } = this.editableText;
		const beforeCursor = text.substring(0, this.cursorPosition);
		const afterCursor = text.substring(this.cursorPosition);
		const updatedText = `${beforeCursor}\n${afterCursor}`;

		// Update visible text
		this.editableText.text = updatedText;

		// Update hidden input and ensure proper selection point
		this.hiddenInput.value = updatedText;

		// Move cursor to beginning of next line
		this.cursorPosition = beforeCursor.length + 1;

		// Update the text position based on vertical alignment
		this.updateTextAlignment();

		// Explicitly force redraw before updating cursor position
		setTimeout(() => {
			this.refocusInput();
			// Force immediate cursor update with correct position
			this.textCursor?.updatePosition(this.cursorPosition);
		}, 0);
	}

	private handleDelete(): void {
		if (!this.editableText || !this.hiddenInput) return;

		// Only delete if not at the end of text
		if (this.cursorPosition < this.editableText.text.length) {
			const { text } = this.editableText;
			const beforeCursor = text.substring(0, this.cursorPosition);
			const afterCursor = text.substring(this.cursorPosition + 1);
			const updatedText = beforeCursor + afterCursor;

			// Update visible text and hidden input
			this.editableText.text = updatedText;
			this.hiddenInput.value = updatedText;

			// Update vertical alignment if text height changed (e.g., deleted a line break)
			this.updateTextAlignment();

			// Update cursor position and visuals
			this.textCursor?.updatePosition(this.cursorPosition);
		}
	}

	private refocusInput(): void {
		if (!this.hiddenInput) return;
		this.hiddenInput.focus();
		this.syncTextareaSelection();
	}

	private syncTextareaSelection(): void {
		if (!this.hiddenInput) return;
		this.hiddenInput.setSelectionRange(this.cursorPosition, this.cursorPosition);
	}



	// ------------------------------
	// Alignment & Layout Methods
	// ------------------------------

	private updateTextAlignment(): void {
		if (!this.editableText || !this.editingContainer) return;

		const containerDimensions = this.getContainerDimensions();
		const alignment = this.getAlignmentSettings();

		// Calculate position based on alignment
		const textX = this.calculateHorizontalPosition({ width: this.editableText.width }, containerDimensions, alignment.horizontal);

		const textY = this.calculateVerticalPosition({ height: this.editableText.height }, containerDimensions, alignment.vertical);

		// Position the entire editing container to maintain the proper alignment
		this.editingContainer.position.set(textX, textY);

		// Update the highlight background to match the new text size
		if (this.editingContainer.children.length > 0) {
			const background = this.editingContainer.getChildAt(0) as pixi.Graphics;
			if (background instanceof pixi.Graphics) {
				background.clear();
				background.fillStyle = { color: 0x000000, alpha: TextEditor.EDITING_BG_ALPHA };
				background.rect(
					-TextEditor.EDITING_BG_PADDING_PX,
					-TextEditor.EDITING_BG_PADDING_PX,
					this.editableText.width + 2 * TextEditor.EDITING_BG_PADDING_PX,
					this.editableText.height + 2 * TextEditor.EDITING_BG_PADDING_PX
				);
				background.fill();
			}
		}
	}

	private calculateHorizontalPosition(
		content: { width: number },
		container: { width: number },
		alignment: HorizontalAlignment = HorizontalAlignment.CENTER
	): number {
		switch (alignment) {
			case HorizontalAlignment.CENTER:
				return container.width / 2 - content.width / 2;
			case HorizontalAlignment.RIGHT:
				return container.width - content.width;
			case HorizontalAlignment.LEFT:
			default:
				return 0;
		}
	}

	private calculateVerticalPosition(
		content: { height: number },
		container: { height: number },
		alignment: VerticalAlignment = VerticalAlignment.CENTER
	): number {
		switch (alignment) {
			case VerticalAlignment.CENTER:
				return container.height / 2 - content.height / 2;
			case VerticalAlignment.BOTTOM:
				return container.height - content.height;
			case VerticalAlignment.TOP:
			default:
				return 0;
		}
	}

	private getContainerDimensions(): { width: number; height: number } {
		const textAsset = this.clipConfig.asset as TextAsset;
		return {
			width: textAsset.width ?? this.parent.getSize().width,
			height: textAsset.height ?? this.parent.getSize().height
		};
	}

	private getAlignmentSettings(): { horizontal: HorizontalAlignment; vertical: VerticalAlignment } {
		const textAsset = this.clipConfig.asset as TextAsset;
		return {
			horizontal: (textAsset.alignment?.horizontal ?? HorizontalAlignment.CENTER) as HorizontalAlignment,
			vertical: (textAsset.alignment?.vertical ?? VerticalAlignment.CENTER) as VerticalAlignment
		};
	}

	// ------------------------------
	// Utility Methods
	// ------------------------------

	/**
	 * Utility method to measure text width without creating and destroying objects repeatedly
	 */
	private measureText(text: string, style: pixi.TextStyle): number {
		const tempText = new pixi.Text(text, style);
		const { width } = tempText;
		tempText.destroy();
		return width;
	}
}
