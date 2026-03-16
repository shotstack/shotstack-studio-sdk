import { findEligibleSourceClips, findCurrentSource, ensureClipAlias, UNLINKED_SOURCE } from "@core/shared/source-clip-finder";
import type { RichCaptionAsset } from "@schemas";

import { SpacingPanel } from "./composites/SpacingPanel";
import { StylePanel } from "./composites/StylePanel";
import { FontColorPicker } from "./font-color-picker";
import { RichTextToolbar } from "./rich-text-toolbar";

/**
 * Toolbar for rich-caption clips. Extends RichTextToolbar to reuse shared
 * property controls (font, style, spacing, fill, shadow) while hiding
 * text-edit / animation / transition / effect controls and adding
 * caption-specific panels: Word Animation and Active Word.
 */
export class RichCaptionToolbar extends RichTextToolbar {
	// Caption popup panels
	private wordAnimPopup: HTMLDivElement | null = null;
	private activeWordPopup: HTMLDivElement | null = null;
	private sourcePopup: HTMLDivElement | null = null;
	private sourceListContainer: HTMLDivElement | null = null;
	private sourceDot: HTMLSpanElement | null = null;

	// Word Animation refs
	private wordAnimDirectionSection: HTMLDivElement | null = null;

	// Active-word font controls
	private activeColorToggle: HTMLInputElement | null = null;
	private activeColorInput: HTMLInputElement | null = null;
	private activeOpacitySlider: HTMLInputElement | null = null;
	private activeOpacityValue: HTMLSpanElement | null = null;
	private activeHighlightToggle: HTMLInputElement | null = null;
	private activeHighlightInput: HTMLInputElement | null = null;

	// Active-word stroke controls
	private activeStrokeToggle: HTMLInputElement | null = null;
	private activeStrokeWidthSlider: HTMLInputElement | null = null;
	private activeStrokeWidthValue: HTMLSpanElement | null = null;
	private activeStrokeColorInput: HTMLInputElement | null = null;
	private activeStrokeOpacitySlider: HTMLInputElement | null = null;
	private activeStrokeOpacityValue: HTMLSpanElement | null = null;

	// Active-word shadow controls
	private activeShadowToggle: HTMLInputElement | null = null;
	private activeShadowOffsetXSlider: HTMLInputElement | null = null;
	private activeShadowOffsetXValue: HTMLSpanElement | null = null;
	private activeShadowOffsetYSlider: HTMLInputElement | null = null;
	private activeShadowOffsetYValue: HTMLSpanElement | null = null;
	private activeShadowColorInput: HTMLInputElement | null = null;
	private activeShadowOpacitySlider: HTMLInputElement | null = null;
	private activeShadowOpacityValue: HTMLSpanElement | null = null;

	// Active-word text decoration buttons
	private activeTextDecorationBtns: NodeListOf<HTMLButtonElement> | null = null;

	// Active-word tab state
	private activeWordTabs: NodeListOf<HTMLButtonElement> | null = null;
	private activeWordPanels: NodeListOf<HTMLDivElement> | null = null;

	// Active-mode scale control
	private scaleSlider: HTMLInputElement | null = null;
	private scaleValue: HTMLSpanElement | null = null;
	private currentActiveScale = 1;

	protected override createStylePanel(): StylePanel {
		return new StylePanel({});
	}

	protected override createSpacingPanel(): SpacingPanel {
		return new SpacingPanel({ showWordSpacing: true });
	}

