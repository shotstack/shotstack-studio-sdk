import type { Edit } from "@core/edit-session";
import { validateAssetUrl } from "@core/shared/utils";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";
import { EffectPanel } from "./composites/EffectPanel";
import { TransitionPanel } from "./composites/TransitionPanel";
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

const ICONS = {
	fit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>`,
	opacity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3"/></svg>`,
	scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
	volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
	volumeMute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
	transition: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 12H2l3-3 3 3H5"/><path d="M19 12h3l-3 3-3-3h3"/></svg>`,
	chevron: `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	check: `<svg class="checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
	moreVertical: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
	effect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M1 12h4M19 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
	fadeIn: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14 L14 4 L30 4"/></svg>`,
	fadeOut: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4 L18 4 L30 14"/></svg>`,
	fadeInOut: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14 L10 4 L22 4 L30 14"/></svg>`,
	fadeNone: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 10 L30 10"/></svg>`
};

type MediaAssetType = "video" | "image" | "audio";

export interface MediaToolbarOptions {
	mergeFields?: boolean;
}

export class MediaToolbar extends BaseToolbar {
	private showMergeFields: boolean;
	private assetType: MediaAssetType = "image";

	constructor(edit: Edit, options: MediaToolbarOptions = {}) {
		super(edit);
		this.showMergeFields = options.mergeFields ?? false;
	}

	// Current values
	private currentFit: FitValue = "crop";
	private currentVolume: number = 100;

	// ─── Composite UI Components ─────────────────────────────────────────────────
	private transitionPanel: TransitionPanel | null = null;
	private effectPanel: EffectPanel | null = null;
	private opacitySlider: SliderControl | null = null;
	private scaleSlider: SliderControl | null = null;

	// ─── Button Elements ─────────────────────────────────────────────────────────
	private fitBtn: HTMLButtonElement | null = null;
	private opacityBtn: HTMLButtonElement | null = null;
	private scaleBtn: HTMLButtonElement | null = null;
	private volumeBtn: HTMLButtonElement | null = null;
	private transitionBtn: HTMLButtonElement | null = null;
	private effectBtn: HTMLButtonElement | null = null;
	private advancedBtn: HTMLButtonElement | null = null;
	private audioFadeBtn: HTMLButtonElement | null = null;

	// ─── Popup Elements ──────────────────────────────────────────────────────────
	private fitPopup: HTMLDivElement | null = null;
	private opacityPopup: HTMLDivElement | null = null;
	private scalePopup: HTMLDivElement | null = null;
	private volumePopup: HTMLDivElement | null = null;
	private transitionPopup: HTMLDivElement | null = null;
	private effectPopup: HTMLDivElement | null = null;
	private advancedPopup: HTMLDivElement | null = null;
	private audioFadePopup: HTMLDivElement | null = null;

	// ─── Other Elements ──────────────────────────────────────────────────────────
	private fitLabel: HTMLSpanElement | null = null;
	private volumeSlider: HTMLInputElement | null = null;
	private volumeValue: HTMLSpanElement | null = null;
	private volumeSection: HTMLDivElement | null = null;
	private visualSection: HTMLDivElement | null = null;
	private audioSection: HTMLDivElement | null = null;

	// ─── Advanced Menu ───────────────────────────────────────────────────────────
	private dynamicToggle: HTMLInputElement | null = null;
	private dynamicPanel: HTMLDivElement | null = null;
	private dynamicInput: HTMLInputElement | null = null;

	// ─── State ───────────────────────────────────────────────────────────────────
	private audioFadeEffect: "" | "fadeIn" | "fadeOut" | "fadeInFadeOut" = "";
	private isDynamicSource: boolean = false;
	private dynamicFieldName: string = "";
	private originalSrc: string = "";

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-media-toolbar";

