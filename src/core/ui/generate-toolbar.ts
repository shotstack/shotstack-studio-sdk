import { EditEvent, InternalEvent } from "@core/events/edit-events";
import {
	isGenerationOptionValueValid,
	missingGenerationOptions,
	reconcileGenerationOptions,
	type GenerationModelDefinition,
	type GenerationOptionDefinition
} from "@core/generation/model-catalogue";
import { MERGE_FIELD_TEST_PATTERN } from "@core/merge/merge-field-service";
import { canCarryPrompt, GENERATION_TYPE, promptProperty } from "@core/shared/ai-asset-utils";
import { injectShotstackStyles } from "@styles/inject";

import { BaseToolbar, TOOLBAR_ICONS } from "./base-toolbar";

const PROMPT_DEBOUNCE_MS = 300;
const OPTION_INPUT_TYPE: Readonly<Record<GenerationOptionDefinition["type"], string>> = {
	boolean: "checkbox",
	integer: "number",
	string: "text"
};

const record = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const modelLabelText = (
	models: readonly GenerationModelDefinition[] | undefined,
	selected: string | undefined,
	selectedModel: GenerationModelDefinition | undefined
): string => {
	if (models === undefined) return "";
	if (selectedModel) return selectedModel.model;
	if (selected) return `${selected} (Unavailable)`;
	return models.length === 0 ? "No models available" : "Select model";
};

export class GenerateToolbar extends BaseToolbar {
	private promptInput: HTMLInputElement | null = null;
	private generateBtn: HTMLButtonElement | null = null;
	private generateError: HTMLElement | null = null;
	private generateNote: HTMLElement | null = null;
	private modelBtn: HTMLButtonElement | null = null;
	private modelLabel: HTMLElement | null = null;
	private modelPopup: HTMLElement | null = null;
	private optionsBtn: HTMLButtonElement | null = null;
	private optionsPopup: HTMLElement | null = null;
	private optionRows = new Map<string, HTMLElement>();
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
			<div class="ss-ai-picker-wrap">
				<button class="ss-media-toolbar-btn ss-ai-picker" data-model-picker type="button" aria-haspopup="menu">
					<span data-model-label>Select model</span>
					<svg class="chevron" viewBox="0 0 12 12">${TOOLBAR_ICONS.chevron}</svg>
				</button>
				<div class="ss-media-toolbar-popup ss-ai-model-popup" data-model-popup role="menu"></div>
			</div>
			<div class="ss-ai-picker-wrap">
				<button class="ss-media-toolbar-btn ss-ai-picker" data-options-picker type="button" aria-haspopup="dialog">Options</button>
				<div class="ss-media-toolbar-popup ss-ai-options-popup" data-options-popup></div>
			</div>
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
		this.modelBtn = this.container.querySelector("[data-model-picker]");
		this.modelLabel = this.container.querySelector("[data-model-label]");
		this.modelPopup = this.container.querySelector("[data-model-popup]");
		this.optionsBtn = this.container.querySelector("[data-options-picker]");
		this.optionsPopup = this.container.querySelector("[data-options-popup]");

		this.setupEventListeners();
		this.subscribeToEditState();
		this.setupOutsideClickHandler();
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

