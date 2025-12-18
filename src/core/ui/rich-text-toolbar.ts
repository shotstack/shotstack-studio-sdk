import type { Edit } from "@core/edit";
import { InternalEvent } from "@core/events/edit-events";
import type { MergeField } from "@core/merge";
import type { ResolvedClip } from "@schemas/clip";
import type { RichTextAsset } from "@schemas/rich-text-asset";
import { injectShotstackStyles } from "@styles/inject";

import { BackgroundColorPicker } from "./background-color-picker";
import { BaseToolbar, BUILT_IN_FONTS, FONT_SIZES } from "./base-toolbar";
import { EffectPanel } from "./composites/EffectPanel";
import { SpacingPanel } from "./composites/SpacingPanel";
import { TransitionPanel } from "./composites/TransitionPanel";
import { FontColorPicker } from "./font-color-picker";

export class RichTextToolbar extends BaseToolbar {
	private fontPopup: HTMLDivElement | null = null;
	private fontPreview: HTMLSpanElement | null = null;
	private sizeInput: HTMLInputElement | null = null;
	private sizePopup: HTMLDivElement | null = null;
	private boldBtn: HTMLButtonElement | null = null;
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

	private shadowPopup: HTMLDivElement | null = null;
	private shadowToggle: HTMLInputElement | null = null;
	private shadowOffsetXSlider: HTMLInputElement | null = null;
	private shadowOffsetXValue: HTMLSpanElement | null = null;
	private shadowOffsetYSlider: HTMLInputElement | null = null;
	private shadowOffsetYValue: HTMLSpanElement | null = null;
	private shadowBlurSlider: HTMLInputElement | null = null;
	private shadowBlurValue: HTMLSpanElement | null = null;
	private shadowColorInput: HTMLInputElement | null = null;
	private shadowOpacitySlider: HTMLInputElement | null = null;
	private shadowOpacityValue: HTMLSpanElement | null = null;
	private lastShadowConfig: { offsetX: number; offsetY: number; blur: number; color: string; opacity: number } | null = null;

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

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-toolbar";

