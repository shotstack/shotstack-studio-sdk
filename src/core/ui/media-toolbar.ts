import { validateAssetUrl } from "@core/shared/utils";

import { BaseToolbar } from "./base-toolbar";
import { MEDIA_TOOLBAR_STYLES } from "./media-toolbar.css";

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
	moreVertical: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`
};

export class MediaToolbar extends BaseToolbar {
	private isVideoClip: boolean = false;

	// Current values
	private currentFit: FitValue = "crop";
	private currentOpacity: number = 100;
	private currentScale: number = 100;
	private currentVolume: number = 100;

	// Transition state (tabbed design)
	private activeTransitionTab: "in" | "out" = "in";
	private transitionInEffect: string = "";
	private transitionInDirection: string = "";
	private transitionInSpeed: number = 1.0; // Speed in seconds
	private transitionOutEffect: string = "";
	private transitionOutDirection: string = "";
	private transitionOutSpeed: number = 1.0; // Speed in seconds

	// Speed step values in seconds
	private readonly SPEED_VALUES = [0.25, 0.5, 1.0, 2.0];

	// Transition popup elements
	private directionRow: HTMLDivElement | null = null;
	private speedValueLabel: HTMLSpanElement | null = null;

	// Button elements
	private fitBtn: HTMLButtonElement | null = null;
	private opacityBtn: HTMLButtonElement | null = null;
	private scaleBtn: HTMLButtonElement | null = null;
	private volumeBtn: HTMLButtonElement | null = null;
	private transitionBtn: HTMLButtonElement | null = null;

	// Popup elements
	private fitPopup: HTMLDivElement | null = null;
	private opacityPopup: HTMLDivElement | null = null;
	private scalePopup: HTMLDivElement | null = null;
	private volumePopup: HTMLDivElement | null = null;
	private transitionPopup: HTMLDivElement | null = null;

	// Slider elements
	private opacitySlider: HTMLInputElement | null = null;
	private scaleSlider: HTMLInputElement | null = null;
	private volumeSlider: HTMLInputElement | null = null;

	// Value display elements
	private fitLabel: HTMLSpanElement | null = null;
	private opacityValue: HTMLSpanElement | null = null;
	private scaleValue: HTMLSpanElement | null = null;
	private volumeValue: HTMLSpanElement | null = null;

	// Volume section
	private volumeSection: HTMLDivElement | null = null;

	// Advanced menu elements
	private advancedBtn: HTMLButtonElement | null = null;
	private advancedPopup: HTMLDivElement | null = null;
	private dynamicToggle: HTMLInputElement | null = null;
	private dynamicPanel: HTMLDivElement | null = null;
	private dynamicInput: HTMLInputElement | null = null;

	// Dynamic source state
	private isDynamicSource: boolean = false;
	private dynamicFieldName: string = "";
	private originalSrc: string = "";

	override mount(parent: HTMLElement): void {
		this.injectStyles("ss-media-toolbar-styles", MEDIA_TOOLBAR_STYLES);

		this.container = document.createElement("div");
		this.container.className = "ss-media-toolbar";

		this.container.innerHTML = `
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
					<div class="ss-media-toolbar-popup-header">Opacity</div>
					<div class="ss-media-toolbar-slider-row">
						<input type="range" class="ss-media-toolbar-slider" data-opacity-slider min="0" max="100" value="100" />
						<span class="ss-media-toolbar-slider-value" data-opacity-display>100%</span>
					</div>
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
					<div class="ss-media-toolbar-popup-header">Scale</div>
					<div class="ss-media-toolbar-slider-row">
						<input type="range" class="ss-media-toolbar-slider" data-scale-slider min="10" max="200" value="100" />
						<span class="ss-media-toolbar-slider-value" data-scale-display>100%</span>
					</div>
				</div>
			</div>

			<!-- Volume (video only) -->
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

			<div class="ss-media-toolbar-divider"></div>

			<!-- Transition -->
			<div class="ss-media-toolbar-dropdown">
				<button class="ss-media-toolbar-btn" data-action="transition">
					${ICONS.transition}
					<span>Transition</span>
				</button>
				<div class="ss-media-toolbar-popup ss-media-toolbar-popup--transition" data-popup="transition">
					<!-- Tabs -->
					<div class="ss-transition-tabs">
						<button class="ss-transition-tab active" data-tab="in">In</button>
						<button class="ss-transition-tab" data-tab="out">Out</button>
					</div>

					<!-- Effects Grid -->
					<div class="ss-transition-effects">
						<button class="ss-transition-effect" data-effect="">None</button>
						<button class="ss-transition-effect" data-effect="fade">Fade</button>
						<button class="ss-transition-effect" data-effect="zoom">Zoom</button>
						<button class="ss-transition-effect" data-effect="slide">Slide</button>
						<button class="ss-transition-effect" data-effect="wipe">Wipe</button>
						<button class="ss-transition-effect" data-effect="carousel">Car</button>
					</div>

					<!-- Direction Row (progressive disclosure) -->
					<div class="ss-transition-direction-row" data-direction-row>
						<span class="ss-transition-label">Direction</span>
						<div class="ss-transition-directions">
							<button class="ss-transition-dir" data-dir="Left">←</button>
							<button class="ss-transition-dir" data-dir="Right">→</button>
							<button class="ss-transition-dir" data-dir="Up">↑</button>
							<button class="ss-transition-dir" data-dir="Down">↓</button>
						</div>
					</div>

					<!-- Speed Stepper -->
					<div class="ss-transition-speed-row">
						<span class="ss-transition-label">Speed</span>
						<div class="ss-transition-speed-stepper">
							<button class="ss-transition-speed-btn" data-speed-decrease>−</button>
							<span class="ss-transition-speed-value" data-speed-value>1.0s</span>
							<button class="ss-transition-speed-btn" data-speed-increase>+</button>
						</div>
					</div>
				</div>
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Advanced Menu -->
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
		`;

		parent.insertBefore(this.container, parent.firstChild);

		// Query elements
		this.fitBtn = this.container.querySelector('[data-action="fit"]');
		this.opacityBtn = this.container.querySelector('[data-action="opacity"]');
		this.scaleBtn = this.container.querySelector('[data-action="scale"]');
		this.volumeBtn = this.container.querySelector('[data-action="volume"]');
		this.transitionBtn = this.container.querySelector('[data-action="transition"]');

		this.fitPopup = this.container.querySelector('[data-popup="fit"]');
		this.opacityPopup = this.container.querySelector('[data-popup="opacity"]');
		this.scalePopup = this.container.querySelector('[data-popup="scale"]');
		this.volumePopup = this.container.querySelector('[data-popup="volume"]');
		this.transitionPopup = this.container.querySelector('[data-popup="transition"]');

		this.fitLabel = this.container.querySelector("[data-fit-label]");
		this.opacityValue = this.container.querySelector("[data-opacity-value]");
		this.scaleValue = this.container.querySelector("[data-scale-value]");
		this.volumeValue = this.container.querySelector("[data-volume-value]");

		this.opacitySlider = this.container.querySelector("[data-opacity-slider]");
		this.scaleSlider = this.container.querySelector("[data-scale-slider]");
		this.volumeSlider = this.container.querySelector("[data-volume-slider]");

		this.volumeSection = this.container.querySelector("[data-volume-section]");

		// Transition elements
		this.directionRow = this.container.querySelector("[data-direction-row]");
		this.speedValueLabel = this.container.querySelector("[data-speed-value]");

		// Advanced menu elements
		this.advancedBtn = this.container.querySelector('[data-action="advanced"]');
		this.advancedPopup = this.container.querySelector('[data-popup="advanced"]');
		this.dynamicToggle = this.container.querySelector("[data-dynamic-toggle]");
		this.dynamicPanel = this.container.querySelector("[data-dynamic-panel]");
		this.dynamicInput = this.container.querySelector("[data-dynamic-input]");

		this.setupEventListeners();
		this.setupOutsideClickHandler();
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
		this.advancedBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopupByName("advanced");
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

		// Opacity slider
		this.opacitySlider?.addEventListener("input", () => {
			const value = parseInt(this.opacitySlider!.value, 10);
			this.handleOpacityChange(value);
		});

		// Scale slider
		this.scaleSlider?.addEventListener("input", () => {
			const value = parseInt(this.scaleSlider!.value, 10);
			this.handleScaleChange(value);
		});

		// Volume slider
		this.volumeSlider?.addEventListener("input", () => {
			const value = parseInt(this.volumeSlider!.value, 10);
			this.handleVolumeChange(value);
		});

		// Transition tabs
		this.transitionPopup?.querySelectorAll("[data-tab]").forEach(tab => {
			tab.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const tabValue = el.dataset["tab"] as "in" | "out";
				this.handleTabChange(tabValue);
			});
		});

		// Effect buttons
		this.transitionPopup?.querySelectorAll("[data-effect]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const effect = el.dataset["effect"] || "";
				this.handleEffectSelect(effect);
			});
		});

		// Direction buttons
		this.transitionPopup?.querySelectorAll("[data-dir]").forEach(btn => {
			btn.addEventListener("click", e => {
				const el = e.currentTarget as HTMLElement;
				const dir = el.dataset["dir"] || "";
				this.handleDirectionSelect(dir);
			});
		});

		// Speed stepper buttons
		const speedDecrease = this.transitionPopup?.querySelector("[data-speed-decrease]");
		const speedIncrease = this.transitionPopup?.querySelector("[data-speed-increase]");
		speedDecrease?.addEventListener("click", () => this.handleSpeedStep(-1));
		speedIncrease?.addEventListener("click", () => this.handleSpeedStep(1));
	}

	private togglePopupByName(popup: "fit" | "opacity" | "scale" | "volume" | "transition" | "advanced"): void {
		const popupMap = {
			fit: { popup: this.fitPopup, btn: this.fitBtn },
			opacity: { popup: this.opacityPopup, btn: this.opacityBtn },
			scale: { popup: this.scalePopup, btn: this.scaleBtn },
			volume: { popup: this.volumePopup, btn: this.volumeBtn },
			transition: { popup: this.transitionPopup, btn: this.transitionBtn },
			advanced: { popup: this.advancedPopup, btn: this.advancedBtn }
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
		this.advancedBtn?.classList.remove("active");
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [this.fitPopup, this.opacityPopup, this.scalePopup, this.volumePopup, this.transitionPopup, this.advancedPopup];
	}

	protected override syncState(): void {
		// Get current clip values
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (player) {
			const clip = player.clipConfiguration;

			// Fit
			this.currentFit = (clip.fit as FitValue) || "crop";

			// Opacity (convert from 0-1 to 0-100)
			const opacity = typeof clip.opacity === "number" ? clip.opacity : 1;
			this.currentOpacity = Math.round(opacity * 100);

			// Scale (convert from 0-1 to percentage)
			const scale = typeof clip.scale === "number" ? clip.scale : 1;
			this.currentScale = Math.round(scale * 100);

			// Volume (video only)
			if (this.isVideoClip && clip.asset.type === "video") {
				const volume = typeof clip.asset.volume === "number" ? clip.asset.volume : 1;
				this.currentVolume = Math.round(volume * 100);
			}

			// Transition - parse effect, direction, and speed
			const parsedIn = this.parseTransitionValue(clip.transition?.in || "");
			const parsedOut = this.parseTransitionValue(clip.transition?.out || "");
			this.transitionInEffect = parsedIn.effect;
			this.transitionInDirection = parsedIn.direction;
			this.transitionInSpeed = parsedIn.speed;
			this.transitionOutEffect = parsedOut.effect;
			this.transitionOutDirection = parsedOut.direction;
			this.transitionOutSpeed = parsedOut.speed;
		}

		// Update displays
		this.updateFitDisplay();
		this.updateOpacityDisplay();
		this.updateScaleDisplay();
		this.updateVolumeDisplay();

		// Update active states
		this.updateFitActiveState();

		// Reset to IN tab and update transition UI
		this.activeTransitionTab = "in";
		this.updateTransitionUI();

		// Update dynamic source state
		this.updateDynamicSourceUI();

		// Show/hide volume section based on asset type
		if (this.volumeSection) {
			this.volumeSection.classList.toggle("hidden", !this.isVideoClip);
		}
	}

	private handleFitChange(fit: FitValue): void {
		this.currentFit = fit;
		this.updateFitDisplay();
		this.updateFitActiveState();
		this.closeAllPopups();
		this.applyClipUpdate({ fit });
	}

	private handleOpacityChange(value: number): void {
		this.currentOpacity = value;
		this.updateOpacityDisplay();
		this.applyClipUpdate({ opacity: value / 100 });
	}

	private handleScaleChange(value: number): void {
		this.currentScale = value;
		this.updateScaleDisplay();
		this.applyClipUpdate({ scale: value / 100 });
	}

	private handleVolumeChange(value: number): void {
		this.currentVolume = value;
		this.updateVolumeDisplay();

		// Volume is on the asset, not the clip
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (player && player.clipConfiguration.asset.type === "video") {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
				asset: {
					...player.clipConfiguration.asset,
					volume: value / 100
				}
			});
		}
	}

	// ==================== Transition Handlers ====================

	private handleTabChange(tab: "in" | "out"): void {
		this.activeTransitionTab = tab;
		this.updateTransitionUI();
	}

	private handleEffectSelect(effect: string): void {
		const tab = this.activeTransitionTab;

		if (tab === "in") {
			this.transitionInEffect = effect;
			this.transitionInDirection = this.getDefaultDirection(effect);
		} else {
			this.transitionOutEffect = effect;
			this.transitionOutDirection = this.getDefaultDirection(effect);
		}

		this.updateTransitionUI();
		this.applyTransitionUpdate();
	}

	private handleDirectionSelect(direction: string): void {
		const tab = this.activeTransitionTab;

		if (tab === "in") {
			this.transitionInDirection = direction;
		} else {
			this.transitionOutDirection = direction;
		}

		this.updateTransitionUI();
		this.applyTransitionUpdate();
	}

	private handleSpeedStep(direction: number): void {
		const tab = this.activeTransitionTab;
		const currentSpeed = tab === "in" ? this.transitionInSpeed : this.transitionOutSpeed;

		// Find current index in speed values
		let currentIdx = this.SPEED_VALUES.indexOf(currentSpeed);
		if (currentIdx === -1) {
			// Find closest value
			currentIdx = this.SPEED_VALUES.findIndex(v => v >= currentSpeed);
			if (currentIdx === -1) currentIdx = this.SPEED_VALUES.length - 1;
		}

		// Calculate new index
		const newIdx = Math.max(0, Math.min(this.SPEED_VALUES.length - 1, currentIdx + direction));
		const newSpeed = this.SPEED_VALUES[newIdx];

		if (tab === "in") {
			this.transitionInSpeed = newSpeed;
		} else {
			this.transitionOutSpeed = newSpeed;
		}

		this.updateTransitionUI();
		this.applyTransitionUpdate();
	}

	private needsDirection(effect: string): boolean {
		return ["slide", "wipe", "carousel"].includes(effect);
	}

	private getDefaultDirection(effect: string): string {
		if (this.needsDirection(effect)) {
			return "Right";
		}
		return "";
	}

	private speedToSuffix(speed: number, effect: string): string {
		// For slide/carousel: default is 0.5s (Fast), so mapping is different
		// No suffix → 0.5s, Slow → 1.0s, Fast → 0.25s
		// For others (fade, zoom, wipe): default is 1.0s
		// No suffix → 1.0s, Slow → 2.0s, Fast → 0.5s

		const isSlideOrCarousel = effect === "slide" || effect === "carousel";

		if (isSlideOrCarousel) {
			if (speed === 0.5) return ""; // Default for slide/carousel
			if (speed === 1.0) return "Slow";
			if (speed === 0.25) return "Fast";
			if (speed === 2.0) return "Slow"; // Approximate
		} else {
			if (speed === 1.0) return ""; // Default for fade/zoom/wipe
			if (speed === 2.0) return "Slow";
			if (speed === 0.5) return "Fast";
			if (speed === 0.25) return "Fast"; // Approximate
		}
		return "";
	}

	private buildTransitionValue(effect: string, direction: string, speed: number): string {
		if (!effect) return "";

		const speedSuffix = this.speedToSuffix(speed, effect);

		// For effects without direction (fade, zoom)
		if (!this.needsDirection(effect)) {
			return effect + speedSuffix;
		}

		// For directional effects: slide + Right = slideRight
		return effect + direction + speedSuffix;
	}

	private suffixToSpeed(suffix: string, effect: string): number {
		// Reverse mapping from speedToSuffix
		const isSlideOrCarousel = effect === "slide" || effect === "carousel";

		if (isSlideOrCarousel) {
			if (suffix === "") return 0.5; // Default for slide/carousel
			if (suffix === "Slow") return 1.0;
			if (suffix === "Fast") return 0.25;
		} else {
			if (suffix === "") return 1.0; // Default for fade/zoom/wipe
			if (suffix === "Slow") return 2.0;
			if (suffix === "Fast") return 0.5;
		}
		return 1.0;
	}

	private parseTransitionValue(value: string): { effect: string; direction: string; speed: number } {
		if (!value) return { effect: "", direction: "", speed: 1.0 };

		// Extract speed suffix first
		let speedSuffix = "";
		let base = value;
		if (value.endsWith("Fast")) {
			speedSuffix = "Fast";
			base = value.slice(0, -4);
		} else if (value.endsWith("Slow")) {
			speedSuffix = "Slow";
			base = value.slice(0, -4);
		}

		// Check for directional effects
		const directions = ["Left", "Right", "Up", "Down"];
		for (const dir of directions) {
			if (base.endsWith(dir)) {
				const effect = base.slice(0, -dir.length);
				const speed = this.suffixToSpeed(speedSuffix, effect);
				return { effect, direction: dir, speed };
			}
		}

		// Non-directional effect (fade, zoom)
		const speed = this.suffixToSpeed(speedSuffix, base);
		return { effect: base, direction: "", speed };
	}

	private applyTransitionUpdate(): void {
		const transitionIn = this.buildTransitionValue(this.transitionInEffect, this.transitionInDirection, this.transitionInSpeed);
		const transitionOut = this.buildTransitionValue(this.transitionOutEffect, this.transitionOutDirection, this.transitionOutSpeed);

		const transition: { in?: string; out?: string } = {};
		if (transitionIn) {
			transition.in = transitionIn;
		}
		if (transitionOut) {
			transition.out = transitionOut;
		}

		if (!transitionIn && !transitionOut) {
			this.applyClipUpdate({ transition: undefined });
		} else {
			this.applyClipUpdate({ transition });
		}
	}

	private updateTransitionUI(): void {
		const tab = this.activeTransitionTab;
		const effect = tab === "in" ? this.transitionInEffect : this.transitionOutEffect;
		const direction = tab === "in" ? this.transitionInDirection : this.transitionOutDirection;
		const speed = tab === "in" ? this.transitionInSpeed : this.transitionOutSpeed;

		// Update tab active states
		this.transitionPopup?.querySelectorAll("[data-tab]").forEach(el => {
			const tabEl = el as HTMLElement;
			tabEl.classList.toggle("active", tabEl.dataset["tab"] === tab);
		});

		// Update effect active states
		this.transitionPopup?.querySelectorAll("[data-effect]").forEach(el => {
			const effectEl = el as HTMLElement;
			effectEl.classList.toggle("active", effectEl.dataset["effect"] === effect);
		});

		// Update direction visibility and active states
		const showDirection = this.needsDirection(effect);
		this.directionRow?.classList.toggle("visible", showDirection);

		// Hide Up/Down for wipe (only Left/Right)
		this.transitionPopup?.querySelectorAll("[data-dir]").forEach(el => {
			const dirEl = el as HTMLElement;
			const dir = dirEl.dataset["dir"] || "";
			const isVertical = dir === "Up" || dir === "Down";
			dirEl.classList.toggle("hidden", effect === "wipe" && isVertical);
			dirEl.classList.toggle("active", dir === direction);
		});

		// Update speed display in seconds (2 decimal places)
		if (this.speedValueLabel) {
			this.speedValueLabel.textContent = `${speed.toFixed(2)}s`;
		}

		// Update stepper button disabled states
		const speedIdx = this.SPEED_VALUES.indexOf(speed);
		const decreaseBtn = this.transitionPopup?.querySelector("[data-speed-decrease]") as HTMLButtonElement | null;
		const increaseBtn = this.transitionPopup?.querySelector("[data-speed-increase]") as HTMLButtonElement | null;
		if (decreaseBtn) decreaseBtn.disabled = speedIdx <= 0;
		if (increaseBtn) increaseBtn.disabled = speedIdx >= this.SPEED_VALUES.length - 1;
	}

	private applyClipUpdate(updates: Record<string, unknown>): void {
		if (this.selectedTrackIdx >= 0 && this.selectedClipIdx >= 0) {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	// ─── Dynamic Source Handlers ─────────────────────────────────────────────────

	private setupDynamicSourceHandlers(): void {
		// Toggle handler
		this.dynamicToggle?.addEventListener("change", () => {
			const checked = this.dynamicToggle?.checked || false;
			this.isDynamicSource = checked;

			if (this.dynamicPanel) {
				this.dynamicPanel.style.display = checked ? "block" : "none";
			}

			if (checked) {
				this.dynamicInput?.focus();
			} else {
				// Revert to original src using Edit API
				this.clearDynamicSource();
			}
		});

		// On Enter key, apply the URL as dynamic source
		this.dynamicInput?.addEventListener("keydown", e => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.applyDynamicUrl();
			} else if (e.key === "Escape") {
				this.dynamicInput?.blur();
			}
		});

		// On blur, also apply the URL
		this.dynamicInput?.addEventListener("blur", () => {
			this.applyDynamicUrl();
		});
	}

	/**
	 * Apply dynamic source using the new Edit.applyMergeField() API.
	 * This uses the command pattern for undo/redo support and in-place asset reloading.
	 * Validates the URL before applying to prevent CORS/404 errors.
	 */
	private async applyDynamicUrl(): Promise<void> {
		const url = (this.dynamicInput?.value || "").trim();
		if (!url) return;

		// Validate URL before applying
		const validation = await validateAssetUrl(url);
		if (!validation.valid) {
			this.showUrlError(validation.error || "Invalid URL");
			return;
		}

		// Clear any previous error state
		this.clearUrlError();

		// If already a dynamic source, update the field value via live update
		if (this.dynamicFieldName) {
			this.edit.updateMergeFieldValueLive(this.dynamicFieldName, url);
			// Also reload the asset to show the new image/video
			const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
			if (player) {
				player.reloadAsset();
			}
			return;
		}

		// Generate unique field name and apply merge field
		const fieldName = this.edit.mergeFields.generateUniqueName("MEDIA");

		// Use Edit API to apply merge field (handles template + resolved value atomically)
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

	/**
	 * Remove dynamic source using the new Edit.removeMergeField() API.
	 * Restores the original src value.
	 */
	private clearDynamicSource(): void {
		if (!this.dynamicFieldName) return;

		// Use Edit API to remove merge field (handles undo and asset reload)
		this.edit.removeMergeField(this.selectedTrackIdx, this.selectedClipIdx, "asset.src", this.originalSrc);

		this.dynamicFieldName = "";
		if (this.dynamicInput) {
			this.dynamicInput.value = "";
		}
	}

	/**
	 * Update UI based on whether this clip has a dynamic source applied.
	 * Uses the new Edit.getMergeFieldForProperty() API.
	 */
	private updateDynamicSourceUI(): void {
		const player = this.edit.getPlayerClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!player) return;

		// Use Edit API to check if this property has a merge field
		const fieldName = this.edit.getMergeFieldForProperty(this.selectedTrackIdx, this.selectedClipIdx, "asset.src");

		if (fieldName) {
			// Has dynamic source
			this.isDynamicSource = true;
			this.dynamicFieldName = fieldName;
			if (this.dynamicToggle) this.dynamicToggle.checked = true;
			if (this.dynamicPanel) this.dynamicPanel.style.display = "block";

			// Show the default URL value
			const mergeField = this.edit.mergeFields.get(fieldName);
			if (this.dynamicInput) {
				this.dynamicInput.value = mergeField?.defaultValue || "";
			}
		} else {
			// No dynamic source - store original src for later restoration
			this.isDynamicSource = false;
			this.dynamicFieldName = "";

			// Get current resolved src as the original value
			const asset = player.clipConfiguration.asset as { src?: string };
			this.originalSrc = asset?.src || "";

			if (this.dynamicToggle) this.dynamicToggle.checked = false;
			if (this.dynamicPanel) this.dynamicPanel.style.display = "none";
			if (this.dynamicInput) this.dynamicInput.value = "";
		}
	}

	private updateFitDisplay(): void {
		if (this.fitLabel) {
			const option = FIT_OPTIONS.find(o => o.value === this.currentFit);
			this.fitLabel.textContent = option?.label || "Crop";
		}
	}

	private updateOpacityDisplay(): void {
		const text = `${this.currentOpacity}%`;
		if (this.opacityValue) this.opacityValue.textContent = text;
		if (this.opacitySlider) this.opacitySlider.value = String(this.currentOpacity);

		const display = this.opacityPopup?.querySelector("[data-opacity-display]");
		if (display) display.textContent = text;
	}

	private updateScaleDisplay(): void {
		const text = `${this.currentScale}%`;
		if (this.scaleValue) this.scaleValue.textContent = text;
		if (this.scaleSlider) this.scaleSlider.value = String(this.currentScale);

		const display = this.scalePopup?.querySelector("[data-scale-display]");
		if (display) display.textContent = text;
	}

	private updateVolumeDisplay(): void {
		const text = `${this.currentVolume}%`;
		if (this.volumeValue) this.volumeValue.textContent = text;
		if (this.volumeSlider) this.volumeSlider.value = String(this.currentVolume);

		const display = this.volumePopup?.querySelector("[data-volume-display]");
		if (display) display.textContent = text;

		// Update icon
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
	 * @param trackIndex - Track index
	 * @param clipIndex - Clip index
	 * @param isVideo - Whether the clip is a video (optional, defaults to false)
	 */
	showMedia(trackIndex: number, clipIndex: number, isVideo: boolean = false): void {
		this.isVideoClip = isVideo;
		super.show(trackIndex, clipIndex);
	}

	override dispose(): void {
		super.dispose();

		this.fitBtn = null;
		this.opacityBtn = null;
		this.scaleBtn = null;
		this.volumeBtn = null;
		this.transitionBtn = null;

		this.fitPopup = null;
		this.opacityPopup = null;
		this.scalePopup = null;
		this.volumePopup = null;
		this.transitionPopup = null;

		this.opacitySlider = null;
		this.scaleSlider = null;
		this.volumeSlider = null;

		this.fitLabel = null;
		this.opacityValue = null;
		this.scaleValue = null;
		this.volumeValue = null;

		this.volumeSection = null;

		// Transition elements
		this.directionRow = null;
		this.speedValueLabel = null;

		// Advanced menu elements
		this.advancedBtn = null;
		this.advancedPopup = null;
		this.dynamicToggle = null;
		this.dynamicPanel = null;
		this.dynamicInput = null;
	}
}