		this.modelBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup(this.modelPopup);
		}, { signal });
		this.optionsBtn?.addEventListener("click", e => {
			e.stopPropagation();
			this.togglePopup(this.optionsPopup);
		}, { signal });
	}

	private requestGeneration(): void {
		const clipId = this.getSelectedClipId();
		if (!clipId) return;
		if ((this.promptInput?.value ?? "").trim() === "") return;
		if (this.edit.getClipGenerationState(clipId)?.status === "generating") return;
		// A generation failure surfaces as clip state; a rejection means the clip could not be
		// generated at all — no handler registered, or nothing on the asset to generate from.
		this.edit.generateClipAsset(clipId).catch((error: unknown) => {
			console.warn(`Generate: ${error instanceof Error ? error.message : String(error)}`);
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
		const onGeneratorChanged = (): void => this.syncState();
		events.on(InternalEvent.AssetGeneratorChanged, onGeneratorChanged);
		this.generationUnsubscribers.push(() => events.off(InternalEvent.AssetGeneratorChanged, onGeneratorChanged));

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

	private selectModel(model: GenerationModelDefinition): void {
		const rawAsset = record(this.edit.getDocumentClip(this.selectedTrackIdx, this.selectedClipIdx)?.asset);
		const resolvedAsset = record(this.edit.getResolvedClip(this.selectedTrackIdx, this.selectedClipIdx)?.asset);
		const options = reconcileGenerationOptions(model, record(rawAsset["options"]), record(resolvedAsset["options"]));
		this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, { asset: { model: model.model, options } } as never);
		this.closeAllPopups();
	}

	private renderModelPopup(models: readonly GenerationModelDefinition[], selected: string | undefined): void {
		if (!this.modelPopup) return;
		this.modelPopup.replaceChildren();
		for (const model of models) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "ss-media-toolbar-popup-item";
			button.dataset["modelValue"] = model.model;
			button.textContent = model.model;
			button.classList.toggle("active", model.model === selected);
			button.addEventListener("click", () => this.selectModel(model));
			this.modelPopup.appendChild(button);
		}
	}

	private createOptionControl(option: GenerationOptionDefinition, value: unknown): HTMLInputElement | HTMLSelectElement {
		if (option.values) {
			const select = document.createElement("select");
			const empty = document.createElement("option");
			empty.value = "";
			empty.textContent = "Select…";
			select.appendChild(empty);
			for (const candidate of option.values) {
				const item = document.createElement("option");
				item.value = candidate;
				item.textContent = candidate;
				select.appendChild(item);
			}
			select.value = typeof value === "string" ? value : "";
			return select;
		}

		const input = document.createElement("input");
		input.type = option.format === "uri" ? "url" : OPTION_INPUT_TYPE[option.type];
		if (input.type === "checkbox") input.checked = value === true;
		else input.value = value === undefined ? "" : String(value);
		if (option.minimum !== undefined) input.min = String(option.minimum);
		if (option.maximum !== undefined) input.max = String(option.maximum);
		return input;
	}

	private readOptionControl(control: HTMLInputElement | HTMLSelectElement, option: GenerationOptionDefinition): unknown {
		if (control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;
		if (control.value === "") return undefined;
		return option.type === "integer" ? Number(control.value) : control.value;
	}

	private renderOptions(model: GenerationModelDefinition, values: Record<string, unknown>): void {
		if (!this.optionsPopup) return;
		this.optionsPopup.replaceChildren();
		this.optionRows.clear();
		for (const option of model.options) {
			const row = document.createElement("label");
			row.className = "ss-ai-option-row";
			row.dataset["optionRow"] = option.name;
			const title = document.createElement("span");
			title.textContent = option.title;
			const value = values[option.name] ?? (option.hasDefault ? option.defaultValue : undefined);
			const control = this.createOptionControl(option, value);
			control.dataset["option"] = option.name;
			// A required boolean is satisfied by false, which an unchecked required checkbox reports as invalid.
			control.required = option.required && option.type !== "boolean";
			control.addEventListener("change", () => {
				// An empty required field is the missing-option state and must commit; malformed input must not.
				if (!control.validity.valid && !control.validity.valueMissing) return;
				const next = this.readOptionControl(control, option);
				this.edit.updateClip(this.selectedTrackIdx, this.selectedClipIdx, { asset: { options: { [option.name]: next } } } as never);
				this.syncMissingOptions(model, { ...values, [option.name]: next });
			});
			row.append(title, control);
			this.optionRows.set(option.name, row);
			this.optionsPopup.appendChild(row);
		}

		for (const option of model.unsupported) {
			const row = document.createElement("div");
			row.className = "ss-ai-option-row is-unsupported";
			row.title = "This option can only be set outside the editor.";
			const title = document.createElement("span");
			title.textContent = option.title;
			const state = document.createElement("span");
			state.className = "ss-ai-option-state";
			state.textContent = values[option.name] === undefined ? "Not set" : "Configured";
			row.append(title, state);
			this.optionsPopup.appendChild(row);
		}
	}

	private syncMissingOptions(model: GenerationModelDefinition | undefined, values: Record<string, unknown>): readonly string[] {
		const missing = model ? missingGenerationOptions(model, values) : [];
		this.optionsBtn?.classList.toggle("has-error", missing.length > 0);
		if (this.optionsBtn) this.optionsBtn.title = missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Generation options";
		if (model) {
			for (const option of model.options) {
				const row = this.optionRows.get(option.name);
				row?.toggleAttribute("data-missing", option.required && !isGenerationOptionValueValid(option, values[option.name]));
			}
		}
		return missing;
	}

	private syncCatalogueControls(asset: Record<string, unknown>): readonly string[] {
		const type = typeof asset["type"] === "string" ? GENERATION_TYPE[asset["type"]] : undefined;
		const models = type ? this.edit.getGenerationModels(type) : undefined;
		const selected = typeof asset["model"] === "string" ? asset["model"] : undefined;
		const selectedModel = models?.find(model => model.model === selected);

		if (this.modelBtn) {
			this.modelBtn.hidden = models === undefined;
			this.modelBtn.disabled = models?.length === 0;
			this.modelBtn.classList.toggle("is-unavailable", selected !== undefined && selectedModel === undefined);
		}
		if (this.modelLabel) this.modelLabel.textContent = modelLabelText(models, selected, selectedModel);
		this.renderModelPopup(models ?? [], selected);

		if (this.optionsBtn) {
			const empty = selectedModel !== undefined && selectedModel.options.length === 0 && selectedModel.unsupported.length === 0;
			this.optionsBtn.hidden = models === undefined || models.length === 0 || empty;
			this.optionsBtn.disabled = selectedModel === undefined;
		}
		const values = record(asset["options"]);
		if (selectedModel) {
			this.renderOptions(selectedModel, values);
		} else {
			this.optionsPopup?.replaceChildren();
			this.optionRows.clear();
		}
		return this.syncMissingOptions(selectedModel, values);
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

		const missing = this.syncCatalogueControls(record(asset));
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
		this.generateBtn.disabled = generating || !hasPrompt || missing.length > 0;
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
		return [this.modelPopup, this.optionsPopup];
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
		this.modelBtn = null;
		this.modelLabel = null;
		this.modelPopup = null;
		this.optionsBtn = null;
		this.optionsPopup = null;
		this.optionRows.clear();
	}
}
