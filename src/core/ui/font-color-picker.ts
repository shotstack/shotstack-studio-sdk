import { FONT_COLOR_PICKER_STYLES } from "./font-color-picker.css";

type ColorMode = "color" | "gradient";
type FontColorChangeCallback = (updates: {
	color?: string;
	opacity?: number;
	background?: string;
	backgroundOpacity?: number;
}) => void;

export class FontColorPicker {
	private container: HTMLDivElement | null = null;
	private currentMode: ColorMode = "color";
	private styleElement: HTMLStyleElement | null = null;

	// Tab buttons
	private colorTab: HTMLButtonElement | null = null;
	private gradientTab: HTMLButtonElement | null = null;

	// Tab content containers
	private colorContent: HTMLDivElement | null = null;
	private gradientContent: HTMLDivElement | null = null;

	// Color tab elements
	private colorInput: HTMLInputElement | null = null;
	private colorOpacitySlider: HTMLInputElement | null = null;
	private colorOpacityValue: HTMLSpanElement | null = null;

	// Highlight elements (in color tab)
	private highlightColorInput: HTMLInputElement | null = null;

	private onColorChange: FontColorChangeCallback | null = null;

	constructor() {
		this.injectStyles();
	}

	private injectStyles(): void {
		if (document.getElementById("ss-font-color-picker-styles")) return;

		this.styleElement = document.createElement("style");
		this.styleElement.id = "ss-font-color-picker-styles";
		this.styleElement.textContent = FONT_COLOR_PICKER_STYLES;
		document.head.appendChild(this.styleElement);
	}

	mount(parent: HTMLElement): void {
		this.container = document.createElement("div");
		this.container.className = "ss-font-color-picker";

		this.container.innerHTML = `
			<div class="ss-font-color-tabs">
				<button class="ss-font-color-tab active" data-tab="color">Color</button>
				<button class="ss-font-color-tab" data-tab="gradient">Gradient</button>
			</div>

			<div class="ss-font-color-tab-content active" data-content="color">
				<div class="ss-font-color-section">
					<div class="ss-font-color-label">Color</div>
					<input type="color" class="ss-font-color-input" data-color-input value="#000000" />
				</div>
				<div class="ss-font-color-section">
					<div class="ss-font-color-label">Opacity</div>
					<div class="ss-font-color-opacity-row">
						<input type="range" class="ss-font-color-opacity" data-color-opacity min="0" max="100" value="100" />
						<span class="ss-font-color-opacity-value" data-color-opacity-value>100%</span>
					</div>
				</div>
				<div class="ss-font-color-section">
					<div class="ss-font-color-label">Highlight</div>
					<input type="color" class="ss-font-color-input" data-highlight-color value="#FFFF00" />
				</div>
			</div>

			<div class="ss-font-color-tab-content" data-content="gradient">
				<div class="ss-font-color-section">
					<div class="ss-font-color-label">Coming soon...</div>
				</div>
			</div>
		`;

		parent.appendChild(this.container);

		// Query tab buttons
		this.colorTab = this.container.querySelector('[data-tab="color"]');
		this.gradientTab = this.container.querySelector('[data-tab="gradient"]');

		// Query tab content
		this.colorContent = this.container.querySelector('[data-content="color"]');
		this.gradientContent = this.container.querySelector('[data-content="gradient"]');

		// Query color elements
		this.colorInput = this.container.querySelector("[data-color-input]");
		this.colorOpacitySlider = this.container.querySelector("[data-color-opacity]");
		this.colorOpacityValue = this.container.querySelector("[data-color-opacity-value]");

		// Query highlight elements
		this.highlightColorInput = this.container.querySelector("[data-highlight-color]");

		// Setup event listeners
		this.colorTab?.addEventListener("click", () => this.setMode("color"));
		this.gradientTab?.addEventListener("click", () => this.setMode("gradient"));

		this.colorInput?.addEventListener("input", () => this.handleColorChange());
		this.colorOpacitySlider?.addEventListener("input", (e) => this.handleColorOpacityChange(e));

		this.highlightColorInput?.addEventListener("input", () => this.handleHighlightChange());
	}

	private handleColorChange(): void {
		this.emitColorChange();
	}

	private handleColorOpacityChange(e: Event): void {
		const opacity = parseInt((e.target as HTMLInputElement).value, 10);
		if (this.colorOpacityValue) {
			this.colorOpacityValue.textContent = `${opacity}%`;
		}
		this.emitColorChange();
	}

	private handleHighlightChange(): void {
		this.emitHighlightChange();
	}

	private emitColorChange(): void {
		if (this.onColorChange && this.colorInput && this.colorOpacitySlider) {
			const color = this.colorInput.value;
			const opacity = parseInt(this.colorOpacitySlider.value, 10) / 100;
			this.onColorChange({ color, opacity });
		}
	}

	private emitHighlightChange(): void {
		if (this.onColorChange && this.highlightColorInput) {
			const background = this.highlightColorInput.value;
			this.onColorChange({ background });
		}
	}

	setMode(mode: ColorMode): void {
		this.currentMode = mode;

		// Update tab buttons
		if (mode === "color") {
			this.colorTab?.classList.add("active");
			this.gradientTab?.classList.remove("active");
			this.colorContent?.classList.add("active");
			this.gradientContent?.classList.remove("active");
		} else {
			this.colorTab?.classList.remove("active");
			this.gradientTab?.classList.add("active");
			this.colorContent?.classList.remove("active");
			this.gradientContent?.classList.add("active");
		}
	}

	setColor(color: string, opacity: number): void {
		if (this.colorInput) {
			this.colorInput.value = color.toUpperCase();
		}
		const opacityPercent = Math.round(Math.max(0, Math.min(100, opacity * 100)));
		if (this.colorOpacitySlider) {
			this.colorOpacitySlider.value = String(opacityPercent);
		}
		if (this.colorOpacityValue) {
			this.colorOpacityValue.textContent = `${opacityPercent}%`;
		}
	}

	setHighlight(color: string): void {
		if (this.highlightColorInput) {
			this.highlightColorInput.value = color.toUpperCase();
		}
	}

	onChange(callback: FontColorChangeCallback): void {
		this.onColorChange = callback;
	}

	dispose(): void {
		this.container?.remove();
		this.container = null;
		this.colorTab = null;
		this.gradientTab = null;
		this.colorContent = null;
		this.gradientContent = null;
		this.colorInput = null;
		this.colorOpacitySlider = null;
		this.colorOpacityValue = null;
		this.highlightColorInput = null;

		this.styleElement?.remove();
		this.styleElement = null;

		this.onColorChange = null;
	}
}
