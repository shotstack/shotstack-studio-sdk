import type { Edit } from "@core/edit-session";
import type { RichCaptionAsset, ResolvedClip } from "@schemas";

import { RichTextToolbar } from "./rich-text-toolbar";

/**
 * Toolbar for rich-caption clips. Extends RichTextToolbar to reuse shared
 * property controls (font, style, spacing, fill, shadow) while hiding
 * text-edit / animation / transition / effect controls and adding
 * caption-specific panels: Layout, Word Animation, and Active Word.
 */
export class RichCaptionToolbar extends RichTextToolbar {
	// Caption popup panels
	private layoutPopup: HTMLDivElement | null = null;
	private wordAnimPopup: HTMLDivElement | null = null;
	private activeWordPopup: HTMLDivElement | null = null;

	// Layout slider refs
	private maxWidthSlider: HTMLInputElement | null = null;
	private maxWidthValue: HTMLSpanElement | null = null;

	// Word Animation slider refs
	private wordAnimSpeedSlider: HTMLInputElement | null = null;
	private wordAnimSpeedValue: HTMLSpanElement | null = null;
	private wordAnimDirectionSection: HTMLDivElement | null = null;

	// Active Word control refs
	private activeColorInput: HTMLInputElement | null = null;
	private activeOpacitySlider: HTMLInputElement | null = null;
	private activeOpacityValue: HTMLSpanElement | null = null;
	private activeBgColorInput: HTMLInputElement | null = null;
	private activeScaleSlider: HTMLInputElement | null = null;
	private activeScaleValue: HTMLSpanElement | null = null;

	// Current slider values during drag (for final commit)
	private currentMaxWidth = 0.9;
	private currentWordAnimSpeed = 1;
	private currentActiveOpacity = 1;
	private currentActiveScale = 1;

	constructor(edit: Edit) {
		super(edit);
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────

	override mount(parent: HTMLElement): void {
		super.mount(parent);
		if (!this.container) return;

		// Hide rich-text controls irrelevant to captions
		for (const action of ["text-edit-toggle", "animation-toggle", "transition-toggle", "effect-toggle", "underline", "linethrough"]) {
			const btn = this.container.querySelector(`[data-action="${action}"]`) as HTMLElement | null;
			if (!btn) continue;
			const dropdown = btn.closest(".ss-toolbar-dropdown") as HTMLElement | null;
			(dropdown ?? btn).style.display = "none";
		}

		this.injectCaptionControls();
	}

	override dispose(): void {
		super.dispose();
		this.layoutPopup = null;
		this.wordAnimPopup = null;
		this.activeWordPopup = null;
		this.maxWidthSlider = null;
		this.maxWidthValue = null;
		this.wordAnimSpeedSlider = null;
		this.wordAnimSpeedValue = null;
		this.wordAnimDirectionSection = null;
		this.activeColorInput = null;
		this.activeOpacitySlider = null;
		this.activeOpacityValue = null;
		this.activeBgColorInput = null;
		this.activeScaleSlider = null;
		this.activeScaleValue = null;
	}

	// ─── Overrides ─────────────────────────────────────────────────────

	protected override handleClick(e: MouseEvent): void {
		const button = (e.target as HTMLElement).closest("button");
		if (!button) return;

		const { action } = button.dataset;
		if (!action) return;

		switch (action) {
			case "caption-layout-toggle":
				this.togglePopup(this.layoutPopup);
				return;
			case "caption-word-anim-toggle":
				this.togglePopup(this.wordAnimPopup);
				return;
			case "caption-active-word-toggle":
				this.togglePopup(this.activeWordPopup);
				return;
		}

		super.handleClick(e);
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [...super.getPopupList(), this.layoutPopup, this.wordAnimPopup, this.activeWordPopup];
	}

	protected override syncState(): void {
		super.syncState();

		const asset = this.getCaptionAsset();
		if (!asset) return;

		// ─── Layout ────────────────────────────────────────
		const position = asset.position ?? "bottom";
		this.container?.querySelectorAll<HTMLButtonElement>("[data-caption-position]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["captionPosition"] === position);
		});

		const maxWidth = asset.maxWidth ?? 0.9;
		if (this.maxWidthSlider) this.maxWidthSlider.value = String(maxWidth);
		if (this.maxWidthValue) this.maxWidthValue.textContent = `${Math.round(maxWidth * 100)}%`;

		const maxLines = asset.maxLines ?? 2;
		this.container?.querySelectorAll<HTMLButtonElement>("[data-caption-max-lines]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["captionMaxLines"] === String(maxLines));
		});

