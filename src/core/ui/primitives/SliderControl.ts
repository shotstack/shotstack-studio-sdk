import type { SliderConfig } from "./types";
import { UIComponent } from "./UIComponent";

/**
 * A slider input with label and value display.
 *
 * Automatically handles value formatting and emits changes.
 *
 * @example
 * ```typescript
 * const opacity = new SliderControl({
 *   label: "Opacity",
 *   min: 0,
 *   max: 100,
 *   initialValue: 100,
 *   formatValue: v => `${v}%`
 * });
 * opacity.onChange(value => this.updateOpacity(value / 100));
 * opacity.mount(container);
 * ```
 */
export class SliderControl extends UIComponent<number> {
	private slider: HTMLInputElement | null = null;
	private valueInput: HTMLInputElement | null = null;
	private formatValue: (value: number) => string;

	constructor(private sliderConfig: SliderConfig) {
		super({ className: sliderConfig.className ?? "ss-toolbar-popup-section" });
		this.formatValue = sliderConfig.formatValue ?? String;
	}

	render(): string {
		const { label, min, max, step = 1, initialValue } = this.sliderConfig;
		const value = initialValue ?? min;
		return `
			<div class="ss-toolbar-popup-label">${label}</div>
			<div class="ss-toolbar-popup-row">
				<input type="range" class="ss-toolbar-slider"
					min="${min}" max="${max}" step="${step}" value="${value}" />
				<input type="text" class="ss-toolbar-popup-value" value="${this.formatValue(value)}" />
			</div>
		`;
	}

	protected bindElements(): void {
		this.slider = this.container?.querySelector('input[type="range"]') ?? null;
		this.valueInput = this.container?.querySelector(".ss-toolbar-popup-value") ?? null;
	}

	protected setupEvents(): void {
		// Slider drag updates the display and emits
		this.events.on(this.slider, "input", () => {
			const value = this.getValue();
			this.updateDisplay(value);
			this.emit(value);
		});

		// Value input: commit on blur or Enter, revert on Escape
		this.events.on(this.valueInput, "blur", () => this.commitInputValue());
		this.events.on(this.valueInput, "keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.commitInputValue();
				this.valueInput?.blur();
			} else if (e.key === "Escape") {
				e.preventDefault();
				this.revertInputValue();
				this.valueInput?.blur();
			}
		});

		// Select all text on focus for easy replacement
		this.events.on(this.valueInput, "focus", () => {
			this.valueInput?.select();
		});
	}

	/**
	 * Parse and commit the value from the text input.
	 */
	private commitInputValue(): void {
		if (!this.valueInput) return;

		const { min, max } = this.sliderConfig;
		const parsed = this.parseInputValue(this.valueInput.value, min, max);
		this.slider!.value = String(parsed);
		this.updateDisplay(parsed);
		this.emit(parsed);
	}

	/**
	 * Revert the text input to match the current slider value.
	 */
	private revertInputValue(): void {
		this.updateDisplay(this.getValue());
	}

	/**
	 * Parse user input, strip non-numeric chars, clamp to range.
	 */
	private parseInputValue(input: string, min: number, max: number): number {
		const stripped = input.replace(/[^0-9.-]/g, "");
		const num = parseFloat(stripped);
		if (Number.isNaN(num)) return this.getValue(); // Keep current if invalid
		return Math.max(min, Math.min(max, num));
	}

	/**
	 * Get the current slider value.
	 */
	getValue(): number {
		return parseFloat(this.slider?.value ?? String(this.sliderConfig.min));
	}

	/**
	 * Set the slider value programmatically.
	 */
	setValue(value: number): void {
		if (this.slider) {
			this.slider.value = String(value);
		}
		this.updateDisplay(value);
	}

	/**
	 * Update the displayed value text.
	 */
	private updateDisplay(value: number): void {
		if (this.valueInput) {
			this.valueInput.value = this.formatValue(value);
		}
	}

	/**
	 * Enable or disable the slider and input.
	 */
	setEnabled(enabled: boolean): void {
		if (this.slider) {
			this.slider.disabled = !enabled;
		}
		if (this.valueInput) {
			this.valueInput.disabled = !enabled;
		}
	}
}