		this.container.innerHTML = `
			<!-- Mode Toggle -->
			<div class="ss-toolbar-mode-toggle" data-mode="asset">
				<button class="ss-toolbar-mode-btn active" data-mode="asset" title="Asset properties (Tab)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="2" width="12" height="12" rx="1.5"/>
						<path d="M2 6h12M6 6v8"/>
					</svg>
				</button>
				<button class="ss-toolbar-mode-btn" data-mode="clip" title="Clip timing (Tab)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<circle cx="8" cy="8" r="6"/>
						<path d="M8 5v3l2 2"/>
					</svg>
				</button>
				<span class="ss-toolbar-mode-indicator"></span>
			</div>
			<div class="ss-toolbar-mode-divider"></div>

			<!-- Visual controls (hidden for audio) -->
			<div class="ss-media-toolbar-visual" data-visual-section>
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

			<!-- Volume (video and audio only) -->
			<div class="ss-media-toolbar-volume" data-volume-section>
				<div class="ss-media-toolbar-divider"></div>
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="volume">
						<span data-volume-icon>${ICONS.volume}</span>
						<span data-volume-value>100%</span>
					</button>
					<div class="ss-media-toolbar-popup ss-media-toolbar-popup--slider" data-popup="volume">
						<div class="ss-media-toolbar-popup-header">Volume</div>
						<div class="ss-media-toolbar-slider-row">
							<input type="range" class="ss-media-toolbar-slider" data-volume-slider min="0" max="100" value="100" />
							<span class="ss-media-toolbar-slider-value" data-volume-display>100%</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Audio Section - only visible for audio assets -->
			<div class="ss-media-toolbar-audio" data-audio-section>
				<div class="ss-media-toolbar-divider"></div>
				<div class="ss-media-toolbar-dropdown">
					<button class="ss-media-toolbar-btn" data-action="audio-fade">
						${ICONS.fadeNone}
						<span>Fade</span>
						${ICONS.chevron}
					</button>
					<div class="ss-media-toolbar-popup ss-media-toolbar-popup--audio-fade" data-popup="audio-fade">
						<div class="ss-audio-fade-options">
							<button class="ss-audio-fade-btn" data-audio-fade="">
								<span class="ss-audio-fade-icon">${ICONS.fadeNone}</span>
								<span class="ss-audio-fade-label">None</span>
							</button>
							<button class="ss-audio-fade-btn" data-audio-fade="fadeIn">
								<span class="ss-audio-fade-icon">${ICONS.fadeIn}</span>
								<span class="ss-audio-fade-label">Fade In</span>
							</button>
							<button class="ss-audio-fade-btn" data-audio-fade="fadeOut">
								<span class="ss-audio-fade-icon">${ICONS.fadeOut}</span>
								<span class="ss-audio-fade-label">Fade Out</span>
							</button>
							<button class="ss-audio-fade-btn" data-audio-fade="fadeInFadeOut">
								<span class="ss-audio-fade-icon">${ICONS.fadeInOut}</span>
								<span class="ss-audio-fade-label">Both</span>
							</button>
						</div>
					</div>
				</div>
			</div>

			${
				this.showMergeFields
					? `
			<div class="ss-media-toolbar-divider" data-divider-before-advanced></div>

			<!-- Advanced Menu (Dynamic Source for merge fields) -->
			<div class="ss-media-toolbar-dropdown">
				<button class="ss-media-toolbar-btn ss-media-toolbar-btn--icon" data-action="advanced" data-tooltip="Advanced">
					${ICONS.moreVertical}
				</button>
				<div class="ss-media-toolbar-popup ss-media-toolbar-popup--advanced" data-popup="advanced">
					<div class="ss-advanced-option">
						<span class="ss-advanced-label">Dynamic Source</span>
						<label class="ss-toggle">
							<input type="checkbox" data-dynamic-toggle />
							<span class="ss-toggle-slider"></span>
						</label>
					</div>
					<div class="ss-dynamic-panel" data-dynamic-panel>
						<input type="text"
							class="ss-dynamic-input"
							data-dynamic-input
							placeholder="Enter default URL..." />
					</div>
				</div>
			</div>
			`
					: ""
			}
		`;

		parent.insertBefore(this.container, parent.firstChild);

		// Query elements
		this.fitBtn = this.container.querySelector('[data-action="fit"]');
		this.opacityBtn = this.container.querySelector('[data-action="opacity"]');
		this.scaleBtn = this.container.querySelector('[data-action="scale"]');
		this.volumeBtn = this.container.querySelector('[data-action="volume"]');
		this.transitionBtn = this.container.querySelector('[data-action="transition"]');
		this.effectBtn = this.container.querySelector('[data-action="effect"]');
		this.advancedBtn = this.container.querySelector('[data-action="advanced"]');
		this.audioFadeBtn = this.container.querySelector('[data-action="audio-fade"]');

