import type { Edit } from "@core/edit";
import { FONT_PATHS } from "@core/fonts/font-config";
import type { ResolvedClip } from "@schemas/clip";
import type { RichTextAsset } from "@schemas/rich-text-asset";

import { TOOLBAR_STYLES } from "./rich-text-toolbar.css";
import { BackgroundColorPicker } from "./background-color-picker";

/** Built-in font families (base names only, without weight variants) */
const BUILT_IN_FONTS = [
	"Arapey",
	"Clear Sans",
	"Didact Gothic",
	"Montserrat",
	"MovLette",
	"Open Sans",
	"Permanent Marker",
	"Roboto",
	"Sue Ellen Francisco",
	"Work Sans"
];

/** Preset font sizes for the dropdown */
const FONT_SIZES = [6, 8, 10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96, 128];

export class RichTextToolbar {
	private container: HTMLDivElement | null = null;
	private edit: Edit;
	private selectedTrackIdx = -1;
	private selectedClipIdx = -1;

	private fontBtn: HTMLButtonElement | null = null;
	private fontPopup: HTMLDivElement | null = null;
	private fontPreview: HTMLSpanElement | null = null;
	private sizeInput: HTMLInputElement | null = null;
	private sizePopup: HTMLDivElement | null = null;
	private boldBtn: HTMLButtonElement | null = null;
	private colorInput: HTMLInputElement | null = null;
	private opacityBtn: HTMLButtonElement | null = null;
	private opacityPopup: HTMLDivElement | null = null;
	private opacitySlider: HTMLInputElement | null = null;
	private opacityValue: HTMLSpanElement | null = null;
	private spacingBtn: HTMLButtonElement | null = null;
	private spacingPopup: HTMLDivElement | null = null;
	private letterSpacingSlider: HTMLInputElement | null = null;
	private letterSpacingValue: HTMLSpanElement | null = null;
	private lineHeightSlider: HTMLInputElement | null = null;
	private lineHeightValue: HTMLSpanElement | null = null;
	private anchorTopBtn: HTMLButtonElement | null = null;
	private anchorMiddleBtn: HTMLButtonElement | null = null;
	private anchorBottomBtn: HTMLButtonElement | null = null;
	private alignBtn: HTMLButtonElement | null = null;
	private alignIcon: SVGElement | null = null;
	private transformBtn: HTMLButtonElement | null = null;
	private underlineBtn: HTMLButtonElement | null = null;
	private textEditBtn: HTMLButtonElement | null = null;
	private textEditPopup: HTMLDivElement | null = null;
	private textEditArea: HTMLTextAreaElement | null = null;
	private textEditDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private borderBtn: HTMLButtonElement | null = null;
	private borderPopup: HTMLDivElement | null = null;
	private borderWidthSlider: HTMLInputElement | null = null;
	private borderWidthValue: HTMLSpanElement | null = null;
	private borderColorInput: HTMLInputElement | null = null;
	private borderOpacitySlider: HTMLInputElement | null = null;
	private borderOpacityValue: HTMLSpanElement | null = null;
	private borderRadiusSlider: HTMLInputElement | null = null;
	private borderRadiusValue: HTMLSpanElement | null = null;
	private backgroundBtn: HTMLButtonElement | null = null;
	private backgroundPopup: HTMLDivElement | null = null;
	private backgroundColorPicker: BackgroundColorPicker | null = null;

	private paddingBtn: HTMLButtonElement | null = null;
	private paddingPopup: HTMLDivElement | null = null;
	private paddingTopSlider: HTMLInputElement | null = null;
	private paddingTopValue: HTMLSpanElement | null = null;
	private paddingRightSlider: HTMLInputElement | null = null;
	private paddingRightValue: HTMLSpanElement | null = null;
	private paddingBottomSlider: HTMLInputElement | null = null;
	private paddingBottomValue: HTMLSpanElement | null = null;
	private paddingLeftSlider: HTMLInputElement | null = null;
	private paddingLeftValue: HTMLSpanElement | null = null;

	private styleElement: HTMLStyleElement | null = null;

	constructor(edit: Edit) {
		this.edit = edit;
	}

