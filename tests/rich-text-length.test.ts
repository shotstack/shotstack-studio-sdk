/** @jest-environment jsdom */

import { ShotstackEdit } from "@core/shotstack-edit";
import { UIController } from "@core/ui/ui-controller";
import type { Canvas } from "@canvas/shotstack-canvas";
import type { RichTextAsset } from "@schemas";
import * as pixi from "pixi.js";

jest.mock("pixi-filters", () => ({
	AdjustmentFilter: jest.fn().mockImplementation(() => ({})),
	BloomFilter: jest.fn().mockImplementation(() => ({})),
	GlowFilter: jest.fn().mockImplementation(() => ({})),
	OutlineFilter: jest.fn().mockImplementation(() => ({})),
	DropShadowFilter: jest.fn().mockImplementation(() => ({}))
}));

jest.mock("pixi.js", () => {
	const createMockContainer = (): Record<string, unknown> => {
		const children: unknown[] = [];
		const self = {
			children,
			sortableChildren: true,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
			visible: true,
			destroyed: false,
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				if (typeof child === "object" && child !== null) {
					// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
					child.parent = self;
				}
				return child;
			}),
			removeChild: jest.fn((child: unknown) => {
				const idx = children.indexOf(child);
				if (idx !== -1) children.splice(idx, 1);
				return child;
			}),
			removeChildAt: jest.fn(),
			getChildByLabel: jest.fn(() => null),
			getChildIndex: jest.fn(() => 0),
			destroy: jest.fn(() => {
				self.destroyed = true;
			}),
			setMask: jest.fn()
		};
		return self;
	};

	const createMockGraphics = (): Record<string, unknown> => ({
		fillStyle: {},
		rect: jest.fn().mockReturnThis(),
		fill: jest.fn().mockReturnThis(),
		clear: jest.fn().mockReturnThis(),
		stroke: jest.fn().mockReturnThis(),
		strokeStyle: {},
		destroy: jest.fn()
	});

	return {
		// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- Jest factories need the filter stubs at mock initialisation.
		...require("./helpers/pixi-mock-filters").pixiFilterStubs,
		Container: jest.fn().mockImplementation(createMockContainer),
		Graphics: jest.fn().mockImplementation(createMockGraphics),
		Sprite: jest.fn().mockImplementation(() => ({
			texture: {},
			width: 100,
			height: 100,
			parent: null,
			anchor: { set: jest.fn() },
			scale: { set: jest.fn() },
			position: { set: jest.fn() },
			destroy: jest.fn()
		})),
		Texture: { from: jest.fn() },
		Assets: { load: jest.fn().mockResolvedValue({}), unload: jest.fn(), cache: { has: jest.fn().mockReturnValue(false) } },
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() })),
		Rectangle: jest.fn()
	};
});

jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue({}),
		unload: jest.fn(),
		getProgress: jest.fn().mockReturnValue(100),
		incrementRef: jest.fn(),
		decrementRef: jest.fn().mockReturnValue(true),
		loadTracker: { on: jest.fn(), off: jest.fn() }
	}))
}));

jest.mock("@core/luma-mask-controller", () => ({
	LumaMaskController: jest.fn().mockImplementation(() => ({
		initialize: jest.fn(),
		update: jest.fn(),
		dispose: jest.fn(),
		cleanupForPlayer: jest.fn(),
		getActiveMaskCount: jest.fn().mockReturnValue(0)
	}))
}));

jest.mock("@canvas/system/alignment-guides", () => ({
	AlignmentGuides: jest.fn().mockImplementation(() => ({
		drawCanvasGuide: jest.fn(),
		drawClipGuide: jest.fn(),
		clear: jest.fn()
	}))
}));

jest.mock("@canvas/shotstack-canvas", () => ({ Canvas: jest.fn() }));

jest.mock("mediabunny", () => ({}));
jest.mock("opentype.js", () => ({ parse: jest.fn() }));
jest.mock("@canvas/players/text-player", () => ({ TextPlayer: { resetFontCache: jest.fn() } }));

// Text editing and schema validation stay real; rendering needs no GPU or font downloads.
jest.mock("@shotstack/shotstack-canvas", () => ({
	createTextEngine: async () => ({
		validate: (value: unknown) => ({ value }),
		createRenderer: () => ({ render: async () => {} }),
		renderFrame: async () => [],
		destroy: () => {}
	})
}));