	protected override createFontColorPicker(): FontColorPicker {
		return new FontColorPicker({ hideGradient: true });
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────

	override mount(parent: HTMLElement): void {
		super.mount(parent);
		if (!this.container) return;

		// Hide rich-text controls irrelevant to captions
		["text-edit-toggle", "animation-toggle", "transition-toggle", "effect-toggle"].forEach(action => {
			const btn = this.container!.querySelector(`[data-action="${action}"]`) as HTMLElement | null;
			if (!btn) return;
			const dropdown = btn.closest(".ss-toolbar-dropdown") as HTMLElement | null;
			(dropdown ?? btn).style.display = "none";
		});

		this.injectCaptionControls();
	}

	override dispose(): void {
		super.dispose();
		this.wordAnimPopup = null;
		this.activeWordPopup = null;
		this.wordAnimDirectionSection = null;
		this.activeColorToggle = null;
		this.activeColorInput = null;
		this.activeOpacitySlider = null;
		this.activeOpacityValue = null;
		this.activeHighlightToggle = null;
		this.activeHighlightInput = null;
		this.activeStrokeToggle = null;
		this.activeStrokeWidthSlider = null;
		this.activeStrokeWidthValue = null;
		this.activeStrokeColorInput = null;
		this.activeStrokeOpacitySlider = null;
		this.activeStrokeOpacityValue = null;
		this.activeShadowToggle = null;
		this.activeShadowOffsetXSlider = null;
		this.activeShadowOffsetXValue = null;
		this.activeShadowOffsetYSlider = null;
		this.activeShadowOffsetYValue = null;
		this.activeShadowColorInput = null;
		this.activeShadowOpacitySlider = null;
		this.activeShadowOpacityValue = null;
		this.activeTextDecorationBtns = null;
		this.activeWordTabs = null;
		this.activeWordPanels = null;
		this.scaleSlider = null;
		this.scaleValue = null;
		this.sourcePopup = null;
		this.sourceListContainer = null;
		this.sourceDot = null;
	}

	// ─── Overrides ─────────────────────────────────────────────────────

	protected override handleClick(e: MouseEvent): void {
		const button = (e.target as HTMLElement).closest("button");
		if (!button) return;

		const { action } = button.dataset;
		if (!action) return;

		switch (action) {
			case "caption-source-toggle":
				this.togglePopup(this.sourcePopup, () => this.populateSourceList());
				return;
			case "caption-word-anim-toggle":
				this.togglePopup(this.wordAnimPopup);
				return;
			case "active-word-toggle":
				this.togglePopup(this.activeWordPopup);
				return;
			default:
				break;
		}

		super.handleClick(e);
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [...super.getPopupList(), this.wordAnimPopup, this.activeWordPopup, this.sourcePopup];
	}

	protected override syncState(): void {
		super.syncState();

		const asset = this.getCaptionAsset();
		if (!asset) return;

		// ─── Word Animation ────────────────────────────────
		const wordAnim = asset.wordAnimation;
		const animStyle = wordAnim?.style ?? "karaoke";
		this.container?.querySelectorAll<HTMLButtonElement>("[data-caption-word-style]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["captionWordStyle"] === animStyle);
		});

		if (this.wordAnimDirectionSection) {
			this.wordAnimDirectionSection.style.display = animStyle === "slide" ? "" : "none";
		}

		const direction = wordAnim?.direction ?? "up";
		this.container?.querySelectorAll<HTMLButtonElement>("[data-caption-word-direction]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["captionWordDirection"] === direction);
		});

		// ─── Active Word Controls ───────────────────────────
		const activeData = asset.active;
		const baseFont = asset.font;
		const baseStroke = asset.stroke;

		// Text decoration
		const textDecoration = (activeData?.font as Record<string, unknown> | undefined)?.["textDecoration"] as string | undefined;
		this.activeTextDecorationBtns?.forEach(btn => {
			this.setButtonActive(btn, btn.dataset["activeTextDecoration"] === (textDecoration ?? "none"));
		});

		// ─── Font tab ──────────────────────────────────────
		const hasActiveColor = activeData?.font?.color !== undefined;
		if (this.activeColorToggle) this.activeColorToggle.checked = hasActiveColor;
		if (this.activeColorInput) {
			this.activeColorInput.value = hasActiveColor ? (activeData!.font!.color ?? "#ffff00") : (baseFont?.color ?? "#ffffff");
			this.activeColorInput.disabled = !hasActiveColor;
			this.activeColorInput.style.opacity = hasActiveColor ? "1" : "0.3";
		}
		const opacity = Math.round((hasActiveColor ? (activeData?.font?.opacity ?? 1) : (baseFont?.opacity ?? 1)) * 100);
		if (this.activeOpacitySlider) {
			this.activeOpacitySlider.value = String(opacity);
			this.activeOpacitySlider.disabled = !hasActiveColor;
		}
		if (this.activeOpacityValue) this.activeOpacityValue.textContent = `${opacity}%`;

		const activeBackground = (activeData?.font as Record<string, unknown> | undefined)?.["background"] as string | undefined;
		const baseBackground = (baseFont as Record<string, unknown> | undefined)?.["background"] as string | undefined;
		const hasActiveHighlight = activeBackground !== undefined;
		if (this.activeHighlightToggle) this.activeHighlightToggle.checked = hasActiveHighlight;
		if (this.activeHighlightInput) {
			this.activeHighlightInput.value = hasActiveHighlight ? activeBackground : (baseBackground ?? "#000000");
			this.activeHighlightInput.disabled = !hasActiveHighlight;
			this.activeHighlightInput.style.opacity = hasActiveHighlight ? "1" : "0.3";
		}

