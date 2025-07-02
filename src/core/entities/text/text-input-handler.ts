type TextInputHandlerOptions = {
	initialText?: string;
	autoFocus?: boolean;
	focusDelay?: number;
};

type TextChangeCallback = (text: string, cursorPosition: number) => void;

type KeyboardEventHandlers = {
	onTextInput?: TextChangeCallback;
	onCursorMove?: (direction: "left" | "right" | "up" | "down", event: KeyboardEvent) => void;
	onEnter?: (event: KeyboardEvent) => void;
	onEscape?: (event: KeyboardEvent) => void;
	onDelete?: (type: "backspace" | "delete", event: KeyboardEvent) => void;
	onFocus?: (event: FocusEvent) => void;
	onBlur?: (event: FocusEvent) => void;
	onTabNavigation?: (direction: "forward" | "backward") => void;
	onCustomKey?: (key: string, event: KeyboardEvent) => boolean;
};

export class TextInputHandler {
	private static readonly DEFAULT_FOCUS_DELAY_MS = 50;

	private hiddenInput: HTMLTextAreaElement | null = null;

	private isFocused: boolean = false;
	private focusRetryCount: number = 0;
	private maxFocusRetries: number = 3;
	private focusDelay: number = TextInputHandler.DEFAULT_FOCUS_DELAY_MS;

	private eventHandlers: Partial<KeyboardEventHandlers> = {};
	private abortController: AbortController | null = null;

	private textChangeCallback: TextChangeCallback | null = null;
	private lastSyncedText: string = "";

	private isComposing: boolean = false;

	public setupInput(initialText: string, options?: TextInputHandlerOptions): void {
		this.focusDelay = options?.focusDelay ?? TextInputHandler.DEFAULT_FOCUS_DELAY_MS;

		this.createHiddenTextarea();

		if (this.hiddenInput) {
			this.hiddenInput.value = initialText;
			this.lastSyncedText = initialText;
		}

		this.setupEventListeners();

		if (options?.autoFocus !== false) {
			this.focusInput();
		}
	}

	public updateInputValue(text: string): void {
		if (!this.hiddenInput) return;

		this.hiddenInput.value = text;
		this.lastSyncedText = text;
	}

	public focusInput(): void {
		if (!this.hiddenInput) return;

		setTimeout(() => {
			if (this.hiddenInput && !this.isFocused) {
				this.hiddenInput.focus();

				setTimeout(() => {
					if (!this.isFocused && this.focusRetryCount < this.maxFocusRetries) {
						this.focusRetryCount += 1;
						this.focusInput();
					}
				}, 10);
			}
		}, this.focusDelay);
	}

	public blurInput(): void {
		if (this.hiddenInput) {
			this.hiddenInput.blur();
		}
	}

	public setSelectionRange(start: number, end: number): void {
		if (!this.hiddenInput) return;

		const textLength = this.hiddenInput.value.length;
		const clampedStart = Math.max(0, Math.min(start, textLength));
		const clampedEnd = Math.max(clampedStart, Math.min(end, textLength));

		this.hiddenInput.setSelectionRange(clampedStart, clampedEnd);
	}

	public getCursorPosition(): number {
		return this.hiddenInput?.selectionStart || 0;
	}

	public getValue(): string {
		return this.hiddenInput?.value || "";
	}

	public setTextInputHandler(callback: TextChangeCallback): void {
		this.textChangeCallback = callback;
	}

	public setEventHandlers(handlers: Partial<KeyboardEventHandlers>): void {
		this.eventHandlers = { ...this.eventHandlers, ...handlers };
	}

	public isFocusedInput(): boolean {
		return this.isFocused;
	}

	public dispose(): void {
		this.removeAllEventListeners();

		if (this.hiddenInput && this.hiddenInput.parentNode) {
			this.hiddenInput.parentNode.removeChild(this.hiddenInput);
		}

		this.hiddenInput = null;
		this.isFocused = false;
		this.focusRetryCount = 0;
		this.textChangeCallback = null;
		this.eventHandlers = {};
	}

