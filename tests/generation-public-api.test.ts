import { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";

import type { Clip } from "@schemas";
import { registerGenerationSettings } from "../src/internal";

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
	it.each([true, false])("scopes the internal settings hook to its registration (before catalogue: %s)", async beforeCatalogue => {
		const edit = await editWithPromptClip();
		const open = jest.fn();
		let cleanup: (() => void) | undefined;
		if (beforeCatalogue) cleanup = registerGenerationSettings(edit, open);
		edit.registerAssetGenerator(async () => ({ url: "unused" }), { catalogue: {
			models: [{ model: "complex", type: "audio", options: {
				type: "object", additionalProperties: false, required: ["plan"],
				properties: { plan: { type: "object" } }
			} }]
		} });
		if (!beforeCatalogue) {
			expect(edit.getGenerationModels("audio")).toEqual([]);
			cleanup = registerGenerationSettings(edit, open);
		}
		expect(edit.getGenerationModels("audio")?.map(model => model.model)).toEqual(["complex"]);
		const removeReplacement = registerGenerationSettings(edit, open);
		cleanup?.();
		edit.generationSettings?.({ clipId: "clip-1", model: "complex" });
		expect(open).toHaveBeenCalledWith({ clipId: "clip-1", model: "complex" });
		removeReplacement();
		expect(edit.generationSettings).toBeUndefined();
		expect(edit.getGenerationModels("audio")).toEqual([]);
		const cleanupDisposed = registerGenerationSettings(edit, open);
		edit.dispose();
		expect(edit.generationSettings).toBeUndefined();
		cleanupDisposed();
	});

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

	it("keeps the timeline length when the last clip's generated asset replaces its placeholder", async () => {
		const edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ asset: { type: "audio", prompt: "a calm harbour at dusk" }, start: 0, length: 5 },
							{ asset: { type: "audio", prompt: "gulls over the water" }, start: 5, length: 5 }
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		const last = (edit.getEdit({ includeIds: true }).timeline.tracks[0]?.clips[1] as Clip & { id: string }).id;
		edit.registerAssetGenerator(async () => ({ url: "https://cdn.example.com/gulls.mp3" }));

		await edit.generateClip(last);

		expect(edit.totalDuration).toBe(10);
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

	it("passes complex options saved by a host panel to the generator", async () => {
		const edit = await editWithPromptClip();
		const clipId = clipIdOf(edit);
		const { asset: originalAsset } = edit.getClipById(clipId)!;
		const options = { compositionPlan: { sections: [{ name: "Introduction", durationMs: 5000 }] } };
		await edit.updateClipById(clipId, { asset: { ...originalAsset, model: "music", options } } as Partial<Clip>);
		let requested: Record<string, unknown> | undefined;
		edit.registerAssetGenerator(async ({ asset }) => {
			requested = asset;
			throw new Error("Recorded without generating");
		});
		await edit.generateClip(clipId);
		expect(requested).toMatchObject({ model: "music", options });
		expect(edit.getClipById(clipId)?.asset).toMatchObject({ model: "music", options });
		await edit.updateClipById(clipId, { asset: { ...originalAsset, options: { compositionPlan: undefined } } } as Partial<Clip>);
		const cleared = edit.getClipById(clipId)?.asset as { options?: Record<string, unknown> };
		expect(cleared.options?.["compositionPlan"]).toBeUndefined();
		edit.dispose();
	});

	it("rejects when no handler is registered", async () => {
		const edit = await editWithPromptClip();
		await expect(edit.generateClip(clipIdOf(edit))).rejects.toThrow(/No asset generator registered/);
		edit.dispose();
	});

	it("continues a generated image with a video that starts from its file", async () => {
		const edit = new Edit({
			timeline: { tracks: [{ clips: [{ asset: { type: "image", prompt: "a lighthouse" }, start: 0, length: 4 }] }] },
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		edit.registerAssetGenerator(async () => ({ url: "https://cdn.example.com/lighthouse.png" }), {
			catalogue: {
				models: [
					{
						model: "i2v",
						type: "video",
						options: {
							type: "object",
							additionalProperties: false,
							required: ["startSrc"],
							properties: { startSrc: { type: "string", format: "uri" } }
						}
					}
				]
			}
		});
		await edit.generateClip(clipIdOf(edit));
		await edit.continueFromClip(clipIdOf(edit));
		expect(edit.getEdit().timeline.tracks[0]?.clips[1]).toMatchObject({
			start: 4,
			length: 5,
			asset: { type: "video", model: "i2v", options: { startSrc: "https://cdn.example.com/lighthouse.png" } }
		});
		edit.dispose();
	});

	it("repoints a continuation when its source is regenerated, as one undo step", async () => {
		const edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ asset: { type: "image", prompt: "a lighthouse", src: "https://cdn.example.com/old.png" }, start: 0, length: 4 },
							{
								asset: {
									type: "video",
									prompt: "waves",
									src: "https://cdn.example.com/waves.mp4",
									options: { startSrc: "https://cdn.example.com/old.png" }
								},
								start: 4,
								length: 5
							}
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		edit.registerAssetGenerator(async () => ({ url: "https://cdn.example.com/new.png" }));
		const clips = () => edit.getEdit().timeline.tracks[0]!.clips as Array<{ asset: { src?: string; options?: { startSrc?: string } } }>;

		await edit.generateClip(clipIdOf(edit));
		expect(clips()[1]!.asset.options?.startSrc).toBe("https://cdn.example.com/new.png");
		expect(clips()[1]!.asset.src).toBeUndefined();

		await edit.undo();
		expect(clips()[0]!.asset.src).toBe("https://cdn.example.com/old.png");
		expect(clips()[1]!.asset.options?.startSrc).toBe("https://cdn.example.com/old.png");
		expect(clips()[1]!.asset.src).toBe("https://cdn.example.com/waves.mp4");
		edit.dispose();
	});

	it("discards a follower's in-flight generation when its source is regenerated", async () => {
		const edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ asset: { type: "image", prompt: "a lighthouse", src: "https://cdn.example.com/old.png" }, start: 0, length: 4 },
							{ asset: { type: "video", prompt: "waves", options: { startSrc: "https://cdn.example.com/old.png" } }, start: 4, length: 5 }
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		let release: () => void = () => {};
		const gate = new Promise<void>(resolve => {
			release = resolve;
		});
		edit.registerAssetGenerator(async ({ asset }) => {
			if ((asset as { type: string }).type === "video") {
				await gate;
				return { url: "https://cdn.example.com/stale.mp4" };
			}
			return { url: "https://cdn.example.com/new.png" };
		});
		const completed: string[] = [];
		edit.events.on(EditEvent.ClipGenerationCompleted, e => completed.push(e.clipId));
		const failures: Array<{ clipId: string; error: string }> = [];
		edit.events.on(EditEvent.ClipGenerationFailed, e => failures.push(e));
		const ids = [0, 1].map(c => edit.getDocument()!.getClipId(0, c) as string);

		const stale = edit.generateClip(ids[1]!);
		await edit.generateClip(ids[0]!);
		expect(edit.getClipGenerationState(ids[1]!)).toEqual({ status: "failed", error: "Its start frame changed." });
		release();
		await stale;

		const clips = edit.getEdit().timeline.tracks[0]!.clips as Array<{ asset: { src?: string } }>;
		expect(clips[1]!.asset.src).toBeUndefined();
		expect(completed).toEqual([ids[0]]);
		expect(failures).toEqual([{ clipId: ids[1], error: "Its start frame changed." }]);
		edit.dispose();
	});

	it("never repoints the regenerated clip itself", async () => {
		const edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{
								asset: {
									type: "video",
									prompt: "loop",
									src: "https://cdn.example.com/old.mp4",
									options: { startSrc: "https://cdn.example.com/old.mp4" }
								},
								start: 0,
								length: 4
							}
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		edit.registerAssetGenerator(async () => ({ url: "https://cdn.example.com/new.mp4" }));
		await edit.generateClip(clipIdOf(edit));
		const { asset } = edit.getEdit().timeline.tracks[0]!.clips[0] as { asset: { src?: string; options?: { startSrc?: string } } };
		expect(asset.src).toBe("https://cdn.example.com/new.mp4");
		expect(asset.options?.startSrc).toBe("https://cdn.example.com/old.mp4");
		edit.dispose();
	});

	describe("a chain of continuations", () => {
		type ChainClip = { asset: { src?: string; options?: { startSrc?: string } } };
		const url = (name: string) => `https://cdn.example.com/${name}.mp4`;
		const video = (prompt: string, src: string, startSrc: string, start: number) => ({
			asset: { type: "video" as const, prompt, src, options: { startSrc } },
			start,
			length: 5
		});

		// A, then B continuing from A, then C continuing from B; each generation writes `<prompt>-new`.
		const chainEdit = async () => {
			const edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [
								{ asset: { type: "image", prompt: "a", src: url("a") }, start: 0, length: 4 },
								video("b", url("b"), url("a"), 4),
								video("c", url("c"), url("b"), 9)
							]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			});
			await edit.load();
			edit.registerAssetGenerator(async ({ asset }) => ({ url: url(`${(asset as { prompt: string }).prompt}-new`) }));
			const ids = [0, 1, 2].map(c => edit.getDocument()!.getClipId(0, c) as string);
			const clip = (index: number) => edit.getEdit().timeline.tracks[0]!.clips[index] as ChainClip;
			return { edit, ids, clip };
		};

		it("repoints the next clip when a cleared continuation is regenerated", async () => {
			const { edit, ids, clip } = await chainEdit();

			await edit.generateClip(ids[0]!);
			expect(clip(1).asset.src).toBeUndefined();
			await edit.generateClip(ids[1]!);
			expect(clip(2).asset.options?.startSrc).toBe(url("b-new"));
			expect(clip(2).asset.src).toBeUndefined();
			expect(edit.getClipGenerationState(ids[2]!)).toBeUndefined();

			await edit.undo();
			expect(clip(2).asset.options?.startSrc).toBe(url("b"));
			await edit.generateClip(ids[1]!);
			expect(clip(2).asset.options?.startSrc).toBe(url("b-new"));
			edit.dispose();
		});

		it("forgets the file a repoint cleared once the repoint is undone", async () => {
			const { edit, ids, clip } = await chainEdit();

			await edit.generateClip(ids[0]!);
			await edit.undo();
			expect(clip(1).asset.src).toBe(url("b"));
			await edit.updateClipById(ids[1]!, { asset: { ...edit.getClipById(ids[1]!)!.asset, src: undefined } } as Partial<Clip>);
			await edit.generateClip(ids[1]!);

			expect(clip(2).asset).toMatchObject({ src: url("c"), options: { startSrc: url("b") } });
			edit.dispose();
		});
	});

	it("leaves continuations alone when a legacy image-to-video clip moves its input image to its options", async () => {
		const edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ asset: { type: "image-to-video", prompt: "drift", src: "https://cdn.example.com/img.png" }, start: 0, length: 4 },
							{
								asset: {
									type: "video",
									prompt: "next",
									src: "https://cdn.example.com/next.mp4",
									options: { startSrc: "https://cdn.example.com/img.png" }
								},
								start: 4,
								length: 5
							}
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		edit.registerAssetGenerator(async () => ({ url: "https://cdn.example.com/drift.mp4" }));

		await edit.generateClip(clipIdOf(edit));

		expect(edit.getEdit().timeline.tracks[0]!.clips[1]!.asset).toMatchObject({
			src: "https://cdn.example.com/next.mp4",
			options: { startSrc: "https://cdn.example.com/img.png" }
		});
		edit.dispose();
	});

	it("drops a follower's result that queued behind the regeneration repointing it", async () => {
		const edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ asset: { type: "image", prompt: "a lighthouse", src: "https://cdn.example.com/old.png" }, start: 0, length: "auto" },
							{ asset: { type: "video", prompt: "waves", options: { startSrc: "https://cdn.example.com/old.png" } }, start: 4, length: 5 }
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
		let releaseFollower: () => void = () => {};
		const followerGate = new Promise<void>(resolve => {
			releaseFollower = resolve;
		});
		edit.registerAssetGenerator(async ({ asset }) => {
			if ((asset as { type: string }).type === "image") return { url: "https://cdn.example.com/new.png" };
			await followerGate;
			return { url: "https://cdn.example.com/stale.mp4" };
		});
		// The source's auto length holds the queue on its probe while the follower's result arrives.
		let releaseProbe: () => void = () => {};
		const probe = new Promise<void>(resolve => {
			releaseProbe = resolve;
		});
		let probing: () => void = () => {};
		const probed = new Promise<void>(resolve => {
			probing = resolve;
		});
		jest.spyOn(edit, "resolveClipAutoLength").mockImplementation(() => {
			probing();
			return probe;
		});
		const completed: string[] = [];
		edit.events.on(EditEvent.ClipGenerationCompleted, e => completed.push(e.clipId));
		const failures: string[] = [];
		edit.events.on(EditEvent.ClipGenerationFailed, e => failures.push(e.clipId));
		const ids = [0, 1].map(c => edit.getDocument()!.getClipId(0, c) as string);

		const follower = edit.generateClip(ids[1]!);
		const source = edit.generateClip(ids[0]!);
		await probed;
		releaseFollower();
		await new Promise(resolve => {
			setTimeout(resolve, 0);
		});
		releaseProbe();
		await Promise.all([source, follower]);

		const { asset } = edit.getEdit().timeline.tracks[0]!.clips[1] as { asset: { src?: string; options?: { startSrc?: string } } };
		expect(asset.options?.startSrc).toBe("https://cdn.example.com/new.png");
		expect(asset.src).toBeUndefined();
		expect(completed).toEqual([ids[0]]);
		expect(failures).toEqual([ids[1]]);
		await edit.undo();
		expect(edit.canUndo).toBe(false);
		edit.dispose();
	});
});