		this.container.innerHTML = `
			<div class="ss-toolbar-dropdown">
				<button data-action="text-edit-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Edit text">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
					</svg>
					<span>Text</span>
				</button>
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

			<button data-action="bold" class="ss-toolbar-btn ss-toolbar-btn--text" title="Bold">B</button>

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
				<button data-action="background-toggle" class="ss-toolbar-btn" title="Background Fill">
					<svg width="16" height="16" viewBox="0 0 491.879 491.879" fill="currentColor">
						<path d="M462.089,151.673h-88.967c2.115,10.658,2.743,21.353,1.806,31.918h85.05v247.93H212.051v-59.488l-11.615,11.609 c-5.921,5.733-12.882,10.113-20.304,13.591v36.4c0,16.423,13.363,29.79,29.791,29.79h252.166c16.425,0,29.79-13.367,29.79-29.79 V181.467C491.879,165.039,478.514,151.673,462.089,151.673z"/>
						<path d="M333.156,201.627c-1.527-3.799-0.837-6.296,0.225-10.065c0.311-1.124,0.613-2.205,0.855-3.3 c3.189-14.43,1.178-31.357-5.57-46.378c-8.859-19.715-24.563-41.406-44.258-61.103c-32.759-32.773-67.686-52.324-93.457-52.324 c-9.418,0-16.406,2.624-21.658,6.136L9.937,192.753c-26.248,27.201,3.542,81.343,42.343,120.142 c32.738,32.738,67.667,52.289,93.419,52.289c13.563,0,22.081-5.506,26.943-10.192l109.896-109.863 c-0.998,3.653-1.478,6.683-1.478,9.243c0,20.097,16.359,36.459,36.475,36.459c20.115,0,36.494-16.362,36.494-36.459 C354.029,250.907,354.029,240.375,333.156,201.627z M146.649,326.792c-10.341-0.163-37.364-11.113-67.284-40.984 c-32.884-32.902-42.807-61.614-42.084-66.191L160.646,96.242c0.289,0.676,0.561,1.335,0.885,2.011 c8.842,19.712,24.559,41.422,44.256,61.118c20.645,20.645,43.046,36.556,63.225,45.079L146.649,326.792z M281.898,149.465 c-10.629,0-27.218-5.104-46.128-14.46l-2.88-2.723c-16.508-16.523-29.439-34.173-36.412-49.717c-3.4-7.634-4.445-12.88-4.622-15.75 c10.724,0.614,36.153,11.76,65.464,41.069c13.045,13.061,24.074,27.23,31.551,40.551 C287.005,149.127,284.632,149.465,281.898,149.465z"/>
					</svg>
				</button>
				<div data-background-popup class="ss-toolbar-popup ss-toolbar-popup--background">
					<div data-background-color-picker></div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="padding-toggle" class="ss-toolbar-btn" title="Padding">
					<svg width="16" height="16" viewBox="0 0 15 15" fill="none">
						<path fill-rule="evenodd" clip-rule="evenodd" d="M2.85714 2H12.1429C12.6162 2 13 2.38376 13 2.85714V12.1429C13 12.6162 12.6162 13 12.1429 13H2.85714C2.38376 13 2 12.6162 2 12.1429V2.85714C2 2.38376 2.38376 2 2.85714 2ZM1 2.85714C1 1.83147 1.83147 1 2.85714 1H12.1429C13.1685 1 14 1.83147 14 2.85714V12.1429C14 13.1685 13.1685 14 12.1429 14H2.85714C1.83147 14 1 13.1685 1 12.1429V2.85714ZM7.49988 5.00012C7.77602 5.00012 7.99988 4.77626 7.99988 4.50012C7.99988 4.22398 7.77602 4.00012 7.49988 4.00012C7.22374 4.00012 6.99988 4.22398 6.99988 4.50012C6.99988 4.77626 7.22374 5.00012 7.49988 5.00012ZM4.49988 11.0001C4.77602 11.0001 4.99988 10.7763 4.99988 10.5001C4.99988 10.224 4.77602 10.0001 4.49988 10.0001C4.22374 10.0001 3.99988 10.224 3.99988 10.5001C3.99988 10.7763 4.22374 11.0001 4.49988 11.0001ZM4.99988 7.50012C4.99988 7.77626 4.77602 8.00012 4.49988 8.00012C4.22374 8.00012 3.99988 7.77626 3.99988 7.50012C3.99988 7.22398 4.22374 7.00012 4.49988 7.00012C4.77602 7.00012 4.99988 7.22398 4.99988 7.50012ZM4.49988 5.00012C4.77602 5.00012 4.99988 4.77626 4.99988 4.50012C4.99988 4.22398 4.77602 4.00012 4.49988 4.00012C4.22374 4.00012 3.99988 4.22398 3.99988 4.50012C3.99988 4.77626 4.22374 5.00012 4.49988 5.00012ZM10.9999 10.5001C10.9999 10.7763 10.776 11.0001 10.4999 11.0001C10.2237 11.0001 9.99988 10.7763 9.99988 10.5001C9.99988 10.224 10.2237 10.0001 10.4999 10.0001C10.776 10.0001 10.9999 10.224 10.9999 10.5001ZM10.4999 8.00012C10.776 8.00012 10.9999 7.77626 10.9999 7.50012C10.9999 7.22398 10.776 7.00012 10.4999 7.00012C10.2237 7.00012 9.99988 7.22398 9.99988 7.50012C9.99988 7.77626 10.2237 8.00012 10.4999 8.00012ZM10.9999 4.50012C10.9999 4.77626 10.776 5.00012 10.4999 5.00012C10.2237 5.00012 9.99988 4.77626 9.99988 4.50012C9.99988 4.22398 10.2237 4.00012 10.4999 4.00012C10.776 4.00012 10.9999 4.22398 10.9999 4.50012ZM7.49988 11.0001C7.77602 11.0001 7.99988 10.7763 7.99988 10.5001C7.99988 10.224 7.77602 10.0001 7.49988 10.0001C7.22374 10.0001 6.99988 10.224 6.99988 10.5001C6.99988 10.7763 7.22374 11.0001 7.49988 11.0001Z" fill="currentColor"/>
					</svg>
				</button>
				<div data-padding-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-header">Padding</div>

					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Top</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-padding-top-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
							<span data-padding-top-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>

					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Right</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-padding-right-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
							<span data-padding-right-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>

					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Bottom</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-padding-bottom-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
							<span data-padding-bottom-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>

					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Left</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-padding-left-slider class="ss-toolbar-slider" min="0" max="100" value="0" />
							<span data-padding-left-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
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

			<div class="ss-toolbar-dropdown">
				<button data-action="border-toggle" class="ss-toolbar-btn" title="Border">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="5" y="5" width="14" height="14" rx="2.5"/>
					</svg>
				</button>
				<div data-border-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Width</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-border-width-slider class="ss-toolbar-slider" min="0" max="20" step="1" value="0" />
							<span data-border-width-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color & Opacity</div>
						<div class="ss-toolbar-popup-row">
							<div class="ss-toolbar-color-wrap">
								<input type="color" data-border-color class="ss-toolbar-color" value="#000000" />
							</div>
							<input type="range" data-border-opacity-slider class="ss-toolbar-slider" min="0" max="100" value="100" />
							<span data-border-opacity-value class="ss-toolbar-popup-value">100</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Corner Rounding</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-border-radius-slider class="ss-toolbar-slider" min="0" max="100" step="1" value="0" />
							<span data-border-radius-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="shadow-toggle" class="ss-toolbar-btn" title="Text Shadow">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
						<circle cx="6" cy="10" r="5.5" fill="currentColor" stroke="currentColor" fill-opacity="0.15"></circle>
						<path stroke="currentColor" stroke-opacity="0.5" d="m3.68 14.973 6.594-6.594M2.26 13.722l6.233-6.233m-7.45 4.779 9.231-9.231M.479 10.16l7.124-7.123m-1.776 12.46 5.661-5.661"></path>
						<circle cx="10" cy="6" r="5.5" fill="#18181b" stroke="currentColor"></circle>
					</svg>
				</button>
				<div data-shadow-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-row">
							<span class="ss-toolbar-popup-label">Enable Shadow</span>
							<input type="checkbox" data-shadow-toggle class="ss-toolbar-checkbox" />
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Offset X</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-shadow-offset-x class="ss-toolbar-slider" min="-20" max="20" value="0" />
							<span data-shadow-offset-x-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Offset Y</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-shadow-offset-y class="ss-toolbar-slider" min="-20" max="20" value="0" />
							<span data-shadow-offset-y-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Blur</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-shadow-blur class="ss-toolbar-slider" min="0" max="100" value="0" />
							<span data-shadow-blur-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color & Opacity</div>
						<div class="ss-toolbar-popup-row">
							<div class="ss-toolbar-color-wrap">
								<input type="color" data-shadow-color class="ss-toolbar-color" value="#000000" />
							</div>
							<input type="range" data-shadow-opacity class="ss-toolbar-slider" min="0" max="100" value="50" />
							<span data-shadow-opacity-value class="ss-toolbar-popup-value">50</span>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="animation-toggle" class="ss-toolbar-btn ss-toolbar-btn--text" title="Animation" style="width: auto; padding: 0 8px;">
					Animate
				</button>
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
				<button data-action="transition-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Transition">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 3v18"/><path d="M5 12H2l3-3 3 3H5"/><path d="M19 12h3l-3 3-3-3h3"/>
					</svg>
					<span>Transition</span>
				</button>
				<div data-transition-popup class="ss-toolbar-popup ss-toolbar-popup--transition"></div>
			</div>

			<div class="ss-toolbar-dropdown">
				<button data-action="effect-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Effect">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M1 12h4M19 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
					</svg>
					<span>Effect</span>
				</button>
				<div data-effect-popup class="ss-toolbar-popup ss-toolbar-popup--effect"></div>
			</div>

			<div class="ss-toolbar-divider"></div>

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
		`;