	mount(parent: HTMLElement): void {
		this.injectStyles();

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
					<textarea data-text-edit-area class="ss-toolbar-text-area" rows="4" placeholder="Enter text..."></textarea>
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
				<button data-action="font-toggle" class="ss-toolbar-btn ss-toolbar-btn--font" title="Font">
					<span data-font-preview class="ss-toolbar-font-preview">Aa</span>
					<svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" class="ss-toolbar-chevron">
						<path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
					</svg>
				</button>
				<div data-font-popup class="ss-toolbar-popup ss-toolbar-popup--font"></div>
			</div>

			<div class="ss-toolbar-color-wrap">
				<input type="color" data-action="color" class="ss-toolbar-color" title="Font color" />
				<div class="ss-toolbar-color-ring"></div>
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
				<button data-action="opacity-toggle" class="ss-toolbar-btn" title="Transparency">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" opacity="0.9">
						<rect x="0" y="0" width="4" height="4" fill-opacity="0.2"/>
						<rect x="4" y="0" width="4" height="4" fill-opacity="0.6"/>
						<rect x="8" y="0" width="4" height="4" fill-opacity="0.2"/>
						<rect x="12" y="0" width="4" height="4" fill-opacity="0.6"/>
						<rect x="0" y="4" width="4" height="4" fill-opacity="0.6"/>
						<rect x="4" y="4" width="4" height="4" fill-opacity="0.2"/>
						<rect x="8" y="4" width="4" height="4" fill-opacity="0.6"/>
						<rect x="12" y="4" width="4" height="4" fill-opacity="0.2"/>
						<rect x="0" y="8" width="4" height="4" fill-opacity="0.2"/>
						<rect x="4" y="8" width="4" height="4" fill-opacity="0.6"/>
						<rect x="8" y="8" width="4" height="4" fill-opacity="0.2"/>
						<rect x="12" y="8" width="4" height="4" fill-opacity="0.6"/>
						<rect x="0" y="12" width="4" height="4" fill-opacity="0.6"/>
						<rect x="4" y="12" width="4" height="4" fill-opacity="0.2"/>
						<rect x="8" y="12" width="4" height="4" fill-opacity="0.6"/>
						<rect x="12" y="12" width="4" height="4" fill-opacity="0.2"/>
					</svg>
				</button>
				<div data-opacity-popup class="ss-toolbar-popup">
					<div class="ss-toolbar-popup-header">Transparency</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-opacity-slider class="ss-toolbar-slider" min="0" max="100" value="100" />
						<span data-opacity-value class="ss-toolbar-popup-value">100</span>
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
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Letter spacing</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-letter-spacing-slider class="ss-toolbar-slider" min="-50" max="100" value="0" />
							<span data-letter-spacing-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
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

			<div class="ss-toolbar-divider"></div>

			<button data-action="align-cycle" class="ss-toolbar-btn" title="Text alignment">
				<svg data-align-icon width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
					<path d="M3 5h18v2H3V5zm3 4h12v2H6V9zm-3 4h18v2H3v-2zm3 4h12v2H6v-2z"/>
				</svg>
			</button>

			<button data-action="transform" class="ss-toolbar-btn ss-toolbar-btn--text" title="Text transform">Aa</button>
			<button data-action="underline" class="ss-toolbar-btn ss-toolbar-btn--text ss-toolbar-btn--underline" title="Underline">U</button>
		`;

		this.sizeInput = this.container.querySelector("[data-size-input]");
		this.sizePopup = this.container.querySelector("[data-size-popup]");
		this.boldBtn = this.container.querySelector("[data-action='bold']");
		this.fontBtn = this.container.querySelector("[data-action='font-toggle']");
		this.fontPopup = this.container.querySelector("[data-font-popup]");
		this.fontPreview = this.container.querySelector("[data-font-preview]");
		this.colorInput = this.container.querySelector("[data-action='color']");
		this.alignBtn = this.container.querySelector("[data-action='align-cycle']");
		this.alignIcon = this.container.querySelector("[data-align-icon]");
		this.transformBtn = this.container.querySelector("[data-action='transform']");
		this.underlineBtn = this.container.querySelector("[data-action='underline']");
		this.textEditBtn = this.container.querySelector("[data-action='text-edit-toggle']");
		this.textEditPopup = this.container.querySelector("[data-text-edit-popup]");
		this.textEditArea = this.container.querySelector("[data-text-edit-area]");

		this.container.addEventListener("click", this.handleClick.bind(this));

		// Size input handlers
		this.sizeInput?.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleSizePopup();
		});
		this.sizeInput?.addEventListener("blur", () => this.applyManualSize());
		this.sizeInput?.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.applyManualSize();
				this.sizeInput?.blur();
				if (this.sizePopup) this.sizePopup.style.display = "none";
			}
		});
		this.buildSizePopup();

		this.colorInput?.addEventListener("input", (e) => {
			const color = (e.target as HTMLInputElement).value;
			this.updateClipProperty({ font: { color } });
		});

		this.opacityBtn = this.container.querySelector("[data-action='opacity-toggle']");
		this.opacityPopup = this.container.querySelector("[data-opacity-popup]");
		this.opacitySlider = this.container.querySelector("[data-opacity-slider]");
		this.opacityValue = this.container.querySelector("[data-opacity-value]");

		this.opacitySlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			const opacity = value / 100;
			if (this.opacityValue) {
				this.opacityValue.textContent = String(value);
			}
			this.updateClipProperty({ font: { opacity } });
		});

		this.spacingBtn = this.container.querySelector("[data-action='spacing-toggle']");
		this.spacingPopup = this.container.querySelector("[data-spacing-popup]");
		this.letterSpacingSlider = this.container.querySelector("[data-letter-spacing-slider]");
		this.letterSpacingValue = this.container.querySelector("[data-letter-spacing-value]");
		this.lineHeightSlider = this.container.querySelector("[data-line-height-slider]");
		this.lineHeightValue = this.container.querySelector("[data-line-height-value]");
		this.anchorTopBtn = this.container.querySelector("[data-action='anchor-top']");
		this.anchorMiddleBtn = this.container.querySelector("[data-action='anchor-middle']");
		this.anchorBottomBtn = this.container.querySelector("[data-action='anchor-bottom']");

		this.letterSpacingSlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.letterSpacingValue) {
				this.letterSpacingValue.textContent = String(value);
			}
			this.updateClipProperty({ style: { letterSpacing: value } });
		});

		this.lineHeightSlider?.addEventListener("input", (e) => {
			const value = parseFloat((e.target as HTMLInputElement).value) / 10;
			if (this.lineHeightValue) {
				this.lineHeightValue.textContent = value.toFixed(1);
			}
			this.updateClipProperty({ style: { lineHeight: value } });
		});

		this.borderBtn = this.container.querySelector("[data-action='border-toggle']");
		this.borderPopup = this.container.querySelector("[data-border-popup]");
		this.borderWidthSlider = this.container.querySelector("[data-border-width-slider]");
		this.borderWidthValue = this.container.querySelector("[data-border-width-value]");
		this.borderColorInput = this.container.querySelector("[data-border-color]");
		this.borderOpacitySlider = this.container.querySelector("[data-border-opacity-slider]");
		this.borderOpacityValue = this.container.querySelector("[data-border-opacity-value]");
		this.borderRadiusSlider = this.container.querySelector("[data-border-radius-slider]");
		this.borderRadiusValue = this.container.querySelector("[data-border-radius-value]");

		this.borderWidthSlider?.addEventListener("input", (e) => {
			const width = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.borderWidthValue) {
				this.borderWidthValue.textContent = String(width);
			}
			this.updateBorderProperty({ width });
		});

		this.borderColorInput?.addEventListener("input", (e) => {
			const color = (e.target as HTMLInputElement).value;
			this.updateBorderProperty({ color });
		});

		this.borderOpacitySlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			const opacity = value / 100;
			if (this.borderOpacityValue) {
				this.borderOpacityValue.textContent = String(value);
			}
			this.updateBorderProperty({ opacity });
		});

		this.borderRadiusSlider?.addEventListener("input", (e) => {
			const radius = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.borderRadiusValue) {
				this.borderRadiusValue.textContent = String(radius);
			}
			this.updateBorderProperty({ radius });
		});

		this.backgroundBtn = this.container.querySelector("[data-action='background-toggle']");
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
		this.paddingBtn = this.container.querySelector("[data-action='padding-toggle']");
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
		this.paddingTopSlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingTopValue) this.paddingTopValue.textContent = String(value);
			this.updatePaddingProperty({ top: value });
		});

		this.paddingRightSlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingRightValue) this.paddingRightValue.textContent = String(value);
			this.updatePaddingProperty({ right: value });
		});

		this.paddingBottomSlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingBottomValue) this.paddingBottomValue.textContent = String(value);
			this.updatePaddingProperty({ bottom: value });
		});

		this.paddingLeftSlider?.addEventListener("input", (e) => {
			const value = parseInt((e.target as HTMLInputElement).value, 10);
			if (this.paddingLeftValue) this.paddingLeftValue.textContent = String(value);
			this.updatePaddingProperty({ left: value });
		});

		// Text edit area handlers
		this.textEditArea?.addEventListener("input", () => this.debouncedApplyTextEdit());
		this.textEditArea?.addEventListener("keydown", (e) => {
			// Apply on Ctrl/Cmd+Enter (allow normal Enter for newlines)
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				if (this.textEditDebounceTimer) {
					clearTimeout(this.textEditDebounceTimer);
					this.textEditDebounceTimer = null;
				}
				this.applyTextEdit();
				if (this.textEditPopup) this.textEditPopup.style.display = "none";
			}
			// Close on Escape
			if (e.key === "Escape") {
				if (this.textEditPopup) this.textEditPopup.style.display = "none";
			}
		});

		document.addEventListener("click", (e) => {
			const target = e.target as Node;
			if (this.sizePopup && this.sizePopup.style.display !== "none") {
				if (!this.sizeInput?.contains(target) && !this.sizePopup.contains(target)) {
					this.sizePopup.style.display = "none";
				}
			}
			if (this.opacityPopup && this.opacityPopup.style.display !== "none") {
				if (!this.opacityBtn?.contains(target) && !this.opacityPopup.contains(target)) {
					this.opacityPopup.style.display = "none";
				}
			}
			if (this.spacingPopup && this.spacingPopup.style.display !== "none") {
				if (!this.spacingBtn?.contains(target) && !this.spacingPopup.contains(target)) {
					this.spacingPopup.style.display = "none";
				}
			}
			if (this.borderPopup && this.borderPopup.style.display !== "none") {
				if (!this.borderBtn?.contains(target) && !this.borderPopup.contains(target)) {
					this.borderPopup.style.display = "none";
				}
			}
			if (this.backgroundPopup && this.backgroundPopup.style.display !== "none") {
				if (!this.backgroundBtn?.contains(target) && !this.backgroundPopup.contains(target)) {
					this.backgroundPopup.style.display = "none";
				}
			}
			if (this.paddingPopup && this.paddingPopup.style.display !== "none") {
				if (!this.paddingBtn?.contains(target) && !this.paddingPopup.contains(target)) {
					this.paddingPopup.style.display = "none";
				}
			}
			if (this.fontPopup && this.fontPopup.style.display !== "none") {
				if (!this.fontBtn?.contains(target) && !this.fontPopup.contains(target)) {
					this.fontPopup.style.display = "none";
				}
			}
			if (this.textEditPopup && this.textEditPopup.style.display !== "none") {
				if (!this.textEditBtn?.contains(target) && !this.textEditPopup.contains(target)) {
					this.textEditPopup.style.display = "none";
				}
			}
		});

		parent.style.position = "relative";
		parent.insertBefore(this.container, parent.firstChild);

		// Re-sync when font capabilities change (async operation)
		this.edit.events.on("font:capabilities:changed", () => {
			if (this.container?.style.display !== "none") {
				this.syncState();
			}
		});
	}

	private injectStyles(): void {
		if (document.getElementById("ss-toolbar-styles")) return;

		this.styleElement = document.createElement("style");
		this.styleElement.id = "ss-toolbar-styles";
		this.styleElement.textContent = TOOLBAR_STYLES;
		document.head.appendChild(this.styleElement);
	}

	private handleClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		const button = target.closest("button");
		if (!button) return;

		const action = button.dataset["action"];
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
			case "opacity-toggle":
				this.toggleOpacityPopup();
				break;
			case "spacing-toggle":
				this.toggleSpacingPopup();
				break;
			case "border-toggle":
				this.toggleBorderPopup();
				break;
			case "background-toggle":
				this.toggleBackgroundPopup();
				break;
			case "padding-toggle":
				this.togglePaddingPopup();
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
		if (!this.sizePopup) return;
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		const isVisible = this.sizePopup.style.display !== "none";
		if (!isVisible) {
			this.buildSizePopup();
		}
		this.sizePopup.style.display = isVisible ? "none" : "block";
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
				this.sizePopup!.style.display = "none";
			});
		});
	}

	private applyManualSize(): void {
		if (!this.sizeInput) return;
		const value = parseInt(this.sizeInput.value, 10);
		if (!isNaN(value) && value > 0) {
			this.updateSize(value);
		}
		this.syncState();
	}

	private toggleOpacityPopup(): void {
		if (!this.opacityPopup) return;
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		if (this.backgroundPopup) this.backgroundPopup.style.display = "none";
		if (this.paddingPopup) this.paddingPopup.style.display = "none";
		const isVisible = this.opacityPopup.style.display !== "none";
		this.opacityPopup.style.display = isVisible ? "none" : "block";
	}

	private toggleSpacingPopup(): void {
		if (!this.spacingPopup) return;
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		if (this.backgroundPopup) this.backgroundPopup.style.display = "none";
		if (this.paddingPopup) this.paddingPopup.style.display = "none";
		const isVisible = this.spacingPopup.style.display !== "none";
		this.spacingPopup.style.display = isVisible ? "none" : "block";
	}

	private toggleBorderPopup(): void {
		if (!this.borderPopup) return;
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";
		if (this.backgroundPopup) this.backgroundPopup.style.display = "none";
		if (this.paddingPopup) this.paddingPopup.style.display = "none";
		const isVisible = this.borderPopup.style.display !== "none";
		this.borderPopup.style.display = isVisible ? "none" : "block";
	}

	private toggleBackgroundPopup(): void {
		if (!this.backgroundPopup) return;
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		if (this.paddingPopup) this.paddingPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";

		const isVisible = this.backgroundPopup.style.display !== "none";
		this.backgroundPopup.style.display = isVisible ? "none" : "block";

		// Sync color picker state when opening
		if (!isVisible && this.backgroundColorPicker) {
			const asset = this.getCurrentAsset();
			const background = asset?.background;
			this.backgroundColorPicker.setColor(background?.color || "#FFFFFF");
			this.backgroundColorPicker.setOpacity((background?.opacity ?? 1) * 100);
		}
	}

	private togglePaddingPopup(): void {
		if (!this.paddingPopup) return;

		// Close other popups
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		if (this.backgroundPopup) this.backgroundPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";

		const isVisible = this.paddingPopup.style.display !== "none";
		this.paddingPopup.style.display = isVisible ? "none" : "block";
	}

	private toggleFontPopup(): void {
		if (!this.fontPopup) return;
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.paddingPopup) this.paddingPopup.style.display = "none";
		if (this.textEditPopup) this.textEditPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		if (this.backgroundPopup) this.backgroundPopup.style.display = "none";
		const isVisible = this.fontPopup.style.display !== "none";
		if (!isVisible) {
			this.buildFontList();
		}
		this.fontPopup.style.display = isVisible ? "none" : "block";
	}

	private toggleTextEditPopup(): void {
		if (!this.textEditPopup) return;
		if (this.sizePopup) this.sizePopup.style.display = "none";
		if (this.fontPopup) this.fontPopup.style.display = "none";
		if (this.opacityPopup) this.opacityPopup.style.display = "none";
		if (this.spacingPopup) this.spacingPopup.style.display = "none";
		if (this.borderPopup) this.borderPopup.style.display = "none";
		if (this.backgroundPopup) this.backgroundPopup.style.display = "none";
		if (this.paddingPopup) this.paddingPopup.style.display = "none";

		const isVisible = this.textEditPopup.style.display !== "none";
		if (!isVisible && this.textEditArea) {
			const asset = this.getCurrentAsset();
			this.textEditArea.value = asset?.text ?? "";
		}
		this.textEditPopup.style.display = isVisible ? "none" : "block";
		if (!isVisible) {
			this.textEditArea?.focus();
		}
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
		const newText = this.textEditArea.value;
		this.updateClipProperty({ text: newText });
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
		if (this.fontPopup) {
			this.fontPopup.style.display = "none";
		}
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

	private updateBorderProperty(updates: Partial<{ width: number; color: string; opacity: number; radius: number }>): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const asset = player.clipConfiguration.asset as RichTextAsset;
		const currentBorder = asset.border || { width: 0, color: "#000000", opacity: 1, radius: 0 };

		const updatedBorder = { ...currentBorder, ...updates };
		this.updateClipProperty({ border: updatedBorder });
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
			updatedPadding.top === updatedPadding.right &&
			updatedPadding.right === updatedPadding.bottom &&
			updatedPadding.bottom === updatedPadding.left;

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

	private updateClipProperty(assetUpdates: Record<string, unknown>): void {
		const updates: Partial<ResolvedClip> = { asset: assetUpdates as ResolvedClip["asset"] };
		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		this.syncState();
	}

	show(trackIdx: number, clipIdx: number): void {
		this.selectedTrackIdx = trackIdx;
		this.selectedClipIdx = clipIdx;
		if (this.container) {
			this.container.style.display = "flex";
		}
		this.syncState();
	}

	hide(): void {
		if (this.container) {
			this.container.style.display = "none";
		}
		if (this.sizePopup) {
			this.sizePopup.style.display = "none";
		}
		if (this.opacityPopup) {
			this.opacityPopup.style.display = "none";
		}
		if (this.spacingPopup) {
			this.spacingPopup.style.display = "none";
		}
		if (this.borderPopup) {
			this.borderPopup.style.display = "none";
		}
		if (this.backgroundPopup) {
			this.backgroundPopup.style.display = "none";
		}
		if (this.paddingPopup) {
			this.paddingPopup.style.display = "none";
		}
		if (this.fontPopup) {
			this.fontPopup.style.display = "none";
		}
		if (this.textEditPopup) {
			this.textEditPopup.style.display = "none";
		}
	}

	private syncState(): void {
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

		if (this.colorInput) {
			this.colorInput.value = asset.font?.color ?? "#000000";
		}

		if (this.opacitySlider && this.opacityValue) {
			const opacity = Math.round((asset.font?.opacity ?? 1) * 100);
			this.opacitySlider.value = String(opacity);
			this.opacityValue.textContent = String(opacity);
		}

		if (this.letterSpacingSlider && this.letterSpacingValue) {
			const letterSpacing = asset.style?.letterSpacing ?? 0;
			this.letterSpacingSlider.value = String(letterSpacing);
			this.letterSpacingValue.textContent = String(letterSpacing);
		}

		if (this.lineHeightSlider && this.lineHeightValue) {
			const lineHeight = asset.style?.lineHeight ?? 1.2;
			this.lineHeightSlider.value = String(Math.round(lineHeight * 10));
			this.lineHeightValue.textContent = lineHeight.toFixed(1);
		}

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
			this.transformBtn.textContent = transform === "uppercase" ? "AA" : transform === "lowercase" ? "aa" : "Aa";
			this.setButtonActive(this.transformBtn, transform !== "none");
		}

		const isUnderline = asset.style?.textDecoration === "underline";
		this.setButtonActive(this.underlineBtn, isUnderline);

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

		// Padding
		if (this.paddingTopSlider && this.paddingRightSlider && this.paddingBottomSlider && this.paddingLeftSlider) {
			let top = 0,
				right = 0,
				bottom = 0,
				left = 0;

			if (typeof asset.padding === "number") {
				// Uniform padding
				top = right = bottom = left = asset.padding;
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
	}

	private setButtonActive(btn: HTMLButtonElement | null, active: boolean): void {
		if (!btn) return;
		btn.classList.toggle("active", active);
	}

	dispose(): void {
		this.container?.remove();
		this.container = null;
		this.sizeInput = null;
		this.sizePopup = null;
		this.boldBtn = null;
		this.fontBtn = null;
		this.fontPopup = null;
		this.fontPreview = null;
		this.colorInput = null;
		this.opacityBtn = null;
		this.opacityPopup = null;
		this.opacitySlider = null;
		this.opacityValue = null;
		this.spacingBtn = null;
		this.spacingPopup = null;
		this.letterSpacingSlider = null;
		this.letterSpacingValue = null;
		this.lineHeightSlider = null;
		this.lineHeightValue = null;
		this.anchorTopBtn = null;
		this.anchorMiddleBtn = null;
		this.anchorBottomBtn = null;
		this.alignBtn = null;
		this.alignIcon = null;
		this.transformBtn = null;
		this.underlineBtn = null;
		this.textEditBtn = null;
		this.textEditPopup = null;
		this.textEditArea = null;
		if (this.textEditDebounceTimer) {
			clearTimeout(this.textEditDebounceTimer);
			this.textEditDebounceTimer = null;
		}
		this.borderBtn = null;
		this.borderPopup = null;
		this.borderWidthSlider = null;
		this.borderWidthValue = null;
		this.borderColorInput = null;
		this.borderOpacitySlider = null;
		this.borderOpacityValue = null;
		this.borderRadiusSlider = null;
		this.borderRadiusValue = null;

		this.backgroundColorPicker?.dispose();
		this.backgroundColorPicker = null;
		this.backgroundBtn = null;
		this.backgroundPopup = null;

		this.paddingBtn = null;
		this.paddingPopup = null;
		this.paddingTopSlider = null;
		this.paddingTopValue = null;
		this.paddingRightSlider = null;
		this.paddingRightValue = null;
		this.paddingBottomSlider = null;
		this.paddingBottomValue = null;
		this.paddingLeftSlider = null;
		this.paddingLeftValue = null;

		this.styleElement?.remove();
		this.styleElement = null;
	}
}
