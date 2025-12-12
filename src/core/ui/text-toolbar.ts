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
			this.strokePopup
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
	}
}