		this.fitPopup = this.container.querySelector('[data-popup="fit"]');
		this.opacityPopup = this.container.querySelector('[data-popup="opacity"]');
		this.scalePopup = this.container.querySelector('[data-popup="scale"]');
		this.volumePopup = this.container.querySelector('[data-popup="volume"]');
		this.transitionPopup = this.container.querySelector('[data-popup="transition"]');
		this.effectPopup = this.container.querySelector('[data-popup="effect"]');
		this.advancedPopup = this.container.querySelector('[data-popup="advanced"]');
		this.audioFadePopup = this.container.querySelector('[data-popup="audio-fade"]');

		this.fitLabel = this.container.querySelector("[data-fit-label]");
		this.volumeValue = this.container.querySelector("[data-volume-value]");
		this.volumeSlider = this.container.querySelector("[data-volume-slider]");
		this.volumeSection = this.container.querySelector("[data-volume-section]");
		this.visualSection = this.container.querySelector("[data-visual-section]");
		this.audioSection = this.container.querySelector("[data-audio-section]");

		this.dynamicToggle = this.container.querySelector("[data-dynamic-toggle]");
		this.dynamicPanel = this.container.querySelector("[data-dynamic-panel]");
		this.dynamicInput = this.container.querySelector("[data-dynamic-input]");

		// ─── Mount Composite Components ──────────────────────────────────────────────
		this.mountCompositeComponents();

