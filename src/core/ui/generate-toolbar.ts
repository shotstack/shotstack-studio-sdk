import { EditEvent, InternalEvent } from "@core/events/edit-events";
import { MERGE_FIELD_TEST_PATTERN } from "@core/merge/merge-field-service";
import { canCarryPrompt } from "@core/shared/ai-asset-utils";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar } from "./base-toolbar";

const PROMPT_DEBOUNCE_MS = 300;

const promptProperty = (asset: { type: string }): "prompt" | "text" => (asset.type === "text-to-speech" ? "text" : "prompt");

export class GenerateToolbar extends BaseToolbar {
	private promptInput: HTMLInputElement | null = null;
	private generateBtn: HTMLButtonElement | null = null;
	private generateError: HTMLElement | null = null;
	private generateNote: HTMLElement | null = null;
	private promptDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private generationUnsubscribers: (() => void)[] = [];
	private abortController: AbortController | null = null;

	override mount(parent: HTMLElement): void {
		injectShotstackStyles();

		this.container = document.createElement("div");
		this.container.className = "ss-generate-toolbar";

		this.container.innerHTML = `
			<div class="ss-toolbar-mode-toggle" data-mode="generate" data-generative>
				<button class="ss-toolbar-mode-btn" data-mode="asset" title="Asset properties (\`)">
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
				<button class="ss-toolbar-mode-btn active" data-mode="generate" title="Generate (\`)">
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M8 2.5l1.3 3.2 3.2 1.3-3.2 1.3L8 11.5 6.7 8.3 3.5 7l3.2-1.3z"/>
					</svg>
				</button>
				<span class="ss-toolbar-mode-indicator"></span>
			</div>
			<div class="ss-toolbar-mode-divider"></div>

			<input class="ss-ai-prompt-input" data-prompt-input type="text" spellcheck="false"
				placeholder="Describe what to generate…"
				title="Describe what to generate. Use {{ FIELD_NAME }} for merge fields." />
			<button class="ss-media-toolbar-btn ss-ai-generate-btn" data-action="generate">
				<span data-generate-label>Generate</span>
			</button>
			<span class="ss-ai-note" data-generate-note hidden
				title="Rendering generates this from the prompt. Register an asset generator to preview it here."
				>Generates on render</span>
			<span class="ss-ai-error" data-generate-error hidden></span>
		`;

		parent.insertBefore(this.container, parent.firstChild);

		this.promptInput = this.container.querySelector("[data-prompt-input]");
		this.generateBtn = this.container.querySelector("[data-action='generate']");
		this.generateError = this.container.querySelector("[data-generate-error]");
		this.generateNote = this.container.querySelector("[data-generate-note]");

		this.setupEventListeners();
		this.subscribeToEditState();
		this.enableDrag();
		this.appendDeleteButton();
	}

	private setupEventListeners(): void {
		this.abortController?.abort();
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		this.promptInput?.addEventListener(
			"input",
			() => {
				this.schedulePromptCommit();
				this.syncState();
			},
			{ signal }
		);

		// Enter is the only way to generate without leaving the keyboard, so the pending
		// prompt has to land on the clip first or the run would use the previous value.
		this.promptInput?.addEventListener(
			"keydown",
			e => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				this.commitPrompt();
				this.requestGeneration();
			},
			{ signal }
		);

