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
import { GenerateToolbar } from "@core/ui/generate-toolbar";

type MockEdit = ReturnType<typeof createMockEdit>;

function createMockEdit(asset: Record<string, unknown> = { type: "image", prompt: "a cat" }) {
	const internalEvents = { on: jest.fn(), off: jest.fn() };
	return {
		getClipId: jest.fn().mockReturnValue("clip-1"),
		getResolvedClip: jest.fn().mockReturnValue({ asset }),
		getDocument: jest.fn(),
		hasAssetGenerator: jest.fn().mockReturnValue(true),
		getClipGenerationState: jest.fn(),
		generateClipAsset: jest.fn().mockResolvedValue(undefined),
		resolveMergeFields: jest.fn((value: string) => value),
		updateClip: jest.fn(),
		deleteClip: jest.fn(),
		canDeleteClip: jest.fn(() => true),
		getInternalEvents: jest.fn(() => internalEvents),
		events: { on: jest.fn(), off: jest.fn() }
	};
}

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

	it("does not stack generation listeners when mounted twice", () => {
		const edit = createMockEdit();
		const { toolbar, container } = mountToolbar(edit);

		toolbar.mount(container);

		[InternalEvent.ClipGenerationStarted, InternalEvent.ClipGenerationCompleted, InternalEvent.ClipGenerationFailed].forEach(event => {
			expect(edit.getInternalEvents().on.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
		});

		toolbar.dispose();
	});
});
