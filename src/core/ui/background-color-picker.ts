import { createThrottle } from "@core/shared/utils";
import { injectShotstackStyles } from "@styles/inject";

type ColorChangeCallback = (color: string, opacity: number) => void;

export class BackgroundColorPicker {
	private container: HTMLDivElement | null = null;
	private colorInput: HTMLInputElement | null = null;
	private opacitySlider: HTMLInputElement | null = null;
	private opacityValue: HTMLSpanElement | null = null;

	private onColorChange: ColorChangeCallback | null = null;

	// Throttle instance for rate-limiting slider updates (~20 updates/sec max)
	private colorThrottle = createThrottle(() => this.emitColorChange(), 50);

	// Arrow function handlers for proper cleanup
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
			<div class="ss-color-picker-color-section">
				<div class="ss-color-picker-label">Color</div>
				<div class="ss-color-picker-color-wrap">
					<input type="color" class="ss-color-picker-color" value="#FFFFFF" />
				</div>
			</div>
			<div class="ss-color-picker-opacity-section">
				<div class="ss-color-picker-label">Opacity</div>
				<div class="ss-color-picker-opacity-row">
					<input type="range" class="ss-color-picker-opacity" min="0" max="100" value="100" />
					<span class="ss-color-picker-opacity-value">100%</span>
				</div>
			</div>
		`;

		parent.appendChild(this.container);

		this.colorInput = this.container.querySelector(".ss-color-picker-color");
		this.opacitySlider = this.container.querySelector(".ss-color-picker-opacity");
		this.opacityValue = this.container.querySelector(".ss-color-picker-opacity-value");

		this.colorInput?.addEventListener("input", this.handleColorChange);
		this.opacitySlider?.addEventListener("input", this.handleOpacityInput);
		this.opacitySlider?.addEventListener("change", this.handleOpacityChange);
	}

	private emitColorChange(): void {
		if (this.onColorChange && this.colorInput && this.opacitySlider) {
			const color = this.colorInput.value;
			const opacity = parseInt(this.opacitySlider.value, 10) / 100;
			this.onColorChange(color, opacity);
		}
	}

	// Public API
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

		this.colorInput?.removeEventListener("input", this.handleColorChange);
		this.opacitySlider?.removeEventListener("input", this.handleOpacityInput);
		this.opacitySlider?.removeEventListener("change", this.handleOpacityChange);
		this.container?.remove();
		this.container = null;
		this.colorInput = null;
		this.opacitySlider = null;
		this.opacityValue = null;
		this.onColorChange = null;
	}
}