	private createHiddenTextarea(): void {
		this.hiddenInput = document.createElement("textarea");

		const styles = {
			position: "absolute",
			opacity: "0.01",
			pointerEvents: "none",
			zIndex: "999",
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

		this.hiddenInput.tabIndex = 0;

		document.body.appendChild(this.hiddenInput);
	}

	private setupEventListeners(): void {
		if (!this.hiddenInput) return;

		this.abortController = new AbortController();
		const { signal } = this.abortController;

		this.hiddenInput.addEventListener("input", this.handleTextInput, { signal });
		this.hiddenInput.addEventListener("keydown", this.handleKeyDown, { signal });
		this.hiddenInput.addEventListener("compositionstart", this.handleCompositionStart, { signal });
		this.hiddenInput.addEventListener("compositionend", this.handleCompositionEnd, { signal });
		this.hiddenInput.addEventListener("focus", this.handleFocus, { signal });
		this.hiddenInput.addEventListener("blur", this.handleBlur, { signal });
		this.hiddenInput.addEventListener("paste", this.handlePaste, { signal });
	}

	private removeAllEventListeners(): void {
		this.abortController?.abort();
		this.abortController = null;
	}

	private handleTextInput = (_: Event): void => {
		if (!this.hiddenInput || this.isComposing) return;

		const text = this.hiddenInput.value;
		const cursorPosition = this.hiddenInput.selectionStart || 0;

		this.lastSyncedText = text;

		this.textChangeCallback?.(text, cursorPosition);
	};

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (document.activeElement !== this.hiddenInput) return;

		let handled = false;

		if (event.ctrlKey || event.metaKey) {
			handled = this.handleKeyboardShortcuts(event);
			if (handled) {
				event.preventDefault();
				return;
			}
		}

		if (event.key === "Tab") {
			const direction = event.shiftKey ? "backward" : "forward";
			this.eventHandlers.onTabNavigation?.(direction);
			event.preventDefault();
			return;
		}

		switch (event.key) {
			case "Escape":
				this.eventHandlers.onEscape?.(event);
				handled = true;
				break;

			case "Enter":
				handled = false;
				break;

			case "ArrowLeft":
			case "ArrowRight":
			case "ArrowUp":
			case "ArrowDown":
				setTimeout(() => {
					if (this.hiddenInput) {
						const text = this.hiddenInput.value;
						const cursorPosition = this.hiddenInput.selectionStart || 0;
						this.textChangeCallback?.(text, cursorPosition);
					}
				}, 0);
				handled = false;
				break;

			case "Backspace":
			case "Delete":
				handled = false;
				break;

			default:
				handled = this.eventHandlers.onCustomKey?.(event.key, event) || false;
				break;
		}

		if (handled) {
			event.preventDefault();
		}
	};

	private handleKeyboardShortcuts(event: KeyboardEvent): boolean {
		const { key } = event;
		switch (key.toLowerCase()) {
			case "a":
				this.selectAll();
				return true;

			case "c":
			case "v":
				return false;

			case "z":
				this.eventHandlers.onCustomKey?.("undo", event);
				return true;

			case "y":
				this.eventHandlers.onCustomKey?.("redo", event);
				return true;

			default:
				return false;
		}
	}

	private handleCompositionStart = (_: CompositionEvent): void => {
		this.isComposing = true;
	};

	private handleCompositionEnd = (_: CompositionEvent): void => {
		this.isComposing = false;

		if (this.hiddenInput) {
			const text = this.hiddenInput.value;
			const cursorPosition = this.hiddenInput.selectionStart || 0;
			this.textChangeCallback?.(text, cursorPosition);
		}
	};

	private handleFocus = (event: FocusEvent): void => {
		this.isFocused = true;
		this.focusRetryCount = 0;

		this.eventHandlers.onFocus?.(event);
	};

	private handleBlur = (event: FocusEvent): void => {
		this.isFocused = false;

		this.eventHandlers.onBlur?.(event);
	};

	private handlePaste = (event: ClipboardEvent): void => {
		setTimeout(() => {
			this.handleTextInput(event);
		}, 0);
	};

	private selectAll(): void {
		if (this.hiddenInput) {
			this.hiddenInput.select();
		}
	}
}