		// ─── Stroke tab ────────────────────────────────────
		const activeStroke = activeData?.stroke;
		const hasActiveStroke = typeof activeStroke === "object";
		if (this.activeStrokeToggle) this.activeStrokeToggle.checked = hasActiveStroke;
		const strokeWidth = hasActiveStroke ? (activeStroke.width ?? 0) : (baseStroke?.width ?? 0);
		if (this.activeStrokeWidthSlider) {
			this.activeStrokeWidthSlider.value = String(strokeWidth);
			this.activeStrokeWidthSlider.disabled = !hasActiveStroke;
		}
		if (this.activeStrokeWidthValue) this.activeStrokeWidthValue.textContent = String(strokeWidth);
		if (this.activeStrokeColorInput) {
			this.activeStrokeColorInput.value = hasActiveStroke ? (activeStroke.color ?? "#000000") : (baseStroke?.color ?? "#000000");
			this.activeStrokeColorInput.disabled = !hasActiveStroke;
			this.activeStrokeColorInput.style.opacity = hasActiveStroke ? "1" : "0.3";
		}
		const strokeOpacity = Math.round((hasActiveStroke ? (activeStroke.opacity ?? 1) : (baseStroke?.opacity ?? 1)) * 100);
		if (this.activeStrokeOpacitySlider) {
			this.activeStrokeOpacitySlider.value = String(strokeOpacity);
			this.activeStrokeOpacitySlider.disabled = !hasActiveStroke;
		}
		if (this.activeStrokeOpacityValue) this.activeStrokeOpacityValue.textContent = `${strokeOpacity}%`;

		// ─── Shadow tab ────────────────────────────────────
		const activeShadow = activeData?.shadow;
		const hasShadow = typeof activeShadow === "object";
		if (this.activeShadowToggle) this.activeShadowToggle.checked = hasShadow;
		if (this.activeShadowOffsetXSlider) {
			this.activeShadowOffsetXSlider.value = String(hasShadow ? (activeShadow.offsetX ?? 2) : 2);
			this.activeShadowOffsetXSlider.disabled = !hasShadow;
		}
		if (this.activeShadowOffsetXValue) this.activeShadowOffsetXValue.textContent = String(hasShadow ? (activeShadow.offsetX ?? 2) : 2);
		if (this.activeShadowOffsetYSlider) {
			this.activeShadowOffsetYSlider.value = String(hasShadow ? (activeShadow.offsetY ?? 2) : 2);
			this.activeShadowOffsetYSlider.disabled = !hasShadow;
		}
		if (this.activeShadowOffsetYValue) this.activeShadowOffsetYValue.textContent = String(hasShadow ? (activeShadow.offsetY ?? 2) : 2);
		if (this.activeShadowColorInput) {
			this.activeShadowColorInput.value = hasShadow ? (activeShadow.color ?? "#000000") : "#000000";
			this.activeShadowColorInput.disabled = !hasShadow;
			this.activeShadowColorInput.style.opacity = hasShadow ? "1" : "0.3";
		}
		const shadowOpacity = Math.round((hasShadow ? (activeShadow.opacity ?? 0.5) : 0.5) * 100);
		if (this.activeShadowOpacitySlider) {
			this.activeShadowOpacitySlider.value = String(shadowOpacity);
			this.activeShadowOpacitySlider.disabled = !hasShadow;
		}
		if (this.activeShadowOpacityValue) this.activeShadowOpacityValue.textContent = `${shadowOpacity}%`;

		// ─── Scale ─────────────────────────────────────────
		const scale = activeData?.scale ?? 1;
		if (this.scaleSlider) this.scaleSlider.value = String(scale);
		if (this.scaleValue) this.scaleValue.textContent = `${scale.toFixed(1)}x`;

		const scaleSection = this.container?.querySelector("[data-caption-scale-section]") as HTMLElement | null;
		if (scaleSection) scaleSection.style.display = animStyle === "pop" ? "" : "none";

