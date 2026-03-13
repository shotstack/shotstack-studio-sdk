import type { RichCaptionAsset, ResolvedClip } from "@schemas";

import { StylePanel } from "./composites/StylePanel";
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

	// Word Animation slider refs
	private wordAnimDirectionSection: HTMLDivElement | null = null;

	// Active-mode scale control
	private scaleSlider: HTMLInputElement | null = null;
	private scaleValue: HTMLSpanElement | null = null;

	// Active-word dedicated controls
	private activeColorInput: HTMLInputElement | null = null;
	private activeOpacitySlider: HTMLInputElement | null = null;
	private activeOpacityValue: HTMLSpanElement | null = null;
	private activeHighlightInput: HTMLInputElement | null = null;

	private activeStrokeWidthSlider: HTMLInputElement | null = null;
	private activeStrokeWidthValue: HTMLSpanElement | null = null;
	private activeStrokeColorInput: HTMLInputElement | null = null;
	private activeStrokeOpacitySlider: HTMLInputElement | null = null;
	private activeStrokeOpacityValue: HTMLSpanElement | null = null;

	// Current slider values during drag (for final commit)
	private currentActiveScale = 1;

	protected override createStylePanel(): StylePanel {
		return new StylePanel({});
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────

	override mount(parent: HTMLElement): void {
		super.mount(parent);
		if (!this.container) return;

		// Hide rich-text controls irrelevant to captions
		["text-edit-toggle", "animation-toggle", "transition-toggle", "effect-toggle", "align-cycle", "anchor-top", "anchor-middle", "anchor-bottom", "underline", "linethrough"].forEach(action => {
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
		this.scaleSlider = null;
		this.scaleValue = null;
		this.activeColorInput = null;
		this.activeOpacitySlider = null;
		this.activeOpacityValue = null;
		this.activeHighlightInput = null;
		this.activeStrokeWidthSlider = null;
		this.activeStrokeWidthValue = null;
		this.activeStrokeColorInput = null;
		this.activeStrokeOpacitySlider = null;
		this.activeStrokeOpacityValue = null;
	}

	// ─── Overrides ─────────────────────────────────────────────────────

	protected override handleClick(e: MouseEvent): void {
		const button = (e.target as HTMLElement).closest("button");
		if (!button) return;

		const { action } = button.dataset;
		if (!action) return;

		switch (action) {
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
		return [...super.getPopupList(), this.wordAnimPopup, this.activeWordPopup];
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

		if (this.activeColorInput) this.activeColorInput.value = activeData?.font?.color ?? "#ffff00";
		const opacity = Math.round((activeData?.font?.opacity ?? 1) * 100);
		if (this.activeOpacitySlider) this.activeOpacitySlider.value = String(opacity);
		if (this.activeOpacityValue) this.activeOpacityValue.textContent = `${opacity}%`;
		if (this.activeHighlightInput)
			this.activeHighlightInput.value = ((activeData?.font as Record<string, unknown> | undefined)?.["background"] as string) ?? "#000000";

		const activeStroke = activeData?.stroke;
		const strokeObj = typeof activeStroke === "object" ? activeStroke : undefined;
		if (this.activeStrokeWidthSlider) this.activeStrokeWidthSlider.value = String(strokeObj?.width ?? 0);
		if (this.activeStrokeWidthValue) this.activeStrokeWidthValue.textContent = String(strokeObj?.width ?? 0);
		if (this.activeStrokeColorInput) this.activeStrokeColorInput.value = strokeObj?.color ?? "#000000";
		const strokeOpacity = Math.round((strokeObj?.opacity ?? 1) * 100);
		if (this.activeStrokeOpacitySlider) this.activeStrokeOpacitySlider.value = String(strokeOpacity);
		if (this.activeStrokeOpacityValue) this.activeStrokeOpacityValue.textContent = `${strokeOpacity}%`;

		const scale = activeData?.scale ?? 1;
		if (this.scaleSlider) this.scaleSlider.value = String(scale);
		if (this.scaleValue) this.scaleValue.textContent = `${scale.toFixed(1)}x`;

		// Show scale section only when word animation is "pop"
		const scaleSection = this.container?.querySelector("[data-caption-scale-section]") as HTMLElement | null;
		if (scaleSection) scaleSection.style.display = animStyle === "pop" ? "" : "none";
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

		// ── Word Animation Group ───────────────────────────
		const wordAnimDropdown = document.createElement("div");
		wordAnimDropdown.className = "ss-toolbar-dropdown";
		wordAnimDropdown.innerHTML = `
			<button data-action="caption-word-anim-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Word animation">Words</button>
			<div data-caption-word-anim-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Style</div>
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

		// ── Active Word Dropdown ──────────────────────────
		const activeWordDropdown = document.createElement("div");
		activeWordDropdown.className = "ss-toolbar-dropdown";
		activeWordDropdown.innerHTML = `
			<button data-action="active-word-toggle"
				class="ss-toolbar-btn ss-toolbar-btn--text-edit"
				title="Active word style">Active Word</button>
			<div data-active-word-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Color</div>
					<input type="color" data-active-font-color value="#ffff00" class="ss-font-color-input" />
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Opacity</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-active-font-opacity class="ss-toolbar-slider" min="0" max="100" value="100" />
						<span data-active-font-opacity-value class="ss-toolbar-popup-value">100%</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Highlight</div>
					<input type="color" data-active-font-highlight value="#000000" class="ss-font-color-input" />
				</div>
				<div class="ss-toolbar-popup-divider"></div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Stroke Width</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-active-stroke-width class="ss-toolbar-slider" min="0" max="10" step="1" value="0" />
						<span data-active-stroke-width-value class="ss-toolbar-popup-value">0</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Stroke Color</div>
					<input type="color" data-active-stroke-color value="#000000" class="ss-font-color-input" />
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Stroke Opacity</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-active-stroke-opacity class="ss-toolbar-slider" min="0" max="100" value="100" />
						<span data-active-stroke-opacity-value class="ss-toolbar-popup-value">100%</span>
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
		this.activeWordPopup = activeWordDropdown.querySelector("[data-active-word-popup]");
		this.activeColorInput = activeWordDropdown.querySelector("[data-active-font-color]");
		this.activeOpacitySlider = activeWordDropdown.querySelector("[data-active-font-opacity]");
		this.activeOpacityValue = activeWordDropdown.querySelector("[data-active-font-opacity-value]");
		this.activeHighlightInput = activeWordDropdown.querySelector("[data-active-font-highlight]");
		this.activeStrokeWidthSlider = activeWordDropdown.querySelector("[data-active-stroke-width]");
		this.activeStrokeWidthValue = activeWordDropdown.querySelector("[data-active-stroke-width-value]");
		this.activeStrokeColorInput = activeWordDropdown.querySelector("[data-active-stroke-color]");
		this.activeStrokeOpacitySlider = activeWordDropdown.querySelector("[data-active-stroke-opacity]");
		this.activeStrokeOpacityValue = activeWordDropdown.querySelector("[data-active-stroke-opacity-value]");
		this.scaleSlider = activeWordDropdown.querySelector("[data-caption-active-scale]");
		this.scaleValue = activeWordDropdown.querySelector("[data-caption-active-scale-value]");
		fragment.appendChild(activeWordDropdown);

		this.container.appendChild(fragment);

		this.wireWordAnimControls(wordAnimDropdown);
		this.wireScaleControl();
		this.wireActiveColorControls();
		this.wireActiveStrokeControls();
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

	// ─── Scale Wiring (active mode) ───────────────────────────────────

	private wireScaleControl(): void {
		this.scaleSlider?.addEventListener("pointerdown", () => {
			const state = this.captureClipState();
			if (state) this.dragManager.start("caption-active-scale", state.clipId, state.initialState);
		});
		this.scaleSlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.currentActiveScale = value;
			if (this.scaleValue) this.scaleValue.textContent = `${value.toFixed(1)}x`;
			this.liveCaptionUpdate(asset => ({
				...asset,
				active: { ...(asset.active ?? {}), scale: value }
			}));
		});
		this.scaleSlider?.addEventListener("change", () => {
			this.commitCaptionDrag("caption-active-scale", a => {
				const active = { ...((a["active"] as Record<string, unknown>) ?? {}) };
				active["scale"] = this.currentActiveScale;
				a["active"] = active; // eslint-disable-line no-param-reassign -- mutating structuredClone
			});
		});
	}

	// ─── Active Color Wiring ──────────────────────────────────────────

	private wireActiveColorControls(): void {
		this.activeColorInput?.addEventListener("input", () => {
			const color = this.activeColorInput!.value;
			const asset = this.getCaptionAsset();
			const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
			const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
			currentFont["color"] = color;
			this.updateClipProperty({ active: { ...currentActive, font: currentFont } });
		});

		this.activeOpacitySlider?.addEventListener("input", () => {
			const opacity = parseInt(this.activeOpacitySlider!.value, 10) / 100;
			if (this.activeOpacityValue) this.activeOpacityValue.textContent = `${Math.round(opacity * 100)}%`;
			const asset = this.getCaptionAsset();
			const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
			const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
			currentFont["opacity"] = opacity;
			this.updateClipProperty({ active: { ...currentActive, font: currentFont } });
		});

		this.activeHighlightInput?.addEventListener("input", () => {
			const background = this.activeHighlightInput!.value;
			const asset = this.getCaptionAsset();
			const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
			const currentFont = { ...((currentActive["font"] ?? {}) as Record<string, unknown>) };
			currentFont["background"] = background;
			this.updateClipProperty({ active: { ...currentActive, font: currentFont } });
		});
	}

	// ─── Active Stroke Wiring ─────────────────────────────────────────

	private wireActiveStrokeControls(): void {
		const writeStroke = () => {
			const width = parseInt(this.activeStrokeWidthSlider?.value ?? "0", 10);
			const color = this.activeStrokeColorInput?.value ?? "#000000";
			const opacity = parseInt(this.activeStrokeOpacitySlider?.value ?? "100", 10) / 100;

			const asset = this.getCaptionAsset();
			const currentActive = (asset?.active ?? {}) as Record<string, unknown>;
			const strokeValue = width > 0 ? { width, color, opacity } : undefined;
			this.updateClipProperty({ active: { ...currentActive, stroke: strokeValue } });
		};

		this.activeStrokeWidthSlider?.addEventListener("input", () => {
			if (this.activeStrokeWidthValue) this.activeStrokeWidthValue.textContent = this.activeStrokeWidthSlider!.value;
			writeStroke();
		});

		this.activeStrokeColorInput?.addEventListener("input", writeStroke);

		this.activeStrokeOpacitySlider?.addEventListener("input", () => {
			if (this.activeStrokeOpacityValue) this.activeStrokeOpacityValue.textContent = `${this.activeStrokeOpacitySlider!.value}%`;
			writeStroke();
		});
	}

	// ─── Two-Phase Drag Helpers ────────────────────────────────────────

	private liveCaptionUpdate(mutate: (asset: RichCaptionAsset) => Record<string, unknown>): void {
		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clipId) return;
		const asset = this.getCaptionAsset();
		if (!asset) return;

		this.edit.updateClipInDocument(clipId, { asset: mutate(asset) as ResolvedClip["asset"] });
		this.edit.resolveClip(clipId);
	}

	private commitCaptionDrag(controlId: string, applyFinal: (asset: Record<string, unknown>) => void): void {
		const session = this.dragManager.end(controlId);
		if (!session) return;

		const finalClip = structuredClone(session.initialState);
		if (finalClip.asset) {
			applyFinal(finalClip.asset as Record<string, unknown>);
		}
		this.edit.commitClipUpdate(session.clipId, session.initialState, finalClip);
	}
}
