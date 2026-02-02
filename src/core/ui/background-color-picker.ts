import { createThrottle } from "@core/shared/utils";
import { injectShotstackStyles } from "@styles/inject";

type ColorChangeCallback = (enabled: boolean, color: string, opacity: number) => void;

export class BackgroundColorPicker {
	private container: HTMLDivElement | null = null;
	private enableCheckbox: HTMLInputElement | null = null;
	private colorInput: HTMLInputElement | null = null;
	private opacitySlider: HTMLInputElement | null = null;
	private opacityValue: HTMLSpanElement | null = null;

	private enabled: boolean = false; // Default to disabled (no background)
	private onColorChange: ColorChangeCallback | null = null;

	// Throttle instance for rate-limiting slider updates (~20 updates/sec max)
	private colorThrottle = createThrottle(() => this.emitColorChange(), 50);

	// Arrow function handlers for proper cleanup
	private handleEnableChange = (): void => {
		this.enabled = this.enableCheckbox?.checked ?? false;
		this.updateControlsState();
		this.emitColorChange();
	};

	private handleColorChange = (): void => {
		this.colorThrottle.call();
	};

	private handleOpacityInput = (e: Event): void => {
		const opacity = parseInt((e.target as HTMLInputElement).value, 10);
		if (this.opacityValue) {
			this.opacityValue.textContent = `${opacity}%`;
		}
		this.colorThrottle.call();
	};

	// Flush throttle on slider release (change event) to ensure final value is applied
	private handleOpacityChange = (): void => {
		this.colorThrottle.flush();
	};

	constructor() {
		injectShotstackStyles();
	}

	mount(parent: HTMLElement): void {
		this.container = document.createElement("div");
		this.container.className = "ss-color-picker";

		this.container.innerHTML = `
			<div class="ss-color-picker-header">Background Fill</div>
			<div class="ss-color-picker-enable-row">
				<label class="ss-color-picker-enable-label">
					<input type="checkbox" class="ss-color-picker-enable-checkbox" ${this.enabled ? "checked" : ""} />
					<span>Enable Background</span>
				</label>
			</div>
			<div class="ss-color-picker-controls ${this.enabled ? "" : "disabled"}">
				<div class="ss-color-picker-color-section">
					<div class="ss-color-picker-label">Color</div>
					<div class="ss-color-picker-color-wrap">
						<input type="color" class="ss-color-picker-color" value="#FFFFFF" ${this.enabled ? "" : "disabled"} />
					</div>
				</div>
				<div class="ss-color-picker-opacity-section">
					<div class="ss-color-picker-label">Opacity</div>
					<div class="ss-color-picker-opacity-row">
						<input type="range" class="ss-color-picker-opacity" min="0" max="100" value="100" ${this.enabled ? "" : "disabled"} />
						<span class="ss-color-picker-opacity-value">100%</span>
					</div>
				</div>
			</div>
		`;

		parent.appendChild(this.container);

		this.enableCheckbox = this.container.querySelector(".ss-color-picker-enable-checkbox");
		this.colorInput = this.container.querySelector(".ss-color-picker-color");
		this.opacitySlider = this.container.querySelector(".ss-color-picker-opacity");
		this.opacityValue = this.container.querySelector(".ss-color-picker-opacity-value");

		this.enableCheckbox?.addEventListener("change", this.handleEnableChange);
		this.colorInput?.addEventListener("input", this.handleColorChange);
		this.opacitySlider?.addEventListener("input", this.handleOpacityInput);
		this.opacitySlider?.addEventListener("change", this.handleOpacityChange);
	}

	private emitColorChange(): void {
		if (this.onColorChange && this.colorInput && this.opacitySlider) {
			const color = this.colorInput.value;
			const opacity = parseInt(this.opacitySlider.value, 10) / 100;
			this.onColorChange(this.enabled, color, opacity);
		}
	}

	private updateControlsState(): void {
		const controls = this.container?.querySelector(".ss-color-picker-controls");
		if (controls) {
			controls.classList.toggle("disabled", !this.enabled);
		}

		if (this.colorInput) this.colorInput.disabled = !this.enabled;
		if (this.opacitySlider) this.opacitySlider.disabled = !this.enabled;
	}

	// Public API
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (this.enableCheckbox) {
			this.enableCheckbox.checked = enabled;
		}
		this.updateControlsState();
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setColor(hex: string): void {
		if (this.colorInput) {
			this.colorInput.value = hex.toUpperCase();
		}
	}

	setOpacity(opacity: number): void {
		const opacityPercent = Math.round(Math.max(0, Math.min(100, opacity)));
		if (this.opacitySlider) {
			this.opacitySlider.value = String(opacityPercent);
		}
		if (this.opacityValue) {
			this.opacityValue.textContent = `${opacityPercent}%`;
		}
	}

	onChange(callback: ColorChangeCallback): void {
		this.onColorChange = callback;
	}

	dispose(): void {
		// Cancel throttle to prevent any pending callbacks after disposal
		this.colorThrottle.cancel();

		this.enableCheckbox?.removeEventListener("change", this.handleEnableChange);
		this.colorInput?.removeEventListener("input", this.handleColorChange);
		this.opacitySlider?.removeEventListener("input", this.handleOpacityInput);
		this.opacitySlider?.removeEventListener("change", this.handleOpacityChange);
		this.container?.remove();
		this.container = null;
		this.enableCheckbox = null;
		this.colorInput = null;
		this.opacitySlider = null;
		this.opacityValue = null;
		this.onColorChange = null;
	}
}
