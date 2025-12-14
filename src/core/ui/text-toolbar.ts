import type { TextAsset } from "@schemas/text-asset";

import { BaseToolbar, BUILT_IN_FONTS, FONT_SIZES, TOOLBAR_ICONS } from "./base-toolbar";
import { TEXT_TOOLBAR_STYLES } from "./text-toolbar.css";

export class TextToolbar extends BaseToolbar {
	// Text edit
	private textEditBtn: HTMLButtonElement | null = null;
	private textEditPopup: HTMLDivElement | null = null;
	private textEditArea: HTMLTextAreaElement | null = null;
	private textEditDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Font size
	private sizeInput: HTMLInputElement | null = null;
	private sizePopup: HTMLDivElement | null = null;

	// Font family
	private fontBtn: HTMLButtonElement | null = null;
	private fontPopup: HTMLDivElement | null = null;
	private fontPreview: HTMLSpanElement | null = null;

	// Bold
	private boldBtn: HTMLButtonElement | null = null;

	// Font color
	private fontColorBtn: HTMLButtonElement | null = null;
	private fontColorPopup: HTMLDivElement | null = null;
	private fontColorInput: HTMLInputElement | null = null;
	private colorDisplay: HTMLButtonElement | null = null;

	// Spacing (line height + vertical anchor)
	private spacingBtn: HTMLButtonElement | null = null;
	private spacingPopup: HTMLDivElement | null = null;
	private lineHeightSlider: HTMLInputElement | null = null;
	private lineHeightValue: HTMLSpanElement | null = null;
	private anchorTopBtn: HTMLButtonElement | null = null;
	private anchorMiddleBtn: HTMLButtonElement | null = null;
	private anchorBottomBtn: HTMLButtonElement | null = null;

	// Horizontal alignment
	private alignBtn: HTMLButtonElement | null = null;
	private alignIcon: SVGElement | null = null;

	// Background
	private backgroundBtn: HTMLButtonElement | null = null;
	private backgroundPopup: HTMLDivElement | null = null;
	private bgColorInput: HTMLInputElement | null = null;
	private bgOpacitySlider: HTMLInputElement | null = null;
	private bgOpacityValue: HTMLSpanElement | null = null;

	// Stroke
	private strokeBtn: HTMLButtonElement | null = null;
	private strokePopup: HTMLDivElement | null = null;
	private strokeWidthSlider: HTMLInputElement | null = null;
	private strokeWidthValue: HTMLSpanElement | null = null;
	private strokeColorInput: HTMLInputElement | null = null;

	// Transition state
	private activeTransitionTab: "in" | "out" = "in";
	private transitionInEffect: string = "";
	private transitionInDirection: string = "";
	private transitionInSpeed: number = 1.0;
	private transitionOutEffect: string = "";
	private transitionOutDirection: string = "";
	private transitionOutSpeed: number = 1.0;
	private readonly SPEED_VALUES = [0.25, 0.5, 1.0, 2.0];

	// Transition elements
	private transitionBtn: HTMLButtonElement | null = null;
	private transitionPopup: HTMLDivElement | null = null;
	private directionRow: HTMLDivElement | null = null;
	private speedValueLabel: HTMLSpanElement | null = null;

	// Effect state
	private effectType: "" | "zoom" | "slide" = "";
	private effectVariant: "In" | "Out" = "In";
	private effectDirection: "Left" | "Right" | "Up" | "Down" = "Right";
	private effectSpeed: number = 1.0;
	private readonly EFFECT_SPEED_VALUES = [0.5, 1.0, 2.0];

	// Effect elements
	private effectBtn: HTMLButtonElement | null = null;
	private effectPopup: HTMLDivElement | null = null;
	private effectVariantRow: HTMLDivElement | null = null;
	private effectDirectionRow: HTMLDivElement | null = null;
	private effectSpeedRow: HTMLDivElement | null = null;
	private effectSpeedValueLabel: HTMLSpanElement | null = null;

