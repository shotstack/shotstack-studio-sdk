import type { Edit } from "@core/edit-session";
import { ensureClipAlias, findEligibleSourceClips } from "@core/shared/source-clip-finder";
import type { AudioAsset, Duck, ResolvedClip } from "@schemas";
import { DUCK_DEFAULT_VOLUME, findDuckIssues, planDuckMeasurements, scanDucking } from "@shotstack/shotstack-canvas/duck";

import { UIComponent } from "../primitives/UIComponent";

/**
 * Copy for each `findDuckIssues` path below the asset. The last segment alone
 * can't tell the clip's `volume` from `duck.volume`.
 */
const ISSUE_COPY: Readonly<Record<string, string>> = {
	volume: "Ducking needs a constant volume.",
	speed: "Ducking needs normal speed.",
	"duck.volume": "Choose a level below the clip's volume.",
	"duck.under": "A clip this ducks under no longer exists."
};

const UNKNOWN_ISSUE = "This setting can't be used with ducking.";

/**
 * The Duck popup's switch, the clips to duck under, and the level. Each change
 * is written straight to the edit as one `updateClip`. Ducking under a clip that
 * has no alias also writes the alias first, as an `updateClip` of its own.
 *
 * @example
 * ```typescript
 * const duck = new DuckPanel(edit);
 * duck.mount(container);
 * duck.setClip(trackIdx, clipIdx);
 * duck.sync();
 * ```
 */
export class DuckPanel extends UIComponent {
	private trackIdx = -1;
	private clipIdx = -1;

	private switchInput: HTMLInputElement | null = null;
	private options: HTMLFieldSetElement | null = null;
	private clipList: HTMLDivElement | null = null;
	private levelSection: HTMLDivElement | null = null;
	private levelButtons: NodeListOf<HTMLButtonElement> | null = null;
	private customRow: HTMLDivElement | null = null;
	private slider: HTMLInputElement | null = null;
	private readout: HTMLSpanElement | null = null;
	private reasonNote: HTMLParagraphElement | null = null;
	private errorNote: HTMLParagraphElement | null = null;
	private hintNote: HTMLParagraphElement | null = null;

	constructor(private readonly edit: Edit) {
		super();
	}

	render(): string {
		return `
			<label class="ss-advanced-option">
				<span class="ss-advanced-label">Duck under other clips</span>
				<span class="ss-toggle">
					<input type="checkbox" role="switch" data-duck-toggle />
					<span class="ss-toggle-slider"></span>
				</span>
			</label>
			<fieldset class="ss-duck-options" data-duck-options>
				<legend class="ss-media-toolbar-popup-header">Lower while these play</legend>
				<div class="ss-duck-clips" data-duck-clips></div>
				<div data-duck-level>
					<div class="ss-media-toolbar-popup-header">Level</div>
					<div class="ss-media-toolbar-presets">
						<button type="button" class="ss-media-toolbar-preset" data-duck-level-option="auto">Auto</button>
						<button type="button" class="ss-media-toolbar-preset" data-duck-level-option="custom">Custom</button>
					</div>
					<div class="ss-duck-custom" data-duck-custom>
						<div class="ss-media-toolbar-slider-row">
							<input type="range" class="ss-media-toolbar-slider" data-duck-volume min="0" max="100" aria-label="Volume while ducked" />
							<span class="ss-media-toolbar-slider-value" data-duck-volume-value></span>
						</div>
					</div>
				</div>
			</fieldset>
			<p class="ss-duck-note" data-duck-reason></p>
			<p class="ss-duck-note ss-duck-note--error" data-duck-error role="alert"></p>
			<p class="ss-duck-note" data-duck-hint></p>
		`;
	}

	protected bindElements(): void {
		const find = <T extends Element>(name: string) => this.container?.querySelector<T>(`[data-duck-${name}]`) ?? null;
		this.switchInput = find("toggle");
		this.options = find("options");
		this.clipList = find("clips");
		this.levelSection = find("level");
		this.levelButtons = this.container?.querySelectorAll("[data-duck-level-option]") ?? null;
		this.customRow = find("custom");
		this.slider = find("volume");
		this.readout = find("volume-value");
		this.reasonNote = find("reason");
		this.errorNote = find("error");
		this.hintNote = find("hint");
	}

