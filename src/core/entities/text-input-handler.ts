/**
 * Configuration options for TextInputHandler
 */
type TextInputHandlerOptions = {
	initialText?: string;
	autoFocus?: boolean;
	focusDelay?: number; // Default: 50ms
};

/**
 * Callback type for text change events
 */
type TextChangeCallback = (text: string, cursorPosition: number) => void;


/**
 * Event handler configuration for keyboard events
 */
type KeyboardEventHandlers = {
	// Text input events
	onTextInput?: TextChangeCallback;

	// Navigation events
	onCursorMove?: (direction: "left" | "right" | "up" | "down", event: KeyboardEvent) => void;

	// Special key events
	onEnter?: (event: KeyboardEvent) => void;
	onEscape?: (event: KeyboardEvent) => void;
	onDelete?: (type: "backspace" | "delete", event: KeyboardEvent) => void;

	// Focus events
	onFocus?: (event: FocusEvent) => void;
	onBlur?: (event: FocusEvent) => void;

	// Tab navigation
	onTabNavigation?: (direction: "forward" | "backward") => void;

	// Custom key handlers
	onCustomKey?: (key: string, event: KeyboardEvent) => boolean;
};

/**
 * TextInputHandler manages hidden DOM textarea for keyboard input capture
 * while maintaining synchronization with PIXI text rendering
 */
export class TextInputHandler {
	// Constants
	private static readonly DEFAULT_FOCUS_DELAY_MS = 50;

	// DOM elements
	private hiddenInput: HTMLTextAreaElement | null = null;

	// State management
	private isFocused: boolean = false;
	private focusRetryCount: number = 0;
	private maxFocusRetries: number = 3;
	private focusDelay: number = TextInputHandler.DEFAULT_FOCUS_DELAY_MS;

	// Event handling
	private eventHandlers: Partial<KeyboardEventHandlers> = {};
	private abortController: AbortController | null = null;

	// Synchronization
	private textChangeCallback: TextChangeCallback | null = null;
	private lastSyncedText: string = "";

	// Composition state for IME support
	private isComposing: boolean = false;

	// ------------------------------
	// Public Interface Methods
	// ------------------------------

	/**
	 * Set up the hidden input element with initial configuration
	 */
	public setupInput(initialText: string, options?: TextInputHandlerOptions): void {
		// Apply options
		this.focusDelay = options?.focusDelay ?? TextInputHandler.DEFAULT_FOCUS_DELAY_MS;

		// Create hidden textarea
		this.createHiddenTextarea();

		// Set initial text
		if (this.hiddenInput) {
			this.hiddenInput.value = initialText;
			this.lastSyncedText = initialText;
		}

		// Set up event listeners
		this.setupEventListeners();

		// Auto-focus if requested
		if (options?.autoFocus !== false) {
			this.focusInput();
		}
	}

	/**
	 * Update the input value programmatically
	 */
	public updateInputValue(text: string): void {
		if (!this.hiddenInput) return;

		this.hiddenInput.value = text;
		this.lastSyncedText = text;
	}

	/**
	 * Focus the hidden input element
	 */
	public focusInput(): void {
		if (!this.hiddenInput) return;

		// Delay focus to avoid conflicts with PIXI events
		setTimeout(() => {
			if (this.hiddenInput && !this.isFocused) {
				this.hiddenInput.focus();
				
				// Verify focus was successful
				setTimeout(() => {
					if (!this.isFocused && this.focusRetryCount < this.maxFocusRetries) {
						this.focusRetryCount += 1;
						this.focusInput(); // Retry
					}
				}, 10);
			}
		}, this.focusDelay);
	}

	/**
	 * Blur the hidden input element
	 */
	public blurInput(): void {
		if (this.hiddenInput) {
			this.hiddenInput.blur();
		}
	}

