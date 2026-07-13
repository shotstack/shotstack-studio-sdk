import { isAiAsset, isPendingAiAsset, aiAssetKind, computeAiAssetNumber, getAiAssetTypeLabel } from "@core/shared/ai-asset-utils";
import type { ResolvedClip } from "@schemas";

describe("ai-asset-utils", () => {
	describe("isAiAsset", () => {
		it("accepts legacy generative types", () => {
			expect(isAiAsset({ type: "text-to-image", prompt: "a cat" })).toBe(true);
			expect(isAiAsset({ type: "image-to-video", src: "https://cdn/input.png" })).toBe(true);
			expect(isAiAsset({ type: "text-to-speech", prompt: "hello" })).toBe(true);
		});

		it("accepts prompt-bearing media assets", () => {
			expect(isAiAsset({ type: "image", prompt: "a cat" })).toBe(true);
			expect(isAiAsset({ type: "video", prompt: "waves", seed: "https://cdn/seed.png" })).toBe(true);
			expect(isAiAsset({ type: "audio", prompt: "calm piano" })).toBe(true);
		});

		it("stays true after realisation fills src", () => {
			expect(isAiAsset({ type: "image", prompt: "a cat", src: "https://cdn/cat.png" })).toBe(true);
		});

		it("rejects plain media and non-media assets", () => {
			expect(isAiAsset({ type: "image", src: "https://cdn/cat.png" })).toBe(false);
			expect(isAiAsset({ type: "video", src: "https://cdn/clip.mp4" })).toBe(false);
			expect(isAiAsset({ type: "shape", shape: "rectangle" })).toBe(false);
			expect(isAiAsset(null)).toBe(false);
		});

		it("treats a whitespace-only prompt as absent", () => {
			expect(isAiAsset({ type: "image", prompt: "   " })).toBe(false);
		});
	});

	describe("isPendingAiAsset", () => {
		it("is pending while a prompt-bearing media asset has no src", () => {
			expect(isPendingAiAsset({ type: "image", prompt: "a cat" })).toBe(true);
			expect(isPendingAiAsset({ type: "video", prompt: "waves", seed: "https://cdn/seed.png" })).toBe(true);
			expect(isPendingAiAsset({ type: "audio", prompt: "calm piano" })).toBe(true);
		});

		it("is not pending once src is filled in place", () => {
			expect(isPendingAiAsset({ type: "image", prompt: "a cat", src: "https://cdn/cat.png" })).toBe(false);
			expect(isPendingAiAsset({ type: "audio", prompt: "calm piano", src: "https://cdn/piano.mp3" })).toBe(false);
		});

		it("legacy generative types are always pending", () => {
			expect(isPendingAiAsset({ type: "text-to-image", prompt: "a cat" })).toBe(true);
			expect(isPendingAiAsset({ type: "image-to-video", src: "https://cdn/input.png" })).toBe(true);
		});

		it("is false for plain media assets", () => {
			expect(isPendingAiAsset({ type: "image", src: "https://cdn/cat.png" })).toBe(false);
			expect(isPendingAiAsset({ type: "image" })).toBe(false);
		});
	});

	describe("aiAssetKind", () => {
		it("maps legacy and unified types to the same kinds", () => {
			expect(aiAssetKind({ type: "text-to-image", prompt: "x" })).toBe("image");
			expect(aiAssetKind({ type: "image", prompt: "x" })).toBe("image");
			expect(aiAssetKind({ type: "image-to-video", src: "s" })).toBe("video");
			expect(aiAssetKind({ type: "video", prompt: "x" })).toBe("video");
			expect(aiAssetKind({ type: "text-to-speech", prompt: "x" })).toBe("mic");
			expect(aiAssetKind({ type: "audio", prompt: "x" })).toBe("mic");
		});

		it("returns null for non-AI assets", () => {
			expect(aiAssetKind({ type: "image", src: "https://cdn/cat.png" })).toBe(null);
			expect(aiAssetKind({ type: "text", text: "hi" })).toBe(null);
		});
	});

	describe("computeAiAssetNumber", () => {
		const clip = (id: string, start: number, asset: object): ResolvedClip => ({ id, start, length: 1, asset }) as unknown as ResolvedClip;

		it("numbers legacy and prompt-bearing assets of one kind in a single sequence", () => {
			const clips = [
				clip("a", 0, { type: "text-to-image", prompt: "first" }),
				clip("b", 1, { type: "image", prompt: "second" }),
				clip("c", 2, { type: "image", prompt: "third", src: "https://cdn/done.png" }),
				clip("d", 3, { type: "audio", prompt: "music" })
			];

			expect(computeAiAssetNumber(clips, "a")).toBe(1);
			expect(computeAiAssetNumber(clips, "b")).toBe(2);
			expect(computeAiAssetNumber(clips, "c")).toBe(3);
			expect(computeAiAssetNumber(clips, "d")).toBe(1);
		});

		it("skips plain media assets and returns null for them", () => {
			const clips = [clip("a", 0, { type: "image", src: "https://cdn/plain.png" }), clip("b", 1, { type: "image", prompt: "generated" })];

			expect(computeAiAssetNumber(clips, "a")).toBe(null);
			expect(computeAiAssetNumber(clips, "b")).toBe(1);
		});
	});

	describe("getAiAssetTypeLabel", () => {
		it("labels unified media types like their legacy counterparts", () => {
			expect(getAiAssetTypeLabel("image")).toBe("Image");
			expect(getAiAssetTypeLabel("video")).toBe("Video");
			expect(getAiAssetTypeLabel("audio")).toBe("Audio");
			expect(getAiAssetTypeLabel("text-to-image")).toBe("Image");
		});
	});
});