		this.setupEventListeners();
		this.setupOutsideClickHandler();
	}

	/**
	 * Mount composite UI components into their placeholder elements.
	 */
	private mountCompositeComponents(): void {
		// Mount opacity slider
		const opacityMount = this.container?.querySelector("[data-opacity-slider-mount]");
		if (opacityMount) {
			this.opacitySlider = new SliderControl({
				label: "Opacity",
				min: 0,
				max: 100,
				initialValue: 100,
				formatValue: v => `${Math.round(v)}%`
			});
			this.opacitySlider.onChange(value => this.handleOpacityChange(value));
			this.opacitySlider.mount(opacityMount as HTMLElement);
		}

		// Mount scale slider
		const scaleMount = this.container?.querySelector("[data-scale-slider-mount]");
		if (scaleMount) {
			this.scaleSlider = new SliderControl({
				label: "Scale",
				min: 10,
				max: 200,
				initialValue: 100,
				formatValue: v => `${Math.round(v)}%`
			});
			this.scaleSlider.onChange(value => this.handleScaleChange(value));
			this.scaleSlider.mount(scaleMount as HTMLElement);
		}

		// Mount transition panel
		const transitionMount = this.container?.querySelector("[data-transition-panel-mount]");
		if (transitionMount) {
			this.transitionPanel = new TransitionPanel();
			this.transitionPanel.onChange(() => this.applyTransitionUpdate());
			this.transitionPanel.mount(transitionMount as HTMLElement);
		}

		// Mount effect panel
		const effectMount = this.container?.querySelector("[data-effect-panel-mount]");
		if (effectMount) {
			this.effectPanel = new EffectPanel();
			this.effectPanel.onChange(() => this.applyEffect());
			this.effectPanel.mount(effectMount as HTMLElement);
		}
	}

	private setupEventListeners(): void {
		// Toggle popups
		this.fitBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("fit");
		});
		this.opacityBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("opacity");
		});
		this.scaleBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("scale");
		});
		this.volumeBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("volume");
		});
		this.transitionBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("transition");
		});
		this.effectBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("effect");
		});
		this.advancedBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("advanced");
		});
		this.audioFadeBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("audio-fade");
		});

		// Dynamic source handlers
		this.setupDynamicSourceHandlers();

		// Fit options
		this.fitPopup?.querySelectorAll("[data-fit]").forEach(item => {
			item.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const fit = el.dataset["fit"] as FitValue;
				this.handleFitChange(fit);
			});
		});

		// Volume slider
		this.volumeSlider?.addEventListener("input", () => {
			const value = parseInt(this.volumeSlider!.value, 10);
			this.handleVolumeChange(value);
		});

		// Audio fade options
		this.audioFadePopup?.querySelectorAll("[data-audio-fade]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const fadeValue = el.dataset["audioFade"] || "";
				this.handleAudioFadeSelect(fadeValue as "" | "fadeIn" | "fadeOut" | "fadeInFadeOut");
			});
		});
	}

	private togglePopupByName(popup: "fit" | "opacity" | "scale" | "volume" | "transition" | "effect" | "advanced" | "audio-fade"): void {
		const popupMap = {
			fit: { popup: this.fitPopup, btn: this.fitBtn },
			opacity: { popup: this.opacityPopup, btn: this.opacityBtn },
			scale: { popup: this.scalePopup, btn: this.scaleBtn },
			volume: { popup: this.volumePopup, btn: this.volumeBtn },
			transition: { popup: this.transitionPopup, btn: this.transitionBtn },
			effect: { popup: this.effectPopup, btn: this.effectBtn },
			advanced: { popup: this.advancedPopup, btn: this.advancedBtn },
			"audio-fade": { popup: this.audioFadePopup, btn: this.audioFadeBtn }
		};

		const isCurrentlyOpen = popupMap[popup].popup?.classList.contains("visible");
		this.closeAllPopups();

		if (!isCurrentlyOpen) {
			this.togglePopup(popupMap[popup].popup);
			popupMap[popup].btn?.classList.add("active");
		}
	}

	protected override closeAllPopups(): void {
		super.closeAllPopups();

		// Also remove active state from buttons
		this.fitBtn?.classList.remove("active");
		this.opacityBtn?.classList.remove("active");
		this.scaleBtn?.classList.remove("active");
		this.volumeBtn?.classList.remove("active");
		this.transitionBtn?.classList.remove("active");
		this.effectBtn?.classList.remove("active");
		this.advancedBtn?.classList.remove("active");
		this.audioFadeBtn?.classList.remove("active");
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [
			this.fitPopup,
			this.opacityPopup,
			this.scalePopup,
			this.volumePopup,
			this.transitionPopup,
			this.effectPopup,
			this.advancedPopup,
			this.audioFadePopup
		];
	}

	protected override syncState(): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (player) {
			const clip = player.clipConfiguration;

			// Fit
			this.currentFit = (clip.fit as FitValue) || "crop";

			// Opacity (convert from 0-1 to 0-100)
			const opacity = typeof clip.opacity === "number" ? clip.opacity : 1;
			this.opacitySlider?.setValue(Math.round(opacity * 100));

			// Scale (convert from 0-1 to percentage)
			const scale = typeof clip.scale === "number" ? clip.scale : 1;
			this.scaleSlider?.setValue(Math.round(scale * 100));

			// Volume (video and audio only)
			if ((this.assetType === "video" || this.assetType === "audio") && (clip.asset.type === "video" || clip.asset.type === "audio")) {
				const volume = typeof clip.asset.volume === "number" ? clip.asset.volume : 1;
				this.currentVolume = Math.round(volume * 100);
			}

			// Transition - use composite
			this.transitionPanel?.setFromClip(clip.transition);

			// Effect - use composite
			this.effectPanel?.setFromClip(clip.effect);

			// Audio fade effect (for audio assets)
			if (clip.asset.type === "audio") {
				this.audioFadeEffect = (clip.asset.effect as "" | "fadeIn" | "fadeOut" | "fadeInFadeOut") || "";
			}
		}

		// Update displays
		this.updateFitDisplay();
		this.updateOpacityDisplay();
		this.updateScaleDisplay();
		this.updateVolumeDisplay();

		// Update active states
		this.updateFitActiveState();
		this.updateAudioFadeUI();
		this.updateDynamicSourceUI();

		// Show/hide visual section (hidden for audio)
		if (this.visualSection) {
			this.visualSection.classList.toggle("hidden", this.assetType === "audio");
		}

		// Show/hide volume section (hidden for image)
		if (this.volumeSection) {
			this.volumeSection.classList.toggle("hidden", this.assetType === "image");
		}

		// Show/hide audio section (only visible for audio)
		if (this.audioSection) {
			this.audioSection.classList.toggle("hidden", this.assetType !== "audio");
		}
	}

	// ─── Value Change Handlers ───────────────────────────────────────────────────

	private handleFitChange(fit: FitValue): void {
		this.currentFit = fit;
		this.updateFitDisplay();
		this.updateFitActiveState();
		this.closeAllPopups();
		this.applyClipUpdate({ fit });
	}

	private handleOpacityChange(value: number): void {
		this.updateOpacityDisplay();
		this.applyClipUpdate({ opacity: value / 100 });
	}

	private handleScaleChange(value: number): void {
		this.updateScaleDisplay();
		this.applyClipUpdate({ scale: value / 100 });
	}

	private handleVolumeChange(value: number): void {
		this.currentVolume = value;
		this.updateVolumeDisplay();

		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (player && (player.clipConfiguration.asset.type === "video" || player.clipConfiguration.asset.type === "audio")) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
				asset: {
					...player.clipConfiguration.asset,
					volume: value / 100
				}
			});
		}
	}

	// ─── Transition (using composite) ────────────────────────────────────────────

	private applyTransitionUpdate(): void {
		const transition = this.transitionPanel?.getClipValue();
		this.applyClipUpdate({ transition });
	}

	// ─── Effect (using composite) ────────────────────────────────────────────────

	private applyEffect(): void {
		const effectValue = this.effectPanel?.getClipValue();
		this.applyClipUpdate({ effect: effectValue });
	}

	// ─── Audio Fade Handlers ─────────────────────────────────────────────────────

	private handleAudioFadeSelect(effect: "" | "fadeIn" | "fadeOut" | "fadeInFadeOut"): void {
		this.audioFadeEffect = effect;
		this.updateAudioFadeUI();
		this.applyAudioFade();
	}

	private applyAudioFade(): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player || player.clipConfiguration.asset.type !== "audio") return;

		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: {
				...player.clipConfiguration.asset,
				effect: this.audioFadeEffect || undefined
			}
		});
	}

	private updateAudioFadeUI(): void {
		if (!this.audioFadePopup) return;

		const buttons = this.audioFadePopup.querySelectorAll("[data-audio-fade]");
		buttons.forEach(btn => {
			const fadeValue = (btn as HTMLElement).dataset["audioFade"] || "";
			btn.classList.toggle("active", fadeValue === this.audioFadeEffect);
		});

		if (this.audioFadeBtn) {
			const iconMap: Record<string, string> = {
				"": ICONS.fadeNone,
				fadeIn: ICONS.fadeIn,
				fadeOut: ICONS.fadeOut,
				fadeInFadeOut: ICONS.fadeInOut
			};
			const svg = this.audioFadeBtn.querySelector("svg");
			if (svg) {
				svg.outerHTML = iconMap[this.audioFadeEffect] || ICONS.fadeNone;
			}
		}
	}

	private applyClipUpdate(updates: Record<string, unknown>): void {
		if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	// ─── Dynamic Source Handlers ─────────────────────────────────────────────────

	private setupDynamicSourceHandlers(): void {
		this.dynamicToggle?.addEventListener("change", () => {
			const checked = this.dynamicToggle?.checked || false;
			this.isDynamicSource = checked;

			if (this.dynamicPanel) {
				this.dynamicPanel.style.display = checked ? "block" : "none";
			}

			if (checked) {
				this.dynamicInput?.focus();
			} else {
				this.clearDynamicSource();
			}
		});

		this.dynamicInput?.addEventListener("keydown", e => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.applyDynamicUrl();
			} else if (e.key === "Escape") {
				this.dynamicInput?.blur();
			}
		});

		this.dynamicInput?.addEventListener("blur", () => {
			this.applyDynamicUrl();
		});
	}

	private async applyDynamicUrl(): Promise<void> {
		const url = (this.dynamicInput?.value || "").trim();
		if (!url) return;

		const validation = await validateAssetUrl(url);
		if (!validation.valid) {
			this.showUrlError(validation.error || "Invalid URL");
			return;
		}

		this.clearUrlError();

		if (this.dynamicFieldName) {
			this.edit.updateMergeFieldValueLive(this.dynamicFieldName, url);
			const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
			if (player) {
				player.reloadAsset();
			}
			return;
		}

		const fieldName = this.edit.mergeFields.generateUniqueName("MEDIA");
		this.edit.applyMergeField(this.selectedTrackIdx, this.selectedClipIdx, "asset.src", fieldName, url, this.originalSrc);
		this.dynamicFieldName = fieldName;
	}

	private showUrlError(message: string): void {
		if (this.dynamicInput) {
			this.dynamicInput.classList.add("error");
			this.dynamicInput.title = message;
		}
	}

	private clearUrlError(): void {
		if (this.dynamicInput) {
			this.dynamicInput.classList.remove("error");
			this.dynamicInput.title = "";
		}
	}

	private clearDynamicSource(): void {
		if (!this.dynamicFieldName) return;

		this.edit.removeMergeField(this.selectedTrackIdx, this.selectedClipIdx, "asset.src", this.originalSrc);
		this.dynamicFieldName = "";
		if (this.dynamicInput) {
			this.dynamicInput.value = "";
		}
	}

	private updateDynamicSourceUI(): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		const fieldName = this.edit.getMergeFieldForProperty(this.selectedTrackIdx, this.selectedClipIdx, "asset.src");

		if (fieldName) {
			this.isDynamicSource = true;
			this.dynamicFieldName = fieldName;
			if (this.dynamicToggle) this.dynamicToggle.checked = true;
			if (this.dynamicPanel) this.dynamicPanel.style.display = "block";

			const mergeField = this.edit.mergeFields.get(fieldName);
			if (this.dynamicInput) {
				this.dynamicInput.value = mergeField?.defaultValue || "";
			}
		} else {
			this.isDynamicSource = false;
			this.dynamicFieldName = "";

			const asset = player.clipConfiguration.asset as { src?: string };
			this.originalSrc = asset?.src || "";

			if (this.dynamicToggle) this.dynamicToggle.checked = false;
			if (this.dynamicPanel) this.dynamicPanel.style.display = "none";
			if (this.dynamicInput) this.dynamicInput.value = "";
		}
	}

	// ─── Display Updates ─────────────────────────────────────────────────────────

	private updateFitDisplay(): void {
		if (this.fitLabel) {
			const option = FIT_OPTIONS.find(o => o.value === this.currentFit);
			this.fitLabel.textContent = option?.label || "Crop";
		}
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

	private updateVolumeDisplay(): void {
		const text = `${this.currentVolume}%`;
		if (this.volumeValue) this.volumeValue.textContent = text;
		if (this.volumeSlider) this.volumeSlider.value = String(this.currentVolume);

		const display = this.volumePopup?.querySelector("[data-volume-display]");
		if (display) display.textContent = text;

		const iconContainer = this.container?.querySelector("[data-volume-icon]");
		if (iconContainer) {
			iconContainer.innerHTML = this.currentVolume === 0 ? ICONS.volumeMute : ICONS.volume;
		}
	}

	private updateFitActiveState(): void {
		this.fitPopup?.querySelectorAll("[data-fit]").forEach(item => {
			const el = item as HTMLElement;
			el.classList.toggle("active", el.dataset["fit"] === this.currentFit);
		});
	}

	/**
	 * Show the toolbar for a specific clip.
	 * Derives assetType from the clip's asset configuration.
	 */
	override show(trackIndex: number, clipIndex: number): void {
		const player = this.edit.getPlayerClip(trackIndex, clipIndex);
		this.assetType = (player?.clipConfiguration.asset?.type ?? "image") as MediaAssetType;
		super.show(trackIndex, clipIndex);
	}

	override dispose(): void {
		// Dispose composite components
		this.transitionPanel?.dispose();
		this.effectPanel?.dispose();
		this.opacitySlider?.dispose();
		this.scaleSlider?.dispose();

		super.dispose();

		this.transitionPanel = null;
		this.effectPanel = null;
		this.opacitySlider = null;
		this.scaleSlider = null;

		this.fitBtn = null;
		this.opacityBtn = null;
		this.scaleBtn = null;
		this.volumeBtn = null;
		this.transitionBtn = null;
		this.effectBtn = null;
		this.advancedBtn = null;
		this.audioFadeBtn = null;

		this.fitPopup = null;
		this.opacityPopup = null;
		this.scalePopup = null;
		this.volumePopup = null;
		this.transitionPopup = null;
		this.effectPopup = null;
		this.advancedPopup = null;
		this.audioFadePopup = null;

		this.fitLabel = null;
		this.volumeSlider = null;
		this.volumeValue = null;
		this.volumeSection = null;
		this.visualSection = null;
		this.audioSection = null;

		this.dynamicToggle = null;
		this.dynamicPanel = null;
		this.dynamicInput = null;
	}
}