		this.sizeInput = this.container.querySelector("[data-size-input]");
		this.sizePopup = this.container.querySelector("[data-size-popup]");
		this.boldBtn = this.container.querySelector("[data-action='bold']");
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

		this.container.addEventListener("click", this.handleClick.bind(this));

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

		// Shadow controls
		this.shadowPopup = this.container.querySelector("[data-shadow-popup]");
		this.shadowToggle = this.container.querySelector("[data-shadow-toggle]");
		this.shadowOffsetXSlider = this.container.querySelector("[data-shadow-offset-x]");
		this.shadowOffsetXValue = this.container.querySelector("[data-shadow-offset-x-value]");
		this.shadowOffsetYSlider = this.container.querySelector("[data-shadow-offset-y]");
		this.shadowOffsetYValue = this.container.querySelector("[data-shadow-offset-y-value]");
		this.shadowBlurSlider = this.container.querySelector("[data-shadow-blur]");
		this.shadowBlurValue = this.container.querySelector("[data-shadow-blur-value]");
		this.shadowColorInput = this.container.querySelector("[data-shadow-color]");
		this.shadowOpacitySlider = this.container.querySelector("[data-shadow-opacity]");
		this.shadowOpacityValue = this.container.querySelector("[data-shadow-opacity-value]");