	protected setupEvents(): void {
		this.events.on(this.switchInput, "change", () => this.setDucking(this.switchInput?.checked ?? false));
		this.events.on(this.clipList, "change", e => {
			const box = e.target as HTMLInputElement;
			this.toggleClip(box.dataset["duckClip"] ?? "", box.checked);
		});
		this.events.onAll(this.levelButtons, "click", (_, btn) => this.setLevel((btn as HTMLElement).dataset["duckLevelOption"] === "custom"));

		// Readout only while dragging, so a drag commits once, on release.
		this.events.on(this.slider, "input", () => {
			if (this.readout && this.slider) this.readout.textContent = `${this.slider.value}%`;
		});
		this.events.on(this.slider, "change", () => this.setVolume(Number(this.slider?.value) / 100));
	}

	setClip(trackIdx: number, clipIdx: number): void {
		this.trackIdx = trackIdx;
		this.clipIdx = clipIdx;
	}

	/** Why the selected clip can't duck, or "" when it can. */
	blocker(): string {
		return this.issues(this.resolvedDuck() ?? { under: [] }).find(({ key }) => !key.startsWith("duck."))?.text ?? "";
	}

	sync(): void {
		const clipId = this.edit.getClipId(this.trackIdx, this.clipIdx);
		if (!this.container || !clipId) return;

		const duck = this.documentDuck();
		const issues = this.issues(this.resolvedDuck() ?? { under: [] });
		const blocker = issues.find(({ key }) => !key.startsWith("duck."));
		const custom = typeof duck?.volume === "number";
		const level = Math.round((typeof duck?.volume === "number" ? duck.volume : DUCK_DEFAULT_VOLUME) * 100);

		if (this.switchInput) {
			this.switchInput.checked = Boolean(duck);
			this.switchInput.disabled = Boolean(blocker) && !duck;
		}
		if (this.options) this.options.disabled = Boolean(blocker);
		if (this.levelSection) this.levelSection.hidden = !duck;
		this.levelButtons?.forEach(btn => {
			const active = (btn.dataset["duckLevelOption"] === "custom") === custom;
			btn.classList.toggle("active", active);
			btn.setAttribute("aria-pressed", String(active));
		});
		if (this.customRow) this.customRow.hidden = !custom;
		if (this.slider) this.slider.value = String(level);
		if (this.readout) this.readout.textContent = `${level}%`;
		// The Custom warning covers `duck.volume`; anything else this clip breaks is said here.
		if (this.reasonNote) this.reasonNote.textContent = (blocker ?? issues.find(({ key }) => key === "duck.under"))?.text ?? "";
		if (this.errorNote) this.errorNote.textContent = "";
		this.renderClips(clipId, duck ? [duck.under].flat() : []);
		this.updateHint();
	}

	private documentDuck(trackIdx = this.trackIdx, clipIdx = this.clipIdx): Duck | undefined {
		return (this.edit.getDocumentClip(trackIdx, clipIdx)?.asset as AudioAsset | undefined)?.duck;
	}

	private resolvedDuck(): Duck | undefined {
		return (this.edit.getResolvedClip(this.trackIdx, this.clipIdx)?.asset as AudioAsset | undefined)?.duck;
	}

	/** This clip's issues with `duck` as given, by the server's own rules, so Studio never writes what a render would reject. */
	private issues(duck: Partial<Duck>) {
		const { trackIdx, clipIdx } = this;
		const { timeline } = this.edit.getResolvedEdit();
		const tracks = timeline.tracks.map((track, t) =>
			t !== trackIdx ? track : { ...track, clips: track.clips.map((clip, c) => (c !== clipIdx ? clip : { ...clip, asset: { ...clip.asset, duck } })) }
		);
		// Paths run timeline.tracks[t].clips[c].asset.<key>.
		return findDuckIssues({ timeline: { tracks } })
			.filter(({ path }) => path[2] === trackIdx && path[4] === clipIdx)
			.map(({ path }) => {
				const key = path.slice(6).join(".");
				return { key, text: ISSUE_COPY[key] ?? UNKNOWN_ISSUE };
			});
	}

