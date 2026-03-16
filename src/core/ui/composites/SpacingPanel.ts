import { UIComponent } from "../primitives/UIComponent";

/**
 * State for spacing configuration.
 */
export interface SpacingState {
	letterSpacing: number;
	wordSpacing: number;
	lineHeight: number;
}

/**
 * Configuration for SpacingPanel.
 */
export interface SpacingPanelConfig {
	/** Whether to show letter spacing control (default: true) */
	showLetterSpacing?: boolean;
	/** Min value for letter spacing (default: -50) */
	letterSpacingMin?: number;
	/** Max value for letter spacing (default: 100) */
	letterSpacingMax?: number;
	/** Whether to show word spacing control (default: true) */
	showWordSpacing?: boolean;
	/** Min value for word spacing (default: 0) */
	wordSpacingMin?: number;
	/** Max value for word spacing (default: 100) */
	wordSpacingMax?: number;
	/** Min value for line height slider (default: 5, represents 0.5) */
	lineHeightMin?: number;
	/** Max value for line height slider (default: 30, represents 3.0) */
	lineHeightMax?: number;
}

/**
 * A spacing configuration panel with letter spacing and line height controls.
 *
 * This composite can be used by both TextToolbar (line height only) and
 * RichTextToolbar (letter spacing + line height).
 *
 * @example
 * ```typescript
 * // Full spacing (RichTextToolbar)
 * const spacing = new SpacingPanel();
 * spacing.onChange(state => this.applySpacing(state));
 * spacing.mount(container);
 *
 * // Line height only (TextToolbar)
 * const spacing = new SpacingPanel({ showLetterSpacing: false });
 * ```
 */
export class SpacingPanel extends UIComponent<SpacingState> {
	private panelConfig: Required<SpacingPanelConfig>;

	private state: SpacingState = {
		letterSpacing: 0,
		wordSpacing: 0,
		lineHeight: 1.2
	};

	// DOM references
	private letterSpacingSlider: HTMLInputElement | null = null;
	private letterSpacingValue: HTMLSpanElement | null = null;
	private wordSpacingSlider: HTMLInputElement | null = null;
	private wordSpacingValue: HTMLSpanElement | null = null;
	private lineHeightSlider: HTMLInputElement | null = null;
	private lineHeightValue: HTMLSpanElement | null = null;

	// Two-phase pattern: Track if drag is active
	private spacingDragActive: boolean = false;

	// Callbacks for drag lifecycle
	private dragStartCallback: (() => void) | null = null;
	private dragEndCallback: (() => void) | null = null;

	constructor(panelConfig: SpacingPanelConfig = {}) {
		super(); // No wrapper class - mounted inside existing popup
		this.panelConfig = {
			showLetterSpacing: panelConfig.showLetterSpacing ?? true,
			letterSpacingMin: panelConfig.letterSpacingMin ?? -50,
			letterSpacingMax: panelConfig.letterSpacingMax ?? 100,
			showWordSpacing: panelConfig.showWordSpacing ?? false,
			wordSpacingMin: panelConfig.wordSpacingMin ?? 0,
			wordSpacingMax: panelConfig.wordSpacingMax ?? 100,
			lineHeightMin: panelConfig.lineHeightMin ?? 5,
			lineHeightMax: panelConfig.lineHeightMax ?? 30
		};
	}

	render(): string {
		const { showLetterSpacing, letterSpacingMin, letterSpacingMax, showWordSpacing, wordSpacingMin, wordSpacingMax, lineHeightMin, lineHeightMax } = this.panelConfig;

		const letterSpacingHtml = showLetterSpacing
			? `
			<div class="ss-toolbar-popup-label" data-merge-path="asset.style.letterSpacing" data-merge-prefix="TEXT_LETTER_SPACING">Letter spacing</div>
			<div class="ss-toolbar-popup-row">
				<input type="range" class="ss-toolbar-slider" data-letter-spacing-slider
					min="${letterSpacingMin}" max="${letterSpacingMax}" value="0" />
				<span class="ss-toolbar-popup-value" data-letter-spacing-value>0</span>
			</div>
		`
			: "";

		const wordSpacingHtml = showWordSpacing
			? `
			<div class="ss-toolbar-popup-label" data-merge-path="asset.style.wordSpacing" data-merge-prefix="TEXT_WORD_SPACING">Word spacing</div>
			<div class="ss-toolbar-popup-row">
				<input type="range" class="ss-toolbar-slider" data-word-spacing-slider
					min="${wordSpacingMin}" max="${wordSpacingMax}" value="0" />
				<span class="ss-toolbar-popup-value" data-word-spacing-value>0</span>
			</div>
		`
			: "";

		return `
			${letterSpacingHtml}
			${wordSpacingHtml}
			<div class="ss-toolbar-popup-label" data-merge-path="asset.style.lineHeight" data-merge-prefix="TEXT_LINE_HEIGHT">Line spacing</div>
			<div class="ss-toolbar-popup-row">
				<input type="range" class="ss-toolbar-slider" data-line-height-slider
					min="${lineHeightMin}" max="${lineHeightMax}" value="12" />
				<span class="ss-toolbar-popup-value" data-line-height-value>1.2</span>
			</div>
		`;
	}