	override mount(parent: HTMLElement): void {
		this.injectStyles("ss-text-toolbar-styles", TEXT_TOOLBAR_STYLES);

		this.container = document.createElement("div");
		this.container.className = "ss-toolbar ss-text-toolbar";

		this.container.innerHTML = `
			<div class="ss-toolbar-dropdown">
				<button data-action="text-edit-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Edit text">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						${TOOLBAR_ICONS.edit}
					</svg>
					<span>Text</span>
				</button>
				<div data-text-edit-popup class="ss-toolbar-popup ss-toolbar-popup--text-edit">
					<div class="ss-toolbar-popup-header">Edit Text</div>
					<div class="ss-toolbar-text-area-wrapper">
						<textarea data-text-edit-area class="ss-toolbar-text-area" rows="4" placeholder="Enter text..."></textarea>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-group ss-toolbar-group--bordered">
				<button data-action="size-down" class="ss-toolbar-btn" title="Decrease font size">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						${TOOLBAR_ICONS.sizeDown}
					</svg>
				</button>
				<div class="ss-toolbar-dropdown ss-toolbar-dropdown--size">
					<input type="text" data-size-input class="ss-toolbar-size-input" value="32" />
					<div data-size-popup class="ss-toolbar-popup ss-toolbar-popup--size"></div>
				</div>
				<button data-action="size-up" class="ss-toolbar-btn" title="Increase font size">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						${TOOLBAR_ICONS.sizeUp}
					</svg>
				</button>
			</div>

			<button data-action="bold" class="ss-toolbar-btn ss-toolbar-btn--text" title="Bold">B</button>

			<div class="ss-toolbar-dropdown">
				<button data-action="font-toggle" class="ss-toolbar-btn ss-toolbar-btn--font" title="Font">
					<span data-font-preview class="ss-toolbar-font-preview">Aa</span>
					<svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" class="ss-toolbar-chevron">
						${TOOLBAR_ICONS.chevron}
					</svg>
				</button>
				<div data-font-popup class="ss-toolbar-popup ss-toolbar-popup--font"></div>
			</div>

			<div class="ss-toolbar-color-wrap">
				<button data-action="font-color-toggle" class="ss-toolbar-color-btn" title="Font color" data-color-display></button>
				<div data-font-color-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-header">Font Color</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color</div>
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-font-color class="ss-toolbar-color" value="#FFFFFF" />
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="spacing-toggle" class="ss-toolbar-btn" title="Spacing">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						${TOOLBAR_ICONS.spacing}
					</svg>
				</button>
				<div data-spacing-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Line spacing</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-line-height-slider class="ss-toolbar-slider" min="5" max="30" value="12" />
							<span data-line-height-value class="ss-toolbar-popup-value">1.2</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-divider"></div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Anchor text box</div>
						<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
							<button data-action="anchor-top" class="ss-toolbar-anchor-btn" title="Top">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									${TOOLBAR_ICONS.anchorTop}
								</svg>
							</button>
							<button data-action="anchor-middle" class="ss-toolbar-anchor-btn" title="Middle">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									${TOOLBAR_ICONS.anchorMiddle}
								</svg>
							</button>
							<button data-action="anchor-bottom" class="ss-toolbar-anchor-btn" title="Bottom">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									${TOOLBAR_ICONS.anchorBottom}
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-divider"></div>

			<button data-action="align-cycle" class="ss-toolbar-btn" title="Text alignment">
				<svg data-align-icon width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					${TOOLBAR_ICONS.alignCenter}
				</svg>
			</button>

			<div class="ss-toolbar-dropdown">
				<button data-action="background-toggle" class="ss-toolbar-btn" title="Background Fill">
					<svg width="16" height="16" viewBox="0 0 491.879 491.879" fill="currentColor">
						${TOOLBAR_ICONS.background}
					</svg>
				</button>
				<div data-background-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-header">Background</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color</div>
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-bg-color class="ss-toolbar-color" value="#000000" />
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Opacity</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-bg-opacity class="ss-toolbar-slider" min="0" max="100" value="100" />
							<span data-bg-opacity-value class="ss-toolbar-popup-value">100</span>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="stroke-toggle" class="ss-toolbar-btn" title="Stroke">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						${TOOLBAR_ICONS.stroke}
					</svg>
				</button>
				<div data-stroke-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-header">Text Stroke</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Width</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-stroke-width class="ss-toolbar-slider" min="0" max="20" value="0" />
							<span data-stroke-width-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color</div>
						<div class="ss-toolbar-color-wrap">
							<input type="color" data-stroke-color class="ss-toolbar-color" value="#000000" />
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-divider"></div>

			<div class="ss-toolbar-dropdown">
				<button data-action="transition-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Transition">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						${TOOLBAR_ICONS.transition}
					</svg>
					<span>Transition</span>
				</button>
				<div data-transition-popup class="ss-toolbar-popup ss-toolbar-popup--transition">
					<div class="ss-transition-tabs">
						<button class="ss-transition-tab active" data-tab="in">In</button>
						<button class="ss-transition-tab" data-tab="out">Out</button>
					</div>
					<div class="ss-transition-effects">
						<button class="ss-transition-effect" data-effect="">None</button>
						<button class="ss-transition-effect" data-effect="fade">Fade</button>
						<button class="ss-transition-effect" data-effect="zoom">Zoom</button>
						<button class="ss-transition-effect" data-effect="slide">Slide</button>
						<button class="ss-transition-effect" data-effect="wipe">Wipe</button>
						<button class="ss-transition-effect" data-effect="carousel">Car</button>
					</div>
					<div class="ss-transition-direction-row" data-direction-row>
						<span class="ss-transition-label">Direction</span>
						<div class="ss-transition-directions">
							<button class="ss-transition-dir" data-dir="Left">←</button>
							<button class="ss-transition-dir" data-dir="Right">→</button>
							<button class="ss-transition-dir" data-dir="Up">↑</button>
							<button class="ss-transition-dir" data-dir="Down">↓</button>
						</div>
					</div>
					<div class="ss-transition-speed-row">
						<span class="ss-transition-label">Speed</span>
						<div class="ss-transition-speed-stepper">
							<button class="ss-transition-speed-btn" data-speed-decrease>−</button>
							<span class="ss-transition-speed-value" data-speed-value>1.00s</span>
							<button class="ss-transition-speed-btn" data-speed-increase>+</button>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="effect-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Effect">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						${TOOLBAR_ICONS.effect}
					</svg>
					<span>Effect</span>
				</button>
				<div data-effect-popup class="ss-toolbar-popup ss-toolbar-popup--effect">
					<div class="ss-effect-types">
						<button class="ss-effect-type" data-effect-type="">None</button>
						<button class="ss-effect-type" data-effect-type="zoom">Zoom</button>
						<button class="ss-effect-type" data-effect-type="slide">Slide</button>
					</div>
					<div class="ss-effect-variant-row" data-effect-variant-row>
						<span class="ss-effect-label">Variant</span>
						<div class="ss-effect-variants">
							<button class="ss-effect-variant" data-variant="In">In</button>
							<button class="ss-effect-variant" data-variant="Out">Out</button>
						</div>
					</div>
					<div class="ss-effect-direction-row" data-effect-direction-row>
						<span class="ss-effect-label">Direction</span>
						<div class="ss-effect-directions">
							<button class="ss-effect-dir" data-effect-dir="Left">←</button>
							<button class="ss-effect-dir" data-effect-dir="Right">→</button>
							<button class="ss-effect-dir" data-effect-dir="Up">↑</button>
							<button class="ss-effect-dir" data-effect-dir="Down">↓</button>
						</div>
					</div>
					<div class="ss-effect-speed-row" data-effect-speed-row>
						<span class="ss-effect-label">Speed</span>
						<div class="ss-effect-speed-stepper">
							<button class="ss-effect-speed-btn" data-effect-speed-decrease>−</button>
							<span class="ss-effect-speed-value" data-effect-speed-value>1s</span>
							<button class="ss-effect-speed-btn" data-effect-speed-increase>+</button>
						</div>
					</div>
				</div>
			</div>
		`;

		parent.insertBefore(this.container, parent.firstChild);

		this.bindElements();
		this.buildFontPopup();
		this.buildSizePopup();
		this.setupEventListeners();
	}

