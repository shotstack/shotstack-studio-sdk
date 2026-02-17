import type { ResolvedClip, TextToSpeechAsset } from "@schemas";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";
import { DragStateManager } from "./drag-state-manager";
import { ScrollableList } from "./primitives/ScrollableList";
import type { ScrollableListGroup } from "./primitives/types";

// ─── Voice Registry ─────────────────────────────────────────────────────────

interface VoiceInfo {
	name: string;
	language: string;
	languageCode: string;
	gender: "Male" | "Female";
}

const TTS_VOICES: VoiceInfo[] = [
	// English (US)
	{ name: "Matthew", language: "English (US)", languageCode: "en-US", gender: "Male" },
	{ name: "Joanna", language: "English (US)", languageCode: "en-US", gender: "Female" },
	{ name: "Salli", language: "English (US)", languageCode: "en-US", gender: "Female" },
	{ name: "Joey", language: "English (US)", languageCode: "en-US", gender: "Male" },
	{ name: "Kendra", language: "English (US)", languageCode: "en-US", gender: "Female" },
	{ name: "Kimberly", language: "English (US)", languageCode: "en-US", gender: "Female" },
	{ name: "Ivy", language: "English (US)", languageCode: "en-US", gender: "Female" },
	{ name: "Kevin", language: "English (US)", languageCode: "en-US", gender: "Male" },
	{ name: "Ruth", language: "English (US)", languageCode: "en-US", gender: "Female" },
	{ name: "Stephen", language: "English (US)", languageCode: "en-US", gender: "Male" },
	// English (UK)
	{ name: "Amy", language: "English (UK)", languageCode: "en-GB", gender: "Female" },
	{ name: "Brian", language: "English (UK)", languageCode: "en-GB", gender: "Male" },
	{ name: "Emma", language: "English (UK)", languageCode: "en-GB", gender: "Female" },
	{ name: "Arthur", language: "English (UK)", languageCode: "en-GB", gender: "Male" },
	// English (AU)
	{ name: "Olivia", language: "English (AU)", languageCode: "en-AU", gender: "Female" },
	// English (IN)
	{ name: "Kajal", language: "English (IN)", languageCode: "en-IN", gender: "Female" },
	// English (ZA)
	{ name: "Ayanda", language: "English (ZA)", languageCode: "en-ZA", gender: "Female" },
	// English (IE)
	{ name: "Niamh", language: "English (IE)", languageCode: "en-IE", gender: "Female" },
	// French
	{ name: "Léa", language: "French", languageCode: "fr-FR", gender: "Female" },
	{ name: "Rémi", language: "French", languageCode: "fr-FR", gender: "Male" },
	// German
	{ name: "Vicki", language: "German", languageCode: "de-DE", gender: "Female" },
	{ name: "Daniel", language: "German", languageCode: "de-DE", gender: "Male" },
	// Spanish (ES)
	{ name: "Lucia", language: "Spanish (ES)", languageCode: "es-ES", gender: "Female" },
	{ name: "Sergio", language: "Spanish (ES)", languageCode: "es-ES", gender: "Male" },
	// Spanish (US)
	{ name: "Lupe", language: "Spanish (US)", languageCode: "es-US", gender: "Female" },
	{ name: "Pedro", language: "Spanish (US)", languageCode: "es-US", gender: "Male" },
	// Portuguese (BR)
	{ name: "Camila", language: "Portuguese (BR)", languageCode: "pt-BR", gender: "Female" },
	{ name: "Vitória", language: "Portuguese (BR)", languageCode: "pt-BR", gender: "Female" },
	{ name: "Thiago", language: "Portuguese (BR)", languageCode: "pt-BR", gender: "Male" },
	// Italian
	{ name: "Bianca", language: "Italian", languageCode: "it-IT", gender: "Female" },
	{ name: "Adriano", language: "Italian", languageCode: "it-IT", gender: "Male" },
	// Japanese
	{ name: "Kazuha", language: "Japanese", languageCode: "ja-JP", gender: "Female" },
	{ name: "Tomoko", language: "Japanese", languageCode: "ja-JP", gender: "Female" },
	{ name: "Takumi", language: "Japanese", languageCode: "ja-JP", gender: "Male" },
	// Korean
	{ name: "Seoyeon", language: "Korean", languageCode: "ko-KR", gender: "Female" },
	// Chinese (Mandarin)
	{ name: "Zhiyu", language: "Chinese (Mandarin)", languageCode: "cmn-CN", gender: "Female" },
	// Chinese (Cantonese)
	{ name: "Hiujin", language: "Chinese (Cantonese)", languageCode: "yue-CN", gender: "Female" },
	// Dutch
	{ name: "Laura", language: "Dutch", languageCode: "nl-NL", gender: "Female" },
	{ name: "Lisa", language: "Dutch (BE)", languageCode: "nl-BE", gender: "Female" },
	// Swedish
	{ name: "Elin", language: "Swedish", languageCode: "sv-SE", gender: "Female" },
	// Danish
	{ name: "Sofie", language: "Danish", languageCode: "da-DK", gender: "Female" },
	// Norwegian
	{ name: "Ida", language: "Norwegian", languageCode: "nb-NO", gender: "Female" },
	// Finnish
	{ name: "Suvi", language: "Finnish", languageCode: "fi-FI", gender: "Female" },
	// Polish
	{ name: "Ola", language: "Polish", languageCode: "pl-PL", gender: "Female" },
	// Arabic
	{ name: "Hala", language: "Arabic", languageCode: "ar-AE", gender: "Female" }
];