		// ─── Source linked indicator ──────────────────────
		if (this.sourceDot) {
			const currentSource = findCurrentSource(this.edit, this.selectedTrackIdx, this.selectedClipIdx);
			this.sourceDot.classList.toggle("linked", !!currentSource);
		}
	}

	// ─── Caption Asset Helper ──────────────────────────────────────────

	private getCaptionAsset(): RichCaptionAsset | null {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		return clip ? (clip.asset as RichCaptionAsset) : null;
	}

	// ─── DOM Injection ─────────────────────────────────────────────────

	private injectCaptionControls(): void {
		if (!this.container) return;

		const fragment = document.createDocumentFragment();

		// ── Source Dropdown ────────────────────────────────
		const sourceDropdown = document.createElement("div");
		sourceDropdown.className = "ss-toolbar-dropdown";
		sourceDropdown.innerHTML = `
			<button data-action="caption-source-toggle"
				class="ss-toolbar-btn ss-toolbar-btn--text-edit"
				title="Caption source">
				<span data-source-dot class="ss-source-dot"></span>
				Source
			</button>
			<div data-caption-source-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-header">Caption Source</div>
				<div data-source-list class="ss-source-list"></div>
			</div>
		`;
		this.sourcePopup = sourceDropdown.querySelector("[data-caption-source-popup]");
		this.sourceListContainer = sourceDropdown.querySelector("[data-source-list]");
		this.sourceDot = sourceDropdown.querySelector("[data-source-dot]");

		// ── Word Animation Group ───────────────────────────
		const wordAnimDropdown = document.createElement("div");
		wordAnimDropdown.className = "ss-toolbar-dropdown";
		wordAnimDropdown.innerHTML = `
			<button data-action="caption-word-anim-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Word animation">Animation</button>
			<div data-caption-word-anim-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-header">Style</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-animation-presets">
						<button class="ss-animation-preset" data-caption-word-style="karaoke">Karaoke</button>
						<button class="ss-animation-preset" data-caption-word-style="highlight">Highlight</button>
						<button class="ss-animation-preset" data-caption-word-style="pop">Pop</button>
						<button class="ss-animation-preset" data-caption-word-style="fade">Fade</button>
						<button class="ss-animation-preset" data-caption-word-style="slide">Slide</button>
						<button class="ss-animation-preset" data-caption-word-style="bounce">Bounce</button>
						<button class="ss-animation-preset" data-caption-word-style="typewriter">Typewriter</button>
						<button class="ss-animation-preset" data-caption-word-style="none">None</button>
					</div>
				</div>
				<div class="ss-toolbar-popup-section" data-caption-word-direction-section style="display: none;">
					<div class="ss-toolbar-popup-label">Direction</div>
					<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
						<button class="ss-toolbar-anchor-btn" data-caption-word-direction="left">\u2190</button>
						<button class="ss-toolbar-anchor-btn" data-caption-word-direction="right">\u2192</button>
						<button class="ss-toolbar-anchor-btn" data-caption-word-direction="up">\u2191</button>
						<button class="ss-toolbar-anchor-btn" data-caption-word-direction="down">\u2193</button>
					</div>
				</div>
			</div>
		`;
		this.wordAnimPopup = wordAnimDropdown.querySelector("[data-caption-word-anim-popup]");
		this.wordAnimDirectionSection = wordAnimDropdown.querySelector("[data-caption-word-direction-section]");
		fragment.appendChild(wordAnimDropdown);

		// ── Active Word Dropdown (Tabbed) ─────────────────
		const activeWordDropdown = document.createElement("div");
		activeWordDropdown.className = "ss-toolbar-dropdown";
		activeWordDropdown.innerHTML = `
			<button data-action="active-word-toggle"
				class="ss-toolbar-btn ss-toolbar-btn--text-edit"
				title="Active word style">Active Word</button>
			<div data-active-word-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-header">Active Word</div>

				<div class="ss-active-word-header">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Decoration</div>
						<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
							<button class="ss-toolbar-anchor-btn" data-active-text-decoration="none">None</button>
							<button class="ss-toolbar-anchor-btn" data-active-text-decoration="underline" style="text-decoration: underline;">U</button>
							<button class="ss-toolbar-anchor-btn" data-active-text-decoration="line-through" style="text-decoration: line-through;">S</button>
						</div>
					</div>
				</div>

				<div class="ss-style-tabs">
					<button class="ss-style-tab active" data-active-word-tab="font">Font</button>
					<button class="ss-style-tab" data-active-word-tab="stroke">Stroke</button>
					<button class="ss-style-tab" data-active-word-tab="shadow">Shadow</button>
				</div>

				<div data-active-word-panel="font" class="ss-style-panel">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color</div>
						<div class="ss-toolbar-popup-row">
							<input type="checkbox" data-active-color-toggle class="ss-toolbar-checkbox" />
							<input type="color" data-active-font-color value="#ffff00" class="ss-font-color-input" disabled style="opacity: 0.3;" />
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Opacity</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-active-font-opacity class="ss-toolbar-slider" min="0" max="100" value="100" disabled />
							<span data-active-font-opacity-value class="ss-toolbar-popup-value">100%</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Highlight</div>
						<div class="ss-toolbar-popup-row">
							<input type="checkbox" data-active-highlight-toggle class="ss-toolbar-checkbox" />
							<input type="color" data-active-font-highlight value="#000000" class="ss-font-color-input" disabled style="opacity: 0.3;" />
						</div>
					</div>
				</div>

				<div data-active-word-panel="stroke" class="ss-style-panel" style="display: none;">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-row">
							<input type="checkbox" data-active-stroke-toggle class="ss-toolbar-checkbox" />
							<span class="ss-toolbar-popup-label" style="margin-bottom: 0;">Enable Stroke</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Width</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-active-stroke-width class="ss-toolbar-slider" min="0" max="10" step="1" value="0" disabled />
							<span data-active-stroke-width-value class="ss-toolbar-popup-value">0</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color</div>
						<input type="color" data-active-stroke-color value="#000000" class="ss-font-color-input" disabled style="opacity: 0.3;" />
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Opacity</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-active-stroke-opacity class="ss-toolbar-slider" min="0" max="100" value="100" disabled />
							<span data-active-stroke-opacity-value class="ss-toolbar-popup-value">100%</span>
						</div>
					</div>
				</div>

				<div data-active-word-panel="shadow" class="ss-style-panel" style="display: none;">
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-row">
							<input type="checkbox" data-active-shadow-toggle class="ss-toolbar-checkbox" />
							<span class="ss-toolbar-popup-label" style="margin-bottom: 0;">Enable Shadow</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Offset X</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-active-shadow-offset-x class="ss-toolbar-slider" min="-10" max="10" step="1" value="2" disabled />
							<span data-active-shadow-offset-x-value class="ss-toolbar-popup-value">2</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Offset Y</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-active-shadow-offset-y class="ss-toolbar-slider" min="-10" max="10" step="1" value="2" disabled />
							<span data-active-shadow-offset-y-value class="ss-toolbar-popup-value">2</span>
						</div>
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Color</div>
						<input type="color" data-active-shadow-color value="#000000" class="ss-font-color-input" disabled style="opacity: 0.3;" />
					</div>
					<div class="ss-toolbar-popup-section">
						<div class="ss-toolbar-popup-label">Opacity</div>
						<div class="ss-toolbar-popup-row">
							<input type="range" data-active-shadow-opacity class="ss-toolbar-slider" min="0" max="100" value="50" disabled />
							<span data-active-shadow-opacity-value class="ss-toolbar-popup-value">50%</span>
						</div>
					</div>
				</div>
				<div data-caption-scale-section class="ss-toolbar-popup-section" style="display: none;">
					<div class="ss-toolbar-popup-divider"></div>
					<div class="ss-toolbar-popup-label">Scale</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-caption-active-scale class="ss-toolbar-slider" min="0.5" max="2" step="0.05" value="1" />
						<span data-caption-active-scale-value class="ss-toolbar-popup-value">1.0x</span>
					</div>
				</div>
			</div>
		`;

		// Query Active Word popup elements
		this.activeWordPopup = activeWordDropdown.querySelector("[data-active-word-popup]");
		this.activeWordTabs = activeWordDropdown.querySelectorAll("[data-active-word-tab]");
		this.activeWordPanels = activeWordDropdown.querySelectorAll("[data-active-word-panel]");

		// Text decoration
		this.activeTextDecorationBtns = activeWordDropdown.querySelectorAll("[data-active-text-decoration]");

		// Font tab
		this.activeColorToggle = activeWordDropdown.querySelector("[data-active-color-toggle]");
		this.activeColorInput = activeWordDropdown.querySelector("[data-active-font-color]");
		this.activeOpacitySlider = activeWordDropdown.querySelector("[data-active-font-opacity]");
		this.activeOpacityValue = activeWordDropdown.querySelector("[data-active-font-opacity-value]");
		this.activeHighlightToggle = activeWordDropdown.querySelector("[data-active-highlight-toggle]");
		this.activeHighlightInput = activeWordDropdown.querySelector("[data-active-font-highlight]");

		// Stroke tab
		this.activeStrokeToggle = activeWordDropdown.querySelector("[data-active-stroke-toggle]");
		this.activeStrokeWidthSlider = activeWordDropdown.querySelector("[data-active-stroke-width]");
		this.activeStrokeWidthValue = activeWordDropdown.querySelector("[data-active-stroke-width-value]");
		this.activeStrokeColorInput = activeWordDropdown.querySelector("[data-active-stroke-color]");
		this.activeStrokeOpacitySlider = activeWordDropdown.querySelector("[data-active-stroke-opacity]");
		this.activeStrokeOpacityValue = activeWordDropdown.querySelector("[data-active-stroke-opacity-value]");

		// Shadow tab
		this.activeShadowToggle = activeWordDropdown.querySelector("[data-active-shadow-toggle]");
		this.activeShadowOffsetXSlider = activeWordDropdown.querySelector("[data-active-shadow-offset-x]");
		this.activeShadowOffsetXValue = activeWordDropdown.querySelector("[data-active-shadow-offset-x-value]");
		this.activeShadowOffsetYSlider = activeWordDropdown.querySelector("[data-active-shadow-offset-y]");
		this.activeShadowOffsetYValue = activeWordDropdown.querySelector("[data-active-shadow-offset-y-value]");
		this.activeShadowColorInput = activeWordDropdown.querySelector("[data-active-shadow-color]");
		this.activeShadowOpacitySlider = activeWordDropdown.querySelector("[data-active-shadow-opacity]");
		this.activeShadowOpacityValue = activeWordDropdown.querySelector("[data-active-shadow-opacity-value]");

		// Scale
		this.scaleSlider = activeWordDropdown.querySelector("[data-caption-active-scale]");
		this.scaleValue = activeWordDropdown.querySelector("[data-caption-active-scale-value]");

		fragment.appendChild(activeWordDropdown);
		fragment.appendChild(sourceDropdown);

		this.container.appendChild(fragment);

		this.wireWordAnimControls(wordAnimDropdown);
		this.wireActiveWordTabs();
		this.wireActiveTextDecorationControls();
		this.wireScaleControl();
		this.wireActiveColorControls();
		this.wireActiveStrokeControls();
		this.wireActiveShadowControls();
	}

	// ─── Source Popup ─────────────────────────────────────────────────

	private populateSourceList(): void {
		if (!this.sourceListContainer) return;

		const eligible = findEligibleSourceClips(this.edit);
		const current = findCurrentSource(this.edit, this.selectedTrackIdx, this.selectedClipIdx);

		this.sourceListContainer.innerHTML = "";

		if (eligible.length === 0) {
			this.sourceListContainer.innerHTML = `<div class="ss-source-empty">No video, audio, or TTS clips found</div>`;
			return;
		}

		for (const info of eligible) {
			const isActive = current?.clipId === info.clipId;
			const item = document.createElement("button");
			item.className = `ss-source-item${isActive ? " active" : ""}`;
			item.innerHTML = `<span>${info.displayLabel}</span><span class="ss-source-item-check"></span>`;
			item.addEventListener("click", () => this.selectSource(info.trackIndex, info.clipIndex));
			item.addEventListener("mouseenter", () => this.focusSourceClip(info.trackIndex, info.clipIndex));
			item.addEventListener("mouseleave", () => this.blurSourceClip());
			this.sourceListContainer.appendChild(item);
		}

		// Divider + None option
		const divider = document.createElement("div");
		divider.className = "ss-source-divider";
		this.sourceListContainer.appendChild(divider);

		const isNone = !current;
		const noneItem = document.createElement("button");
		noneItem.className = `ss-source-item${isNone ? " active" : ""}`;
		noneItem.innerHTML = `<span>None (placeholder)</span><span class="ss-source-item-check"></span>`;
		noneItem.addEventListener("click", () => this.clearSource());
		this.sourceListContainer.appendChild(noneItem);
	}

	private async selectSource(trackIdx: number, clipIdx: number): Promise<void> {
		this.blurSourceClip();
		const alias = await ensureClipAlias(this.edit, trackIdx, clipIdx);
		this.updateClipProperty({ src: `alias://${alias}` });
		this.closeAllPopups();
	}

	private clearSource(): void {
		this.blurSourceClip();
		this.updateClipProperty({ src: UNLINKED_SOURCE });
		this.closeAllPopups();
	}

	private focusSourceClip(trackIdx: number, clipIdx: number): void {
		this.edit.focusClip(trackIdx, clipIdx);
	}

	private blurSourceClip(): void {
		this.edit.blurClip();
	}

	// ─── Word Animation Wiring ─────────────────────────────────────────

	private wireWordAnimControls(root: HTMLElement): void {
		// Style buttons (discrete command)
		root.querySelectorAll<HTMLButtonElement>("[data-caption-word-style]").forEach(btn => {
			btn.addEventListener("click", () => {
				const style = btn.dataset["captionWordStyle"];
				if (!style) return;
				const asset = this.getCaptionAsset();
				this.updateClipProperty({ wordAnimation: { ...(asset?.wordAnimation ?? {}), style } });
			});
		});

		// Direction buttons (discrete command)
		root.querySelectorAll<HTMLButtonElement>("[data-caption-word-direction]").forEach(btn => {
			btn.addEventListener("click", () => {
				const direction = btn.dataset["captionWordDirection"];
				if (!direction) return;
				const asset = this.getCaptionAsset();
				this.updateClipProperty({ wordAnimation: { style: "slide" as const, ...(asset?.wordAnimation ?? {}), direction } });
			});
		});
	}

	// ─── Active Word Tab Switching ───────────────────────────────────

	private wireActiveWordTabs(): void {
		this.activeWordTabs?.forEach(tab => {
			tab.addEventListener("click", () => {
				const tabName = tab.dataset["activeWordTab"];
				if (!tabName) return;

				// Update tab active state
				this.activeWordTabs?.forEach(t => t.classList.remove("active"));
				tab.classList.add("active");

				// Show/hide panels
				this.activeWordPanels?.forEach(p => {
					p.style.display = p.dataset["activeWordPanel"] === tabName ? "" : "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
				});
			});
		});
	}

	// ─── Text Decoration Wiring ──────────────────────────────────────

	private wireActiveTextDecorationControls(): void {
		this.activeTextDecorationBtns?.forEach(btn => {
			btn.addEventListener("click", () => {
				const decoration = btn.dataset["activeTextDecoration"];
				if (!decoration) return;
				const asset = this.getCaptionAsset();
				const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
				const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
				currentFont["textDecoration"] = decoration === "none" ? undefined : decoration;
				this.updateClipProperty({ active: { ...currentActive, font: currentFont } });
			});
		});
	}

	// ─── Scale Wiring (active mode) ───────────────────────────────────

	private wireScaleControl(): void {
		this.scaleSlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.currentActiveScale = value;
			if (this.scaleValue) this.scaleValue.textContent = `${value.toFixed(1)}x`;
			const asset = this.getCaptionAsset();
			this.updateClipProperty({ active: { ...(asset?.active ?? {}), scale: value } });
		});
	}

	// ─── Active Color Wiring ──────────────────────────────────────────

	private wireActiveColorControls(): void {
		// Color toggle — enable/disable color override
		this.activeColorToggle?.addEventListener("change", () => {
			const enabled = this.activeColorToggle!.checked;
			if (this.activeColorInput) {
				this.activeColorInput.disabled = !enabled;
				this.activeColorInput.style.opacity = enabled ? "1" : "0.3";
			}
			if (this.activeOpacitySlider) this.activeOpacitySlider.disabled = !enabled;

			if (enabled) {
				this.writeActiveFont();
			} else {
				// Clear active font color/opacity (inherit from base)
				const asset = this.getCaptionAsset();
				const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
				const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
				delete currentFont["color"];
				delete currentFont["opacity"];
				const hasKeys = Object.values(currentFont).some(v => v !== undefined);
				this.updateClipProperty({ active: { ...currentActive, font: hasKeys ? currentFont : undefined } });
			}
		});

		this.activeColorInput?.addEventListener("input", () => this.writeActiveFont());

		this.activeOpacitySlider?.addEventListener("input", () => {
			if (this.activeOpacityValue) this.activeOpacityValue.textContent = `${this.activeOpacitySlider!.value}%`;
			this.writeActiveFont();
		});

		// Highlight toggle
		this.activeHighlightToggle?.addEventListener("change", () => {
			const enabled = this.activeHighlightToggle!.checked;
			if (this.activeHighlightInput) {
				this.activeHighlightInput.disabled = !enabled;
				this.activeHighlightInput.style.opacity = enabled ? "1" : "0.3";
			}

			if (enabled) {
				this.writeActiveHighlight();
			} else {
				const asset = this.getCaptionAsset();
				const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
				const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
				delete currentFont["background"];
				const hasKeys = Object.values(currentFont).some(v => v !== undefined);
				this.updateClipProperty({ active: { ...currentActive, font: hasKeys ? currentFont : undefined } });
			}
		});

		this.activeHighlightInput?.addEventListener("input", () => this.writeActiveHighlight());
	}

	private writeActiveFont(): void {
		const color = this.activeColorInput?.value ?? "#ffff00";
		const opacity = parseInt(this.activeOpacitySlider?.value ?? "100", 10) / 100;
		const asset = this.getCaptionAsset();
		const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
		const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
		currentFont["color"] = color;
		currentFont["opacity"] = opacity;
		this.updateClipProperty({ active: { ...currentActive, font: currentFont } });
	}

	private writeActiveHighlight(): void {
		const background = this.activeHighlightInput?.value ?? "#000000";
		const asset = this.getCaptionAsset();
		const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
		const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
		currentFont["background"] = background;
		this.updateClipProperty({ active: { ...currentActive, font: currentFont } });
	}

	// ─── Active Stroke Wiring ─────────────────────────────────────────

	private wireActiveStrokeControls(): void {
		// Stroke toggle — enable/disable stroke override
		this.activeStrokeToggle?.addEventListener("change", () => {
			const enabled = this.activeStrokeToggle!.checked;
			this.setStrokeControlsEnabled(enabled);

			if (enabled) {
				this.writeActiveStroke();
			} else {
				const asset = this.getCaptionAsset();
				const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
				this.updateClipProperty({ active: { ...currentActive, stroke: undefined } });
			}
		});

		this.activeStrokeWidthSlider?.addEventListener("input", () => {
			if (this.activeStrokeWidthValue) this.activeStrokeWidthValue.textContent = this.activeStrokeWidthSlider!.value;
			this.writeActiveStroke();
		});

		this.activeStrokeColorInput?.addEventListener("input", () => this.writeActiveStroke());

		this.activeStrokeOpacitySlider?.addEventListener("input", () => {
			if (this.activeStrokeOpacityValue) this.activeStrokeOpacityValue.textContent = `${this.activeStrokeOpacitySlider!.value}%`;
			this.writeActiveStroke();
		});
	}

	private setStrokeControlsEnabled(enabled: boolean): void {
		if (this.activeStrokeWidthSlider) this.activeStrokeWidthSlider.disabled = !enabled;
		if (this.activeStrokeColorInput) {
			this.activeStrokeColorInput.disabled = !enabled;
			this.activeStrokeColorInput.style.opacity = enabled ? "1" : "0.3";
		}
		if (this.activeStrokeOpacitySlider) this.activeStrokeOpacitySlider.disabled = !enabled;
	}

	private writeActiveStroke(): void {
		const width = parseInt(this.activeStrokeWidthSlider?.value ?? "0", 10);
		const color = this.activeStrokeColorInput?.value ?? "#000000";
		const opacity = parseInt(this.activeStrokeOpacitySlider?.value ?? "100", 10) / 100;

		const asset = this.getCaptionAsset();
		const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
		this.updateClipProperty({ active: { ...currentActive, stroke: { width, color, opacity } } });
	}

	// ─── Active Shadow Wiring ─────────────────────────────────────────

	private wireActiveShadowControls(): void {
		// Shadow toggle
		this.activeShadowToggle?.addEventListener("change", () => {
			const enabled = this.activeShadowToggle!.checked;
			this.setShadowControlsEnabled(enabled);

			if (enabled) {
				this.writeActiveShadow();
			} else {
				const asset = this.getCaptionAsset();
				const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
				this.updateClipProperty({ active: { ...currentActive, shadow: undefined } });
			}
		});

		this.activeShadowOffsetXSlider?.addEventListener("input", () => {
			if (this.activeShadowOffsetXValue) this.activeShadowOffsetXValue.textContent = this.activeShadowOffsetXSlider!.value;
			this.writeActiveShadow();
		});

		this.activeShadowOffsetYSlider?.addEventListener("input", () => {
			if (this.activeShadowOffsetYValue) this.activeShadowOffsetYValue.textContent = this.activeShadowOffsetYSlider!.value;
			this.writeActiveShadow();
		});

		this.activeShadowColorInput?.addEventListener("input", () => this.writeActiveShadow());

		this.activeShadowOpacitySlider?.addEventListener("input", () => {
			if (this.activeShadowOpacityValue) this.activeShadowOpacityValue.textContent = `${this.activeShadowOpacitySlider!.value}%`;
			this.writeActiveShadow();
		});
	}

	private setShadowControlsEnabled(enabled: boolean): void {
		if (this.activeShadowOffsetXSlider) this.activeShadowOffsetXSlider.disabled = !enabled;
		if (this.activeShadowOffsetYSlider) this.activeShadowOffsetYSlider.disabled = !enabled;
		if (this.activeShadowColorInput) {
			this.activeShadowColorInput.disabled = !enabled;
			this.activeShadowColorInput.style.opacity = enabled ? "1" : "0.3";
		}
		if (this.activeShadowOpacitySlider) this.activeShadowOpacitySlider.disabled = !enabled;
	}

	private writeActiveShadow(): void {
		const offsetX = parseInt(this.activeShadowOffsetXSlider?.value ?? "2", 10);
		const offsetY = parseInt(this.activeShadowOffsetYSlider?.value ?? "2", 10);
		const color = this.activeShadowColorInput?.value ?? "#000000";
		const opacity = parseInt(this.activeShadowOpacitySlider?.value ?? "50", 10) / 100;

		const asset = this.getCaptionAsset();
		const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
		this.updateClipProperty({
			active: {
				...currentActive,
				shadow: { offsetX, offsetY, blur: 4, color, opacity }
			}
		});
	}

}
