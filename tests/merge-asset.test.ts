import { describe, it, expect } from "@jest/globals";
import { mergeAssetForExport } from "../src/core/shared/merge-asset";
import type { Asset } from "../src/core/schemas/asset";

describe("mergeAssetForExport", () => {
	it("returns current asset when no original exists", () => {
		const currentAsset: Asset = {
			type: "text",
			text: "Hello"
		};

		const result = mergeAssetForExport(undefined, currentAsset);

		expect(result).toEqual(currentAsset);
	});

	it("includes animation added at runtime to rich-text asset", () => {
		const originalAsset = {
			type: "rich-text" as const,
			text: "Title",
			font: { family: "Open Sans", size: 48 }
		};
		const currentAsset = {
			type: "rich-text" as const,
			text: "Title",
			font: { family: "Open Sans", size: 48 },
			animation: { preset: "fadeIn" as const, duration: 1 }
		};

		const result = mergeAssetForExport(originalAsset as Asset, currentAsset as Asset);

		expect(result).toHaveProperty("animation");
		expect((result as any).animation.preset).toBe("fadeIn");
	});

	it("current asset properties override original properties", () => {
		const originalAsset: Asset = {
			type: "text",
			text: "Original"
		};
		const currentAsset: Asset = {
			type: "text",
			text: "Updated"
		};

		const result = mergeAssetForExport(originalAsset, currentAsset);

		expect(result.text).toBe("Updated");
	});

	it("preserves original properties not present in current (shallow merge)", () => {
		const originalAsset = {
			type: "rich-text" as const,
			text: "{{title}}",
			font: { family: "Arial", size: 24 },
			customProperty: "preserved"
		};
		const currentAsset = {
			type: "rich-text" as const,
			text: "Hello",
			font: { family: "Arial", size: 24 }
		};

		const result = mergeAssetForExport(originalAsset as Asset, currentAsset as Asset);

		// Custom property from original should be preserved since it's not in current
		expect((result as any).customProperty).toBe("preserved");
	});

	it("handles video asset with src merge field", () => {
		const originalAsset: Asset = {
			type: "video",
			src: "{{videoUrl}}"
		};
		const currentAsset: Asset = {
			type: "video",
			src: "https://example.com/video.mp4",
			volume: 0.8
		};

		const result = mergeAssetForExport(originalAsset, currentAsset);

		expect(result.type).toBe("video");
		expect((result as any).src).toBe("https://example.com/video.mp4");
		expect((result as any).volume).toBe(0.8);
	});

	it("type field always comes from current asset", () => {
		const originalAsset: Asset = {
			type: "text",
			text: "Hello"
		};
		const currentAsset: Asset = {
			type: "rich-text",
			text: "Hello"
		};

		const result = mergeAssetForExport(originalAsset, currentAsset);

		expect(result.type).toBe("rich-text");
	});
});