/** Group voices by language for the ScrollableList */
function buildVoiceGroups(): ScrollableListGroup[] {
	const grouped = new Map<string, VoiceInfo[]>();
	for (const voice of TTS_VOICES) {
		const list = grouped.get(voice.language) ?? [];
		list.push(voice);
		grouped.set(voice.language, list);
	}

	return Array.from(grouped.entries()).map(([language, voices]) => ({
		header: language,
		headerDetail: `${voices.length} voice${voices.length > 1 ? "s" : ""}`,
		items: voices.map(v => ({
			value: v.name,
			label: v.name,
			data: { gender: v.gender, lang: v.languageCode }
		}))
	}));
}

// ─── Icons ──────────────────────────────────────────────────────────────────

const ICONS = {
	voice: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
	text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
	volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
	volumeMute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
	chevron: `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
	fadeIn: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14 L14 4 L30 4"/></svg>`,
	fadeOut: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4 L18 4 L30 14"/></svg>`,
	fadeInOut: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14 L10 4 L22 4 L30 14"/></svg>`,
	fadeNone: `<svg viewBox="0 0 32 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 10 L30 10"/></svg>`
};

const TEXT_DEBOUNCE_MS = 300;

// ─── Toolbar ────────────────────────────────────────────────────────────────

export class TextToSpeechToolbar extends BaseToolbar {
	// State
	private currentVoice = "Matthew";
	private currentVolume = 100;
	private audioFadeEffect: "" | "fadeIn" | "fadeOut" | "fadeInFadeOut" = "";
	private textDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private dragManager = new DragStateManager();

	// Composite components
	private voiceList: ScrollableList | null = null;

	// Elements
	private voiceBtn: HTMLButtonElement | null = null;
	private voicePopup: HTMLDivElement | null = null;
	private textBtn: HTMLButtonElement | null = null;
	private textPopup: HTMLDivElement | null = null;
	private textArea: HTMLTextAreaElement | null = null;
	private volumeBtn: HTMLButtonElement | null = null;
	private volumePopup: HTMLDivElement | null = null;
	private volumeSlider: HTMLInputElement | null = null;
	private volumeDisplayInput: HTMLInputElement | null = null;
	private audioFadeBtn: HTMLButtonElement | null = null;
	private audioFadePopup: HTMLDivElement | null = null;

	private abortController: AbortController | null = null;

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-tts-toolbar";

