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
	private valueDisplay: HTMLSpanElement | null = null;
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
				<span class="ss-toolbar-popup-value">${this.formatValue(value)}</span>
			</div>
		`;
	}

	protected bindElements(): void {
		this.slider = this.container?.querySelector("input") ?? null;
		this.valueDisplay = this.container?.querySelector(".ss-toolbar-popup-value") ?? null;
	}

	protected setupEvents(): void {
		this.events.on(this.slider, "input", () => {
			const value = this.getValue();
			this.updateDisplay(value);
			this.emit(value);
		});
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
		if (this.valueDisplay) {
			this.valueDisplay.textContent = this.formatValue(value);
		}
	}

	/**
	 * Enable or disable the slider.
	 */
	setEnabled(enabled: boolean): void {
		if (this.slider) {
			this.slider.disabled = !enabled;
		}
	}
}