	private renderClips(clipId: string, refs: string[]): void {
		const list = this.clipList;
		if (!list) return;
		const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset["duckClip"] : undefined;
		const others = findEligibleSourceClips(this.edit).filter(info => info.clipId !== clipId);

		list.replaceChildren(
			...others.map(info => {
				const box = document.createElement("input");
				box.type = "checkbox";
				box.dataset["duckClip"] = info.clipId;
				box.checked = Boolean(info.currentAlias) && refs.includes(`alias://${info.currentAlias}`);
				const text = document.createElement("span");
				// Labels carry user text such as speech scripts, so they never go through innerHTML.
				text.textContent = info.displayLabel;
				const label = document.createElement("label");
				label.className = "ss-duck-clip";
				label.append(box, text);
				return label;
			})
		);
		if (others.length === 0) list.innerHTML = `<div class="ss-duck-empty">No other audio or video clips</div>`;

		// Every write re-renders the list, which would otherwise drop a keyboard user's place.
		list.querySelectorAll<HTMLInputElement>("[data-duck-clip]").forEach(box => {
			if (box.dataset["duckClip"] === focused) box.focus();
		});
	}

	private async setDucking(on: boolean): Promise<void> {
		const { trackIdx, clipIdx } = this;
		if (!on) {
			this.write(trackIdx, clipIdx, undefined);
			return;
		}

		const clip = this.edit.getResolvedClip(trackIdx, clipIdx);
		const clipId = this.edit.getClipId(trackIdx, clipIdx);
		if (!clip) return;
		const others = findEligibleSourceClips(this.edit).filter(info => info.clipId !== clipId);
		const targets = others.filter(info => {
			const other = info.assetType !== "video" && this.edit.getResolvedClip(info.trackIndex, info.clipIndex);
			return other && other.start < clip.start + clip.length && clip.start < other.start + other.length;
		});
		if (targets.length === 0) {
			this.sync();
			if (this.errorNote) {
				this.errorNote.textContent =
					others.length > 0 ? "No audio plays over this clip. Tick the clips to duck under." : "There are no other clips to duck under.";
			}
			return;
		}

		const aliases = await Promise.all(targets.map(info => ensureClipAlias(this.edit, info.trackIndex, info.clipIndex)));
		this.write(trackIdx, clipIdx, { under: aliases.map(alias => `alias://${alias}`) });
	}

	private async toggleClip(targetId: string, ticked: boolean): Promise<void> {
		const { trackIdx, clipIdx } = this;
		const target = findEligibleSourceClips(this.edit).find(info => info.clipId === targetId);
		if (!target) return;

		const ref = `alias://${ticked ? await ensureClipAlias(this.edit, target.trackIndex, target.clipIndex) : target.currentAlias}`;
		const duck = this.documentDuck(trackIdx, clipIdx);
		const under = [duck?.under ?? []].flat().filter(existing => existing !== ref);
		if (ticked) under.push(ref);
		this.write(trackIdx, clipIdx, under.length > 0 ? { ...duck, under } : undefined);
	}

	private setLevel(custom: boolean): void {
		const duck = this.documentDuck();
		if (!duck || custom === (typeof duck.volume === "number")) return;
		if (custom) this.setVolume(DUCK_DEFAULT_VOLUME);
		else this.write(this.trackIdx, this.clipIdx, { ...duck, volume: undefined });
	}

	private setVolume(volume: number): void {
		const duck = this.documentDuck();
		if (!duck) return;
		const issue = this.issues({ ...this.resolvedDuck(), volume }).find(({ key }) => key === "duck.volume");
		if (issue) {
			if (this.errorNote) this.errorNote.textContent = issue.text;
			return;
		}
		this.write(this.trackIdx, this.clipIdx, { ...duck, volume });
	}

	private async updateHint(): Promise<void> {
		// A pending batch can take seconds, and the old hint may not apply to this clip or level.
		if (this.hintNote) this.hintNote.textContent = "";
		const levels = this.edit.getDuckLevels();
		await levels.whenSettled();
		const clipId = this.edit.getClipId(this.trackIdx, this.clipIdx);
		if (!this.container || !this.hintNote || !clipId) return;

		const { aliases, ducking } = scanDucking(this.edit.getResolvedEdit());
		const entry = ducking.find(({ clip }) => (clip as ResolvedClip).id === clipId);
		const measured = levels.levelsFor(clipId);
		// Only planned refs count: a ref that doesn't overlap the clip has no dip.
		const unmeasured = entry ? planDuckMeasurements(entry.clip, aliases).some(({ ref }) => !measured?.has(ref)) : false;
		this.hintNote.textContent = unmeasured ? "Couldn't measure some clips' loudness, so their dips use the default level." : "";
	}

	private write(trackIdx: number, clipIdx: number, duck: Duck | undefined): void {
		this.edit.updateClip(trackIdx, clipIdx, { asset: { duck } } as Record<string, unknown>);
	}
}
