import { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";

import type { Clip } from "@schemas";

// A prompt-bearing clip has no src, so PlayerFactory routes it to a pending
// placeholder player. Constructing one for real still needs pixi.js mocked —
// see edit-clip-operations.test.ts for the fuller player-mock pattern.
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
		// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
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

const editWithPromptClip = async (): Promise<Edit> => {
	const edit = new Edit({
		timeline: {
			tracks: [
				{
					clips: [{ asset: { type: "audio", prompt: "a calm harbour at dusk" }, start: 0, length: 5 }]
				}
			]
		},
		output: { size: { width: 1920, height: 1080 }, format: "mp4" }
	});
	await edit.load();
	return edit;
};

const clipIdOf = (edit: Edit): string =>
	(edit.getEdit({ includeIds: true }).timeline.tracks[0]?.clips[0] as Clip & { id: string }).id;

describe("generation through the public API", () => {
	it("reports started then completed when the host handler resolves", async () => {
		const edit = await editWithPromptClip();
		const seen: string[] = [];
		edit.events.on(EditEvent.ClipGenerationStarted, () => seen.push("started"));
		edit.events.on(EditEvent.ClipGenerationCompleted, () => seen.push("completed"));
		edit.registerAssetGenerator(async () => ({ url: "https://cdn.example.com/harbour.mp3" }));

		await edit.generateClip(clipIdOf(edit));

		expect(seen).toEqual(["started", "completed"]);
		edit.dispose();
	});

	it("reports the handler's message on failure, and resolves rather than rejecting", async () => {
		const edit = await editWithPromptClip();
		const failures: Array<{ clipId: string; error: string }> = [];
		edit.events.on(EditEvent.ClipGenerationFailed, payload => failures.push(payload));
		edit.registerAssetGenerator(async () => {
			throw new Error("provider refused the prompt");
		});

		await expect(edit.generateClip(clipIdOf(edit))).resolves.toBeUndefined();

		expect(failures).toHaveLength(1);
		expect(failures[0]?.error).toBe("provider refused the prompt");
		expect(failures[0]?.clipId).toBe(clipIdOf(edit));
		edit.dispose();
	});

	it("rejects when no handler is registered", async () => {
		const edit = await editWithPromptClip();
		await expect(edit.generateClip(clipIdOf(edit))).rejects.toThrow(/No asset generator registered/);
		edit.dispose();
	});
});