describe("Rich-text length validation", () => {
	let edit: ShotstackEdit;
	let ui: UIController;
	let area: HTMLTextAreaElement;

	beforeEach(async () => {
		// The fixtures contain JSON data; jsdom does not provide structuredClone.
		globalThis.structuredClone ??= value => JSON.parse(JSON.stringify(value));
		jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		Object.assign(pixi.Texture, { from: () => ({ source: { update() {} }, destroy() {} }) });
		edit = new ShotstackEdit({
			timeline: { tracks: [{ clips: [{ asset: { type: "rich-text", text: "Original" }, start: 0, length: 3 }] }] },
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		const canvas = {
			setUIController: jest.fn(),
			getContentBounds: () => ({ top: 0, left: 0, right: 1920, bottom: 1080 })
		} as unknown as Canvas;
		ui = UIController.create(edit, canvas, { selectionHandles: false, mergeFields: true });
		ui.mount(document.body);
		edit.selectClip(0, 0);
		document.querySelector<HTMLButtonElement>('.ss-toolbar.visible [data-action="text-edit-toggle"]')!.click();
		area = document.querySelector<HTMLTextAreaElement>(".ss-toolbar.visible [data-text-edit-area]")!;
		jest.useFakeTimers();
	});

	afterEach(() => {
		ui?.dispose();
		edit?.dispose();
		jest.useRealTimers();
		jest.restoreAllMocks();
		document.body.replaceChildren();
	});

	function savedText() {
		return (edit.getEdit().timeline.tracks[0].clips[0].asset as RichTextAsset).text;
	}

	async function typeText(value: string) {
		area.value = value;
		area.setSelectionRange(value.length, value.length);
		area.dispatchEvent(new Event("input", { bubbles: true }));
		await jest.advanceTimersByTimeAsync(150);
	}

	it("retains oversized Unicode text for correction and saves a valid boundary edit", async () => {
		const oversized = `${"a".repeat(4999)  }😀`;
		await typeText(oversized);
		expect(savedText()).toBe("Original");
		expect(area.value).toBe(oversized);
		expect(area.validationMessage).toContain("5,000");
		area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
		expect(area.closest<HTMLElement>("[data-text-edit-popup]")!.classList.contains("visible")).toBe(true);

		const valid = `${"a".repeat(4998)  }😀`;
		await typeText(valid);
		expect(savedText()).toBe(valid);
		expect(area.validationMessage).toBe("");
	});

	it.each([
		{ kind: "template", prefix: "a".repeat(4992), value: "Z" },
		{ kind: "resolved text", prefix: "", value: "x".repeat(5001) }
	])("rejects an oversized $kind insertion without a delayed partial-token save", async ({ prefix, value }) => {
		edit.mergeFields.register({ name: "NAME", defaultValue: value });
		const draft = `${prefix  }{{ N`;
		area.value = draft;
		area.setSelectionRange(draft.length, draft.length);
		area.dispatchEvent(new Event("input", { bubbles: true }));
		document.querySelector<HTMLElement>('.ss-toolbar.visible [data-var-name="NAME"]')!.click();
		await jest.advanceTimersByTimeAsync(150);
		expect(savedText()).toBe("Original");
		expect(area.value).toBe(draft);
		expect(area.validationMessage).toContain("5,000");

		edit.mergeFields.register({ name: "NAME", defaultValue: "Z" });
		edit.mergeFields.register({ name: "OTHER", defaultValue: "Hello" });
		area.value = "{{ OTHER }} {{ N";
		area.setSelectionRange(area.value.length, area.value.length);
		area.dispatchEvent(new Event("input", { bubbles: true }));
		document.querySelector<HTMLElement>('.ss-toolbar.visible [data-var-name="NAME"]')!.click();
		await jest.advanceTimersByTimeAsync(150);
		expect(savedText()).toBe("{{ OTHER }} {{ NAME }}");
		expect((edit.getResolvedEdit().timeline.tracks[0].clips[0].asset as RichTextAsset).text).toBe("Hello Z");
		expect(area.validationMessage).toBe("");
	});

	it("preserves the previous binding when variable expansion exceeds the limit", async () => {
		edit.mergeFields.register({ name: "NAME", defaultValue: "Z" });
		await typeText("{{ NAME }}");
		expect(savedText()).toBe("{{ NAME }}");
		edit.mergeFields.register({ name: "LONG", defaultValue: "x".repeat(5001) });
		await typeText("{{ LONG }}");
		expect(savedText()).toBe("{{ NAME }}");
		expect((edit.getResolvedEdit().timeline.tracks[0].clips[0].asset as RichTextAsset).text).toBe("Z");
		expect(area.value).toBe("{{ LONG }}");
		expect(area.validationMessage).toContain("5,000");
	});
});