	private bindElements(): void {
		if (!this.container) return;

		// Text edit
		this.textEditBtn = this.container.querySelector("[data-action='text-edit-toggle']");
		this.textEditPopup = this.container.querySelector("[data-text-edit-popup]");
		this.textEditArea = this.container.querySelector("[data-text-edit-area]");

		// Font size
		this.sizeInput = this.container.querySelector("[data-size-input]");
		this.sizePopup = this.container.querySelector("[data-size-popup]");

		// Font family
		this.fontBtn = this.container.querySelector("[data-action='font-toggle']");
		this.fontPopup = this.container.querySelector("[data-font-popup]");
		this.fontPreview = this.container.querySelector("[data-font-preview]");

		// Bold
		this.boldBtn = this.container.querySelector("[data-action='bold']");

		// Font color
		this.fontColorBtn = this.container.querySelector("[data-action='font-color-toggle']");
		this.fontColorPopup = this.container.querySelector("[data-font-color-popup]");
		this.fontColorInput = this.container.querySelector("[data-font-color]");
		this.colorDisplay = this.container.querySelector("[data-color-display]");

		// Spacing
		this.spacingBtn = this.container.querySelector("[data-action='spacing-toggle']");
		this.spacingPopup = this.container.querySelector("[data-spacing-popup]");
		this.lineHeightSlider = this.container.querySelector("[data-line-height-slider]");
		this.lineHeightValue = this.container.querySelector("[data-line-height-value]");
		this.anchorTopBtn = this.container.querySelector("[data-action='anchor-top']");
		this.anchorMiddleBtn = this.container.querySelector("[data-action='anchor-middle']");
		this.anchorBottomBtn = this.container.querySelector("[data-action='anchor-bottom']");

		// Alignment
		this.alignBtn = this.container.querySelector("[data-action='align-cycle']");
		this.alignIcon = this.container.querySelector("[data-align-icon]");

		// Background
		this.backgroundBtn = this.container.querySelector("[data-action='background-toggle']");
		this.backgroundPopup = this.container.querySelector("[data-background-popup]");
		this.bgColorInput = this.container.querySelector("[data-bg-color]");
		this.bgOpacitySlider = this.container.querySelector("[data-bg-opacity]");
		this.bgOpacityValue = this.container.querySelector("[data-bg-opacity-value]");

		// Stroke
		this.strokeBtn = this.container.querySelector("[data-action='stroke-toggle']");
		this.strokePopup = this.container.querySelector("[data-stroke-popup]");
		this.strokeWidthSlider = this.container.querySelector("[data-stroke-width]");
		this.strokeWidthValue = this.container.querySelector("[data-stroke-width-value]");
		this.strokeColorInput = this.container.querySelector("[data-stroke-color]");

		// Transition
		this.transitionBtn = this.container.querySelector("[data-action='transition-toggle']");
		this.transitionPopup = this.container.querySelector("[data-transition-popup]");
		this.directionRow = this.container.querySelector("[data-direction-row]");
		this.speedValueLabel = this.container.querySelector("[data-speed-value]");

		// Effect
		this.effectBtn = this.container.querySelector("[data-action='effect-toggle']");
		this.effectPopup = this.container.querySelector("[data-effect-popup]");
		this.effectVariantRow = this.container.querySelector("[data-effect-variant-row]");
		this.effectDirectionRow = this.container.querySelector("[data-effect-direction-row]");
		this.effectSpeedRow = this.container.querySelector("[data-effect-speed-row]");
		this.effectSpeedValueLabel = this.container.querySelector("[data-effect-speed-value]");
	}