	protected bindElements(): void {
		this.letterSpacingSlider = this.container?.querySelector("[data-letter-spacing-slider]") ?? null;
		this.letterSpacingValue = this.container?.querySelector("[data-letter-spacing-value]") ?? null;
		this.wordSpacingSlider = this.container?.querySelector("[data-word-spacing-slider]") ?? null;
		this.wordSpacingValue = this.container?.querySelector("[data-word-spacing-value]") ?? null;
		this.lineHeightSlider = this.container?.querySelector("[data-line-height-slider]") ?? null;
		this.lineHeightValue = this.container?.querySelector("[data-line-height-value]") ?? null;
	}

	protected setupEvents(): void {
		// Phase 1: Mark drag active on pointerdown
		const setupPointerdown = (slider: HTMLInputElement | null): void => {
			if (slider) {
				this.events.on(slider, "pointerdown", () => {
					const wasInactive = !this.spacingDragActive;
					this.spacingDragActive = true;
					if (wasInactive) {
						this.dragStartCallback?.();
					}
				});
			}
		};

		setupPointerdown(this.letterSpacingSlider);
		setupPointerdown(this.wordSpacingSlider);
		setupPointerdown(this.lineHeightSlider);

		// Phase 2: Live update during drag
		if (this.letterSpacingSlider) {
			this.events.on(this.letterSpacingSlider, "input", () => {
				const value = parseInt(this.letterSpacingSlider!.value, 10);
				this.state.letterSpacing = value;
				this.updateLetterSpacingDisplay();
				this.emit(this.state);
			});
		}

		if (this.wordSpacingSlider) {
			this.events.on(this.wordSpacingSlider, "input", () => {
				const value = parseInt(this.wordSpacingSlider!.value, 10);
				this.state.wordSpacing = value;
				this.updateWordSpacingDisplay();
				this.emit(this.state);
			});
		}

		if (this.lineHeightSlider) {
			this.events.on(this.lineHeightSlider, "input", () => {
				const rawValue = parseInt(this.lineHeightSlider!.value, 10);
				const lineHeight = rawValue / 10;
				this.state.lineHeight = lineHeight;
				this.updateLineHeightDisplay();
				this.emit(this.state);
			});
		}

		// Phase 3: Mark drag complete on release
		const onDragEnd = (): void => {
			if (this.spacingDragActive) {
				this.spacingDragActive = false;
				this.dragEndCallback?.();
			}
		};

		if (this.letterSpacingSlider) this.events.on(this.letterSpacingSlider, "change", onDragEnd);
		if (this.wordSpacingSlider) this.events.on(this.wordSpacingSlider, "change", onDragEnd);
		if (this.lineHeightSlider) this.events.on(this.lineHeightSlider, "change", onDragEnd);
	}

	/**
	 * Set spacing values from clip data.
	 */
	setState(letterSpacing: number, wordSpacing: number, lineHeight: number): void {
		this.state.letterSpacing = letterSpacing;
		this.state.wordSpacing = wordSpacing;
		this.state.lineHeight = lineHeight;
		this.updateUI();
	}

	/**
	 * Set only line height (for TextToolbar which doesn't use letter spacing).
	 */
	setLineHeight(lineHeight: number): void {
		this.state.lineHeight = lineHeight;
		this.updateLineHeightDisplay();
		if (this.lineHeightSlider) {
			this.lineHeightSlider.value = String(Math.round(lineHeight * 10));
		}
	}

	/**
	 * Get current spacing state.
	 */
	getState(): SpacingState {
		return { ...this.state };
	}

	/**
	 * Register callback for drag start (when pointerdown occurs on any slider).
	 */
	onDragStart(callback: () => void): void {
		this.dragStartCallback = callback;
	}

	/**
	 * Register callback for drag end (when change event occurs on any slider).
	 */
	onDragEnd(callback: () => void): void {
		this.dragEndCallback = callback;
	}

	/**
	 * Check if any spacing slider is currently being dragged.
	 * @internal Used by parent to determine if live updates should skip command creation.
	 */
	isDragging(): boolean {
		return this.spacingDragActive;
	}

	// ─── Private Methods ─────────────────────────────────────────────────────

	private updateUI(): void {
		this.updateLetterSpacingDisplay();
		this.updateWordSpacingDisplay();
		this.updateLineHeightDisplay();

		if (this.letterSpacingSlider) {
			this.letterSpacingSlider.value = String(this.state.letterSpacing);
		}
		if (this.wordSpacingSlider) {
			this.wordSpacingSlider.value = String(this.state.wordSpacing);
		}
		if (this.lineHeightSlider) {
			this.lineHeightSlider.value = String(Math.round(this.state.lineHeight * 10));
		}
	}

	private updateLetterSpacingDisplay(): void {
		if (this.letterSpacingValue) {
			this.letterSpacingValue.textContent = String(this.state.letterSpacing);
		}
	}

	private updateWordSpacingDisplay(): void {
		if (this.wordSpacingValue) {
			this.wordSpacingValue.textContent = String(this.state.wordSpacing);
		}
	}

	private updateLineHeightDisplay(): void {
		if (this.lineHeightValue) {
			this.lineHeightValue.textContent = this.state.lineHeight.toFixed(1);
		}
	}

	override dispose(): void {
		// Clear drag state
		this.spacingDragActive = false;
		super.dispose();
	}
}
