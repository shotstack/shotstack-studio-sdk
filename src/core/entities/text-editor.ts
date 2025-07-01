import * as pixi from "pixi.js";

import { type Clip } from "../schemas/clip";
import { type TextAsset } from "../schemas/text-asset";

import { TextCursor } from "./text-cursor";
import { TextInputHandler } from "./text-input-handler";
import type { TextPlayer } from "./text-player";

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
	private textInputHandler: TextInputHandler | null = null;
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
	}

	public dispose(): void {
		// Clean up event listeners
		this.parent.getContainer().off("click", this.checkForDoubleClick);

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

		// Clean up TextInputHandler
		if (this.textInputHandler) {
			this.textInputHandler.dispose();
			this.textInputHandler = null;
		}

		// Make original text visible again
		this.targetText.visible = true;

		// Save changes if requested - TextPlayer.updateTextContent will handle positioning
		if (saveChanges && initialConfig && newText !== "") {
			this.parent.updateTextContent(newText, initialConfig);
		}

		// Exit editing mode
		this.isEditing = false;
	}

	// ------------------------------
	// Event Handlers
	// ------------------------------

	// Define event handlers as class properties using arrow functions
	private checkForDoubleClick = (_: pixi.FederatedPointerEvent): void => {
		const currentTime = Date.now();
		const isDoubleClick = currentTime - this.lastClickTime < TextEditor.DOUBLE_CLICK_THRESHOLD_MS;

		if (isDoubleClick) {
			this.startEditing();
		}

		this.lastClickTime = currentTime;
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

		// Create and setup TextCursor
		if (this.editingContainer && this.editableText) {
			this.textCursor = new TextCursor(
				this.editingContainer,
				this.editableText,
				this.clipConfig
			);

			// Position cursor at the end of text initially and start blinking
			this.textCursor.updatePosition(this.targetText.text.length);
			this.textCursor.startBlinking();
		}

		// Create and setup TextInputHandler
		this.setupTextInputHandler();

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



	private setupTextInputHandler(): void {
		// Create TextInputHandler instance
		this.textInputHandler = new TextInputHandler();

		// Set up text change callback
		this.textInputHandler.setTextInputHandler((text: string, cursorPosition: number) => {
			// Update PIXI text
			if (this.editableText) {
				this.editableText.text = text;
				this.updateTextAlignment(); // Reposition if needed
			}
			
			// Update cursor position via TextCursor
			this.textCursor?.updatePosition(cursorPosition);
		});

		// Set up event handlers  
		this.textInputHandler.setEventHandlers({
			onEscape: (_) => this.stopEditing(false),
			onTabNavigation: (_) => this.stopEditing(true)
			// Note: Enter, arrow keys, and delete keys are handled automatically by TextInputHandler
			// Text input and cursor movement work through the browser's native textarea behavior
		});

		// Initialize with current text
		this.textInputHandler.setupInput(this.targetText.text, { autoFocus: true });
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