		this.container.innerHTML = `
			<!-- Mode Toggle -->
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

			<!-- Voice Selector -->
			<div class="ss-media-toolbar-dropdown">
				<button class="ss-media-toolbar-btn" data-action="voice">
					${ICONS.voice}
					<span data-voice-label>Matthew</span>
					${ICONS.chevron}
				</button>
				<div class="ss-media-toolbar-popup ss-tts-voice-popup" data-popup="voice">
					<div class="ss-media-toolbar-popup-header">Voice</div>
					<div data-voice-list-mount></div>
				</div>
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Text Input -->
			<div class="ss-media-toolbar-dropdown">
				<button class="ss-media-toolbar-btn ss-tts-text-btn" data-action="text">
					${ICONS.text}
					<span class="ss-tts-text-preview" data-text-preview>Text</span>
				</button>
				<div class="ss-media-toolbar-popup ss-tts-text-popup" data-popup="text">
					<div class="ss-media-toolbar-popup-header">Speech Text</div>
					<textarea class="ss-tts-textarea" data-tts-textarea
						placeholder="Enter text to convert to speech..."
						rows="4"></textarea>
				</div>
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Volume -->
			<div class="ss-media-toolbar-dropdown">
				<button class="ss-media-toolbar-btn" data-action="volume">
					<span data-volume-icon>${ICONS.volume}</span>
					<span data-volume-value>100%</span>
				</button>
				<div class="ss-media-toolbar-popup ss-media-toolbar-popup--slider" data-popup="volume">
					<div class="ss-media-toolbar-popup-header">Volume</div>
					<div class="ss-media-toolbar-slider-row">
						<input type="range" class="ss-media-toolbar-slider" data-volume-slider min="0" max="100" value="100" />
						<input type="text" class="ss-media-toolbar-slider-value" data-volume-display value="100%" />
					</div>
				</div>
			</div>

			<div class="ss-media-toolbar-divider"></div>

			<!-- Audio Fade -->
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
		`;

		parent.insertBefore(this.container, parent.firstChild);

		// Query elements
		this.voiceBtn = this.container.querySelector('[data-action="voice"]');
		this.voicePopup = this.container.querySelector('[data-popup="voice"]');
		this.textBtn = this.container.querySelector('[data-action="text"]');
		this.textPopup = this.container.querySelector('[data-popup="text"]');
		this.textArea = this.container.querySelector("[data-tts-textarea]");
		this.volumeBtn = this.container.querySelector('[data-action="volume"]');
		this.volumePopup = this.container.querySelector('[data-popup="volume"]');
		this.volumeSlider = this.container.querySelector("[data-volume-slider]");
		this.volumeDisplayInput = this.container.querySelector("[data-volume-display]");
		this.audioFadeBtn = this.container.querySelector('[data-action="audio-fade"]');
		this.audioFadePopup = this.container.querySelector('[data-popup="audio-fade"]');

