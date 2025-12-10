import { FONT_COLOR_PICKER_STYLES } from "./font-color-picker.css";

type GradientPreset = {
	type: "linear";
	angle: number;
	stops: Array<{ offset: number; color: string }>;
};

const GRADIENT_PRESETS: Array<{ name: string; gradients: GradientPreset[] }> = [
	{
		name: "Cool Tones",
		gradients: [
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#8B5CF6" },
					{ offset: 1, color: "#06B6D4" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#3B82F6" },
					{ offset: 1, color: "#8B5CF6" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#06B6D4" },
					{ offset: 1, color: "#3B82F6" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#3B82F6" },
					{ offset: 1, color: "#6366F1" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#06B6D4" },
					{ offset: 1, color: "#14B8A6" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#0EA5E9" },
					{ offset: 1, color: "#38BDF8" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#8B5CF6" },
					{ offset: 0.5, color: "#3B82F6" },
					{ offset: 1, color: "#06B6D4" }
				]
			}
		]
	},
	{
		name: "Warm Tones",
		gradients: [
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#EF4444" },
					{ offset: 1, color: "#F97316" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#F97316" },
					{ offset: 1, color: "#EAB308" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#EC4899" },
					{ offset: 1, color: "#F43F5E" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#EF4444" },
					{ offset: 1, color: "#EC4899" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#F97316" },
					{ offset: 1, color: "#F59E0B" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#EC4899" },
					{ offset: 1, color: "#F97316" }
				]
			},
			{
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#8B5CF6" },
					{ offset: 0.5, color: "#EC4899" },
					{ offset: 1, color: "#EAB308" }
				]
			}
		]
	},
	{
		name: "Monochromatic",
		gradients: [
			// Neutrals row
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#878274" },
					{ offset: 1, color: "#24221a" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#dfdcda" },
					{ offset: 1, color: "#858176" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#fffcf5" },
					{ offset: 1, color: "#d8d5ca" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#feffff" },
					{ offset: 1, color: "#c5c5c5" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#e9f0f3" },
					{ offset: 1, color: "#a2a5ac" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#a5acb9" },
					{ offset: 1, color: "#303643" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#6d7486" },
					{ offset: 1, color: "#0a0d13" }
				]
			},
			// Dark to light colors row
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#731919" },
					{ offset: 1, color: "#e52b2b" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#963e15" },
					{ offset: 1, color: "#f4773e" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#997300" },
					{ offset: 1, color: "#ffc000" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#226214" },
					{ offset: 1, color: "#43cc25" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#004d48" },
					{ offset: 1, color: "#3ff3e7" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#001f65" },
					{ offset: 1, color: "#6895fd" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#450050" },
					{ offset: 1, color: "#e753fe" }
				]
			},
			// Pastels row
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#ff6767" },
					{ offset: 1, color: "#ffd1d1" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#ff9869" },
					{ offset: 1, color: "#ffd2bd" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#ffda6a" },
					{ offset: 1, color: "#fff7de" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#7cce6b" },
					{ offset: 1, color: "#d8ffd0" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#7af6ee" },
					{ offset: 1, color: "#eafffe" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#84a9ff" },
					{ offset: 1, color: "#f5f8ff" }
				]
			},
			{
				type: "linear",
				angle: 180,
				stops: [
					{ offset: 0, color: "#f093ff" },
					{ offset: 1, color: "#fdf1ff" }
				]
			}
		]
	}
];

type ColorMode = "color" | "gradient";
type FontColorChangeCallback = (updates: {
	color?: string;
	opacity?: number;
	background?: string;
	gradient?: { type: "linear" | "radial"; angle: number; stops: Array<{ offset: number; color: string }> };
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
				${this.buildGradientHTML()}
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
		this.colorOpacitySlider?.addEventListener("input", e => this.handleColorOpacityChange(e));

		this.highlightColorInput?.addEventListener("input", () => this.handleHighlightChange());

		// Setup gradient swatch click handlers
		this.container.querySelectorAll("[data-cat]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLButtonElement;
				this.handleGradientClick(parseInt(el.dataset["cat"] || "0"), parseInt(el.dataset["idx"] || "0"));
			});
		});
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

	private buildCSSGradient(gradient: GradientPreset): string {
		const stops = gradient.stops.map(s => `${s.color} ${Math.round(s.offset * 100)}%`).join(", ");
		return `linear-gradient(${gradient.angle}deg, ${stops})`;
	}

	private buildGradientHTML(): string {
		let html = "";
		GRADIENT_PRESETS.forEach((category, catIdx) => {
			html += `<div class="ss-gradient-category">
				<div class="ss-gradient-category-name">${category.name}</div>
				<div class="ss-gradient-swatches">`;
			category.gradients.forEach((g, idx) => {
				html += `<button class="ss-gradient-swatch" data-cat="${catIdx}" data-idx="${idx}" style="background:${this.buildCSSGradient(g)}"></button>`;
			});
			html += `</div></div>`;
		});
		return html;
	}

	private handleGradientClick(catIdx: number, idx: number): void {
		const gradient = GRADIENT_PRESETS[catIdx]?.gradients[idx];
		if (gradient && this.onColorChange) {
			this.onColorChange({ gradient: { type: gradient.type, angle: gradient.angle, stops: gradient.stops } });
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
