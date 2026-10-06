import { canContinueFrom, continuationClip, continuationModel, repointChain } from "../src/core/generation/continue-clip";
import type { GenerationModelDefinition } from "../src/core/generation/model-catalogue";

const model = (name: string, optionNames: string[]): GenerationModelDefinition => ({
	model: name,
	type: "video",
	optionNames,
	options: [],
	unsupported: []
});
const clip = (asset: Record<string, unknown>) => ({ asset, start: 2, length: 5 }) as never;

describe("continue-clip", () => {
	it("continues video and image clips that have a file", () => {
		expect(canContinueFrom(clip({ type: "video", src: "https://cdn.example/a.mp4" }))).toBe(true);
		expect(canContinueFrom(clip({ type: "image", src: "https://cdn.example/a.png" }))).toBe(true);
		expect(canContinueFrom(clip({ type: "video", prompt: "pan" }))).toBe(false);
		expect(canContinueFrom(clip({ type: "video", src: "{{ INTRO }}" }))).toBe(false);
		expect(canContinueFrom(clip({ type: "audio", src: "https://cdn.example/a.mp3" }))).toBe(false);
	});

	it("picks the first video model that takes a start image", () => {
		const models = [model("seedance-2.0-text-to-video", ["aspectRatio"]), model("seedance-2.0-image-to-video", ["startSrc", "endSrc"])];
		expect(continuationModel(models)?.model).toBe("seedance-2.0-image-to-video");
		expect(continuationModel([model("seedance-2.0-text-to-video", ["aspectRatio"])])).toBeUndefined();
		expect(continuationModel(undefined)).toBeUndefined();
	});

	it("starts the new clip at the source's end from the source's file", () => {
		const next = continuationClip(clip({ type: "video", src: "https://cdn.example/a.mp4?v=1" }), model("i2v", ["startSrc"]), 7);
		expect(next).toMatchObject({
			start: 7,
			length: 5,
			asset: { type: "video", model: "i2v", options: { startSrc: "https://cdn.example/a.mp4?v=1" } }
		});
		expect((next.asset as { prompt: string }).prompt.trim()).not.toBe("");
		expect(typeof next.id).toBe("string");
	});

	it("repoints clips that start or end on the regenerated file and clears their output", () => {
		const tracks = [
			[clip({ type: "image", prompt: "a lighthouse", src: "https://cdn.example/new.png" })],
			[
				clip({ type: "video", prompt: "next", src: "https://cdn.example/b.mp4", options: { startSrc: "https://cdn.example/old.png" } }),
				clip({ type: "video", prompt: "other", src: "https://cdn.example/c.mp4", options: { startSrc: "https://cdn.example/x.png" } })
			]
		] as never;
		const moved = repointChain(tracks, "https://cdn.example/old.png", "https://cdn.example/new.png");
		expect(moved).toHaveLength(1);
		expect(moved[0]).toMatchObject({ trackIndex: 1, clipIndex: 0 });
		expect(moved[0]!.clip.asset).toEqual({ type: "video", prompt: "next", options: { startSrc: "https://cdn.example/new.png" } });
	});

	it("keeps the file of a clip with no prompt to regenerate from", () => {
		const tracks = [[clip({ type: "video", src: "https://cdn.example/b.mp4", options: { endSrc: "https://cdn.example/old.png" } })]] as never;
		expect(repointChain(tracks, "https://cdn.example/old.png", "https://cdn.example/new.png")[0]!.clip.asset).toMatchObject({
			src: "https://cdn.example/b.mp4",
			options: { endSrc: "https://cdn.example/new.png" }
		});
	});

	it("repoints both start and end when a clip uses the file for each", () => {
		const tracks = [
			[clip({ type: "video", prompt: "x", options: { startSrc: "https://cdn.example/old.png", endSrc: "https://cdn.example/old.png" } })]
		] as never;
		const [moved] = repointChain(tracks, "https://cdn.example/old.png", "https://cdn.example/new.png");
		expect(moved!.clip.asset).toMatchObject({ options: { startSrc: "https://cdn.example/new.png", endSrc: "https://cdn.example/new.png" } });
	});
});
