import { truncatePrompt } from "@core/shared/ai-asset-utils";
import { ShotstackEdit } from "@core/shotstack-edit";
import type { ResolvedClip, TextToImageAsset } from "@schemas";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";
import { EffectPanel } from "./composites/EffectPanel";
import { TransitionPanel } from "./composites/TransitionPanel";
import { DragStateManager } from "./drag-state-manager";
import { SliderControl } from "./primitives/SliderControl";

type FitValue = "crop" | "cover" | "contain" | "none";

interface FitOption {
	value: FitValue;
	label: string;
	description: string;
}

const FIT_OPTIONS: FitOption[] = [
	{ value: "crop", label: "Crop", description: "Fill frame, clip overflow" },
	{ value: "cover", label: "Cover", description: "Fill frame, keep ratio" },
	{ value: "contain", label: "Contain", description: "Fit inside frame" },
	{ value: "none", label: "None", description: "Original size" }
];

const DIMENSION_OPTIONS = [256, 512, 768, 1024, 1280];

const ICONS = {
	prompt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
	fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>`,
	opacity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3"/></svg>`,
	scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
	transition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 12H2l3-3 3 3H5"/><path d="M19 12h3l-3 3-3-3h3"/></svg>`,
	chevron: `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	check: `<svg class="checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
	effect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M1 12h4M19 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
	dimensions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>`
};

const PROMPT_DEBOUNCE_MS = 150;

export class TextToImageToolbar extends BaseToolbar {
	// ─── Current Values ──────────────────────────────────────────────────────────
	private currentFit: FitValue = "crop";
	private currentWidth: number = 1024;
	private currentHeight: number = 1024;

	// ─── Composite UI Components ─────────────────────────────────────────────────
	private transitionPanel: TransitionPanel | null = null;
	private effectPanel: EffectPanel | null = null;
	private opacitySlider: SliderControl | null = null;
	private scaleSlider: SliderControl | null = null;

	// ─── Cached Elements (only those accessed frequently or needing typed refs) ──
	private promptTextarea: HTMLTextAreaElement | null = null;

	// ─── State ───────────────────────────────────────────────────────────────────
	private dragManager = new DragStateManager();
	private promptDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private abortController: AbortController | null = null;

	// ─── DOM Query Helpers ────────────────────────────────────────────────────────

	private btn(name: PopupName): HTMLButtonElement | null {
		return this.container?.querySelector(`[data-action="${name}"]`) ?? null;
	}

	private popup(name: PopupName): HTMLDivElement | null {
		return this.container?.querySelector(`[data-popup="${name}"]`) ?? null;
	}

	private label(attr: string): HTMLSpanElement | null {
		return this.container?.querySelector(`[data-${attr}]`) ?? null;
	}

	/** Get the edit as ShotstackEdit if it has merge field capabilities */
	private getShotstackEdit(): ShotstackEdit | null {
		return this.edit instanceof ShotstackEdit ? this.edit : null;
	}

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-tti-toolbar";

		this.container.innerHTML = `
			<!-- Prompt Section -->
			<div class="ss-tti-prompt-section">
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn ss-tti-prompt-btn" data-action="prompt">
						${ICONS.prompt}
						<span class="ss-tti-prompt-text" data-prompt-text>Prompt</span>
					</button>
					<div class="ss-media-toolbar-popup ss-tti-prompt-popup" data-popup="prompt">
						<div class="ss-media-toolbar-popup-header">Prompt</div>
						<textarea class="ss-tti-prompt-textarea" data-prompt-textarea
							placeholder="Describe the image you want to generate..."
							rows="4"></textarea>
						<div class="ss-tti-prompt-hint">Use {{ FIELD_NAME }} for merge fields</div>
					</div>
				</div>
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Dimensions Section -->
			<div class="ss-tti-dimensions-section">
				<span class="ss-tti-dim-icon" title="Size of the AI-generated image">${ICONS.dimensions}</span>
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn ss-tti-dim-btn" data-action="width">
						<span data-width-label>1024</span>
						${ICONS.chevron}
					</button>
					<div class="ss-media-toolbar-popup" data-popup="width">
						<div class="ss-media-toolbar-popup-header">Generation Width</div>
						<div class="ss-tti-dim-description">Pixel width of the AI-generated image</div>
						${DIMENSION_OPTIONS.map(
							dim => `
							<div class="ss-media-toolbar-popup-item" data-dim-width="${dim}">
								<div class="ss-media-toolbar-popup-item-label">
									<span>${dim}px</span>
								</div>
								${ICONS.check}
							</div>
						`
						).join("")}
					</div>
				</div>
				<span class="ss-tti-dim-separator">×</span>
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn ss-tti-dim-btn" data-action="height">
						<span data-height-label>1024</span>
						${ICONS.chevron}
					</button>
					<div class="ss-media-toolbar-popup" data-popup="height">
						<div class="ss-media-toolbar-popup-header">Generation Height</div>
						<div class="ss-tti-dim-description">Pixel height of the AI-generated image</div>
						${DIMENSION_OPTIONS.map(
							dim => `
							<div class="ss-media-toolbar-popup-item" data-dim-height="${dim}">
								<div class="ss-media-toolbar-popup-item-label">
									<span>${dim}px</span>
								</div>
								${ICONS.check}
							</div>
						`
						).join("")}
					</div>
				</div>
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Visual Controls -->
			<div class="ss-tti-visual-section">
				<!-- Fit Dropdown -->
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="fit">
						${ICONS.fit}
						<span data-fit-label>Crop</span>
						${ICONS.chevron}
					</button>
					<div class="ss-media-toolbar-popup" data-popup="fit">
						${FIT_OPTIONS.map(
							opt => `
							<div class="ss-media-toolbar-popup-item" data-fit="${opt.value}">
								<div class="ss-media-toolbar-popup-item-label">
									<span>${opt.label}</span>
									<span class="ss-media-toolbar-popup-item-sublabel">${opt.description}</span>
								</div>
								${ICONS.check}
							</div>
						`
						).join("")}
					</div>
				</div>

				<div class="ss-media-toolbar-divider"></div>

				<!-- Opacity -->
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="opacity">
						${ICONS.opacity}
						<span data-opacity-value>100%</span>
					</button>
					<div class="ss-media-toolbar-popup ss-media-toolbar-popup--slider" data-popup="opacity">
						<div data-opacity-slider-mount></div>
					</div>
				</div>

				<div class="ss-media-toolbar-divider"></div>

				<!-- Scale -->
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="scale">
						${ICONS.scale}
						<span data-scale-value>100%</span>
					</button>
					<div class="ss-media-toolbar-popup ss-media-toolbar-popup--slider" data-popup="scale">
						<div data-scale-slider-mount></div>
					</div>
				</div>

				<div class="ss-media-toolbar-divider"></div>

				<!-- Transition -->
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="transition">
						${ICONS.transition}
						<span>Transition</span>
					</button>
					<div class="ss-media-toolbar-popup ss-media-toolbar-popup--transition" data-popup="transition">
						<div data-transition-panel-mount></div>
					</div>
				</div>

				<div class="ss-media-toolbar-divider"></div>

				<!-- Effect -->
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="effect">
						${ICONS.effect}
						<span>Effect</span>
					</button>
					<div class="ss-media-toolbar-popup ss-media-toolbar-popup--effect" data-popup="effect">
						<div data-effect-panel-mount></div>
					</div>
				</div>
			</div>
		`;

		parent.insertBefore(this.container, parent.firstChild);

		this.promptTextarea = this.container.querySelector("[data-prompt-textarea]");

		// ─── Mount Composite Components ──────────────────────────────────────────────
		this.mountCompositeComponents();

		this.setupEventListeners();
		this.setupOutsideClickHandler();
		this.enableDrag();
	}

	private mountCompositeComponents(): void {
		// Mount opacity slider (two-phase: live preview during drag, single undo on release)
		const opacityMount = this.container?.querySelector("[data-opacity-slider-mount]");
		if (opacityMount) {
			this.opacitySlider = new SliderControl({
				label: "Opacity",
				min: 0,
				max: 100,
				initialValue: 100,
				formatValue: v => `${Math.round(v)}%`
			});
			this.opacitySlider.onDragStart(() => this.startSliderDrag("opacity"));
			this.opacitySlider.onChange(value => this.handleOpacityChange(value));
			this.opacitySlider.onDragEnd(() => this.endSliderDrag("opacity"));
			this.opacitySlider.mount(opacityMount as HTMLElement);
		}

		// Mount scale slider (two-phase: live preview during drag, single undo on release)
		const scaleMount = this.container?.querySelector("[data-scale-slider-mount]");
		if (scaleMount) {
			this.scaleSlider = new SliderControl({
				label: "Scale",
				min: 10,
				max: 200,
				initialValue: 100,
				formatValue: v => `${Math.round(v)}%`
			});
			this.scaleSlider.onDragStart(() => this.startSliderDrag("scale"));
			this.scaleSlider.onChange(value => this.handleScaleChange(value));
			this.scaleSlider.onDragEnd(() => this.endSliderDrag("scale"));
			this.scaleSlider.mount(scaleMount as HTMLElement);
		}

		const transitionMount = this.container?.querySelector("[data-transition-panel-mount]");
		if (transitionMount) {
			this.transitionPanel = new TransitionPanel();
			this.transitionPanel.onChange(() => this.applyTransitionUpdate());
			this.transitionPanel.mount(transitionMount as HTMLElement);
		}

		const effectMount = this.container?.querySelector("[data-effect-panel-mount]");
		if (effectMount) {
			this.effectPanel = new EffectPanel();
			this.effectPanel.onChange(() => this.applyEffect());
			this.effectPanel.mount(effectMount as HTMLElement);
		}
	}

	private setupEventListeners(): void {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		// Toggle popups — bind all buttons by name
		const popupNames: PopupName[] = ["prompt", "width", "height", "fit", "opacity", "scale", "transition", "effect"];
		for (const name of popupNames) {
			this.btn(name)?.addEventListener(
				"click",
				e => {
					e.stopPropagation();
					this.togglePopupByName(name);
				},
				{ signal }
			);
		}

		// Prompt textarea input (debounced)
		this.promptTextarea?.addEventListener("input", () => this.debouncedApplyPromptEdit(), { signal });

		// Width options
		this.popup("width")
			?.querySelectorAll<HTMLElement>("[data-dim-width]")
			.forEach(item => {
				item.addEventListener("click", () => this.handleWidthChange(parseInt(item.dataset["dimWidth"] || "1024", 10)), { signal });
			});

		// Height options
		this.popup("height")
			?.querySelectorAll<HTMLElement>("[data-dim-height]")
			.forEach(item => {
				item.addEventListener("click", () => this.handleHeightChange(parseInt(item.dataset["dimHeight"] || "1024", 10)), { signal });
			});

		// Fit options
		this.popup("fit")
			?.querySelectorAll<HTMLElement>("[data-fit]")
			.forEach(item => {
				item.addEventListener("click", () => this.handleFitChange(item.dataset["fit"] as FitValue), { signal });
			});
	}

	// ─── Popup Management ─────────────────────────────────────────────────────────

	private togglePopupByName(name: PopupName): void {
		const popupEl = this.popup(name);
		const isCurrentlyOpen = popupEl?.classList.contains("visible");
		this.closeAllPopups();

		if (!isCurrentlyOpen) {
			this.togglePopup(popupEl);
			this.btn(name)?.classList.add("active");

			// Auto-focus textarea when prompt popup opens
			if (name === "prompt" && this.promptTextarea) {
				requestAnimationFrame(() => this.promptTextarea?.focus());
			}
		}
	}

	protected override closeAllPopups(): void {
		super.closeAllPopups();
		const names: PopupName[] = ["prompt", "width", "height", "fit", "opacity", "scale", "transition", "effect"];
		for (const name of names) {
			this.btn(name)?.classList.remove("active");
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		const names: PopupName[] = ["prompt", "width", "height", "fit", "opacity", "scale", "transition", "effect"];
		return names.map(name => this.popup(name));
	}

	// ─── Sync State ──────────────────────────────────────────────────────────────

	protected override syncState(): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip || clip.asset.type !== "text-to-image") return;

		const asset = clip.asset as TextToImageAsset;

		// Prompt - show merge field placeholder if present, otherwise resolved value
		if (this.promptTextarea) {
			const document = this.edit.getDocument();
			const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
			const binding = clipId ? document?.getClipBinding(clipId, "asset.prompt") : undefined;
			this.promptTextarea.value = binding?.placeholder ?? asset.prompt ?? "";
		}
		this.updatePromptDisplay(clip.asset as TextToImageAsset);

		// Dimensions
		this.currentWidth = asset.width ?? this.edit.size.width;
		this.currentHeight = asset.height ?? this.edit.size.height;
		this.updateWidthDisplay();
		this.updateHeightDisplay();
		this.updateDimensionActiveStates();

		// Fit
		this.currentFit = (clip.fit as FitValue) || "crop";
		this.updateFitDisplay();
		this.updateFitActiveState();

		// Opacity
		const opacity = typeof clip.opacity === "number" ? clip.opacity : 1;
		this.opacitySlider?.setValue(Math.round(opacity * 100));
		this.updateOpacityDisplay();

		// Scale
		const scale = typeof clip.scale === "number" ? clip.scale : 1;
		this.scaleSlider?.setValue(Math.round(scale * 100));
		this.updateScaleDisplay();

		// Transition
		this.transitionPanel?.setFromClip(clip.transition);

		// Effect
		this.effectPanel?.setFromClip(clip.effect);
	}

	// ─── Prompt Handlers ──────────────────────────────────────────────────────────

	private debouncedApplyPromptEdit(): void {
		if (this.promptDebounceTimer) {
			clearTimeout(this.promptDebounceTimer);
		}
		this.promptDebounceTimer = setTimeout(() => {
			const rawText = this.promptTextarea?.value ?? "";
			const shotstackEdit = this.getShotstackEdit();
			const resolvedText = shotstackEdit?.mergeFields.resolve(rawText) ?? rawText;

			const document = this.edit.getDocument();
			const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);

			if (shotstackEdit?.mergeFields.isMergeFieldTemplate(rawText)) {
				const binding = {
					placeholder: rawText,
					resolvedValue: resolvedText
				};
				if (clipId && document) {
					document.setClipBinding(clipId, "asset.prompt", binding);
				}
			} else if (clipId && document) {
				document.removeClipBinding(clipId, "asset.prompt");
			}

			this.updateAssetProperty({ prompt: resolvedText });
			this.updatePromptButtonText(rawText);
		}, PROMPT_DEBOUNCE_MS);
	}

	private updatePromptDisplay(asset: TextToImageAsset): void {
		const document = this.edit.getDocument();
		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		const binding = clipId ? document?.getClipBinding(clipId, "asset.prompt") : undefined;
		const displayText = binding?.placeholder ?? asset.prompt ?? "";
		this.updatePromptButtonText(displayText);
	}

	private updatePromptButtonText(text: string): void {
		const el = this.label("prompt-text");
		if (el) {
			el.textContent = text ? truncatePrompt(text, 20) : "Prompt";
			el.title = text || "";
		}
	}

	// ─── Dimension Handlers ───────────────────────────────────────────────────────

	private handleWidthChange(width: number): void {
		this.currentWidth = width;
		this.updateWidthDisplay();
		this.updateDimensionActiveStates();
		this.closeAllPopups();
		this.updateAssetProperty({ width });
	}

	private handleHeightChange(height: number): void {
		this.currentHeight = height;
		this.updateHeightDisplay();
		this.updateDimensionActiveStates();
		this.closeAllPopups();
		this.updateAssetProperty({ height });
	}

	private updateWidthDisplay(): void {
		const el = this.label("width-label");
		if (el) el.textContent = String(this.currentWidth);
	}

	private updateHeightDisplay(): void {
		const el = this.label("height-label");
		if (el) el.textContent = String(this.currentHeight);
	}

	private updateDimensionActiveStates(): void {
		this.popup("width")
			?.querySelectorAll<HTMLElement>("[data-dim-width]")
			.forEach(el => {
				el.classList.toggle("active", el.dataset["dimWidth"] === String(this.currentWidth));
			});
		this.popup("height")
			?.querySelectorAll<HTMLElement>("[data-dim-height]")
			.forEach(el => {
				el.classList.toggle("active", el.dataset["dimHeight"] === String(this.currentHeight));
			});
	}

	// ─── Two-Phase Drag Helpers ──────────────────────────────────────────────────
	//
	// Without this, every slider tick creates an undo command and Ctrl-Z steps
	// through dozens of intermediate values instead of reverting the whole drag.
	//
	//   pointerdown → snapshot clip state
	//   input       → live preview (bypass command system)
	//   change      → commit one undo entry for the entire gesture
	//
	// Text-input commits (blur / Enter) skip the drag path and go straight
	// through applyClipUpdate().

	/**
	 * Capture and deep-clone the current clip state for drag rollback.
	 */
	private captureClipState(): { clipId: string; initialState: ResolvedClip } | null {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		return clip && clipId ? { clipId, initialState: structuredClone(clip) } : null;
	}

	/**
	 * Start a drag session for a slider control.
	 */
	private startSliderDrag(controlId: string): void {
		const state = this.captureClipState();
		if (state) {
			this.dragManager.start(controlId, state.clipId, state.initialState);
		}
	}

	/**
	 * End a drag session and commit a single undo entry.
	 */
	private endSliderDrag(controlId: string): void {
		const session = this.dragManager.end(controlId);
		if (!session) return;

		const finalClip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (finalClip) {
			this.edit.commitClipUpdate(session.clipId, session.initialState, structuredClone(finalClip));
		}
	}

	// ─── Visual Control Handlers ──────────────────────────────────────────────────

	private handleFitChange(fit: FitValue): void {
		this.currentFit = fit;
		this.updateFitDisplay();
		this.updateFitActiveState();
		this.closeAllPopups();
		this.applyClipUpdate({ fit });
	}

	private handleOpacityChange(value: number): void {
		this.updateOpacityDisplay();

		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clipId) return;

		const updates = { opacity: value / 100 };

		if (this.dragManager.isDragging("opacity")) {
			this.edit.updateClipInDocument(clipId, updates);
			this.edit.resolveClip(clipId);
		} else {
			this.applyClipUpdate(updates);
		}
	}

	private handleScaleChange(value: number): void {
		this.updateScaleDisplay();

		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clipId) return;

		const updates = { scale: value / 100 };

		if (this.dragManager.isDragging("scale")) {
			this.edit.updateClipInDocument(clipId, updates);
			this.edit.resolveClip(clipId);
		} else {
			this.applyClipUpdate(updates);
		}
	}

	private applyTransitionUpdate(): void {
		const transition = this.transitionPanel?.getClipValue();
		this.applyClipUpdate({ transition });
	}

	private applyEffect(): void {
		const effectValue = this.effectPanel?.getClipValue();
		this.applyClipUpdate({ effect: effectValue });
	}

	// ─── Display Updates ──────────────────────────────────────────────────────────

	private updateFitDisplay(): void {
		const el = this.label("fit-label");
		if (el) {
			const option = FIT_OPTIONS.find(o => o.value === this.currentFit);
			el.textContent = option?.label || "Crop";
		}
	}

	private updateFitActiveState(): void {
		this.popup("fit")
			?.querySelectorAll<HTMLElement>("[data-fit]")
			.forEach(el => {
				el.classList.toggle("active", el.dataset["fit"] === this.currentFit);
			});
	}

	private updateOpacityDisplay(): void {
		const value = this.opacitySlider?.getValue() ?? 100;
		const text = `${Math.round(value)}%`;
		const opacityValue = this.container?.querySelector("[data-opacity-value]");
		if (opacityValue) opacityValue.textContent = text;
	}

	private updateScaleDisplay(): void {
		const value = this.scaleSlider?.getValue() ?? 100;
		const text = `${Math.round(value)}%`;
		const scaleValue = this.container?.querySelector("[data-scale-value]");
		if (scaleValue) scaleValue.textContent = text;
	}

	// ─── Update Helpers ───────────────────────────────────────────────────────────

	private updateAssetProperty(updates: Partial<TextToImageAsset>): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip || clip.asset.type !== "text-to-image") return;

		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: { ...clip.asset, ...updates } as TextToImageAsset
		});
	}

	private applyClipUpdate(updates: Record<string, unknown>): void {
		if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────────

	override dispose(): void {
		this.abortController?.abort();
		this.abortController = null;

		// Clear any in-progress drag sessions
		this.dragManager.clear();

		if (this.promptDebounceTimer) {
			clearTimeout(this.promptDebounceTimer);
			this.promptDebounceTimer = null;
		}

		this.transitionPanel?.dispose();
		this.effectPanel?.dispose();
		this.opacitySlider?.dispose();
		this.scaleSlider?.dispose();

		super.dispose();

		this.transitionPanel = null;
		this.effectPanel = null;
		this.opacitySlider = null;
		this.scaleSlider = null;
		this.promptTextarea = null;
	}
}

type PopupName = "prompt" | "width" | "height" | "fit" | "opacity" | "scale" | "transition" | "effect";
