import type { Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import type { MergeField } from "@core/merge";
import type { ResolvedClip, RichTextAsset } from "@schemas";
import { injectShotstackStyles } from "@styles/inject";

import { GOOGLE_FONTS_BY_FILENAME } from "../fonts/google-fonts";

import { BackgroundColorPicker } from "./background-color-picker";
import { BaseToolbar, FONT_SIZES } from "./base-toolbar";
import { EffectPanel } from "./composites/EffectPanel";
import { SpacingPanel } from "./composites/SpacingPanel";
import { StylePanel } from "./composites/StylePanel";
import { TransitionPanel } from "./composites/TransitionPanel";
import { FontColorPicker } from "./font-color-picker";
import { FontPicker, type GoogleFont } from "./font-picker";

export interface RichTextToolbarOptions {
	mergeFields?: boolean;
}

export class RichTextToolbar extends BaseToolbar {
	private showMergeFields: boolean;
	private fontPopup: HTMLDivElement | null = null;
	private fontPreview: HTMLSpanElement | null = null;
	private fontPicker: FontPicker | null = null;
	private sizeInput: HTMLInputElement | null = null;
	private sizePopup: HTMLDivElement | null = null;
	private weightPopup: HTMLDivElement | null = null;
	private weightPreview: HTMLSpanElement | null = null;
	private spacingPopup: HTMLDivElement | null = null;
	private spacingPanel: SpacingPanel | null = null;
	private anchorTopBtn: HTMLButtonElement | null = null;
	private anchorMiddleBtn: HTMLButtonElement | null = null;
	private anchorBottomBtn: HTMLButtonElement | null = null;
	private alignIcon: SVGElement | null = null;
	private transformBtn: HTMLButtonElement | null = null;
	private underlineBtn: HTMLButtonElement | null = null;
	private linethroughBtn: HTMLButtonElement | null = null;
	private textEditPopup: HTMLDivElement | null = null;
	private textEditArea: HTMLTextAreaElement | null = null;
	private textEditDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Autocomplete for merge field variables
	private autocompletePopup: HTMLDivElement | null = null;
	private autocompleteItems: HTMLDivElement | null = null;
	private autocompleteVisible: boolean = false;
	private autocompleteFilter: string = "";
	private autocompleteStartPos: number = 0;
	private selectedAutocompleteIndex: number = 0;
	private borderPopup: HTMLDivElement | null = null;
	private borderWidthSlider: HTMLInputElement | null = null;
	private borderWidthValue: HTMLSpanElement | null = null;
	private borderColorInput: HTMLInputElement | null = null;
	private borderOpacitySlider: HTMLInputElement | null = null;
	private borderOpacityValue: HTMLSpanElement | null = null;
	private borderRadiusSlider: HTMLInputElement | null = null;
	private borderRadiusValue: HTMLSpanElement | null = null;
	private backgroundPopup: HTMLDivElement | null = null;
	private backgroundColorPicker: BackgroundColorPicker | null = null;

	private paddingPopup: HTMLDivElement | null = null;
	private paddingTopSlider: HTMLInputElement | null = null;
	private paddingTopValue: HTMLSpanElement | null = null;
	private paddingRightSlider: HTMLInputElement | null = null;
	private paddingRightValue: HTMLSpanElement | null = null;
	private paddingBottomSlider: HTMLInputElement | null = null;
	private paddingBottomValue: HTMLSpanElement | null = null;
	private paddingLeftSlider: HTMLInputElement | null = null;
	private paddingLeftValue: HTMLSpanElement | null = null;

	private fontColorPopup: HTMLDivElement | null = null;
	private fontColorPicker: FontColorPicker | null = null;
	private colorDisplay: HTMLButtonElement | null = null;

	private animationPopup: HTMLDivElement | null = null;
	private animationDurationSlider: HTMLInputElement | null = null;
	private animationDurationValue: HTMLSpanElement | null = null;
	private animationStyleSection: HTMLDivElement | null = null;
	private animationDirectionSection: HTMLDivElement | null = null;

	// Composite panels (replace ~400 lines of duplicated transition/effect code)
	private transitionPopup: HTMLDivElement | null = null;
	private transitionPanel: TransitionPanel | null = null;
	private effectPopup: HTMLDivElement | null = null;
	private effectPanel: EffectPanel | null = null;
	private stylePopup: HTMLDivElement | null = null;
	private stylePanel: StylePanel | null = null;

	// Bound handler for proper cleanup
	private boundHandleClick: ((e: MouseEvent) => void) | null = null;

	constructor(edit: Edit, options: RichTextToolbarOptions = {}) {
		super(edit);
		this.showMergeFields = options.mergeFields ?? false;
	}

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-toolbar";

		this.container.innerHTML = `
			<!-- Mode Toggle -->
			<div class="ss-toolbar-mode-toggle" data-mode="asset">
				<button class="ss-toolbar-mode-btn active" data-mode="asset" title="Asset properties (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="2" width="12" height="12" rx="1.5"/>
						<path d="M2 6h12M6 6v8"/>
					</svg>
				</button>
				<button class="ss-toolbar-mode-btn" data-mode="clip" title="Clip timing (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6"/>
						<path d="M8 5v3l2 2"/>
					</svg>
				</button>
				<span class="ss-toolbar-mode-indicator"></span>
			</div>
			<div class="ss-toolbar-mode-divider"></div>

			<div class="ss-toolbar-dropdown">
				<button data-action="text-edit-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Edit text">Text</button>
				<div data-text-edit-popup class="ss-toolbar-popup ss-toolbar-popup--text-edit">
					<div class="ss-toolbar-popup-header">Edit Text</div>
					<div class="ss-toolbar-text-area-wrapper">
						<textarea data-text-edit-area class="ss-toolbar-text-area" rows="4" placeholder="Enter text..."></textarea>
						<div class="ss-autocomplete-popup" data-autocomplete-popup>
							<div class="ss-autocomplete-items" data-autocomplete-items></div>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-group ss-toolbar-group--bordered">
				<button data-action="size-down" class="ss-toolbar-btn" title="Decrease font size">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
				</button>
				<div class="ss-toolbar-dropdown ss-toolbar-dropdown--size">
					<input type="text" data-size-input class="ss-toolbar-size-input" value="48" />
					<div data-size-popup class="ss-toolbar-popup ss-toolbar-popup--size"></div>
				</div>
				<button data-action="size-up" class="ss-toolbar-btn" title="Increase font size">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19"/>
						<line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
				</button>
			</div>

			<div class="ss-toolbar-dropdown ss-toolbar-dropdown--weight">
				<button data-action="weight-toggle" class="ss-toolbar-font-btn ss-toolbar-font-btn--weight" title="Font weight">
					<span data-weight-preview>Regular</span>
					<svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" style="opacity: 0.5;">
						<path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
					</svg>
				</button>
				<div data-weight-popup class="ss-toolbar-popup ss-toolbar-popup--weight"></div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="font-toggle" class="ss-toolbar-font-btn" title="Font">
					<span data-font-preview></span>
					<svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" style="opacity: 0.5;">
						<path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
					</svg>
				</button>
				<div data-font-popup class="ss-toolbar-popup ss-toolbar-popup--font"></div>
			</div>

			<div class="ss-toolbar-color-wrap">
				<button data-action="font-color-toggle" class="ss-toolbar-color" title="Font color" data-color-display></button>
				<div data-font-color-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div data-font-color-picker></div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="spacing-toggle" class="ss-toolbar-btn" title="Spacing">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<path d="M17.952 15.75a.75.75 0 0 1 .535.238l2.147 2.146a1.255 1.255 0 0 1 0 1.77l-2.147 2.145a.75.75 0 0 1-1.06-1.06l1.22-1.22H5.352l1.22 1.22a.753.753 0 0 1 .019 1.078.752.752 0 0 1-1.08-.018l-2.146-2.146a1.255 1.255 0 0 1-.342-.64 1.253 1.253 0 0 1-.02-.225L3 19.018c0-.02.002-.041.004-.062a1.25 1.25 0 0 1 .09-.416 1.25 1.25 0 0 1 .27-.406l2.147-2.146a.751.751 0 0 1 1.279.53c0 .2-.08.39-.22.53l-1.22 1.22h13.298l-1.22-1.22a.752.752 0 0 1-.02-1.078.752.752 0 0 1 .544-.22ZM15.854 3c.725 0 1.313.588 1.313 1.313v1.31a.782.782 0 0 1-1.563 0v-.956a.104.104 0 0 0-.104-.104l-2.754.005.007 8.245c0 .252.206.457.459.457h.996a.782.782 0 0 1 0 1.563H9.736a.781.781 0 0 1 0-1.563h.996a.458.458 0 0 0 .458-.457l-.006-8.245-2.767-.005a.104.104 0 0 0-.104.104v.976a.781.781 0 0 1-1.563 0v-1.33C6.75 3.587 7.338 3 8.063 3h7.791Z"/>
					</svg>
				</button>
				<div data-spacing-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div data-spacing-panel-container class="ss-toolbar-popup-section"></div>
					<div class="ss-toolbar-popup-divider"></div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Anchor text box</div>
						<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
							<button data-action="anchor-top" class="ss-toolbar-anchor-btn" title="Top">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="5" x2="12" y2="19"/>
									<polyline points="5 12 12 5 19 12"/>
								</svg>
							</button>
							<button data-action="anchor-middle" class="ss-toolbar-anchor-btn" title="Middle">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="5" x2="12" y2="19"/>
									<polyline points="5 9 12 5 19 9"/>
									<polyline points="5 15 12 19 19 15"/>
								</svg>
							</button>
							<button data-action="anchor-bottom" class="ss-toolbar-anchor-btn" title="Bottom">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="5" x2="12" y2="19"/>
									<polyline points="5 12 12 19 19 12"/>
								</svg>
							</button>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-divider"></div>

			<!-- Formatting Group -->
			<button data-action="align-cycle" class="ss-toolbar-btn" title="Text alignment">
				<svg data-align-icon width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<path d="M3 5h18v2H3V5zm3 4h12v2H6V9zm-3 4h18v2H3v-2zm3 4h12v2H6v-2z"/>
				</svg>
			</button>
			<button data-action="transform" class="ss-toolbar-btn ss-toolbar-btn--text" title="Text transform">Aa</button>
			<button data-action="underline" class="ss-toolbar-btn ss-toolbar-btn--text ss-toolbar-btn--underline" title="Underline">U</button>
			<button data-action="linethrough" class="ss-toolbar-btn" title="Strikethrough">
				<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
					<path d="M7.349 15.508c0 1.263.43 2.249 1.292 2.957.861.708 2.01 1.063 3.445 1.063 1.436 0 2.571-.355 3.407-1.063.836-.708 1.254-1.636 1.254-2.785 0-.885-.205-1.611-.614-2.18H18V12H6.432v1.5h7.175c.388.185.688.367.9.544.492.408.737.957.737 1.646 0 .753-.27 1.362-.813 1.828-.542.46-1.324.689-2.345.689-1.02 0-1.815-.227-2.383-.68-.561-.453-.842-1.126-.842-2.019v-.23H7.349v.23ZM8.351 11h2.918c-.667-.268-1.147-.523-1.441-.765-.473-.396-.709-.916-.709-1.56 0-.715.233-1.28.699-1.694.466-.415 1.193-.622 2.182-.622.983 0 1.723.242 2.22.727.498.485.747 1.117.747 1.895v.21h1.512v-.21c0-1.148-.405-2.093-1.215-2.833-.804-.74-1.892-1.11-3.264-1.11-1.372 0-2.447.348-3.225 1.043-.772.69-1.158 1.573-1.158 2.651 0 .948.245 1.704.734 2.268Z"/>
				</svg>
			</button>

			<div class="ss-toolbar-divider"></div>

			<!-- Box Styling Group - Consolidated Style Panel -->
			<div class="ss-toolbar-dropdown">
				<button data-action="style-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Style">Style</button>
				<div data-style-popup class="ss-toolbar-popup ss-toolbar-popup--style"></div>
			</div>

			<div class="ss-toolbar-divider"></div>

			<!-- Animation & Effects Group -->
			<div class="ss-toolbar-dropdown">
				<button data-action="animation-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Animation">Animate</button>
				<div data-animation-popup class="ss-toolbar-popup ss-toolbar-popup--animation">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Preset</div>
						<div class="ss-animation-presets">
							<button class="ss-animation-preset" data-preset="typewriter">Typewriter</button>
							<button class="ss-animation-preset" data-preset="fadeIn">Fade In</button>
							<button class="ss-animation-preset" data-preset="slideIn">Slide In</button>
							<button class="ss-animation-preset" data-preset="ascend">Ascend</button>
							<button class="ss-animation-preset" data-preset="shift">Shift</button>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Duration</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-animation-duration class="ss-toolbar-slider" min="0.1" max="10" step="0.1" value="1" />
							<span data-animation-duration-value class="ss-toolbar-popup-value">1.0s</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section" data-animation-style-section>
						<div class="ss-toolbar-popup-label">Writing Style</div>
						<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
							<button class="ss-toolbar-anchor-btn" data-animation-style="character">Character</button>
							<button class="ss-toolbar-anchor-btn" data-animation-style="word">Word</button>
						</div>
					</div>
					<div class="ss-toolbar-popup-section" data-animation-direction-section>
						<div class="ss-toolbar-popup-label">Direction</div>
						<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
							<button class="ss-toolbar-anchor-btn" data-animation-direction="left">←</button>
							<button class="ss-toolbar-anchor-btn" data-animation-direction="right">→</button>
							<button class="ss-toolbar-anchor-btn" data-animation-direction="up">↑</button>
							<button class="ss-toolbar-anchor-btn" data-animation-direction="down">↓</button>
						</div>
					</div>
					<div class="ss-toolbar-popup-divider"></div>
					<button class="ss-toolbar-anchor-btn" data-action="animation-clear" style="width: 100%;">Clear Animation</button>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="transition-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Transition">Transition</button>
				<div data-transition-popup class="ss-toolbar-popup ss-toolbar-popup--transition"></div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="effect-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Effect">Effect</button>
				<div data-effect-popup class="ss-toolbar-popup ss-toolbar-popup--effect"></div>
			</div>
		`;

		this.sizeInput = this.container.querySelector("[data-size-input]");
		this.sizePopup = this.container.querySelector("[data-size-popup]");
		this.weightPopup = this.container.querySelector("[data-weight-popup]");
		this.weightPreview = this.container.querySelector("[data-weight-preview]");
		this.buildWeightPopup();
		this.fontPopup = this.container.querySelector("[data-font-popup]");
		this.fontPreview = this.container.querySelector("[data-font-preview]");
		this.alignIcon = this.container.querySelector("[data-align-icon]");
		this.transformBtn = this.container.querySelector("[data-action='transform']");
		this.underlineBtn = this.container.querySelector("[data-action='underline']");
		this.linethroughBtn = this.container.querySelector("[data-action='linethrough']");
		this.textEditPopup = this.container.querySelector("[data-text-edit-popup]");
		this.textEditArea = this.container.querySelector("[data-text-edit-area]");
		this.autocompletePopup = this.container.querySelector("[data-autocomplete-popup]");
		this.autocompleteItems = this.container.querySelector("[data-autocomplete-items]");

		this.boundHandleClick = this.handleClick.bind(this);
		this.container.addEventListener("click", this.boundHandleClick);

		// Size input handlers
		this.sizeInput?.addEventListener("click", e => {
			e.stopPropagation();
			this.toggleSizePopup();
		});
		this.sizeInput?.addEventListener("blur", () => this.applyManualSize());
		this.sizeInput?.addEventListener("keydown", e => {
			if (e.key === "Enter") {
				this.applyManualSize();
				this.sizeInput?.blur();
				this.closeAllPopups();
			}
		});
		this.buildSizePopup();

		// Font color picker
		this.colorDisplay = this.container.querySelector("[data-color-display]");
		this.fontColorPopup = this.container.querySelector("[data-font-color-popup]");
		const fontColorPickerContainer = this.container.querySelector("[data-font-color-picker]");

		if (fontColorPickerContainer) {
			this.fontColorPicker = new FontColorPicker();
			this.fontColorPicker.mount(fontColorPickerContainer as HTMLElement);
			this.fontColorPicker.onChange(updates => {
				this.updateFontColorProperty(updates);
			});
		}

		this.spacingPopup = this.container.querySelector("[data-spacing-popup]");
		this.anchorTopBtn = this.container.querySelector("[data-action='anchor-top']");
		this.anchorMiddleBtn = this.container.querySelector("[data-action='anchor-middle']");
		this.anchorBottomBtn = this.container.querySelector("[data-action='anchor-bottom']");

		// Mount SpacingPanel composite (letter spacing + line height)
		const spacingContainer = this.container.querySelector("[data-spacing-panel-container]") as HTMLElement | null;
		if (spacingContainer) {
			this.spacingPanel = new SpacingPanel();
			this.spacingPanel.onChange(state => {
				this.updateClipProperty({
					style: { letterSpacing: state.letterSpacing, lineHeight: state.lineHeight }
				});
			});
			this.spacingPanel.mount(spacingContainer);
		}

		this.borderPopup = this.container.querySelector("[data-border-popup]");
		this.borderWidthSlider = this.container.querySelector("[data-border-width-slider]");
		this.borderWidthValue = this.container.querySelector("[data-border-width-value]");
		this.borderColorInput = this.container.querySelector("[data-border-color]");
		this.borderOpacitySlider = this.container.querySelector("[data-border-opacity-slider]");
		this.borderOpacityValue = this.container.querySelector("[data-border-opacity-value]");
		this.borderRadiusSlider = this.container.querySelector("[data-border-radius-slider]");
		this.borderRadiusValue = this.container.querySelector("[data-border-radius-value]");

		this.borderWidthSlider?.addEventListener("input", e => {
			const width = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.borderWidthValue) {
				this.borderWidthValue.textContent = String(width);
			}
			this.updateBorderProperty({ width });
		});

		this.borderColorInput?.addEventListener("input", e => {
			const color = (e.target as HTMLInputElement).value;
			this.updateBorderProperty({ color });
		});

		this.borderOpacitySlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			const opacity = value / 100;
			if (this.borderOpacityValue) {
				this.borderOpacityValue.textContent = String(value);
			}
			this.updateBorderProperty({ opacity });
		});

		this.borderRadiusSlider?.addEventListener("input", e => {
			const radius = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.borderRadiusValue) {
				this.borderRadiusValue.textContent = String(radius);
			}
			this.updateBorderProperty({ radius });
		});

		// Animation controls
		this.animationPopup = this.container.querySelector("[data-animation-popup]");
		this.animationDurationSlider = this.container.querySelector("[data-animation-duration]");
		this.animationDurationValue = this.container.querySelector("[data-animation-duration-value]");
		this.animationStyleSection = this.container.querySelector("[data-animation-style-section]");
		this.animationDirectionSection = this.container.querySelector("[data-animation-direction-section]");

		// Composite panels for transition/effect (mount containers)
		this.transitionPopup = this.container.querySelector("[data-transition-popup]");
		this.effectPopup = this.container.querySelector("[data-effect-popup]");

		// Mount TransitionPanel composite
		if (this.transitionPopup) {
			this.transitionPanel = new TransitionPanel();
			this.transitionPanel.onChange(() => {
				const transitionValue = this.transitionPanel?.getClipValue();
				this.applyClipUpdate({ transition: transitionValue });
			});
			this.transitionPanel.mount(this.transitionPopup);
		}

		// Mount EffectPanel composite
		if (this.effectPopup) {
			this.effectPanel = new EffectPanel();
			this.effectPanel.onChange(() => {
				const effectValue = this.effectPanel?.getClipValue();
				this.applyClipUpdate({ effect: effectValue });
			});
			this.effectPanel.mount(this.effectPopup);
		}

		// Preset buttons
		this.container.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(btn => {
			btn.addEventListener("click", () => {
				const preset = btn.dataset["preset"] as "typewriter" | "fadeIn" | "slideIn" | "ascend" | "shift" | "movingLetters";
				if (preset) this.updateAnimationProperty({ preset });
			});
		});

		// Duration slider
		this.animationDurationSlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			if (this.animationDurationValue) this.animationDurationValue.textContent = `${value.toFixed(1)}s`;
			this.updateAnimationProperty({ duration: value });
		});

		// Style buttons
		this.container.querySelectorAll<HTMLButtonElement>("[data-animation-style]").forEach(btn => {
			btn.addEventListener("click", () => {
				const style = btn.dataset["animationStyle"] as "character" | "word";
				if (style) this.updateAnimationProperty({ style });
			});
		});

		// Direction buttons
		this.container.querySelectorAll<HTMLButtonElement>("[data-animation-direction]").forEach(btn => {
			btn.addEventListener("click", () => {
				const direction = btn.dataset["animationDirection"] as "left" | "right" | "up" | "down";
				if (direction) this.updateAnimationProperty({ direction });
			});
		});

		// Mount StylePanel composite (consolidated fill/border/padding/shadow)
		this.stylePopup = this.container.querySelector("[data-style-popup]");
		if (this.stylePopup) {
			this.stylePanel = new StylePanel();
			this.stylePanel.onBorderChange(border => {
				this.updateBorderProperty({
					width: border.width,
					color: border.color,
					opacity: border.opacity / 100,
					radius: border.radius
				});
			});
			this.stylePanel.onPaddingChange(padding => {
				this.updatePaddingProperty(padding);
			});
			this.stylePanel.onShadowChange(shadow => {
				if (shadow.enabled) {
					this.updateShadowProperty({
						offsetX: shadow.offsetX,
						offsetY: shadow.offsetY,
						blur: shadow.blur,
						color: shadow.color,
						opacity: shadow.opacity / 100
					});
				} else {
					this.updateClipProperty({ shadow: undefined });
				}
			});
			this.stylePanel.mount(this.stylePopup);

			// Mount BackgroundColorPicker inside StylePanel's fill tab
			const fillMount = this.stylePanel.getFillColorPickerMount();
			if (fillMount) {
				this.backgroundColorPicker = new BackgroundColorPicker();
				this.backgroundColorPicker.mount(fillMount);
				this.backgroundColorPicker.onChange((color, opacity) => {
					this.updateBackgroundProperty({ color, opacity });
				});
			}
		}

		// Padding controls
		this.paddingPopup = this.container.querySelector("[data-padding-popup]");
		this.paddingTopSlider = this.container.querySelector("[data-padding-top-slider]");
		this.paddingTopValue = this.container.querySelector("[data-padding-top-value]");
		this.paddingRightSlider = this.container.querySelector("[data-padding-right-slider]");
		this.paddingRightValue = this.container.querySelector("[data-padding-right-value]");
		this.paddingBottomSlider = this.container.querySelector("[data-padding-bottom-slider]");
		this.paddingBottomValue = this.container.querySelector("[data-padding-bottom-value]");
		this.paddingLeftSlider = this.container.querySelector("[data-padding-left-slider]");
		this.paddingLeftValue = this.container.querySelector("[data-padding-left-value]");

		// Event listeners
		this.paddingTopSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingTopValue) this.paddingTopValue.textContent = String(value);
			this.updatePaddingProperty({ top: value });
		});

		this.paddingRightSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingRightValue) this.paddingRightValue.textContent = String(value);
			this.updatePaddingProperty({ right: value });
		});

		this.paddingBottomSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingBottomValue) this.paddingBottomValue.textContent = String(value);
			this.updatePaddingProperty({ bottom: value });
		});

		this.paddingLeftSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingLeftValue) this.paddingLeftValue.textContent = String(value);
			this.updatePaddingProperty({ left: value });
		});

		// Text edit area handlers
		this.textEditArea?.addEventListener("input", () => {
			this.checkAutocomplete();
			this.debouncedApplyTextEdit();
		});
		this.textEditArea?.addEventListener("keydown", e => {
			// Handle autocomplete navigation when visible
			if (this.autocompleteVisible) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					const count = this.getFilteredFieldCount();
					this.selectedAutocompleteIndex = Math.min(this.selectedAutocompleteIndex + 1, count - 1);
					this.showAutocomplete();
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					this.selectedAutocompleteIndex = Math.max(this.selectedAutocompleteIndex - 1, 0);
					this.showAutocomplete();
					return;
				}
				if (e.key === "Enter" || e.key === "Tab") {
					e.preventDefault();
					this.insertSelectedVariable();
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					this.hideAutocomplete();
					return;
				}
			}

			// Apply on Ctrl/Cmd+Enter (allow normal Enter for newlines)
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				if (this.textEditDebounceTimer) {
					clearTimeout(this.textEditDebounceTimer);
					this.textEditDebounceTimer = null;
				}
				this.applyTextEdit();
				this.closeAllPopups();
			}
			if (e.key === "Escape") {
				this.closeAllPopups();
			}
		});

		this.setupOutsideClickHandler();

		// eslint-disable-next-line no-param-reassign -- Intentional DOM parent styling
		parent.style.position = "relative";
		parent.insertBefore(this.container, parent.firstChild);

		// Re-sync when font capabilities change (async operation)
		this.edit.events.on(InternalEvent.FontCapabilitiesChanged, () => {
			if (this.container?.style.display !== "none") {
				this.syncState();
			}
		});
	}

	private handleClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const button = target.closest("button");
		if (!button) return;

		const { action } = button.dataset;
		if (!action) return;

		const asset = this.getCurrentAsset();
		if (!asset) return;

		switch (action) {
			case "size-down":
				this.updateSize((asset.font?.size ?? 48) - 4);
				break;
			case "size-up":
				this.updateSize((asset.font?.size ?? 48) + 4);
				break;
			case "weight-toggle":
				this.toggleWeightPopup();
				break;
			case "font-toggle":
				this.toggleFontPopup();
				break;
			case "text-edit-toggle":
				this.toggleTextEditPopup();
				break;
			case "spacing-toggle":
				this.toggleSpacingPopup();
				break;
			case "style-toggle":
				this.togglePopup(this.stylePopup);
				break;
			case "font-color-toggle":
				this.toggleFontColorPopup();
				break;
			case "anchor-top":
				this.updateVerticalAlign("top");
				break;
			case "anchor-middle":
				this.updateVerticalAlign("middle");
				break;
			case "anchor-bottom":
				this.updateVerticalAlign("bottom");
				break;
			case "align-cycle":
				this.cycleAlignment(asset);
				break;
			case "transform":
				this.cycleTransform(asset);
				break;
			case "underline":
				this.toggleUnderline(asset);
				break;
			case "linethrough":
				this.toggleLinethrough(asset);
				break;
			case "animation-toggle":
				this.toggleAnimationPopup();
				break;
			case "animation-clear":
				this.updateClipProperty({ animation: undefined });
				this.closeAllPopups();
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

	private getCurrentAsset(): RichTextAsset | null {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return null;
		return player.clipConfiguration.asset as RichTextAsset;
	}

	private updateSize(newSize: number): void {
		const clampedSize = Math.max(8, Math.min(500, newSize));
		this.updateClipProperty({ font: { size: clampedSize } });
	}

	// Font weight options: name → numeric value
	private static readonly FONT_WEIGHTS: Array<{ name: string; value: number }> = [
		{ name: "Light", value: 300 },
		{ name: "Regular", value: 400 },
		{ name: "Medium", value: 500 },
		{ name: "Bold", value: 700 },
		{ name: "Black", value: 900 }
	];

	// Checkmark SVG (constant to avoid rebuilding string)
	private static readonly CHECKMARK_SVG =
		'<svg class="ss-toolbar-weight-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

	/** Single source of truth for weight normalization - handles string, number, or object */
	private normalizeWeight(raw: unknown): number {
		if (typeof raw === "number") return raw;
		if (typeof raw === "string") return parseInt(raw, 10) || 400;
		return 400;
	}

	private getWeightName(weight: unknown): string {
		const numWeight = this.normalizeWeight(weight);
		const found = RichTextToolbar.FONT_WEIGHTS.find(w => w.value === numWeight);
		return found?.name ?? "Regular";
	}

	private toggleWeightPopup(): void {
		this.togglePopup(this.weightPopup, () => this.updateWeightPopupState());
	}

	/** Build popup once at mount - uses event delegation (no per-item listeners) */
	private buildWeightPopup(): void {
		if (!this.weightPopup) return;

		// Build static HTML once
		this.weightPopup.innerHTML = RichTextToolbar.FONT_WEIGHTS.map(
			({ name, value }) => `
				<div class="ss-toolbar-weight-item" data-weight="${value}">
					<span class="ss-toolbar-weight-name" style="font-weight: ${value}">${name}</span>
					<span class="ss-toolbar-weight-check-slot"></span>
				</div>
			`
		).join("");

		// Single delegated click handler (no leak on repeated opens)
		this.weightPopup.addEventListener("click", (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest("[data-weight]") as HTMLElement | null;
			if (!item) return;
			const weight = parseInt(item.dataset["weight"]!, 10);
			this.setFontWeight(weight);
			this.closeAllPopups();
		});

		this.updateWeightPopupState();
	}

	/** Update active state without rebuilding DOM */
	private updateWeightPopupState(): void {
		if (!this.weightPopup) return;
		const asset = this.getCurrentAsset();
		const currentWeight = this.normalizeWeight(asset?.font?.weight);

		this.weightPopup.querySelectorAll("[data-weight]").forEach(item => {
			const el = item as HTMLElement;
			const value = parseInt(el.dataset["weight"]!, 10);
			const isActive = value === currentWeight;
			el.classList.toggle("active", isActive);

			// Update checkmark slot
			const slot = el.querySelector(".ss-toolbar-weight-check-slot");
			if (slot) {
				slot.innerHTML = isActive ? RichTextToolbar.CHECKMARK_SVG : "";
			}
		});
	}

	private setFontWeight(weight: number): void {
		this.updateClipProperty({ font: { weight } });
	}

	private toggleSizePopup(): void {
		this.togglePopup(this.sizePopup, () => this.buildSizePopup());
	}

	private buildSizePopup(): void {
		if (!this.sizePopup) return;
		const asset = this.getCurrentAsset();
		const currentSize = asset?.font?.size ?? 48;

		this.sizePopup.innerHTML = FONT_SIZES.map(
			size => `<div class="ss-toolbar-size-item${size === currentSize ? " active" : ""}" data-size="${size}">${size}</div>`
		).join("");

		this.sizePopup.querySelectorAll("[data-size]").forEach(item => {
			item.addEventListener("click", () => {
				const size = parseInt((item as HTMLElement).dataset["size"]!, 10);
				this.updateSize(size);
				this.closeAllPopups();
			});
		});
	}

	private applyManualSize(): void {
		if (!this.sizeInput) return;
		const value = parseInt(this.sizeInput.value, 10);
		if (!Number.isNaN(value) && value > 0) {
			this.updateSize(value);
		}
		this.syncState();
	}

	private toggleSpacingPopup(): void {
		this.togglePopup(this.spacingPopup);
	}

	private toggleAnimationPopup(): void {
		this.togglePopup(this.animationPopup, () => {
			const asset = this.getCurrentAsset();
			this.updateAnimationSections(asset?.animation?.preset);
		});
	}

	private toggleFontColorPopup(): void {
		this.togglePopup(this.fontColorPopup, () => {
			if (this.fontColorPicker) {
				const asset = this.getCurrentAsset();
				const font = asset?.font;
				const style = asset?.style;

				if (style?.gradient) {
					this.fontColorPicker.setMode("gradient");
				} else {
					this.fontColorPicker.setMode("color");
					this.fontColorPicker.setColor(font?.color || "#000000", font?.opacity ?? 1);
					// Check for SDK-extended background property (not in external schema)
					const fontExt = font as typeof font & { background?: string };
					if (fontExt?.background) {
						this.fontColorPicker.setHighlight(fontExt.background);
					}
				}
			}
		});
	}

	private toggleFontPopup(): void {
		this.togglePopup(this.fontPopup, () => this.buildFontPicker());
	}

	private toggleTextEditPopup(): void {
		this.togglePopup(this.textEditPopup, () => {
			if (this.textEditArea) {
				const templateText = this.edit.getTemplateClipText(this.selectedTrackIdx, this.selectedClipIdx);
				const asset = this.getCurrentAsset();
				this.textEditArea.value = templateText ?? asset?.text ?? "";
				this.textEditArea.focus();
			}
		});
	}

	private debouncedApplyTextEdit(): void {
		if (this.textEditDebounceTimer) {
			clearTimeout(this.textEditDebounceTimer);
		}
		this.textEditDebounceTimer = setTimeout(() => {
			this.applyTextEdit();
			this.textEditDebounceTimer = null;
		}, 150);
	}

	private applyTextEdit(): void {
		if (!this.textEditArea) return;
		const templateText = this.textEditArea.value;

		// Resolve any merge field templates in the text for canvas rendering
		const resolvedText = this.edit.mergeFields.resolve(templateText);

		// Update merge field binding for export to preserve templates
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (player && this.edit.mergeFields.isMergeFieldTemplate(templateText)) {
			player.setMergeFieldBinding("asset.text", {
				placeholder: templateText,
				resolvedValue: resolvedText
			});
		} else if (player) {
			player.removeMergeFieldBinding("asset.text");
		}

		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: { text: resolvedText } as ResolvedClip["asset"]
		});
		this.syncState();
	}

	// ─── Autocomplete for Merge Field Variables ─────────────────────────────────

	private checkAutocomplete(): void {
		if (!this.showMergeFields) return;
		if (!this.textEditArea) return;

		const pos = this.textEditArea.selectionStart;
		const text = this.textEditArea.value.substring(0, pos);
		const match = text.match(/\{\{\s*([A-Z_0-9]*)$/i);

		if (match) {
			this.autocompleteStartPos = pos - match[0].length;
			this.autocompleteFilter = match[1].toUpperCase();
			this.showAutocomplete();
		} else {
			this.hideAutocomplete();
		}
	}

	private showAutocomplete(): void {
		if (!this.autocompletePopup || !this.autocompleteItems) return;

		const fields = this.edit.mergeFields.getAll();
		const filtered = fields.filter((f: MergeField) => f.name.toUpperCase().includes(this.autocompleteFilter));

		if (filtered.length === 0) {
			this.hideAutocomplete();
			return;
		}

		// Reset selection if out of bounds
		if (this.selectedAutocompleteIndex >= filtered.length) {
			this.selectedAutocompleteIndex = 0;
		}

		this.autocompleteItems.innerHTML = filtered
			.map(
				(f: MergeField, i: number) => `
			<div class="ss-autocomplete-item${i === this.selectedAutocompleteIndex ? " selected" : ""}"
				 data-var-name="${f.name}">
				<span class="ss-autocomplete-var">{{ ${f.name} }}</span>
				${f.defaultValue ? `<span class="ss-autocomplete-preview">${f.defaultValue}</span>` : ""}
			</div>
		`
			)
			.join("");

		// Add click handlers
		this.autocompleteItems.querySelectorAll(".ss-autocomplete-item").forEach(item => {
			item.addEventListener("click", e => {
				e.stopPropagation();
				const el = e.currentTarget as HTMLElement;
				const { varName } = el.dataset;
				if (varName) {
					this.insertVariable(varName);
				}
			});
		});

		this.autocompletePopup.classList.add("visible");
		this.autocompleteVisible = true;
	}

	private hideAutocomplete(): void {
		if (this.autocompletePopup) {
			this.autocompletePopup.classList.remove("visible");
		}
		this.autocompleteVisible = false;
		this.selectedAutocompleteIndex = 0;
	}

	private insertVariable(varName: string): void {
		if (!this.textEditArea) return;

		const before = this.textEditArea.value.substring(0, this.autocompleteStartPos);
		const after = this.textEditArea.value.substring(this.textEditArea.selectionStart);

		// Build template string (keeps {{ VAR }})
		const templateText = `${before}{{ ${varName} }}${after}`;

		// Resolve for clipConfiguration (canvas rendering)
		const field = this.edit.mergeFields.get(varName);
		const resolvedValue = field?.defaultValue ?? `{{ ${varName} }}`;
		const resolvedText = `${before}${resolvedValue}${after}`;

		// Keep template in text area (user can see merge fields)
		this.textEditArea.value = templateText;

		// Position cursor after inserted template
		const newPos = this.autocompleteStartPos + varName.length + 6; // "{{ " + name + " }}"
		this.textEditArea.selectionStart = newPos;
		this.textEditArea.selectionEnd = newPos;
		this.textEditArea.focus();

		this.hideAutocomplete();

		// Update merge field binding for export to preserve templates
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (player) {
			player.setMergeFieldBinding("asset.text", {
				placeholder: templateText,
				resolvedValue: resolvedText
			});
		}

		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: { text: resolvedText } as ResolvedClip["asset"]
		});
		this.syncState();
	}

	private insertSelectedVariable(): void {
		const selected = this.autocompleteItems?.querySelector(".selected") as HTMLElement | null;
		if (!selected) return;

		const { varName } = selected.dataset;
		if (varName) {
			this.insertVariable(varName);
		}
	}

	private getFilteredFieldCount(): number {
		const fields = this.edit.mergeFields.getAll();
		return fields.filter((f: MergeField) => f.name.toUpperCase().includes(this.autocompleteFilter)).length;
	}

	private buildFontPicker(): void {
		if (!this.fontPopup) return;

		// Clean up existing picker
		if (this.fontPicker) {
			this.fontPicker.destroy();
			this.fontPicker = null;
		}

		const asset = this.getCurrentAsset();
		const currentFilename = asset?.font?.family;

		this.fontPicker = new FontPicker({
			selectedFilename: currentFilename,
			onSelect: font => this.selectGoogleFont(font),
			onClose: () => this.closeAllPopups()
		});

		this.fontPopup.innerHTML = "";
		this.fontPopup.appendChild(this.fontPicker.getElement());
	}

	private getDisplayName(fontFamily: string): string {
		// First check if it's a Google Font filename (hash)
		const googleFont = GOOGLE_FONTS_BY_FILENAME.get(fontFamily);
		if (googleFont) {
			return googleFont.displayName;
		}
		// Fall back to cleaning up font names: "Oswald-VariableFont" → "Oswald"
		return fontFamily.replace(/-VariableFont$/i, "").replace(/-/g, " ");
	}

	private selectGoogleFont(font: GoogleFont): void {
		// Add font URL to timeline.fonts via document layer (persists properly)
		const document = this.edit.getDocument();
		if (document) {
			document.addFont(font.url);
		}

		// Set the filename (hash) as the font family - this is what the backend expects
		this.updateClipProperty({ font: { family: font.filename } });

		// Clean up old font if no longer used by any clip
		this.edit.pruneUnusedFonts();

		this.closeAllPopups();
	}

	private updateVerticalAlign(align: "top" | "middle" | "bottom"): void {
		this.updateClipProperty({ align: { vertical: align } });
	}

	private cycleAlignment(asset: RichTextAsset): void {
		const current = asset.align?.horizontal ?? "center";
		const cycle: Array<"left" | "center" | "right"> = ["left", "center", "right"];
		const currentIdx = cycle.indexOf(current as "left" | "center" | "right");
		const nextIdx = (currentIdx + 1) % cycle.length;
		this.updateAlignment(cycle[nextIdx]);
	}

	private updateAlignment(align: "left" | "center" | "right"): void {
		this.updateClipProperty({ align: { horizontal: align } });
		this.updateAlignIcon(align);
	}

	private updateAlignIcon(align: "left" | "center" | "right"): void {
		if (!this.alignIcon) return;
		const paths: Record<string, string> = {
			left: "M3 5h18v2H3V5zm0 4h12v2H3V9zm0 4h18v2H3v-2zm0 4h12v2H3v-2z",
			center: "M3 5h18v2H3V5zm3 4h12v2H6V9zm-3 4h18v2H3v-2zm3 4h12v2H6v-2z",
			right: "M3 5h18v2H3V5zm6 4h12v2H9V9zm-6 4h18v2H3v-2zm6 4h12v2H9v-2z"
		};
		const path = this.alignIcon.querySelector("path");
		if (path) {
			path.setAttribute("d", paths[align]);
		}
	}

	private cycleTransform(asset: RichTextAsset): void {
		const current = asset.style?.textTransform ?? "none";
		const cycle: Array<"none" | "uppercase" | "lowercase"> = ["none", "uppercase", "lowercase"];
		const currentIdx = cycle.indexOf(current as "none" | "uppercase" | "lowercase");
		const nextIdx = (currentIdx + 1) % cycle.length;
		this.updateClipProperty({ style: { textTransform: cycle[nextIdx] } });
	}

	private toggleUnderline(asset: RichTextAsset): void {
		const current = asset.style?.textDecoration ?? "none";
		const newValue = current === "underline" ? "none" : "underline";
		this.updateClipProperty({ style: { textDecoration: newValue } });
	}

	private toggleLinethrough(asset: RichTextAsset): void {
		const current = asset.style?.textDecoration ?? "none";
		const newValue = current === "line-through" ? "none" : "line-through";
		this.updateClipProperty({ style: { textDecoration: newValue } });
	}

	private updateBorderProperty(updates: Partial<{ width: number; color: string; opacity: number; radius: number }>): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;
		const currentBorder = asset.border || { width: 0, color: "#000000", opacity: 1, radius: 0 };

		const updatedBorder = { ...currentBorder, ...updates };
		this.updateClipProperty({ border: updatedBorder });
	}

	private updateShadowProperty(updates: Partial<{ offsetX: number; offsetY: number; blur: number; color: string; opacity: number }>): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;
		const currentShadow = asset.shadow || { offsetX: 0, offsetY: 0, blur: 0, color: "#000000", opacity: 0.5 };

		const updatedShadow = { ...currentShadow, ...updates };
		this.updateClipProperty({ shadow: updatedShadow });
	}

	private updateAnimationProperty(updates: Partial<{ preset: string; duration: number; style: string; direction: string }>): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;
		const currentAnimation = asset.animation || { preset: "fadeIn" as const };

		const updatedAnimation = { ...currentAnimation, ...updates };
		this.updateClipProperty({ animation: updatedAnimation });

		// Update UI sections visibility when preset changes
		if (updates.preset) {
			this.updateAnimationSections(updates.preset);
		}
	}

	private updateAnimationSections(preset?: string): void {
		// style is allowed for: typewriter, shift, fadeIn, slideIn
		const stylePresets = ["typewriter", "shift", "fadeIn", "slideIn"];
		// direction is allowed for: ascend, shift, slideIn
		const directionPresets = ["ascend", "shift", "slideIn"];

		if (this.animationStyleSection) {
			this.animationStyleSection.style.display = preset && stylePresets.includes(preset) ? "block" : "none";
		}
		if (this.animationDirectionSection) {
			this.animationDirectionSection.style.display = preset && directionPresets.includes(preset) ? "block" : "none";
		}
	}

	private updateBackgroundProperty(updates: Partial<{ color?: string; opacity: number }>): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;
		const currentBackground = asset.background || { opacity: 1 };

		const updatedBackground = { ...currentBackground, ...updates };

		// If color is being removed and opacity is 1, remove background entirely
		if (!updatedBackground.color && updatedBackground.opacity === 1) {
			const { background, ...assetWithoutBackground } = asset;
			this.updateClipProperty(assetWithoutBackground);
		} else {
			this.updateClipProperty({ background: updatedBackground });
		}
	}

	private updatePaddingProperty(updates: Partial<{ top: number; right: number; bottom: number; left: number }>): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;

		// Get current padding (handle both number and object formats)
		let currentPadding: { top: number; right: number; bottom: number; left: number };

		if (typeof asset.padding === "number") {
			// Convert uniform padding to object format
			currentPadding = {
				top: asset.padding,
				right: asset.padding,
				bottom: asset.padding,
				left: asset.padding
			};
		} else if (asset.padding) {
			// Already object format
			currentPadding = { ...asset.padding };
		} else {
			// No padding set, use defaults
			currentPadding = { top: 0, right: 0, bottom: 0, left: 0 };
		}

		// Merge updates
		const updatedPadding = { ...currentPadding, ...updates };

		// Check if all sides are equal (can simplify to uniform padding)
		const allEqual =
			updatedPadding.top === updatedPadding.right && updatedPadding.right === updatedPadding.bottom && updatedPadding.bottom === updatedPadding.left;

		// If all sides are 0, remove padding entirely
		if (updatedPadding.top === 0 && updatedPadding.right === 0 && updatedPadding.bottom === 0 && updatedPadding.left === 0) {
			const { padding, ...assetWithoutPadding } = asset;
			this.updateClipProperty(assetWithoutPadding);
		}
		// If all sides are equal, use uniform padding (simpler format)
		else if (allEqual) {
			this.updateClipProperty({ padding: updatedPadding.top });
		}
		// Otherwise use object format
		else {
			this.updateClipProperty({ padding: updatedPadding });
		}
	}

	private updateFontColorProperty(updates: {
		color?: string;
		opacity?: number;
		background?: string;
		gradient?: { type: "linear" | "radial"; angle: number; stops: Array<{ offset: number; color: string }> };
	}): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;
		const currentFont = asset.font || {};

		const fontUpdates: Record<string, unknown> = { ...currentFont };

		// Handle solid color and opacity
		if (updates.color !== undefined) {
			fontUpdates["color"] = updates.color;
		}
		if (updates.opacity !== undefined) {
			fontUpdates["opacity"] = updates.opacity;
		}

		// Handle text highlight (font.background)
		if (updates.background !== undefined) {
			fontUpdates["background"] = updates.background;
		}

		// Handle gradient (stored in style.gradient)
		if (updates.gradient !== undefined) {
			const currentStyle = asset.style || {};
			this.updateClipProperty({
				font: fontUpdates,
				style: { ...currentStyle, gradient: updates.gradient }
			});
			return;
		}

		// Clear gradient when setting solid color
		const currentStyle = asset.style || ({} as Record<string, unknown>);
		if ((updates.color !== undefined || updates.opacity !== undefined) && currentStyle.gradient) {
			this.updateClipProperty({
				font: fontUpdates,
				style: { ...currentStyle, gradient: undefined }
			});
			return;
		}

		// Apply updates
		this.updateClipProperty({
			font: fontUpdates
		});
	}

	private updateClipProperty(assetUpdates: Record<string, unknown>): void {
		const updates: Partial<ResolvedClip> = { asset: assetUpdates as ResolvedClip["asset"] };
		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		this.syncState();
	}

	private applyClipUpdate(updates: Record<string, unknown>): void {
		if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [
			this.sizePopup,
			this.weightPopup,
			this.spacingPopup,
			this.stylePopup,
			this.fontPopup,
			this.textEditPopup,
			this.fontColorPopup,
			this.animationPopup,
			this.transitionPopup,
			this.effectPopup
		];
	}

	protected override syncState(): void {
		const asset = this.getCurrentAsset();
		if (!asset) return;

		// Update weight preview to show current weight name
		if (this.weightPreview) {
			this.weightPreview.textContent = this.getWeightName(asset.font?.weight);
		}

		if (this.sizeInput) {
			this.sizeInput.value = String(asset.font?.size ?? 48);
		}

		if (this.fontPreview) {
			const fontFamily = asset.font?.family ?? "Roboto";
			this.fontPreview.textContent = this.getDisplayName(fontFamily);
			this.fontPreview.style.fontFamily = `'${fontFamily}', sans-serif`;
		}

		if (this.colorDisplay) {
			const color = asset.font?.color ?? "#000000";
			this.colorDisplay.style.backgroundColor = color;
		}

		// Sync spacing panel
		this.spacingPanel?.setState(asset.style?.letterSpacing ?? 0, asset.style?.lineHeight ?? 1.2);

		const verticalAlign = asset.align?.vertical ?? "middle";
		this.setButtonActive(this.anchorTopBtn, verticalAlign === "top");
		this.setButtonActive(this.anchorMiddleBtn, verticalAlign === "middle");
		this.setButtonActive(this.anchorBottomBtn, verticalAlign === "bottom");

		const align = asset.align?.horizontal ?? "center";
		this.updateAlignIcon(align as "left" | "center" | "right");

		const transform = asset.style?.textTransform ?? "none";
		if (this.transformBtn) {
			let transformLabel = "Aa";
			if (transform === "uppercase") {
				transformLabel = "AA";
			} else if (transform === "lowercase") {
				transformLabel = "aa";
			}
			this.transformBtn.textContent = transformLabel;
			this.setButtonActive(this.transformBtn, transform !== "none");
		}

		const isUnderline = asset.style?.textDecoration === "underline";
		this.setButtonActive(this.underlineBtn, isUnderline);

		const isLinethrough = asset.style?.textDecoration === "line-through";
		this.setButtonActive(this.linethroughBtn, isLinethrough);

		// Sync StylePanel (consolidated border/padding/shadow/fill)
		if (this.stylePanel) {
			// Border
			const border = asset.border || { width: 0, color: "#000000", opacity: 1, radius: 0 };
			this.stylePanel.setBorderState({
				width: border.width,
				color: border.color,
				opacity: Math.round(border.opacity * 100),
				radius: border.radius
			});

			// Shadow (blur fixed at 4 - canvas only checks blur > 0, doesn't implement actual blur)
			const { shadow } = asset;
			this.stylePanel.setShadowState({
				enabled: !!shadow,
				offsetX: shadow?.offsetX ?? 0,
				offsetY: shadow?.offsetY ?? 0,
				blur: shadow?.blur ?? 4,
				color: shadow?.color ?? "#000000",
				opacity: shadow ? Math.round(shadow.opacity * 100) : 50
			});

			// Padding (handled below, needs special normalization)
		}

		// Background fill sync
		if (this.backgroundColorPicker) {
			const { background } = asset;
			this.backgroundColorPicker.setColor(background?.color || "#FFFFFF");
			this.backgroundColorPicker.setOpacity((background?.opacity ?? 1) * 100);
		}

		// Animation
		const { animation } = asset;
		this.container?.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["preset"] === animation?.preset);
		});
		if (this.animationDurationSlider && this.animationDurationValue) {
			const duration = animation?.duration ?? 1;
			this.animationDurationSlider.value = String(duration);
			this.animationDurationValue.textContent = `${duration.toFixed(1)}s`;
		}
		this.container?.querySelectorAll<HTMLButtonElement>("[data-animation-style]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["animationStyle"] === animation?.style);
		});
		this.container?.querySelectorAll<HTMLButtonElement>("[data-animation-direction]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["animationDirection"] === animation?.direction);
		});
		this.updateAnimationSections(animation?.preset);

		// Padding - sync with StylePanel
		if (this.stylePanel) {
			const padding =
				typeof asset.padding === "number"
					? { top: asset.padding, right: asset.padding, bottom: asset.padding, left: asset.padding }
					: {
							top: asset.padding?.top ?? 0,
							right: asset.padding?.right ?? 0,
							bottom: asset.padding?.bottom ?? 0,
							left: asset.padding?.left ?? 0
						};
			this.stylePanel.setPaddingState(padding);
		}

		// Get clip for transition and effect values
		const clip = this.edit.getClip(this.selectedTrackIdx, this.selectedClipIdx);

		// Sync composite panels
		this.transitionPanel?.setFromClip(clip?.transition as { in?: string; out?: string } | undefined);
		this.effectPanel?.setFromClip((clip?.effect as string) ?? "");
	}

	override dispose(): void {
		// Clean up event listener before super.dispose() removes container
		if (this.boundHandleClick) {
			this.container?.removeEventListener("click", this.boundHandleClick);
			this.boundHandleClick = null;
		}
		super.dispose();
		this.sizeInput = null;
		this.sizePopup = null;
		this.weightPopup = null;
		this.weightPreview = null;
		this.fontPopup = null;
		this.fontPreview = null;
		this.fontPicker?.destroy();
		this.fontPicker = null;

		this.fontColorPicker?.dispose();
		this.fontColorPicker = null;
		this.fontColorPopup = null;
		this.colorDisplay = null;

		this.spacingPopup = null;
		this.spacingPanel?.dispose();
		this.spacingPanel = null;
		this.stylePopup = null;
		this.stylePanel?.dispose();
		this.stylePanel = null;
		this.anchorTopBtn = null;
		this.anchorMiddleBtn = null;
		this.anchorBottomBtn = null;
		this.alignIcon = null;
		this.transformBtn = null;
		this.underlineBtn = null;
		this.linethroughBtn = null;
		this.textEditPopup = null;
		this.textEditArea = null;
		if (this.textEditDebounceTimer) {
			clearTimeout(this.textEditDebounceTimer);
			this.textEditDebounceTimer = null;
		}
		this.borderPopup = null;
		this.borderWidthSlider = null;
		this.borderWidthValue = null;
		this.borderColorInput = null;
		this.borderOpacitySlider = null;
		this.borderOpacityValue = null;
		this.borderRadiusSlider = null;
		this.borderRadiusValue = null;

		this.animationPopup = null;
		this.animationDurationSlider = null;
		this.animationDurationValue = null;
		this.animationStyleSection = null;
		this.animationDirectionSection = null;

		this.backgroundColorPicker?.dispose();
		this.backgroundColorPicker = null;
		this.backgroundPopup = null;

		this.paddingPopup = null;
		this.paddingTopSlider = null;
		this.paddingTopValue = null;
		this.paddingRightSlider = null;
		this.paddingRightValue = null;
		this.paddingBottomSlider = null;
		this.paddingBottomValue = null;
		this.paddingLeftSlider = null;
		this.paddingLeftValue = null;

		// Dispose composite panels (auto-cleans events via EventManager)
		this.transitionPanel?.dispose();
		this.transitionPanel = null;
		this.transitionPopup = null;

		this.effectPanel?.dispose();
		this.effectPanel = null;
		this.effectPopup = null;
	}
}