	/**
	 * Set selection range in the hidden input
	 */
	public setSelectionRange(start: number, end: number): void {
		if (!this.hiddenInput) return;
		
		const textLength = this.hiddenInput.value.length;
		const clampedStart = Math.max(0, Math.min(start, textLength));
		const clampedEnd = Math.max(clampedStart, Math.min(end, textLength));
		
		this.hiddenInput.setSelectionRange(clampedStart, clampedEnd);
	}

	/**
	 * Get current cursor position
	 */
	public getCursorPosition(): number {
		return this.hiddenInput?.selectionStart || 0;
	}

	/**
	 * Get current input value
	 */
	public getValue(): string {
		return this.hiddenInput?.value || "";
	}

	/**
	 * Set text change callback
	 */
	public setTextInputHandler(callback: TextChangeCallback): void {
		this.textChangeCallback = callback;
	}

	/**
	 * Set event handlers for keyboard events
	 */
	public setEventHandlers(handlers: Partial<KeyboardEventHandlers>): void {
		this.eventHandlers = { ...this.eventHandlers, ...handlers };
	}

	/**
	 * Check if input is currently focused
	 */
	public isFocusedInput(): boolean {
		return this.isFocused;
	}

	/**
	 * Clean up resources and dispose of input handler
	 */
	public dispose(): void {
		// Remove event listeners
		this.removeAllEventListeners();

		// Remove from DOM
		if (this.hiddenInput && this.hiddenInput.parentNode) {
			this.hiddenInput.parentNode.removeChild(this.hiddenInput);
		}

		// Clear references
		this.hiddenInput = null;
		this.isFocused = false;
		this.focusRetryCount = 0;
		this.textChangeCallback = null;
		this.eventHandlers = {};
	}

	// ------------------------------
	// Private Implementation Methods
	// ------------------------------

	/**
	 * Create the hidden textarea element with proper styling
	 */
	private createHiddenTextarea(): void {
		this.hiddenInput = document.createElement("textarea");

		// Apply invisible styling to capture input without visual interference
		const styles = {
			position: "absolute",
			opacity: "0.01", // Nearly invisible but still focusable
			pointerEvents: "none", // Don't interfere with PIXI interactions
			zIndex: "999", // Ensure it's above other elements
			left: "0px",
			top: "0px",
			width: "1px",
			height: "1px",
			border: "none",
			outline: "none",
			resize: "none",
			backgroundColor: "transparent"
		};

		Object.assign(this.hiddenInput.style, styles);

		// Ensure input is in tab order
		this.hiddenInput.tabIndex = 0;

		// Add to DOM
		document.body.appendChild(this.hiddenInput);
	}

	/**
	 * Set up all event listeners using AbortController for clean cleanup
	 */
	private setupEventListeners(): void {
		if (!this.hiddenInput) return;

		// Use AbortController for clean event listener management
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		// Input event for text changes
		this.hiddenInput.addEventListener("input", this.handleTextInput, { signal });

		// Keydown for special keys and navigation
		this.hiddenInput.addEventListener("keydown", this.handleKeyDown, { signal });

		// Composition events for IME support
		this.hiddenInput.addEventListener("compositionstart", this.handleCompositionStart, { signal });
		this.hiddenInput.addEventListener("compositionend", this.handleCompositionEnd, { signal });

		// Focus/blur events
		this.hiddenInput.addEventListener("focus", this.handleFocus, { signal });
		this.hiddenInput.addEventListener("blur", this.handleBlur, { signal });

		// Paste events
		this.hiddenInput.addEventListener("paste", this.handlePaste, { signal });
	}

	/**
	 * Remove all event listeners
	 */
	private removeAllEventListeners(): void {
		this.abortController?.abort();
		this.abortController = null;
	}

	// ------------------------------
	// Event Handler Methods
	// ------------------------------