		this.shadowToggle?.addEventListener("change", e => {
			const enabled = (e.target as HTMLInputElement).checked;
			if (enabled) {
				// Restore previous config or use defaults
				const config = this.lastShadowConfig || { offsetX: 2, offsetY: 2, blur: 4, color: "#000000", opacity: 0.5 };
				this.updateShadowProperty(config);
			} else {
				// Store current config before disabling
				const asset = this.getCurrentAsset();
				if (asset?.shadow) {
					this.lastShadowConfig = { ...asset.shadow };
				}
				this.updateClipProperty({ shadow: undefined });
			}
		});

		this.shadowOffsetXSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.shadowOffsetXValue) this.shadowOffsetXValue.textContent = String(value);
			this.updateShadowProperty({ offsetX: value });
		});

		this.shadowOffsetYSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.shadowOffsetYValue) this.shadowOffsetYValue.textContent = String(value);
			this.updateShadowProperty({ offsetY: value });
		});

		this.shadowBlurSlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.shadowBlurValue) this.shadowBlurValue.textContent = String(value);
			this.updateShadowProperty({ blur: value });
		});

		this.shadowColorInput?.addEventListener("input", e => {
			this.updateShadowProperty({ color: (e.target as HTMLInputElement).value });
		});

		this.shadowOpacitySlider?.addEventListener("input", e => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.shadowOpacityValue) this.shadowOpacityValue.textContent = String(value);
			this.updateShadowProperty({ opacity: value / 100 });
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

		this.backgroundPopup = this.container.querySelector("[data-background-popup]");
		const backgroundPickerContainer = this.container.querySelector("[data-background-color-picker]");

		if (backgroundPickerContainer) {
			this.backgroundColorPicker = new BackgroundColorPicker();
			this.backgroundColorPicker.mount(backgroundPickerContainer as HTMLElement);
			this.backgroundColorPicker.onChange((color, opacity) => {
				this.updateBackgroundProperty({ color, opacity });
			});
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
			case "bold":
				this.toggleBold(asset);
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
			case "border-toggle":
				this.toggleBorderPopup();
				break;
			case "shadow-toggle":
				this.toggleShadowPopup();
				break;
			case "background-toggle":
				this.toggleBackgroundPopup();
				break;
			case "padding-toggle":
				this.togglePaddingPopup();
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

	private toggleBold(asset: RichTextAsset): void {
		const currentWeight = String(asset.font?.weight ?? "400");
		const isBold = currentWeight === "700" || currentWeight === "bold";
		this.updateClipProperty({ font: { weight: isBold ? "400" : "700" } });
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

	private toggleBorderPopup(): void {
		this.togglePopup(this.borderPopup);
	}

	private toggleShadowPopup(): void {
		this.togglePopup(this.shadowPopup);
	}

	private toggleAnimationPopup(): void {
		this.togglePopup(this.animationPopup, () => {
			const asset = this.getCurrentAsset();
			this.updateAnimationSections(asset?.animation?.preset);
		});
	}

	private toggleBackgroundPopup(): void {
		this.togglePopup(this.backgroundPopup, () => {
			if (this.backgroundColorPicker) {
				const asset = this.getCurrentAsset();
				const background = asset?.background;
				this.backgroundColorPicker.setColor(background?.color || "#FFFFFF");
				this.backgroundColorPicker.setOpacity((background?.opacity ?? 1) * 100);
			}
		});
	}

	private togglePaddingPopup(): void {
		this.togglePopup(this.paddingPopup);
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
					if (font?.background) {
						this.fontColorPicker.setHighlight(font.background);
					}
				}
			}
		});
	}

	private toggleFontPopup(): void {
		this.togglePopup(this.fontPopup, () => this.buildFontList());
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

	private buildFontList(): void {
		if (!this.fontPopup) return;

		const asset = this.getCurrentAsset();
		const currentFont = asset?.font?.family ?? "Roboto";
		const customFonts = this.getCustomFonts();

		let html = "";

		if (customFonts.length > 0) {
			html += `<div class="ss-toolbar-font-section">
				<div class="ss-toolbar-font-section-header">Custom</div>
				${customFonts.map(f => this.renderFontItem(f, currentFont)).join("")}
			</div>`;
		}

		html += `<div class="ss-toolbar-font-section">
			<div class="ss-toolbar-font-section-header">Built-in</div>
			${BUILT_IN_FONTS.map(f => this.renderFontItem(f, currentFont)).join("")}
		</div>`;

		this.fontPopup.innerHTML = html;

		// Attach click handlers to font items
		this.fontPopup.querySelectorAll("[data-font-family]").forEach(item => {
			item.addEventListener("click", () => {
				const family = (item as HTMLElement).dataset["fontFamily"];
				if (family) {
					this.selectFont(family);
				}
			});
		});
	}

	private renderFontItem(fontFamily: string, currentFont: string): string {
		const isActive = fontFamily === currentFont;
		const displayName = this.getDisplayName(fontFamily);
		return `<div class="ss-toolbar-font-item${isActive ? " active" : ""}" data-font-family="${fontFamily}">
			<span class="ss-toolbar-font-name" style="font-family: '${fontFamily}', sans-serif">${displayName}</span>
		</div>`;
	}

	private getDisplayName(fontFamily: string): string {
		// Clean up font names: "Oswald-VariableFont" → "Oswald"
		return fontFamily.replace(/-VariableFont$/i, "").replace(/-/g, " ");
	}

	private getCustomFonts(): string[] {
		const edit = this.edit.getEdit();
		return (edit.timeline.fonts ?? []).map(f => {
			const filename = f.src.split("/").pop() || "";
			return filename.replace(/\.(ttf|otf|woff2?)$/i, "");
		});
	}

	private selectFont(fontFamily: string): void {
		this.updateClipProperty({ font: { family: fontFamily } });
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
			this.spacingPopup,
			this.borderPopup,
			this.shadowPopup,
			this.backgroundPopup,
			this.paddingPopup,
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

		// Check if bold is supported by the current font
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		const supportsBold = (player as { supportsBold?: () => boolean })?.supportsBold?.() ?? true;
		if (this.boldBtn) {
			this.boldBtn.style.display = supportsBold ? "" : "none";
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
		this.spacingPanel?.setState(
			asset.style?.letterSpacing ?? 0,
			asset.style?.lineHeight ?? 1.2
		);

		const verticalAlign = asset.align?.vertical ?? "middle";
		this.setButtonActive(this.anchorTopBtn, verticalAlign === "top");
		this.setButtonActive(this.anchorMiddleBtn, verticalAlign === "middle");
		this.setButtonActive(this.anchorBottomBtn, verticalAlign === "bottom");

		const isBold = String(asset.font?.weight ?? "400") === "700" || String(asset.font?.weight ?? "400") === "bold";
		this.setButtonActive(this.boldBtn, isBold);

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

		const border = asset.border || { width: 0, color: "#000000", opacity: 1, radius: 0 };
		if (this.borderWidthSlider && this.borderWidthValue) {
			this.borderWidthSlider.value = String(border.width);
			this.borderWidthValue.textContent = String(border.width);
		}
		if (this.borderColorInput) {
			this.borderColorInput.value = border.color;
		}
		if (this.borderOpacitySlider && this.borderOpacityValue) {
			const opacityPercent = Math.round(border.opacity * 100);
			this.borderOpacitySlider.value = String(opacityPercent);
			this.borderOpacityValue.textContent = String(opacityPercent);
		}
		if (this.borderRadiusSlider && this.borderRadiusValue) {
			this.borderRadiusSlider.value = String(border.radius);
			this.borderRadiusValue.textContent = String(border.radius);
		}

		// Shadow
		const { shadow } = asset;
		if (this.shadowToggle) {
			this.shadowToggle.checked = !!shadow;
		}
		if (shadow) {
			if (this.shadowOffsetXSlider && this.shadowOffsetXValue) {
				this.shadowOffsetXSlider.value = String(shadow.offsetX);
				this.shadowOffsetXValue.textContent = String(shadow.offsetX);
			}
			if (this.shadowOffsetYSlider && this.shadowOffsetYValue) {
				this.shadowOffsetYSlider.value = String(shadow.offsetY);
				this.shadowOffsetYValue.textContent = String(shadow.offsetY);
			}
			if (this.shadowBlurSlider && this.shadowBlurValue) {
				this.shadowBlurSlider.value = String(shadow.blur);
				this.shadowBlurValue.textContent = String(shadow.blur);
			}
			if (this.shadowColorInput) {
				this.shadowColorInput.value = shadow.color;
			}
			if (this.shadowOpacitySlider && this.shadowOpacityValue) {
				const opacityPercent = Math.round(shadow.opacity * 100);
				this.shadowOpacitySlider.value = String(opacityPercent);
				this.shadowOpacityValue.textContent = String(opacityPercent);
			}
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

		// Padding
		if (this.paddingTopSlider && this.paddingRightSlider && this.paddingBottomSlider && this.paddingLeftSlider) {
			let top = 0;
			let right = 0;
			let bottom = 0;
			let left = 0;

			if (typeof asset.padding === "number") {
				// Uniform padding
				top = asset.padding;
				right = asset.padding;
				bottom = asset.padding;
				left = asset.padding;
			} else if (asset.padding) {
				// Object padding
				top = asset.padding.top ?? 0;
				right = asset.padding.right ?? 0;
				bottom = asset.padding.bottom ?? 0;
				left = asset.padding.left ?? 0;
			}

			this.paddingTopSlider.value = String(top);
			if (this.paddingTopValue) this.paddingTopValue.textContent = String(top);

			this.paddingRightSlider.value = String(right);
			if (this.paddingRightValue) this.paddingRightValue.textContent = String(right);

			this.paddingBottomSlider.value = String(bottom);
			if (this.paddingBottomValue) this.paddingBottomValue.textContent = String(bottom);

			this.paddingLeftSlider.value = String(left);
			if (this.paddingLeftValue) this.paddingLeftValue.textContent = String(left);
		}

		// Get clip for transition and effect values
		const clip = this.edit.getClip(this.selectedTrackIdx, this.selectedClipIdx);

		// Sync composite panels
		this.transitionPanel?.setFromClip(clip?.transition as { in?: string; out?: string } | undefined);
		this.effectPanel?.setFromClip((clip?.effect as string) ?? "");
	}

	override dispose(): void {
		super.dispose();
		this.sizeInput = null;
		this.sizePopup = null;
		this.boldBtn = null;
		this.fontPopup = null;
		this.fontPreview = null;

		this.fontColorPicker?.dispose();
		this.fontColorPicker = null;
		this.fontColorPopup = null;
		this.colorDisplay = null;

		this.spacingPopup = null;
		this.spacingPanel?.dispose();
		this.spacingPanel = null;
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

		this.shadowPopup = null;
		this.shadowToggle = null;
		this.shadowOffsetXSlider = null;
		this.shadowOffsetXValue = null;
		this.shadowOffsetYSlider = null;
		this.shadowOffsetYValue = null;
		this.shadowBlurSlider = null;
		this.shadowBlurValue = null;
		this.shadowColorInput = null;
		this.shadowOpacitySlider = null;
		this.shadowOpacityValue = null;
		this.lastShadowConfig = null;

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