	private setupEventListeners(): void {
		this.container?.addEventListener("click", this.handleClick.bind(this));

		// Text edit
		this.textEditArea?.addEventListener("input", () => this.debouncedApplyTextEdit());

		// Size input
		this.sizeInput?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup(this.sizePopup);
		});
		this.sizeInput?.addEventListener("blur", () => this.applyManualSize());
		this.sizeInput?.addEventListener("keydown", e => {
			if (e.key === "Enter") {
				this.applyManualSize();
				this.sizeInput?.blur();
				this.closeAllPopups();
			}
		});

		// Font color
		this.fontColorInput?.addEventListener("input", () => this.handleFontColorChange());

		// Line height - use base class helper
		this.createSliderHandler(this.lineHeightSlider, this.lineHeightValue, value => {
			const lineHeight = value / 10;
			this.updateAssetProperty({ font: { ...this.getCurrentAsset()?.font, lineHeight } });
		}, value => (value / 10).toFixed(1));

		// Background color
		this.bgColorInput?.addEventListener("input", () => this.handleBackgroundChange());

		// Background opacity - use base class helper
		this.createSliderHandler(this.bgOpacitySlider, this.bgOpacityValue, () => {
			this.handleBackgroundChange();
		});

		// Stroke width - use base class helper
		this.createSliderHandler(this.strokeWidthSlider, this.strokeWidthValue, () => {
			this.handleStrokeChange();
		});
		this.strokeColorInput?.addEventListener("input", () => this.handleStrokeChange());

		// Transition tab handlers
		this.transitionPopup?.querySelectorAll("[data-tab]").forEach(tab => {
			tab.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const tabValue = el.dataset["tab"] as "in" | "out";
				this.handleTabChange(tabValue);
			});
		});

		// Transition effect handlers
		this.transitionPopup?.querySelectorAll("[data-effect]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const effect = el.dataset["effect"] || "";
				this.handleTransitionEffectSelect(effect);
			});
		});

		// Transition direction handlers
		this.transitionPopup?.querySelectorAll("[data-dir]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const dir = el.dataset["dir"] || "";
				this.handleDirectionSelect(dir);
			});
		});

		// Transition speed stepper
		const speedDecrease = this.transitionPopup?.querySelector("[data-speed-decrease]");
		const speedIncrease = this.transitionPopup?.querySelector("[data-speed-increase]");
		speedDecrease?.addEventListener("click", () => this.handleSpeedStep(-1));
		speedIncrease?.addEventListener("click", () => this.handleSpeedStep(1));

		// Effect type handlers
		this.effectPopup?.querySelectorAll("[data-effect-type]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const effectType = el.dataset["effectType"] || "";
				this.handleEffectTypeSelect(effectType as "" | "zoom" | "slide");
			});
		});

		// Effect variant handlers (for Zoom)
		this.effectPopup?.querySelectorAll("[data-variant]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const variant = el.dataset["variant"] || "In";
				this.handleEffectVariantSelect(variant as "In" | "Out");
			});
		});

		// Effect direction handlers (for Slide)
		this.effectPopup?.querySelectorAll("[data-effect-dir]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const dir = el.dataset["effectDir"] || "Right";
				this.handleEffectDirectionSelect(dir as "Left" | "Right" | "Up" | "Down");
			});
		});

		// Effect speed stepper
		const effectSpeedDecrease = this.effectPopup?.querySelector("[data-effect-speed-decrease]");
		const effectSpeedIncrease = this.effectPopup?.querySelector("[data-effect-speed-increase]");
		effectSpeedDecrease?.addEventListener("click", () => this.handleEffectSpeedStep(-1));
		effectSpeedIncrease?.addEventListener("click", () => this.handleEffectSpeedStep(1));

		// Use base class outside click handler
		this.setupOutsideClickHandler();
	}

	private handleClick(e: Event): void {
		const target = e.target as HTMLElement;
		const btn = target.closest("[data-action]") as HTMLElement | null;
		if (!btn) return;

		const { action } = btn.dataset;
		e.stopPropagation();

		switch (action) {
			case "text-edit-toggle":
				this.togglePopup(this.textEditPopup);
				break;
			case "size-down":
				this.adjustSize(-1);
				break;
			case "size-up":
				this.adjustSize(1);
				break;
			case "bold":
				this.toggleBold();
				break;
			case "font-toggle":
				this.togglePopup(this.fontPopup);
				break;
			case "font-color-toggle":
				this.togglePopup(this.fontColorPopup);
				break;
			case "spacing-toggle":
				this.togglePopup(this.spacingPopup);
				break;
			case "anchor-top":
				this.setVerticalAnchor("top");
				break;
			case "anchor-middle":
				this.setVerticalAnchor("center");
				break;
			case "anchor-bottom":
				this.setVerticalAnchor("bottom");
				break;
			case "align-cycle":
				this.cycleAlignment();
				break;
			case "background-toggle":
				this.togglePopup(this.backgroundPopup);
				break;
			case "stroke-toggle":
				this.togglePopup(this.strokePopup);
				break;
			case "transition-toggle":
				this.togglePopup(this.transitionPopup);
				break;
			case "effect-toggle":
				this.togglePopup(this.effectPopup);
				break;
			default:
				break;
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [
			this.textEditPopup,
			this.sizePopup,
			this.fontPopup,
			this.fontColorPopup,
			this.spacingPopup,
			this.backgroundPopup,
			this.strokePopup,
			this.transitionPopup,
			this.effectPopup
		];
	}

	private buildFontPopup(): void {
		if (!this.fontPopup) return;

		const html = `<div class="ss-toolbar-font-section">
			<div class="ss-toolbar-font-section-header">Built-in Fonts</div>
			${BUILT_IN_FONTS.map(f => `<div class="ss-toolbar-font-item" data-font="${f}"><span class="ss-toolbar-font-name" style="font-family:'${f}'">${f}</span></div>`).join("")}
		</div>`;

		this.fontPopup.innerHTML = html;

		this.fontPopup.querySelectorAll("[data-font]").forEach(item => {
			item.addEventListener("click", () => {
				const { font } = (item as HTMLElement).dataset;
				if (font) this.setFont(font);
				this.closeAllPopups();
			});
		});
	}

	private buildSizePopup(): void {
		if (!this.sizePopup) return;

		this.sizePopup.innerHTML = FONT_SIZES.map(size => `<div class="ss-toolbar-size-item" data-size="${size}">${size}</div>`).join("");

		this.sizePopup.querySelectorAll("[data-size]").forEach(item => {
			item.addEventListener("click", () => {
				const size = parseInt((item as HTMLElement).dataset["size"] || "32", 10);
				this.setSize(size);
				this.closeAllPopups();
			});
		});
	}

	private getCurrentAsset(): TextAsset | null {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player || player.clipConfiguration.asset.type !== "text") return null;
		return player.clipConfiguration.asset as TextAsset;
	}

	private updateAssetProperty(updates: Partial<TextAsset>): void {
		const asset = this.getCurrentAsset();
		if (!asset) return;

		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: { ...asset, ...updates } as TextAsset
		});
	}

	// Text content
	private debouncedApplyTextEdit(): void {
		if (this.textEditDebounceTimer) {
			clearTimeout(this.textEditDebounceTimer);
		}
		this.textEditDebounceTimer = setTimeout(() => {
			const newText = this.textEditArea?.value ?? "";
			this.updateAssetProperty({ text: newText });
		}, 150);
	}

	// Font size
	private adjustSize(direction: number): void {
		const asset = this.getCurrentAsset();
		const currentSize = asset?.font?.size ?? 32;
		const currentIdx = FONT_SIZES.findIndex(s => s >= currentSize);
		const idx = Math.max(0, Math.min(FONT_SIZES.length - 1, (currentIdx === -1 ? FONT_SIZES.length - 1 : currentIdx) + direction));
		this.setSize(FONT_SIZES[idx]);
	}

	private setSize(size: number): void {
		if (this.sizeInput) this.sizeInput.value = String(size);
		this.updateAssetProperty({ font: { ...this.getCurrentAsset()?.font, size } });
	}

	private applyManualSize(): void {
		const size = parseInt(this.sizeInput?.value || "32", 10);
		if (!Number.isNaN(size) && size > 0) {
			this.setSize(size);
		}
	}

	// Font family
	private setFont(font: string): void {
		if (this.fontPreview) this.fontPreview.textContent = "Aa";
		if (this.fontPreview) this.fontPreview.style.fontFamily = `'${font}'`;
		this.updateAssetProperty({ font: { ...this.getCurrentAsset()?.font, family: font } });
		this.updateFontActiveState(font);
	}

	private updateFontActiveState(currentFont: string): void {
		this.fontPopup?.querySelectorAll("[data-font]").forEach(item => {
			item.classList.toggle("active", (item as HTMLElement).dataset["font"] === currentFont);
		});
	}

	// Bold
	private toggleBold(): void {
		const asset = this.getCurrentAsset();
		const currentWeight = asset?.font?.weight ?? 400;
		const newWeight = currentWeight >= 700 ? 400 : 700;
		this.updateAssetProperty({ font: { ...asset?.font, weight: newWeight } });
		this.setButtonActive(this.boldBtn, newWeight >= 700);
	}

	// Font color
	private handleFontColorChange(): void {
		const color = this.fontColorInput?.value ?? "#FFFFFF";
		if (this.colorDisplay) {
			this.colorDisplay.style.backgroundColor = color;
		}
		this.updateAssetProperty({ font: { ...this.getCurrentAsset()?.font, color } });
	}

	// Vertical anchor
	private setVerticalAnchor(anchor: "top" | "center" | "bottom"): void {
		this.updateAssetProperty({ alignment: { ...this.getCurrentAsset()?.alignment, vertical: anchor } });
		this.updateAnchorActiveState(anchor);
	}

	private updateAnchorActiveState(anchor: string): void {
		this.setButtonActive(this.anchorTopBtn, anchor === "top");
		this.setButtonActive(this.anchorMiddleBtn, anchor === "center");
		this.setButtonActive(this.anchorBottomBtn, anchor === "bottom");
	}

	// Horizontal alignment
	private cycleAlignment(): void {
		const asset = this.getCurrentAsset();
		const current = asset?.alignment?.horizontal ?? "center";
		const cycle: Array<"left" | "center" | "right"> = ["left", "center", "right"];
		const idx = cycle.indexOf(current as "left" | "center" | "right");
		const next = cycle[(idx + 1) % cycle.length];

		this.updateAssetProperty({ alignment: { ...asset?.alignment, horizontal: next } });
		this.updateAlignmentIcon(next);
	}

	private updateAlignmentIcon(alignment: string): void {
		if (!this.alignIcon) return;

		const icons: Record<string, string> = {
			left: TOOLBAR_ICONS.alignLeft,
			center: TOOLBAR_ICONS.alignCenter,
			right: TOOLBAR_ICONS.alignRight
		};

		this.alignIcon.innerHTML = icons[alignment] || icons["center"];
	}

	// Background
	private handleBackgroundChange(): void {
		const color = this.bgColorInput?.value ?? "#000000";
		const opacity = parseInt(this.bgOpacitySlider?.value ?? "100", 10) / 100;

		this.updateAssetProperty({
			background: { color, opacity }
		});
	}

	// Stroke
	private handleStrokeChange(): void {
		const width = parseInt(this.strokeWidthSlider?.value ?? "0", 10);
		const color = this.strokeColorInput?.value ?? "#000000";

		this.updateAssetProperty({
			stroke: { width, color }
		});
	}

	// ==================== Transition Handlers ====================

	private handleTabChange(tab: "in" | "out"): void {
		this.activeTransitionTab = tab;
		this.updateTransitionUI();
	}

	private handleTransitionEffectSelect(effect: string): void {
		const tab = this.activeTransitionTab;

		if (tab === "in") {
			this.transitionInEffect = effect;
			this.transitionInDirection = this.getDefaultDirection(effect);
		} else {
			this.transitionOutEffect = effect;
			this.transitionOutDirection = this.getDefaultDirection(effect);
		}

		this.updateTransitionUI();
		this.applyTransitionUpdate();
	}

	private handleDirectionSelect(direction: string): void {
		const tab = this.activeTransitionTab;

		if (tab === "in") {
			this.transitionInDirection = direction;
		} else {
			this.transitionOutDirection = direction;
		}

		this.updateTransitionUI();
		this.applyTransitionUpdate();
	}

	private handleSpeedStep(direction: number): void {
		const tab = this.activeTransitionTab;
		const currentSpeed = tab === "in" ? this.transitionInSpeed : this.transitionOutSpeed;

		let currentIdx = this.SPEED_VALUES.indexOf(currentSpeed);
		if (currentIdx === -1) {
			currentIdx = this.SPEED_VALUES.findIndex(v => v >= currentSpeed);
			if (currentIdx === -1) currentIdx = this.SPEED_VALUES.length - 1;
		}

		const newIdx = Math.max(0, Math.min(this.SPEED_VALUES.length - 1, currentIdx + direction));
		const newSpeed = this.SPEED_VALUES[newIdx];

		if (tab === "in") {
			this.transitionInSpeed = newSpeed;
		} else {
			this.transitionOutSpeed = newSpeed;
		}

		this.updateTransitionUI();
		this.applyTransitionUpdate();
	}

	private needsDirection(effect: string): boolean {
		return ["slide", "wipe", "carousel"].includes(effect);
	}

	private getDefaultDirection(effect: string): string {
		if (this.needsDirection(effect)) {
			return "Right";
		}
		return "";
	}

	private speedToSuffix(speed: number, effect: string): string {
		const isSlideOrCarousel = effect === "slide" || effect === "carousel";

		if (isSlideOrCarousel) {
			if (speed === 0.5) return "";
			if (speed === 1.0) return "Slow";
			if (speed === 0.25) return "Fast";
			if (speed === 2.0) return "Slow";
		} else {
			if (speed === 1.0) return "";
			if (speed === 2.0) return "Slow";
			if (speed === 0.5) return "Fast";
			if (speed === 0.25) return "Fast";
		}
		return "";
	}

	private buildTransitionValue(effect: string, direction: string, speed: number): string {
		if (!effect) return "";

		const speedSuffix = this.speedToSuffix(speed, effect);

		if (!this.needsDirection(effect)) {
			return effect + speedSuffix;
		}

		return effect + direction + speedSuffix;
	}

	private suffixToSpeed(suffix: string, effect: string): number {
		const isSlideOrCarousel = effect === "slide" || effect === "carousel";

		if (isSlideOrCarousel) {
			if (suffix === "") return 0.5;
			if (suffix === "Slow") return 1.0;
			if (suffix === "Fast") return 0.25;
		} else {
			if (suffix === "") return 1.0;
			if (suffix === "Slow") return 2.0;
			if (suffix === "Fast") return 0.5;
		}
		return 1.0;
	}

	private parseTransitionValue(value: string): { effect: string; direction: string; speed: number } {
		if (!value) return { effect: "", direction: "", speed: 1.0 };

		let speedSuffix = "";
		let base = value;
		if (value.endsWith("Fast")) {
			speedSuffix = "Fast";
			base = value.slice(0, -4);
		} else if (value.endsWith("Slow")) {
			speedSuffix = "Slow";
			base = value.slice(0, -4);
		}

		const directions = ["Left", "Right", "Up", "Down"];
		for (const dir of directions) {
			if (base.endsWith(dir)) {
				const effect = base.slice(0, -dir.length);
				const speed = this.suffixToSpeed(speedSuffix, effect);
				return { effect, direction: dir, speed };
			}
		}

		const speed = this.suffixToSpeed(speedSuffix, base);
		return { effect: base, direction: "", speed };
	}

	private applyTransitionUpdate(): void {
		const transitionIn = this.buildTransitionValue(this.transitionInEffect, this.transitionInDirection, this.transitionInSpeed);
		const transitionOut = this.buildTransitionValue(this.transitionOutEffect, this.transitionOutDirection, this.transitionOutSpeed);

		const transition: { in?: string; out?: string } = {};
		if (transitionIn) transition.in = transitionIn;
		if (transitionOut) transition.out = transitionOut;

		if (!transitionIn && !transitionOut) {
			this.applyClipUpdate({ transition: undefined });
		} else {
			this.applyClipUpdate({ transition });
		}
	}

	private updateTransitionUI(): void {
		const tab = this.activeTransitionTab;
		const effect = tab === "in" ? this.transitionInEffect : this.transitionOutEffect;
		const direction = tab === "in" ? this.transitionInDirection : this.transitionOutDirection;
		const speed = tab === "in" ? this.transitionInSpeed : this.transitionOutSpeed;

		// Update tab active states
		this.transitionPopup?.querySelectorAll("[data-tab]").forEach(el => {
			const tabEl = el as HTMLElement;
			tabEl.classList.toggle("active", tabEl.dataset["tab"] === tab);
		});

		// Update effect active states
		this.transitionPopup?.querySelectorAll("[data-effect]").forEach(el => {
			const effectEl = el as HTMLElement;
			effectEl.classList.toggle("active", effectEl.dataset["effect"] === effect);
		});

		// Update direction visibility and active states
		const showDirection = this.needsDirection(effect);
		this.directionRow?.classList.toggle("visible", showDirection);

		this.transitionPopup?.querySelectorAll("[data-dir]").forEach(el => {
			const dirEl = el as HTMLElement;
			const dir = dirEl.dataset["dir"] || "";
			const isVertical = dir === "Up" || dir === "Down";
			dirEl.classList.toggle("hidden", effect === "wipe" && isVertical);
			dirEl.classList.toggle("active", dir === direction);
		});

		// Update speed display
		if (this.speedValueLabel) {
			this.speedValueLabel.textContent = `${speed.toFixed(2)}s`;
		}

		// Update stepper button disabled states
		const speedIdx = this.SPEED_VALUES.indexOf(speed);
		const decreaseBtn = this.transitionPopup?.querySelector("[data-speed-decrease]") as HTMLButtonElement | null;
		const increaseBtn = this.transitionPopup?.querySelector("[data-speed-increase]") as HTMLButtonElement | null;
		if (decreaseBtn) decreaseBtn.disabled = speedIdx <= 0;
		if (increaseBtn) increaseBtn.disabled = speedIdx >= this.SPEED_VALUES.length - 1;
	}

	// ==================== Effect Handlers ====================

	private handleEffectTypeSelect(effectType: "" | "zoom" | "slide"): void {
		this.effectType = effectType;
		this.updateEffectUI();
		this.applyEffect();
	}

	private handleEffectVariantSelect(variant: "In" | "Out"): void {
		this.effectVariant = variant;
		this.updateEffectUI();
		this.applyEffect();
	}

	private handleEffectDirectionSelect(direction: "Left" | "Right" | "Up" | "Down"): void {
		this.effectDirection = direction;
		this.updateEffectUI();
		this.applyEffect();
	}

	private handleEffectSpeedStep(direction: number): void {
		const currentIndex = this.EFFECT_SPEED_VALUES.indexOf(this.effectSpeed);
		const newIndex = Math.max(0, Math.min(this.EFFECT_SPEED_VALUES.length - 1, currentIndex + direction));
		this.effectSpeed = this.EFFECT_SPEED_VALUES[newIndex];
		this.updateEffectUI();
		this.applyEffect();
	}

	private updateEffectUI(): void {
		// Update active state on effect type buttons
		this.effectPopup?.querySelectorAll("[data-effect-type]").forEach(btn => {
			const type = (btn as HTMLElement).dataset["effectType"] || "";
			btn.classList.toggle("active", type === this.effectType);
		});

		// Show/hide variant row (for Zoom)
		this.effectVariantRow?.classList.toggle("visible", this.effectType === "zoom");

		// Update variant active states
		this.effectPopup?.querySelectorAll("[data-variant]").forEach(btn => {
			const variant = (btn as HTMLElement).dataset["variant"] || "";
			btn.classList.toggle("active", variant === this.effectVariant);
		});

		// Show/hide direction row (for Slide)
		this.effectDirectionRow?.classList.toggle("visible", this.effectType === "slide");

		// Update direction active states
		this.effectPopup?.querySelectorAll("[data-effect-dir]").forEach(btn => {
			const dir = (btn as HTMLElement).dataset["effectDir"] || "";
			btn.classList.toggle("active", dir === this.effectDirection);
		});

		// Show/hide speed row (when effect is selected)
		this.effectSpeedRow?.classList.toggle("visible", this.effectType !== "");

		// Update speed display
		if (this.effectSpeedValueLabel) {
			this.effectSpeedValueLabel.textContent = `${this.effectSpeed}s`;
		}

		// Update stepper button disabled states
		const speedIdx = this.EFFECT_SPEED_VALUES.indexOf(this.effectSpeed);
		const decreaseBtn = this.effectPopup?.querySelector("[data-effect-speed-decrease]") as HTMLButtonElement | null;
		const increaseBtn = this.effectPopup?.querySelector("[data-effect-speed-increase]") as HTMLButtonElement | null;
		if (decreaseBtn) decreaseBtn.disabled = speedIdx <= 0;
		if (increaseBtn) increaseBtn.disabled = speedIdx >= this.EFFECT_SPEED_VALUES.length - 1;
	}

	private buildEffectValue(): string {
		if (this.effectType === "") return "";

		let value = "";
		if (this.effectType === "zoom") {
			value = `zoom${this.effectVariant}`;
		} else if (this.effectType === "slide") {
			value = `slide${this.effectDirection}`;
		}

		if (this.effectSpeed === 0.5) value += "Fast";
		else if (this.effectSpeed === 2.0) value += "Slow";

		return value;
	}

	private applyEffect(): void {
		const effectValue = this.buildEffectValue();
		if (!effectValue) {
			this.applyClipUpdate({ effect: undefined });
		} else {
			this.applyClipUpdate({ effect: effectValue });
		}
	}

	private parseEffectValue(effect: string): void {
		if (!effect) {
			this.effectType = "";
			this.effectSpeed = 1.0;
			return;
		}

		let base = effect;
		if (effect.endsWith("Slow")) {
			this.effectSpeed = 2.0;
			base = effect.slice(0, -4);
		} else if (effect.endsWith("Fast")) {
			this.effectSpeed = 0.5;
			base = effect.slice(0, -4);
		} else {
			this.effectSpeed = 1.0;
		}

		if (base.startsWith("zoom")) {
			this.effectType = "zoom";
			this.effectVariant = base === "zoomOut" ? "Out" : "In";
		} else if (base.startsWith("slide")) {
			this.effectType = "slide";
			const dir = base.replace("slide", "");
			this.effectDirection = (dir as "Left" | "Right" | "Up" | "Down") || "Right";
		} else {
			this.effectType = "";
		}
	}

	private applyClipUpdate(updates: Record<string, unknown>): void {
		if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	// Sync UI with current clip state
	protected override syncState(): void {
		const asset = this.getCurrentAsset();
		if (!asset) return;

		// Text
		if (this.textEditArea) {
			this.textEditArea.value = asset.text || "";
		}

		// Size
		if (this.sizeInput) {
			this.sizeInput.value = String(asset.font?.size ?? 32);
		}

		// Font family
		const fontFamily = asset.font?.family ?? "Open Sans";
		if (this.fontPreview) {
			this.fontPreview.style.fontFamily = `'${fontFamily}'`;
		}
		this.updateFontActiveState(fontFamily);

		// Bold
		const weight = asset.font?.weight ?? 400;
		this.setButtonActive(this.boldBtn, weight >= 700);

		// Font color
		if (this.fontColorInput && asset.font?.color) {
			this.fontColorInput.value = asset.font.color;
		}
		if (this.colorDisplay) {
			this.colorDisplay.style.backgroundColor = asset.font?.color ?? "#FFFFFF";
		}

		// Line height
		const lineHeight = asset.font?.lineHeight ?? 1.2;
		if (this.lineHeightSlider) this.lineHeightSlider.value = String(Math.round(lineHeight * 10));
		if (this.lineHeightValue) this.lineHeightValue.textContent = lineHeight.toFixed(1);

		// Vertical anchor
		const verticalAnchor = asset.alignment?.vertical ?? "center";
		this.updateAnchorActiveState(verticalAnchor);

		// Horizontal alignment
		const horizontalAlign = asset.alignment?.horizontal ?? "center";
		this.updateAlignmentIcon(horizontalAlign);

		// Background
		if (this.bgColorInput && asset.background?.color) {
			this.bgColorInput.value = asset.background.color;
		}
		const bgOpacity = Math.round((asset.background?.opacity ?? 1) * 100);
		if (this.bgOpacitySlider) this.bgOpacitySlider.value = String(bgOpacity);
		if (this.bgOpacityValue) this.bgOpacityValue.textContent = String(bgOpacity);

		// Stroke
		const strokeWidth = asset.stroke?.width ?? 0;
		if (this.strokeWidthSlider) this.strokeWidthSlider.value = String(strokeWidth);
		if (this.strokeWidthValue) this.strokeWidthValue.textContent = String(strokeWidth);
		if (this.strokeColorInput && asset.stroke?.color) {
			this.strokeColorInput.value = asset.stroke.color;
		}

		// Get clip for transition and effect values
		const clip = this.edit.getClip(this.selectedTrackIdx, this.selectedClipIdx);

		// Transition
		const transitionIn = this.parseTransitionValue((clip?.transition as { in?: string })?.in ?? "");
		const transitionOut = this.parseTransitionValue((clip?.transition as { out?: string })?.out ?? "");

		this.transitionInEffect = transitionIn.effect;
		this.transitionInDirection = transitionIn.direction;
		this.transitionInSpeed = transitionIn.speed;
		this.transitionOutEffect = transitionOut.effect;
		this.transitionOutDirection = transitionOut.direction;
		this.transitionOutSpeed = transitionOut.speed;

		this.updateTransitionUI();

		// Effect
		this.parseEffectValue((clip?.effect as string) ?? "");
		this.updateEffectUI();
	}

	override dispose(): void {
		if (this.textEditDebounceTimer) {
			clearTimeout(this.textEditDebounceTimer);
		}

		// Call base dispose
		super.dispose();

		// Null all element references
		this.textEditBtn = null;
		this.textEditPopup = null;
		this.textEditArea = null;
		this.sizeInput = null;
		this.sizePopup = null;
		this.fontBtn = null;
		this.fontPopup = null;
		this.fontPreview = null;
		this.boldBtn = null;
		this.fontColorBtn = null;
		this.fontColorPopup = null;
		this.fontColorInput = null;
		this.colorDisplay = null;
		this.spacingBtn = null;
		this.spacingPopup = null;
		this.lineHeightSlider = null;
		this.lineHeightValue = null;
		this.anchorTopBtn = null;
		this.anchorMiddleBtn = null;
		this.anchorBottomBtn = null;
		this.alignBtn = null;
		this.alignIcon = null;
		this.backgroundBtn = null;
		this.backgroundPopup = null;
		this.bgColorInput = null;
		this.bgOpacitySlider = null;
		this.bgOpacityValue = null;
		this.strokeBtn = null;
		this.strokePopup = null;
		this.strokeWidthSlider = null;
		this.strokeWidthValue = null;
		this.strokeColorInput = null;

		// Transition elements
		this.transitionBtn = null;
		this.transitionPopup = null;
		this.directionRow = null;
		this.speedValueLabel = null;

		// Effect elements
		this.effectBtn = null;
		this.effectPopup = null;
		this.effectVariantRow = null;
		this.effectDirectionRow = null;
		this.effectSpeedRow = null;
		this.effectSpeedValueLabel = null;
	}
}