	/**
	 * Handle text input events for real-time synchronization
	 */
	private handleTextInput = (_: Event): void => {
		if (!this.hiddenInput || this.isComposing) return;

		const text = this.hiddenInput.value;
		const cursorPosition = this.hiddenInput.selectionStart || 0;

		// Update last synced state
		this.lastSyncedText = text;

		// Notify parent of text change for real-time WYSIWYG editing
		this.textChangeCallback?.(text, cursorPosition);
	};

	/**
	 * Handle key down events for special keys and navigation
	 */
	private handleKeyDown = (event: KeyboardEvent): void => {
		// Validate active element
		if (document.activeElement !== this.hiddenInput) return;

		let handled = false;

		// Handle modifier key combinations first
		if (event.ctrlKey || event.metaKey) {
			handled = this.handleKeyboardShortcuts(event);
			if (handled) {
				event.preventDefault();
				return;
			}
		}

		// Handle Tab key for navigation
		if (event.key === "Tab") {
			const direction = event.shiftKey ? "backward" : "forward";
			this.eventHandlers.onTabNavigation?.(direction);
			event.preventDefault();
			return;
		}

		// Process special keys
		switch (event.key) {
			case "Escape":
				this.eventHandlers.onEscape?.(event);
				handled = true;
				break;

			case "Enter":
				// Let browser handle Enter naturally (adds newline), sync happens via input event
				handled = false;
				break;

			case "ArrowLeft":
			case "ArrowRight":
			case "ArrowUp":
			case "ArrowDown":
				// Let browser handle navigation naturally, cursor sync happens via input event
				handled = false;
				break;

			case "Backspace":
			case "Delete":
				// Let browser handle delete/backspace naturally, sync happens via input event
				handled = false;
				break;

			default:
				// Allow custom key handlers
				handled = this.eventHandlers.onCustomKey?.(event.key, event) || false;
				break;
		}

		// Prevent default if handled
		if (handled) {
			event.preventDefault();
		}
	};

	/**
	 * Handle keyboard shortcuts
	 */
	private handleKeyboardShortcuts(event: KeyboardEvent): boolean {
		const { key } = event;
		switch (key.toLowerCase()) {
			case "a":
				// Select all
				this.selectAll();
				return true;

			case "c":
			case "v":
				// Copy/Paste - allow default browser behavior
				return false;

			case "z":
				// Undo
				this.eventHandlers.onCustomKey?.("undo", event);
				return true;

			case "y":
				// Redo
				this.eventHandlers.onCustomKey?.("redo", event);
				return true;

			default:
				return false;
		}
	}


	/**
	 * Handle composition start for IME input
	 */
	private handleCompositionStart = (_: CompositionEvent): void => {
		this.isComposing = true;
	};

	/**
	 * Handle composition end for IME input
	 */
	private handleCompositionEnd = (_: CompositionEvent): void => {
		this.isComposing = false;

		// Process final composed text
		if (this.hiddenInput) {
			const text = this.hiddenInput.value;
			const cursorPosition = this.hiddenInput.selectionStart || 0;
			this.textChangeCallback?.(text, cursorPosition);
		}
	};

	/**
	 * Handle focus events
	 */
	private handleFocus = (event: FocusEvent): void => {
		this.isFocused = true;
		this.focusRetryCount = 0;
		
		// Notify parent that text editing is active
		this.eventHandlers.onFocus?.(event);
	};

	/**
	 * Handle blur events
	 */
	private handleBlur = (event: FocusEvent): void => {
		this.isFocused = false;
		
		// Notify parent that text editing lost focus
		this.eventHandlers.onBlur?.(event);
	};

	/**
	 * Handle paste events
	 */
	private handlePaste = (event: ClipboardEvent): void => {
		// Allow default paste behavior, then sync
		setTimeout(() => {
			this.handleTextInput(event);
		}, 0);
	};

	/**
	 * Select all text in the input
	 */
	private selectAll(): void {
		if (this.hiddenInput) {
			this.hiddenInput.select();
		}
	}
}