		this.mountCompositeComponents();
		this.setupEventListeners();
		this.setupOutsideClickHandler();
		this.enableDrag();
	}

	private mountCompositeComponents(): void {
		const voiceMount = this.container?.querySelector("[data-voice-list-mount]");
		if (voiceMount) {
			this.voiceList = new ScrollableList({
				groups: buildVoiceGroups(),
				height: 300,
				selectedValue: this.currentVoice
			});
			this.voiceList.onChange(value => this.handleVoiceChange(value));
			this.voiceList.mount(voiceMount as HTMLElement);
		}
	}

	private setupEventListeners(): void {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		// Popup toggles
		this.voiceBtn?.addEventListener(
			"click",
			e => {
				e.stopPropagation();
				this.togglePopupByName("voice");
			},
			{ signal }
		);
		this.textBtn?.addEventListener(
			"click",
			e => {
				e.stopPropagation();
				this.togglePopupByName("text");
			},
			{ signal }
		);
		this.volumeBtn?.addEventListener(
			"click",
			e => {
				e.stopPropagation();
				this.togglePopupByName("volume");
			},
			{ signal }
		);
		this.audioFadeBtn?.addEventListener(
			"click",
			e => {
				e.stopPropagation();
				this.togglePopupByName("audio-fade");
			},
			{ signal }
		);

		// Text area (debounced)
		this.textArea?.addEventListener("input", () => this.debouncedApplyTextEdit(), { signal });

		// Volume slider (two-phase drag)
		this.volumeSlider?.addEventListener("pointerdown", () => this.startSliderDrag("volume"), { signal });
		this.volumeSlider?.addEventListener(
			"input",
			() => {
				const value = parseInt(this.volumeSlider!.value, 10);
				this.handleVolumeChange(value);
			},
			{ signal }
		);
		this.volumeSlider?.addEventListener("change", () => this.endSliderDrag("volume"), { signal });

		// Volume display input
		this.volumeDisplayInput?.addEventListener("blur", () => this.commitVolumeInputValue(), { signal });
		this.volumeDisplayInput?.addEventListener(
			"keydown",
			(e: KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.commitVolumeInputValue();
					this.volumeDisplayInput?.blur();
				} else if (e.key === "Escape") {
					e.preventDefault();
					this.updateVolumeDisplay();
					this.volumeDisplayInput?.blur();
				}
			},
			{ signal }
		);
		this.volumeDisplayInput?.addEventListener("focus", () => this.volumeDisplayInput?.select(), { signal });

		// Audio fade options
		this.audioFadePopup?.querySelectorAll("[data-audio-fade]").forEach(btn => {
			btn.addEventListener(
				"click",
				e => {
					const el = e.currentTarget as HTMLElement;
					const fadeValue = el.dataset["audioFade"] || "";
					this.handleAudioFadeSelect(fadeValue as "" | "fadeIn" | "fadeOut" | "fadeInFadeOut");
				},
				{ signal }
			);
		});
	}

	// ─── Popup Management ──────────────────────────────────────────────────────

	private togglePopupByName(popup: "voice" | "text" | "volume" | "audio-fade"): void {
		const popupMap = {
			voice: { popup: this.voicePopup, btn: this.voiceBtn },
			text: { popup: this.textPopup, btn: this.textBtn },
			volume: { popup: this.volumePopup, btn: this.volumeBtn },
			"audio-fade": { popup: this.audioFadePopup, btn: this.audioFadeBtn }
		};

		const isCurrentlyOpen = popupMap[popup].popup?.classList.contains("visible");
		this.closeAllPopups();

		if (!isCurrentlyOpen) {
			this.togglePopup(popupMap[popup].popup);
			popupMap[popup].btn?.classList.add("active");

			if (popup === "voice") {
				this.voiceList?.scrollToSelected();
			} else if (popup === "text" && this.textArea) {
				requestAnimationFrame(() => this.textArea?.focus());
			}
		}
	}

	protected override closeAllPopups(): void {
		super.closeAllPopups();
		this.voiceBtn?.classList.remove("active");
		this.textBtn?.classList.remove("active");
		this.volumeBtn?.classList.remove("active");
		this.audioFadeBtn?.classList.remove("active");
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [this.voicePopup, this.textPopup, this.volumePopup, this.audioFadePopup];
	}

	// ─── Sync State ──────────────────────────────────────────────────────────────

	protected override syncState(): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip || clip.asset.type !== "text-to-speech") return;

		const asset = clip.asset as TextToSpeechAsset;

		// Voice
		this.currentVoice = asset.voice ?? "Matthew";
		this.voiceList?.setSelected(this.currentVoice);
		this.updateVoiceDisplay();

		// Text
		if (this.textArea) {
			this.textArea.value = asset.text ?? "";
		}
		this.updateTextPreview(asset.text ?? "");

		// Volume
		const volume = typeof asset.volume === "number" ? asset.volume : 1;
		this.currentVolume = Math.round(volume * 100);
		this.updateVolumeDisplay();

		// Audio fade
		this.audioFadeEffect = (asset.effect as "" | "fadeIn" | "fadeOut" | "fadeInFadeOut") || "";
		this.updateAudioFadeUI();
	}

	// ─── Voice Handlers ──────────────────────────────────────────────────────────

	private handleVoiceChange(voiceName: string): void {
		this.currentVoice = voiceName;
		this.updateVoiceDisplay();
		this.updateAssetProperty({ voice: voiceName });
	}

	private updateVoiceDisplay(): void {
		const label = this.container?.querySelector("[data-voice-label]");
		if (label) label.textContent = this.currentVoice;
	}

	// ─── Text Handlers ───────────────────────────────────────────────────────────

	private debouncedApplyTextEdit(): void {
		if (this.textDebounceTimer) clearTimeout(this.textDebounceTimer);
		this.textDebounceTimer = setTimeout(() => {
			const text = this.textArea?.value ?? "";
			this.updateTextPreview(text);
			this.updateAssetProperty({ text });
		}, TEXT_DEBOUNCE_MS);
	}

	private updateTextPreview(text: string): void {
		const el = this.container?.querySelector("[data-text-preview]");
		if (el) {
			el.textContent = text ? this.truncateText(text, 20) : "Text";
			(el as HTMLElement).title = text || "";
		}
	}

	private truncateText(text: string, maxLen: number): string {
		return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
	}

	// ─── Volume Handlers ─────────────────────────────────────────────────────────

	private handleVolumeChange(value: number): void {
		this.currentVolume = value;
		this.updateVolumeDisplay();

		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip) return;

		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clipId) return;

		const asset = clip.asset as Record<string, unknown>;
		const updates = { asset: { ...asset, volume: value / 100 } as typeof clip.asset };

		if (this.dragManager.isDragging("volume")) {
			this.edit.updateClipInDocument(clipId, updates);
			this.edit.resolveClip(clipId);
		} else {
			this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, updates);
		}
	}

	private commitVolumeInputValue(): void {
		if (!this.volumeDisplayInput) return;
		const stripped = this.volumeDisplayInput.value.replace(/[^0-9]/g, "");
		const num = parseInt(stripped, 10);
		const parsed = Number.isNaN(num) ? this.currentVolume : Math.max(0, Math.min(100, num));
		this.handleVolumeChange(parsed);
	}

	private updateVolumeDisplay(): void {
		const text = `${this.currentVolume}%`;
		const volumeValue = this.container?.querySelector("[data-volume-value]");
		if (volumeValue) volumeValue.textContent = text;
		if (this.volumeSlider) this.volumeSlider.value = String(this.currentVolume);
		if (this.volumeDisplayInput) this.volumeDisplayInput.value = text;

		const iconContainer = this.container?.querySelector("[data-volume-icon]");
		if (iconContainer) {
			iconContainer.innerHTML = this.currentVolume === 0 ? ICONS.volumeMute : ICONS.volume;
		}
	}

	// ─── Audio Fade ──────────────────────────────────────────────────────────────

	private handleAudioFadeSelect(effect: "" | "fadeIn" | "fadeOut" | "fadeInFadeOut"): void {
		this.audioFadeEffect = effect;
		this.updateAudioFadeUI();
		this.updateAssetProperty({ effect: effect || undefined });
	}

	private updateAudioFadeUI(): void {
		if (!this.audioFadePopup) return;

		this.audioFadePopup.querySelectorAll("[data-audio-fade]").forEach(btn => {
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

	// ─── Two-Phase Drag ──────────────────────────────────────────────────────────

	private captureClipState(): { clipId: string; initialState: ResolvedClip } | null {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		const clipId = this.edit.getClipId(this.selectedTrackIdx, this.selectedClipIdx);
		return clip && clipId ? { clipId, initialState: structuredClone(clip) } : null;
	}

	private startSliderDrag(controlId: string): void {
		const state = this.captureClipState();
		if (state) {
			this.dragManager.start(controlId, state.clipId, state.initialState);
		}
	}

	private endSliderDrag(controlId: string): void {
		const session = this.dragManager.end(controlId);
		if (!session) return;

		const finalClip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (finalClip) {
			this.edit.commitClipUpdate(session.clipId, session.initialState, structuredClone(finalClip));
		}
	}

	// ─── Update Helpers ──────────────────────────────────────────────────────────

	private updateAssetProperty(updates: Partial<TextToSpeechAsset>): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip || clip.asset.type !== "text-to-speech") return;

		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: { ...clip.asset, ...updates } as TextToSpeechAsset
		});
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────────────

	override dispose(): void {
		this.abortController?.abort();
		this.abortController = null;

		this.dragManager.clear();

		if (this.textDebounceTimer) {
			clearTimeout(this.textDebounceTimer);
			this.textDebounceTimer = null;
		}

		this.voiceList?.dispose();
		this.voiceList = null;

		super.dispose();

		this.voiceBtn = null;
		this.voicePopup = null;
		this.textBtn = null;
		this.textPopup = null;
		this.textArea = null;
		this.volumeBtn = null;
		this.volumePopup = null;
		this.volumeSlider = null;
		this.volumeDisplayInput = null;
		this.audioFadeBtn = null;
		this.audioFadePopup = null;
	}
}