		// ─── Word Animation ────────────────────────────────
		const wordAnim = asset.wordAnimation;
		const animStyle = wordAnim?.style ?? "karaoke";
		this.container?.querySelectorAll<HTMLButtonElement>("[data-caption-word-style]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["captionWordStyle"] === animStyle);
		});

		const speed = wordAnim?.speed ?? 1;
		if (this.wordAnimSpeedSlider) this.wordAnimSpeedSlider.value = String(speed);
		if (this.wordAnimSpeedValue) this.wordAnimSpeedValue.textContent = `${speed.toFixed(1)}x`;

		if (this.wordAnimDirectionSection) {
			this.wordAnimDirectionSection.style.display = animStyle === "slide" ? "" : "none";
		}

		const direction = wordAnim?.direction ?? "up";
		this.container?.querySelectorAll<HTMLButtonElement>("[data-caption-word-direction]").forEach(btn => {
			this.setButtonActive(btn, btn.dataset["captionWordDirection"] === direction);
		});

		// ─── Active Word ───────────────────────────────────
		if (this.activeColorInput) this.activeColorInput.value = asset.active?.font?.color ?? "#ffff00";

		const opacity = asset.active?.font?.opacity ?? 1;
		if (this.activeOpacitySlider) this.activeOpacitySlider.value = String(opacity);
		if (this.activeOpacityValue) this.activeOpacityValue.textContent = `${Math.round(opacity * 100)}%`;

		if (this.activeBgColorInput) this.activeBgColorInput.value = asset.active?.font?.background ?? "#000000";

		const scale = asset.active?.scale ?? 1;
		if (this.activeScaleSlider) this.activeScaleSlider.value = String(scale);
		if (this.activeScaleValue) this.activeScaleValue.textContent = `${scale.toFixed(1)}x`;
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

		// ── Layout Group ───────────────────────────────────
		const layoutDropdown = document.createElement("div");
		layoutDropdown.className = "ss-toolbar-dropdown";
		layoutDropdown.innerHTML = `
			<button data-action="caption-layout-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Caption layout">Layout</button>
			<div data-caption-layout-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Position</div>
					<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
						<button class="ss-toolbar-anchor-btn" data-caption-position="top">Top</button>
						<button class="ss-toolbar-anchor-btn" data-caption-position="center">Center</button>
						<button class="ss-toolbar-anchor-btn" data-caption-position="bottom">Bottom</button>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Max Width</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-caption-max-width class="ss-toolbar-slider" min="0.1" max="1" step="0.05" value="0.9" />
						<span data-caption-max-width-value class="ss-toolbar-popup-value">90%</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Max Lines</div>
					<div class="ss-toolbar-popup-row ss-toolbar-popup-row--buttons">
						<button class="ss-toolbar-anchor-btn" data-caption-max-lines="1">1</button>
						<button class="ss-toolbar-anchor-btn" data-caption-max-lines="2">2</button>
						<button class="ss-toolbar-anchor-btn" data-caption-max-lines="3">3</button>
						<button class="ss-toolbar-anchor-btn" data-caption-max-lines="4">4</button>
					</div>
				</div>
			</div>
		`;
		this.layoutPopup = layoutDropdown.querySelector("[data-caption-layout-popup]");
		this.maxWidthSlider = layoutDropdown.querySelector("[data-caption-max-width]");
		this.maxWidthValue = layoutDropdown.querySelector("[data-caption-max-width-value]");
		fragment.appendChild(layoutDropdown);

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
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Speed</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-caption-word-speed class="ss-toolbar-slider" min="0.5" max="2" step="0.1" value="1" />
						<span data-caption-word-speed-value class="ss-toolbar-popup-value">1.0x</span>
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
		this.wordAnimSpeedSlider = wordAnimDropdown.querySelector("[data-caption-word-speed]");
		this.wordAnimSpeedValue = wordAnimDropdown.querySelector("[data-caption-word-speed-value]");
		this.wordAnimDirectionSection = wordAnimDropdown.querySelector("[data-caption-word-direction-section]");
		fragment.appendChild(wordAnimDropdown);

		// ── Active Word Group ──────────────────────────────
		const activeWordDropdown = document.createElement("div");
		activeWordDropdown.className = "ss-toolbar-dropdown";
		activeWordDropdown.innerHTML = `
			<button data-action="caption-active-word-toggle" class="ss-toolbar-btn ss-toolbar-btn--text-edit" title="Active word style">Active</button>
			<div data-caption-active-popup class="ss-toolbar-popup ss-toolbar-popup--wide">
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Color</div>
					<div class="ss-toolbar-popup-row">
						<input type="color" data-caption-active-color value="#ffff00"
							style="width:32px;height:24px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;background:none;cursor:pointer;padding:0;" />
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Opacity</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-caption-active-opacity class="ss-toolbar-slider" min="0" max="1" step="0.05" value="1" />
						<span data-caption-active-opacity-value class="ss-toolbar-popup-value">100%</span>
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Background</div>
					<div class="ss-toolbar-popup-row">
						<input type="color" data-caption-active-bg value="#000000"
							style="width:32px;height:24px;border:1px solid rgba(255,255,255,0.15);border-radius:4px;background:none;cursor:pointer;padding:0;" />
					</div>
				</div>
				<div class="ss-toolbar-popup-section">
					<div class="ss-toolbar-popup-label">Scale</div>
					<div class="ss-toolbar-popup-row">
						<input type="range" data-caption-active-scale class="ss-toolbar-slider" min="0.5" max="2" step="0.05" value="1" />
						<span data-caption-active-scale-value class="ss-toolbar-popup-value">1.0x</span>
					</div>
				</div>
			</div>
		`;
		this.activeWordPopup = activeWordDropdown.querySelector("[data-caption-active-popup]");
		this.activeColorInput = activeWordDropdown.querySelector("[data-caption-active-color]");
		this.activeOpacitySlider = activeWordDropdown.querySelector("[data-caption-active-opacity]");
		this.activeOpacityValue = activeWordDropdown.querySelector("[data-caption-active-opacity-value]");
		this.activeBgColorInput = activeWordDropdown.querySelector("[data-caption-active-bg]");
		this.activeScaleSlider = activeWordDropdown.querySelector("[data-caption-active-scale]");
		this.activeScaleValue = activeWordDropdown.querySelector("[data-caption-active-scale-value]");
		fragment.appendChild(activeWordDropdown);

		this.container.appendChild(fragment);

		this.wireLayoutControls(layoutDropdown);
		this.wireWordAnimControls(wordAnimDropdown);
		this.wireActiveWordControls();
	}

	// ─── Layout Wiring ─────────────────────────────────────────────────

	private wireLayoutControls(root: HTMLElement): void {
		// Position buttons (discrete command)
		root.querySelectorAll<HTMLButtonElement>("[data-caption-position]").forEach(btn => {
			btn.addEventListener("click", () => {
				const pos = btn.dataset["captionPosition"];
				if (pos) this.updateClipProperty({ position: pos });
			});
		});

		// Max Width slider (two-phase drag)
		this.maxWidthSlider?.addEventListener("pointerdown", () => {
			const state = this.captureClipState();
			if (state) this.dragManager.start("caption-max-width", state.clipId, state.initialState);
		});
		this.maxWidthSlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.currentMaxWidth = value;
			if (this.maxWidthValue) this.maxWidthValue.textContent = `${Math.round(value * 100)}%`;
			this.liveCaptionUpdate(asset => ({ ...asset, maxWidth: value }));
		});
		this.maxWidthSlider?.addEventListener("change", () => {
			this.commitCaptionDrag("caption-max-width", a => {
				a["maxWidth"] = this.currentMaxWidth;
			});
		});

		// Max Lines buttons (discrete command)
		root.querySelectorAll<HTMLButtonElement>("[data-caption-max-lines]").forEach(btn => {
			btn.addEventListener("click", () => {
				const lines = parseInt(btn.dataset["captionMaxLines"]!, 10);
				if (lines) this.updateClipProperty({ maxLines: lines });
			});
		});
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

		// Speed slider (two-phase drag)
		this.wordAnimSpeedSlider?.addEventListener("pointerdown", () => {
			const state = this.captureClipState();
			if (state) this.dragManager.start("caption-word-speed", state.clipId, state.initialState);
		});
		this.wordAnimSpeedSlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.currentWordAnimSpeed = value;
			if (this.wordAnimSpeedValue) this.wordAnimSpeedValue.textContent = `${value.toFixed(1)}x`;
			this.liveCaptionUpdate(asset => ({
				...asset,
				wordAnimation: { ...(asset.wordAnimation ?? {}), speed: value }
			}));
		});
		this.wordAnimSpeedSlider?.addEventListener("change", () => {
			this.commitCaptionDrag("caption-word-speed", a => {
				const wa = { ...((a["wordAnimation"] as Record<string, unknown>) ?? {}) };
				wa["speed"] = this.currentWordAnimSpeed;
				a["wordAnimation"] = wa;
			});
		});

		// Direction buttons (discrete command)
		root.querySelectorAll<HTMLButtonElement>("[data-caption-word-direction]").forEach(btn => {
			btn.addEventListener("click", () => {
				const direction = btn.dataset["captionWordDirection"];
				if (!direction) return;
				const asset = this.getCaptionAsset();
				this.updateClipProperty({ wordAnimation: { ...(asset?.wordAnimation ?? {}), direction } });
			});
		});
	}

	// ─── Active Word Wiring ────────────────────────────────────────────

	private wireActiveWordControls(): void {
		// Color (discrete command on change)
		this.activeColorInput?.addEventListener("change", () => {
			const color = this.activeColorInput!.value;
			const asset = this.getCaptionAsset();
			this.updateClipProperty({
				active: { ...(asset?.active ?? {}), font: { ...(asset?.active?.font ?? {}), color } }
			});
		});

		// Opacity slider (two-phase drag)
		this.activeOpacitySlider?.addEventListener("pointerdown", () => {
			const state = this.captureClipState();
			if (state) this.dragManager.start("caption-active-opacity", state.clipId, state.initialState);
		});
		this.activeOpacitySlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.currentActiveOpacity = value;
			if (this.activeOpacityValue) this.activeOpacityValue.textContent = `${Math.round(value * 100)}%`;
			this.liveCaptionUpdate(asset => ({
				...asset,
				active: { ...(asset.active ?? {}), font: { ...(asset.active?.font ?? {}), opacity: value } }
			}));
		});
		this.activeOpacitySlider?.addEventListener("change", () => {
			this.commitCaptionDrag("caption-active-opacity", a => {
				const active = { ...((a["active"] as Record<string, unknown>) ?? {}) };
				const font = { ...((active["font"] as Record<string, unknown>) ?? {}) };
				font["opacity"] = this.currentActiveOpacity;
				active["font"] = font;
				a["active"] = active;
			});
		});

		// Background color (discrete command on change)
		this.activeBgColorInput?.addEventListener("change", () => {
			const bg = this.activeBgColorInput!.value;
			const asset = this.getCaptionAsset();
			this.updateClipProperty({
				active: { ...(asset?.active ?? {}), font: { ...(asset?.active?.font ?? {}), background: bg } }
			});
		});

		// Scale slider (two-phase drag)
		this.activeScaleSlider?.addEventListener("pointerdown", () => {
			const state = this.captureClipState();
			if (state) this.dragManager.start("caption-active-scale", state.clipId, state.initialState);
		});
		this.activeScaleSlider?.addEventListener("input", e => {
			const value = parseFloat((e.target as HTMLInputElement).value);
			this.currentActiveScale = value;
			if (this.activeScaleValue) this.activeScaleValue.textContent = `${value.toFixed(1)}x`;
			this.liveCaptionUpdate(asset => ({
				...asset,
				active: { ...(asset.active ?? {}), scale: value }
			}));
		});
		this.activeScaleSlider?.addEventListener("change", () => {
			this.commitCaptionDrag("caption-active-scale", a => {
				const active = { ...((a["active"] as Record<string, unknown>) ?? {}) };
				active["scale"] = this.currentActiveScale;
				a["active"] = active;
			});
		});
	}

	// ─── Two-Phase Drag Helpers ────────────────────────────────────────

	/**
	 * Live-update the caption asset during a slider drag (no undo command).
	 */
	private liveCaptionUpdate(mutate: (asset: RichCaptionAsset) => Record<string, unknown>): void {
		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clipId) return;
		const asset = this.getCaptionAsset();
		if (!asset) return;

		this.edit.updateClipInDocument(clipId, { asset: mutate(asset) as ResolvedClip["asset"] });
		this.edit.resolveClip(clipId);
	}

	/**
	 * End a drag session and commit a single undo command.
	 */
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
