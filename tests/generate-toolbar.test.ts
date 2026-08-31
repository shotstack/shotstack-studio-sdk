/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */
/* eslint-disable max-classes-per-file -- the two stub classes are jest.mock factories, not real types */

import type { Edit } from "@core/edit-session";

if (typeof structuredClone === "undefined") {
	global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

jest.mock("pixi.js", () => ({}));
jest.mock("../src/components/canvas/players/player", () => ({
	Player: class MockPlayer {},
	PlayerType: {}
}));
jest.mock("../src/core/edit-session", () => ({}));
jest.mock("@styles/inject", () => ({
	injectShotstackStyles: jest.fn()
}));

import { InternalEvent } from "@core/events/edit-events";
import type { GenerationAssetType, GenerationModelDefinition, GenerationOptionDefinition } from "@core/generation/model-catalogue";
import { GenerateToolbar } from "@core/ui/generate-toolbar";

type MockEdit = ReturnType<typeof createMockEdit>;

function createMockEdit(asset: Record<string, unknown> = { type: "image", prompt: "a cat" }) {
	const internalEvents = { on: jest.fn(), off: jest.fn() };
	return {
		getClipId: jest.fn().mockReturnValue("clip-1"),
		getResolvedClip: jest.fn().mockReturnValue({ asset }),
		getDocumentClip: jest.fn().mockReturnValue({ asset }),
		getGenerationModels: jest.fn(),
		getDocument: jest.fn(),
		hasAssetGenerator: jest.fn().mockReturnValue(true),
		getClipGenerationState: jest.fn(),
		getGenerationStatus: jest.fn(),
		generateClipAsset: jest.fn().mockResolvedValue(undefined),
		resolveMergeFields: jest.fn((value: string) => value),
		updateClip: jest.fn(),
		deleteClip: jest.fn(),
		canDeleteClip: jest.fn(() => true),
		getInternalEvents: jest.fn(() => internalEvents),
		events: { on: jest.fn(), off: jest.fn() }
	};
}

const model = (
	name: string,
	type: GenerationAssetType = "image",
	options: readonly GenerationOptionDefinition[] = [],
	unsupported: readonly { name: string; title: string }[] = []
): GenerationModelDefinition => ({
	model: name,
	type,
	optionNames: [...options.map(option => option.name), ...unsupported.map(entry => entry.name)],
	options,
	unsupported
});

const option = (
	name: string,
	type: GenerationOptionDefinition["type"],
	overrides: Partial<GenerationOptionDefinition> = {}
): GenerationOptionDefinition => ({ name, title: name, type, required: false, hasDefault: false, ...overrides });

function mountToolbar(edit: MockEdit): { toolbar: GenerateToolbar; container: HTMLDivElement } {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const toolbar = new GenerateToolbar(edit as unknown as Edit);
	toolbar.mount(container);
	toolbar.show(0, 0);
	return { toolbar, container };
}

describe("GenerateToolbar", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("offers all three modes so the other panes stay reachable", () => {
		const { toolbar, container } = mountToolbar(createMockEdit());

		const modes = [...container.querySelectorAll(".ss-toolbar-mode-btn")].map(b => (b as HTMLElement).dataset["mode"]);
		expect(modes).toEqual(["asset", "clip", "generate"]);
		expect(container.querySelector(".ss-toolbar-mode-btn.active")?.getAttribute("data-mode")).toBe("generate");

		toolbar.dispose();
	});

	it("marks its own toggle generative, since it only ever shows for such a clip", () => {
		const { toolbar, container } = mountToolbar(createMockEdit());

		expect(container.querySelector(".ss-toolbar-mode-toggle")?.hasAttribute("data-generative")).toBe(true);

		toolbar.dispose();
	});

	it("calls the action Generate whether or not the clip already has output", () => {
		const assets: Array<Record<string, unknown>> = [
			{ type: "image", prompt: "a cat" },
			{ type: "image", prompt: "a cat", src: "https://cdn/out.png" }
		];

		assets.forEach(asset => {
			const { toolbar, container } = mountToolbar(createMockEdit(asset));
			expect(container.querySelector("[data-generate-label]")?.textContent).toBe("Generate");
			toolbar.dispose();
			document.body.innerHTML = "";
		});
	});

	it("disables the action while a generation is in flight", () => {
		const edit = createMockEdit();
		edit.getClipGenerationState.mockReturnValue({ status: "generating" });
		const { toolbar, container } = mountToolbar(edit);

		const btn = container.querySelector<HTMLButtonElement>("[data-action='generate']");
		expect(btn?.disabled).toBe(true);
		expect(container.querySelector("[data-generate-label]")?.textContent).toBe("Generating…");

		toolbar.dispose();
	});

	it("offers a retry and the reason when generation failed", () => {
		const edit = createMockEdit();
		edit.getClipGenerationState.mockReturnValue({ status: "failed", error: "model unavailable" });
		const { toolbar, container } = mountToolbar(edit);

		expect(container.querySelector("[data-generate-label]")?.textContent).toBe("Retry");
		const error = container.querySelector<HTMLElement>("[data-generate-error]");
		expect(error?.hidden).toBe(false);
		expect(error?.textContent).toBe("model unavailable");

		toolbar.dispose();
	});

	it("says the prompt still generates on render when no generator is registered", () => {
		const edit = createMockEdit();
		edit.hasAssetGenerator.mockReturnValue(false);
		const { toolbar, container } = mountToolbar(edit);

		expect(container.querySelector<HTMLButtonElement>("[data-action='generate']")?.hidden).toBe(true);
		const note = container.querySelector<HTMLElement>("[data-generate-note]");
		expect(note?.hidden).toBe(false);
		expect(note?.textContent?.trim()).toBe("Generates on render");
		expect(container.querySelector<HTMLInputElement>("[data-prompt-input]")?.disabled).toBe(false);

		toolbar.dispose();
	});

	it("drops the note once a generator can preview it here", () => {
		const { toolbar, container } = mountToolbar(createMockEdit());

		expect(container.querySelector<HTMLElement>("[data-generate-note]")?.hidden).toBe(true);
		expect(container.querySelector<HTMLButtonElement>("[data-action='generate']")?.hidden).toBe(false);

		toolbar.dispose();
	});

	it.each([
		[undefined, true, ""],
		[[], false, "No models available"]
	])("distinguishes an absent catalogue from an empty one", (models, hidden, label) => {
		const edit = createMockEdit();
		edit.getGenerationModels.mockReturnValue(models);
		const { toolbar, container } = mountToolbar(edit);
		const picker = container.querySelector<HTMLButtonElement>("[data-model-picker]");
		expect(picker?.hidden).toBe(hidden);
		expect(container.querySelector("[data-model-label]")?.textContent).toBe(label);
		if (models) expect(picker?.disabled).toBe(true);
		toolbar.dispose();
	});

	it("shows available models without inventing an automatic entry", () => {
		const edit = createMockEdit();
		edit.getGenerationModels.mockReturnValue([model("flux-schnell"), model("nano-banana-2")]);
		const { toolbar, container } = mountToolbar(edit);

		expect(container.querySelector("[data-model-label]")?.textContent).toBe("Select model");
		expect(container.querySelector<HTMLButtonElement>("[data-options-picker]")?.disabled).toBe(true);
		container.querySelector<HTMLButtonElement>("[data-model-picker]")?.click();
		expect([...container.querySelectorAll("[data-model-value]")].map(node => node.textContent)).toEqual([
			"flux-schnell",
			"nano-banana-2"
		]);
		expect(container.textContent).not.toContain("Automatic");
		toolbar.dispose();
	});

	it("hides Options for a selected model with no controls", () => {
		const edit = createMockEdit({ type: "image", prompt: "a cat", model: "flux-schnell" });
		edit.getGenerationModels.mockReturnValue([model("flux-schnell")]);
		const { toolbar, container } = mountToolbar(edit);
		expect(container.querySelector<HTMLButtonElement>("[data-options-picker]")?.hidden).toBe(true);
		toolbar.dispose();
	});

	it("preserves an unavailable model until an available model is selected", () => {
		const asset = { type: "image", prompt: "a cat", model: "host-model", options: { seed: 7 } };
		const edit = createMockEdit(asset);
		edit.getGenerationModels.mockReturnValue([model("nano-banana-2")]);
		const { toolbar, container } = mountToolbar(edit);

		expect(container.querySelector("[data-model-label]")?.textContent).toBe("host-model (Unavailable)");
		expect(edit.updateClip).not.toHaveBeenCalled();
		container.querySelector<HTMLButtonElement>('[data-model-value="nano-banana-2"]')?.click();
		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, { asset: { model: "nano-banana-2", options: { seed: undefined } } });
		toolbar.dispose();
	});

	it("reconciles defaults and raw merge fields in one model update", () => {
		const resolution = option("resolution", "string", { values: ["1K", "2K"], hasDefault: true, defaultValue: "1K" });
		const seed = option("seed", "integer");
		const edit = createMockEdit({ type: "image", prompt: "a cat", options: { seed: 7 } });
		edit.getDocumentClip.mockReturnValue({ asset: { type: "image", options: { resolution: "{{ SIZE }}", seed: 7 } } });
		edit.getResolvedClip.mockReturnValue({ asset: { type: "image", prompt: "a cat", options: { resolution: "2K", seed: 7 } } });
		edit.getGenerationModels.mockReturnValue([model("nano-banana-2", "image", [resolution, seed])]);
		const { toolbar, container } = mountToolbar(edit);

		container.querySelector<HTMLButtonElement>('[data-model-value="nano-banana-2"]')?.click();
		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, {
			asset: { model: "nano-banana-2", options: { resolution: "{{ SIZE }}", seed: 7 } }
		});
		toolbar.dispose();
	});

	it("renders each supported schema shape as a native control", () => {
		const options = [
			option("resolution", "string", { values: ["720p", "1080p"] }),
			option("generateAudio", "boolean"),
			option("musicLengthMs", "integer", { minimum: 1000, maximum: 60000 }),
			option("compositionPlan", "string"),
			option("inputSrc", "string", { format: "uri" })
		];
		const edit = createMockEdit({ type: "video", prompt: "a cat", model: "video-model", options: {} });
		edit.getGenerationModels.mockReturnValue([model("video-model", "video", options)]);
		const { toolbar, container } = mountToolbar(edit);

		expect(container.querySelector('[data-option="resolution"]')?.tagName).toBe("SELECT");
		expect(container.querySelector<HTMLInputElement>('[data-option="generateAudio"]')?.type).toBe("checkbox");
		const number = container.querySelector<HTMLInputElement>('[data-option="musicLengthMs"]');
		expect([number?.type, number?.min, number?.max]).toEqual(["number", "1000", "60000"]);
		expect(container.querySelector<HTMLInputElement>('[data-option="compositionPlan"]')?.type).toBe("text");
		expect(container.querySelector<HTMLInputElement>('[data-option="inputSrc"]')?.type).toBe("url");

		number!.value = "5000";
		number?.dispatchEvent(new Event("change", { bubbles: true }));
		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, { asset: { options: { musicLengthMs: 5000 } } });
		toolbar.dispose();
	});

	it("requires configured model options but permits the backend default model", () => {
		const voice = option("voice", "string", { title: "Voice", required: true });
		const asset = { type: "audio", prompt: "hello", model: "speech", options: {} };
		const edit = createMockEdit(asset);
		edit.getGenerationModels.mockReturnValue([model("speech", "audio", [voice])]);
		const { toolbar, container } = mountToolbar(edit);
		const generate = container.querySelector<HTMLButtonElement>("[data-action='generate']");
		const optionsButton = container.querySelector<HTMLButtonElement>("[data-options-picker]");

		expect(generate?.disabled).toBe(true);
		expect(optionsButton?.classList.contains("has-error")).toBe(true);
		expect(optionsButton?.title).toContain("Voice");
		expect(container.querySelector('[data-option-row="voice"]')?.hasAttribute("data-missing")).toBe(true);

		asset.model = undefined as never;
		toolbar.show(0, 0);
		expect(generate?.disabled).toBe(false);
		toolbar.dispose();
	});

	it("commits a cleared required option and marks it missing", () => {
		const voice = option("voice", "string", { title: "Voice", required: true });
		const edit = createMockEdit({ type: "audio", prompt: "hello", model: "speech", options: { voice: "Matthew" } });
		edit.getGenerationModels.mockReturnValue([model("speech", "audio", [voice])]);
		const { toolbar, container } = mountToolbar(edit);
		const control = container.querySelector<HTMLInputElement>('[data-option="voice"]');

		control!.value = "";
		control?.dispatchEvent(new Event("change", { bubbles: true }));

		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, { asset: { options: { voice: undefined } } });
		expect(container.querySelector('[data-option-row="voice"]')?.hasAttribute("data-missing")).toBe(true);
		expect(container.querySelector<HTMLButtonElement>("[data-options-picker]")?.classList.contains("has-error")).toBe(true);
		toolbar.dispose();
	});

	it("shows a published option it cannot render instead of dropping it", () => {
		const plan = { name: "compositionPlan", title: "Composition plan" };
		const edit = createMockEdit({ type: "audio", prompt: "a score", model: "music", options: { compositionPlan: { sections: [] } } });
		edit.getGenerationModels.mockReturnValue([model("music", "audio", [option("forceInstrumental", "boolean", { title: "Instrumental only" })], [plan])]);
		const { toolbar, container } = mountToolbar(edit);

		const row = container.querySelector<HTMLElement>(".ss-ai-option-row.is-unsupported");
		expect(row?.textContent).toContain("Composition plan");
		expect(row?.textContent).toContain("Configured");
		expect(row?.querySelector("input, select")).toBeNull();
		expect(container.querySelector<HTMLButtonElement>("[data-options-picker]")?.hidden).toBe(false);
		toolbar.dispose();
	});

	it("keeps Options reachable when every published option is unrenderable", () => {
		const edit = createMockEdit({ type: "audio", prompt: "a score", model: "music", options: {} });
		edit.getGenerationModels.mockReturnValue([model("music", "audio", [], [{ name: "compositionPlan", title: "Composition plan" }])]);
		const { toolbar, container } = mountToolbar(edit);

		expect(container.querySelector<HTMLButtonElement>("[data-options-picker]")?.hidden).toBe(false);
		expect(container.querySelector(".ss-ai-option-row.is-unsupported")?.textContent).toContain("Not set");
		toolbar.dispose();
	});

	it("generates the selected clip when the action is pressed", () => {
		const edit = createMockEdit();
		const { toolbar, container } = mountToolbar(edit);

		container.querySelector<HTMLButtonElement>("[data-action='generate']")?.click();

		expect(edit.generateClipAsset).toHaveBeenCalledWith("clip-1");

		toolbar.dispose();
	});

	it("puts the whole prompt in an editable field, not a truncated label", () => {
		const prompt = "a very long prompt that would not have fitted in a button label";
		const { toolbar, container } = mountToolbar(createMockEdit({ type: "image", prompt }));

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		expect(input?.value).toBe(prompt);

		toolbar.dispose();
	});

	it("asks for a prompt when the clip has none", () => {
		const { toolbar, container } = mountToolbar(createMockEdit({ type: "text-to-image" }));

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		expect(input?.value).toBe("");
		expect(input?.placeholder).toBe("Describe what to generate…");

		toolbar.dispose();
	});

	it("commits an edited prompt before generating, so Enter never runs the stale one", () => {
		const edit = createMockEdit();
		const { toolbar, container } = mountToolbar(edit);

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		input!.value = "a dog instead";
		input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ asset: expect.objectContaining({ prompt: "a dog instead" }) }));
		expect(edit.generateClipAsset).toHaveBeenCalledWith("clip-1");

		toolbar.dispose();
	});

	it("edits the legacy text-to-speech text property", () => {
		const document = {
			setClipBinding: jest.fn(),
			removeClipBinding: jest.fn(),
			getClipBinding: jest.fn()
		};
		const edit = createMockEdit({ type: "text-to-speech", text: "Welcome" });
		edit.getDocument.mockReturnValue(document);
		const { toolbar, container } = mountToolbar(edit);

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		expect(input?.value).toBe("Welcome");
		input!.value = "Updated welcome";
		input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(document.removeClipBinding).toHaveBeenCalledWith("clip-1", "asset.text");
		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ asset: expect.objectContaining({ text: "Updated welcome" }) }));

		toolbar.dispose();
	});

	it("keeps a merge-field prompt editable when using the base Edit class", () => {
		const rawPrompt = "a calm image of {{ SUBJECT }}";
		const resolvedPrompt = "a calm image of a red apple";
		let binding: { placeholder: string; resolvedValue: string } | undefined;
		const document = {
			setClipBinding: jest.fn((_clipId: string, _path: string, value: { placeholder: string; resolvedValue: string }) => {
				binding = value;
			}),
			removeClipBinding: jest.fn(),
			getClipBinding: jest.fn(() => binding)
		};
		const edit = createMockEdit();
		edit.getDocument.mockReturnValue(document);
		edit.resolveMergeFields.mockReturnValue(resolvedPrompt);
		const { toolbar, container } = mountToolbar(edit);

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		input!.value = rawPrompt;
		input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(document.setClipBinding).toHaveBeenCalledWith("clip-1", "asset.prompt", {
			placeholder: rawPrompt,
			resolvedValue: resolvedPrompt
		});
		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ asset: expect.objectContaining({ prompt: resolvedPrompt }) }));

		input?.blur();
		toolbar.show(0, 0);
		expect(input?.value).toBe(rawPrompt);

		toolbar.dispose();
	});

	it("ignores a second request while one is already running", () => {
		const edit = createMockEdit();
		edit.getClipGenerationState.mockReturnValue({ status: "generating" });
		const { toolbar, container } = mountToolbar(edit);

		container.querySelector<HTMLButtonElement>("[data-action='generate']")?.click();

		expect(edit.generateClipAsset).not.toHaveBeenCalled();

		toolbar.dispose();
	});

	it("offers the pane on a plain asset, with nothing to run yet", () => {
		const { toolbar, container } = mountToolbar(createMockEdit({ type: "image", src: "https://cdn/uploaded.png" }));

		const btn = container.querySelector<HTMLButtonElement>("[data-action='generate']");
		expect(btn?.hidden).toBe(false);
		expect(btn?.disabled).toBe(true);
		expect(container.querySelector<HTMLInputElement>("[data-prompt-input]")?.value).toBe("");

		toolbar.dispose();
	});

	it("enables the action as soon as a prompt is typed, and disables it again when cleared", () => {
		const edit = createMockEdit({ type: "image", src: "https://cdn/uploaded.png" });
		const { toolbar, container } = mountToolbar(edit);

		const btn = container.querySelector<HTMLButtonElement>("[data-action='generate']");
		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		expect(btn?.disabled).toBe(true);

		input!.value = "a golden sunset";
		input?.dispatchEvent(new Event("input", { bubbles: true }));
		expect(btn?.disabled).toBe(false);

		btn?.click();
		expect(edit.generateClipAsset).toHaveBeenCalledWith("clip-1");

		input!.value = "";
		input?.dispatchEvent(new Event("input", { bubbles: true }));
		expect(btn?.disabled).toBe(true);

		toolbar.dispose();
	});

	it("turns a plain asset generative when a prompt is typed", () => {
		const edit = createMockEdit({ type: "image", src: "https://cdn/uploaded.png" });
		const { toolbar, container } = mountToolbar(edit);

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		input!.value = "a golden sunset";
		input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ asset: expect.objectContaining({ prompt: "a golden sunset" }) }));
		expect(edit.generateClipAsset).toHaveBeenCalledWith("clip-1");

		toolbar.dispose();
	});

	it("removes the prompt when the field is cleared, so the asset stops regenerating", () => {
		const edit = createMockEdit({ type: "image", prompt: "a cat", src: "https://cdn/out.png" });
		const document = { setClipBinding: jest.fn(), removeClipBinding: jest.fn(), getClipBinding: jest.fn() };
		edit.getDocument.mockReturnValue(document);
		const { toolbar, container } = mountToolbar(edit);

		const input = container.querySelector<HTMLInputElement>("[data-prompt-input]");
		input!.value = "   ";
		input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

		expect(edit.updateClip).toHaveBeenCalledWith(0, 0, { asset: expect.objectContaining({ prompt: undefined }) });
		expect(document.removeClipBinding).toHaveBeenCalledWith("clip-1", "asset.prompt");
		expect(edit.generateClipAsset).not.toHaveBeenCalled();

		toolbar.dispose();
	});

	it("does not stack generation listeners when mounted twice", () => {
		const edit = createMockEdit();
		const { toolbar, container } = mountToolbar(edit);

		toolbar.mount(container);

		[InternalEvent.ClipGenerationStarted, InternalEvent.ClipGenerationCompleted, InternalEvent.ClipGenerationFailed].forEach(event => {
			expect(edit.getInternalEvents().on.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
		});

		toolbar.dispose();
	});

	describe("host status", () => {
		it("shows the host's text in the note slot with its tone", () => {
			const edit = createMockEdit();
			edit.getGenerationStatus.mockReturnValue({ text: "neutral line", tone: "neutral" });
			const { toolbar, container } = mountToolbar(edit);
			const note = container.querySelector<HTMLElement>("[data-generate-note]");
			expect(note?.hidden).toBe(false);
			expect(note?.textContent).toBe("neutral line");
			expect(note?.dataset["tone"]).toBe("neutral");
			expect(container.querySelector<HTMLButtonElement>("[data-action='generate']")?.disabled).toBe(false);
			toolbar.dispose();
		});

		it("disables Generate only for an error tone", () => {
			const edit = createMockEdit();
			edit.getGenerationStatus.mockReturnValue({ text: "blocked", tone: "error" });
			const { toolbar, container } = mountToolbar(edit);
			expect(container.querySelector<HTMLButtonElement>("[data-action='generate']")?.disabled).toBe(true);
			expect(container.querySelector<HTMLElement>("[data-generate-note]")?.dataset["tone"]).toBe("error");

			edit.getGenerationStatus.mockReturnValue({ text: "caution", tone: "warning" });
			toolbar.show(0, 0);
			expect(container.querySelector<HTMLButtonElement>("[data-action='generate']")?.disabled).toBe(false);
			toolbar.dispose();
		});

		it("hides the note again when the status is cleared", () => {
			const edit = createMockEdit();
			edit.getGenerationStatus.mockReturnValue({ text: "x" });
			const { toolbar, container } = mountToolbar(edit);
			const note = container.querySelector<HTMLElement>("[data-generate-note]");
			expect(note?.dataset["tone"]).toBe("neutral");
			edit.getGenerationStatus.mockReturnValue(undefined);
			toolbar.show(0, 0);
			expect(note?.hidden).toBe(true);
			expect(note?.dataset["tone"]).toBeUndefined();
			toolbar.dispose();
		});

		it("still shows the no-generator note when no generator is registered", () => {
			const edit = createMockEdit();
			edit.hasAssetGenerator.mockReturnValue(false);
			edit.getGenerationStatus.mockReturnValue({ text: "ignored" });
			const { toolbar, container } = mountToolbar(edit);
			expect(container.querySelector("[data-generate-note]")?.textContent).toBe("Generates on render");
			toolbar.dispose();
		});

		it("carries the no-generator tooltip only when no generator is registered", () => {
			const edit = createMockEdit();
			edit.hasAssetGenerator.mockReturnValue(false);
			const { toolbar, container } = mountToolbar(edit);
			expect(container.querySelector("[data-generate-note]")?.getAttribute("title")).toBe(
				"Rendering generates this from the prompt. Register an asset generator to preview it here."
			);
			toolbar.dispose();
		});

		it("drops the no-generator tooltip once a generator reports a status", () => {
			const edit = createMockEdit();
			edit.getGenerationStatus.mockReturnValue({ text: "now" });
			const { toolbar, container } = mountToolbar(edit);
			expect(container.querySelector("[data-generate-note]")?.hasAttribute("title")).toBe(false);
			toolbar.dispose();
		});

		it("re-syncs when the status for the selected clip changes", () => {
			const edit = createMockEdit();
			const { toolbar, container } = mountToolbar(edit);
			const handler = edit.getInternalEvents().on.mock.calls.find(([name]) => name === InternalEvent.GenerationStatusChanged)?.[1];
			expect(handler).toBeDefined();
			edit.getGenerationStatus.mockReturnValue({ text: "now" });
			handler({ clipId: "clip-1" });
			expect(container.querySelector("[data-generate-note]")?.textContent).toBe("now");
			toolbar.dispose();
		});

		it("ignores a status change for a clip other than the selected one", () => {
			const edit = createMockEdit();
			edit.getGenerationStatus.mockReturnValue({ text: "original" });
			const { toolbar, container } = mountToolbar(edit);
			const handler = edit.getInternalEvents().on.mock.calls.find(([name]) => name === InternalEvent.GenerationStatusChanged)?.[1];
			expect(handler).toBeDefined();
			edit.getGenerationStatus.mockReturnValue({ text: "unrelated clip's line" });
			handler({ clipId: "other-clip" });
			expect(container.querySelector("[data-generate-note]")?.textContent).toBe("original");
			toolbar.dispose();
		});
	});
});
