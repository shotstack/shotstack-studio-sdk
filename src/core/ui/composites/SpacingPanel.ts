import { UIComponent } from "../primitives/UIComponent";

/**
 * State for spacing configuration.
 */
export interface SpacingState {
	letterSpacing: number;
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
		lineHeight: 1.2
	};

	// DOM references
	private letterSpacingSlider: HTMLInputElement | null = null;
	private letterSpacingValue: HTMLSpanElement | null = null;
	private lineHeightSlider: HTMLInputElement | null = null;
	private lineHeightValue: HTMLSpanElement | null = null;

	constructor(panelConfig: SpacingPanelConfig = {}) {
		super(); // No wrapper class - mounted inside existing popup
		this.panelConfig = {
			showLetterSpacing: panelConfig.showLetterSpacing ?? true,
			letterSpacingMin: panelConfig.letterSpacingMin ?? -50,
			letterSpacingMax: panelConfig.letterSpacingMax ?? 100,
			lineHeightMin: panelConfig.lineHeightMin ?? 5,
			lineHeightMax: panelConfig.lineHeightMax ?? 30
		};
	}

	render(): string {
		const { showLetterSpacing, letterSpacingMin, letterSpacingMax, lineHeightMin, lineHeightMax } = this.panelConfig;

		const letterSpacingHtml = showLetterSpacing
			? `
			<div class="ss-toolbar-popup-label">Letter spacing</div>
			<div class="ss-toolbar-popup-row">
				<input type="range" class="ss-toolbar-slider" data-letter-spacing-slider
					min="${letterSpacingMin}" max="${letterSpacingMax}" value="0" />
				<span class="ss-toolbar-popup-value" data-letter-spacing-value>0</span>
			</div>
		`
			: "";

		return `
			${letterSpacingHtml}
			<div class="ss-toolbar-popup-label">Line spacing</div>
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
		this.lineHeightSlider = this.container?.querySelector("[data-line-height-slider]") ?? null;
		this.lineHeightValue = this.container?.querySelector("[data-line-height-value]") ?? null;
	}

	protected setupEvents(): void {
		// Letter spacing
		if (this.letterSpacingSlider) {
			this.events.on(this.letterSpacingSlider, "input", () => {
				const value = parseInt(this.letterSpacingSlider!.value, 10);
				this.state.letterSpacing = value;
				this.updateLetterSpacingDisplay();
				this.emit(this.state);
			});
		}

		// Line height
		if (this.lineHeightSlider) {
			this.events.on(this.lineHeightSlider, "input", () => {
				const rawValue = parseInt(this.lineHeightSlider!.value, 10);
				const lineHeight = rawValue / 10;
				this.state.lineHeight = lineHeight;
				this.updateLineHeightDisplay();
				this.emit(this.state);
			});
		}
	}

	/**
	 * Set spacing values from clip data.
	 */
	setState(letterSpacing: number, lineHeight: number): void {
		this.state.letterSpacing = letterSpacing;
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

	// ─── Private Methods ─────────────────────────────────────────────────────

	private updateUI(): void {
		this.updateLetterSpacingDisplay();
		this.updateLineHeightDisplay();

		if (this.letterSpacingSlider) {
			this.letterSpacingSlider.value = String(this.state.letterSpacing);
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

	private updateLineHeightDisplay(): void {
		if (this.lineHeightValue) {
			this.lineHeightValue.textContent = this.state.lineHeight.toFixed(1);
		}
	}
}
