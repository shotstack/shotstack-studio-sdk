import { updateSvgAttribute } from "@core/shared/svg-utils";
import type { ResolvedClip, SvgAsset } from "@schemas";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";
import { EffectPanel } from "./composites/EffectPanel";
import { TransitionPanel } from "./composites/TransitionPanel";
import { DragStateManager } from "./drag-state-manager";
import { SliderControl } from "./primitives/SliderControl";

const ICONS = {
	opacity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3"/></svg>`,
	scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
	transition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 12H2l3-3 3 3H5"/><path d="M19 12h3l-3 3-3-3h3"/></svg>`,
	effect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M1 12h4M19 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`
};

type PopupName = "opacity" | "scale" | "transition" | "effect";

/**
 * Toolbar for editing SVG clip properties.
 *
 * Asset-level controls: fill color, corner radius (simple rect SVGs only).
 * Clip-level controls: opacity, scale, transition, effect.
 */
export class SvgToolbar extends BaseToolbar {
	// ─── SVG Asset Controls ──────────────────────────────────────────────────────
	private fillColorInput: HTMLInputElement | null = null;
	private cornerRadiusInput: HTMLInputElement | null = null;
	private currentFill = "#0000ff";
	private currentRadius = 0;

	// ─── Clip-Level Controls ─────────────────────────────────────────────────────
	private transitionPanel: TransitionPanel | null = null;
	private effectPanel: EffectPanel | null = null;
	private opacitySlider: SliderControl | null = null;
	private scaleSlider: SliderControl | null = null;

	// ─── Cached DOM References ───────────────────────────────────────────────────
	// Queried once at mount time. We own the template so these are guaranteed to exist.
	private readonly buttons = new Map<PopupName, HTMLButtonElement>();
	private readonly popups = new Map<PopupName, HTMLDivElement>();

	// ─── State ───────────────────────────────────────────────────────────────────
	// Single DragStateManager for all controls: "fill", "corner", "opacity", "scale"
	private dragManager = new DragStateManager();
	private abortController: AbortController | null = null;

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();
		this.container = document.createElement("div");
		this.container.className = "ss-toolbar ss-svg-toolbar";
		this.container.innerHTML = `
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

			<!-- SVG Asset Controls -->
			<input type="color" data-fill-color class="ss-toolbar-color-input" value="#0000ff" title="Fill color" />
			<div class="ss-toolbar-mode-divider"></div>
			<div class="ss-toolbar-slider-group--inline">
				<svg class="ss-toolbar-inline-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4 12 L4 7 Q4 4 7 4 L12 4"/>
				</svg>
				<input type="number" data-corner-radius-input
					   class="ss-toolbar-number-input" min="0" step="1" value="0"
					   title="Corner radius" />
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Clip-Level Visual Controls -->

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
		`;
		parent.insertBefore(this.container, parent.firstChild);

		// ─── Cache DOM References ────────────────────────────────────────────────
		const popupNames: PopupName[] = ["opacity", "scale", "transition", "effect"];
		for (const name of popupNames) {
			const btn = this.container.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
			const popup = this.container.querySelector<HTMLDivElement>(`[data-popup="${name}"]`);
			if (btn) this.buttons.set(name, btn);
			if (popup) this.popups.set(name, popup);
		}

		// ─── SVG Asset Controls ──────────────────────────────────────────────────
		this.fillColorInput = this.container.querySelector("[data-fill-color]");
		this.cornerRadiusInput = this.container.querySelector("[data-corner-radius-input]");
		this.setupFillColorControl();
		this.setupCornerRadiusControl();

		// ─── Clip-Level Composite Components ─────────────────────────────────────
		this.mountCompositeComponents();
		this.setupClipEventListeners();

		this.setupOutsideClickHandler();
		this.enableDrag();
	}

	// ─── SVG Asset Control Setup ──────────────────────────────────────────────────

	private setupFillColorControl(): void {
		if (!this.fillColorInput) return;

		this.fillColorInput.addEventListener("pointerdown", () => {
			this.startAssetDrag("fill");
		});

		this.fillColorInput.addEventListener("input", e => {
			this.currentFill = (e.target as HTMLInputElement).value;
			const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
			const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
			if (!clipId || !clip || clip.asset?.type !== "svg") return;

			const svgAsset = clip.asset as SvgAsset;
			if (!svgAsset.src) return;

			const updated = structuredClone(svgAsset);
			updated.src = updateSvgAttribute(svgAsset.src, "fill", this.currentFill);

			this.edit.updateClipInDocument(clipId, { asset: updated as ResolvedClip["asset"] });
			this.edit.resolveClip(clipId);
		});

		this.fillColorInput.addEventListener("change", () => {
			this.endAssetDrag("fill");
		});
	}

	private setupCornerRadiusControl(): void {
		if (!this.cornerRadiusInput) return;

		this.cornerRadiusInput.addEventListener("input", () => {
			try {
				// Capture initial state on first input (lazy start)
				if (!this.dragManager.isDragging("corner")) {
					this.startAssetDrag("corner");
				}

				this.currentRadius = parseInt(this.cornerRadiusInput!.value, 10);

				if (Number.isNaN(this.currentRadius)) {
					return;
				}

				const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
				const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);

				if (!clipId || !clip || clip.asset?.type !== "svg") {
					return;
				}

				const svgAsset = clip.asset as SvgAsset;
				if (!svgAsset.src) return;

				const doc = new DOMParser().parseFromString(svgAsset.src, "image/svg+xml");
				const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");

				const maxRadius = shape ? SvgToolbar.getMaxRadius(shape) : 100;

				const clampedRadius = Math.max(0, Math.min(this.currentRadius, maxRadius));
				if (clampedRadius !== this.currentRadius) {
					this.currentRadius = clampedRadius;
					this.cornerRadiusInput!.value = String(clampedRadius);
				}

				const updated = structuredClone(svgAsset);
				updated.src = updateSvgAttribute(svgAsset.src, "rx", String(clampedRadius));
				updated.src = updateSvgAttribute(updated.src, "ry", String(clampedRadius));

				this.edit.updateClipInDocument(clipId, { asset: updated as ResolvedClip["asset"] });
				this.edit.resolveClip(clipId);
			} catch (error) {
				console.error("[SVG Corner Radius] Error applying radius:", error);
				this.dragManager.end("corner");
			}
		});

		this.cornerRadiusInput.addEventListener("blur", () => {
			this.endAssetDrag("corner");
		});
	}

	/**
	 * Max corner radius is half the shortest side (same as Figma).
	 * Since viewBox units match pixel dimensions, rx/ry values are already in pixels.
	 */
	private static getMaxRadius(shape: Element): number {
		const rectWidth = parseFloat(shape.getAttribute("width") || "100");
		const rectHeight = parseFloat(shape.getAttribute("height") || "100");
		return Math.min(rectWidth, rectHeight) / 2;
	}

	// ─── Clip-Level Component Setup ──────────────────────────────────────────────

	private mountCompositeComponents(): void {
		const opacityMount = this.container?.querySelector("[data-opacity-slider-mount]");
		if (opacityMount) {
			this.opacitySlider = new SliderControl({
				label: "Opacity",
				min: 0,
				max: 100,
				initialValue: 100,
				formatValue: v => `${Math.round(v)}%`
			});
			this.opacitySlider.onDragStart(() => this.startAssetDrag("opacity"));
			this.opacitySlider.onChange(value => this.handleOpacityChange(value));
			this.opacitySlider.onDragEnd(() => this.endAssetDrag("opacity"));
			this.opacitySlider.mount(opacityMount as HTMLElement);
		}

		const scaleMount = this.container?.querySelector("[data-scale-slider-mount]");
		if (scaleMount) {
			this.scaleSlider = new SliderControl({
				label: "Scale",
				min: 10,
				max: 200,
				initialValue: 100,
				formatValue: v => `${Math.round(v)}%`
			});
			this.scaleSlider.onDragStart(() => this.startAssetDrag("scale"));
			this.scaleSlider.onChange(value => this.handleScaleChange(value));
			this.scaleSlider.onDragEnd(() => this.endAssetDrag("scale"));
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

	private setupClipEventListeners(): void {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		for (const [name, btn] of this.buttons) {
			btn.addEventListener(
				"click",
				(e: Event) => {
					e.stopPropagation();
					this.togglePopupByName(name);
				},
				{ signal }
			);
		}
	}

	// ─── Popup Management ─────────────────────────────────────────────────────────

	private togglePopupByName(name: PopupName): void {
		const popupEl = this.popups.get(name);
		const isCurrentlyOpen = popupEl?.classList.contains("visible");
		this.closeAllPopups();

		if (!isCurrentlyOpen) {
			this.togglePopup(popupEl ?? null);
			this.buttons.get(name)?.classList.add("active");
		}
	}

	protected override closeAllPopups(): void {
		super.closeAllPopups();
		for (const btn of this.buttons.values()) {
			btn.classList.remove("active");
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [...this.popups.values()];
	}

	// ─── Sync State ──────────────────────────────────────────────────────────────

	protected override syncState(): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip || clip.asset?.type !== "svg") {
			return;
		}

		// SVG asset controls
		const svgAsset = clip.asset as SvgAsset;
		if (svgAsset.src) {
			const doc = new DOMParser().parseFromString(svgAsset.src, "image/svg+xml");
			const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");
			if (shape) {
				this.currentFill = shape.getAttribute("fill") || "#0000ff";
				if (this.fillColorInput) this.fillColorInput.value = this.currentFill;

				const rx = shape.getAttribute("rx") || "0";
				const maxRadius = SvgToolbar.getMaxRadius(shape);

				if (this.cornerRadiusInput) {
					this.cornerRadiusInput.max = String(Math.round(maxRadius));
				}

				this.currentRadius = Math.round(parseFloat(rx));

				if (this.cornerRadiusInput) {
					this.cornerRadiusInput.value = String(this.currentRadius);
				}
			}
		}

		// Clip-level controls
		const opacity = typeof clip.opacity === "number" ? clip.opacity : 1;
		this.opacitySlider?.setValue(Math.round(opacity * 100));
		this.updateOpacityDisplay();

		const scale = typeof clip.scale === "number" ? clip.scale : 1;
		this.scaleSlider?.setValue(Math.round(scale * 100));
		this.updateScaleDisplay();

		this.transitionPanel?.setFromClip(clip.transition);
		this.effectPanel?.setFromClip(clip.effect);
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

	private captureClipState(): { clipId: string; initialState: ResolvedClip } | null {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		return clip && clipId ? { clipId, initialState: structuredClone(clip) } : null;
	}

	/** Start a drag session for any control (asset or clip-level). */
	private startAssetDrag(controlId: string): void {
		const state = this.captureClipState();
		if (state) {
			this.dragManager.start(controlId, state.clipId, state.initialState);
		}
	}

	/** End a drag session and commit a single undo entry. */
	private endAssetDrag(controlId: string): void {
		const session = this.dragManager.end(controlId);
		if (!session) return;

		const finalClip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (finalClip) {
			this.edit.commitClipUpdate(session.clipId, session.initialState, structuredClone(finalClip));
		}
	}

	// ─── Value Change Handlers ───────────────────────────────────────────────────

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

	private updateOpacityDisplay(): void {
		const value = this.opacitySlider?.getValue() ?? 100;
		const el = this.container?.querySelector("[data-opacity-value]");
		if (el) el.textContent = `${Math.round(value)}%`;
	}

	private updateScaleDisplay(): void {
		const value = this.scaleSlider?.getValue() ?? 100;
		const el = this.container?.querySelector("[data-scale-value]");
		if (el) el.textContent = `${Math.round(value)}%`;
	}

	// ─── Update Helpers ───────────────────────────────────────────────────────────

	private applyClipUpdate(updates: Record<string, unknown>): void {
		if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────────────

	override dispose(): void {
		this.abortController?.abort();
		this.abortController = null;

		this.dragManager.clear();

		this.buttons.clear();
		this.popups.clear();
		this.fillColorInput = null;
		this.cornerRadiusInput = null;

		this.transitionPanel?.dispose();
		this.effectPanel?.dispose();
		this.opacitySlider?.dispose();
		this.scaleSlider?.dispose();

		super.dispose();

		this.transitionPanel = null;
		this.effectPanel = null;
		this.opacitySlider = null;
		this.scaleSlider = null;
	}
}