		this.generateBtn?.addEventListener(
			"click",
			e => {
				e.stopPropagation();
				this.commitPrompt();
				this.requestGeneration();
			},
			{ signal }
		);
	}

	private requestGeneration(): void {
		const clipId = this.getSelectedClipId();
		if (!clipId) return;
		if ((this.promptInput?.value ?? "").trim() === "") return;
		if (this.edit.getClipGenerationState(clipId)?.status === "generating") return;
		this.edit.generateClipAsset(clipId).catch(() => {
			// Failures surface as clip state.
		});
	}

	private subscribeToEditState(): void {
		// mount() can run more than once on an instance; never stack listeners.
		if (this.generationUnsubscribers.length > 0) return;
		const events = this.edit.getInternalEvents();
		const names = [InternalEvent.ClipGenerationStarted, InternalEvent.ClipGenerationCompleted, InternalEvent.ClipGenerationFailed] as const;
		for (const name of names) {
			const handler = (payload: { clipId: string }): void => {
				if (payload.clipId === this.getSelectedClipId()) this.syncState();
			};
			events.on(name, handler);
			this.generationUnsubscribers.push(() => events.off(name, handler));
		}

		const onEditChanged = (): void => this.syncState();
		this.edit.events.on(EditEvent.EditChanged, onEditChanged);
		this.generationUnsubscribers.push(() => this.edit.events.off(EditEvent.EditChanged, onEditChanged));
	}

	private schedulePromptCommit(): void {
		if (this.promptDebounceTimer) clearTimeout(this.promptDebounceTimer);
		this.promptDebounceTimer = setTimeout(() => this.commitPrompt(), PROMPT_DEBOUNCE_MS);
	}

	private commitPrompt(): void {
		if (this.promptDebounceTimer) clearTimeout(this.promptDebounceTimer);
		this.promptDebounceTimer = null;

		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		if (!clip) return;
		const property = promptProperty(clip.asset);
		const path = `asset.${property}`;
		const rawText = this.promptInput?.value ?? "";
		const cleared = rawText.trim() === "";
		const resolvedText = this.edit.resolveMergeFields(rawText);
		const document = this.edit.getDocument();
		const clipId = this.getSelectedClipId();
		if (clipId && document) {
			if (!cleared && MERGE_FIELD_TEST_PATTERN.test(rawText)) {
				document.setClipBinding(clipId, path, { placeholder: rawText, resolvedValue: resolvedText });
			} else {
				document.removeClipBinding(clipId, path);
			}
		}
		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, {
			asset: { ...clip.asset, [property]: cleared ? undefined : resolvedText }
		} as never);
	}

	protected override syncState(): void {
		const clip = this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx);
		const asset = clip?.asset;
		if (!canCarryPrompt(asset) || !this.generateBtn) return;
		// While a commit is pending the field holds newer text than the asset, so the field
		// wins. The enabled state below reads the field, so it must not be overwritten here.
		if (this.promptInput && this.promptDebounceTimer === null) {
			const property = promptProperty(asset);
			const document = this.edit.getDocument();
			const clipId = this.getSelectedClipId();
			const binding = clipId ? document?.getClipBinding(clipId, `asset.${property}`) : undefined;
			const value = (asset as unknown as Record<string, unknown>)[property];
			this.promptInput.value = binding?.placeholder ?? (typeof value === "string" ? value : "");
		}

		const hasGenerator = this.edit.hasAssetGenerator();
		this.generateBtn.hidden = !hasGenerator;
		if (this.generateNote) this.generateNote.hidden = hasGenerator;
		if (!hasGenerator) {
			if (this.generateError) this.generateError.hidden = true;
			return;
		}

		const clipId = this.getSelectedClipId();
		const state = clipId ? this.edit.getClipGenerationState(clipId) : undefined;
		const generating = state?.status === "generating";
		const hasPrompt = (this.promptInput?.value ?? "").trim() !== "";
		const label = this.generateBtn.querySelector("[data-generate-label]");
		this.generateBtn.disabled = generating || !hasPrompt;
		this.generateBtn.classList.toggle("is-generating", generating);
		if (label) {
			if (generating) label.textContent = "Generating…";
			else if (state?.status === "failed") label.textContent = "Retry";
			else label.textContent = "Generate";
		}
		if (this.generateError) {
			const message = state?.status === "failed" ? (state.error ?? "Generation failed") : "";
			this.generateError.textContent = message;
			this.generateError.hidden = message === "";
		}
	}

	protected override getPopupList(): (HTMLElement | null)[] {
		return [];
	}

	override dispose(): void {
		this.abortController?.abort();
		this.abortController = null;

		if (this.promptDebounceTimer) clearTimeout(this.promptDebounceTimer);
		this.promptDebounceTimer = null;

		for (const off of this.generationUnsubscribers) off();
		this.generationUnsubscribers = [];

		super.dispose();

		this.promptInput = null;
		this.generateBtn = null;
		this.generateError = null;
		this.generateNote = null;
	}
}
