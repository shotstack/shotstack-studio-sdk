import { findEligibleSourceClips, findCurrentSource, generateAlias } from "../src/core/shared/source-clip-finder";

// ── Helpers ──────────────────────────────────────────────────────────

function makeClip(type: string, overrides: Record<string, unknown> = {}) {
	return { asset: { type }, start: 0, length: 5, ...overrides };
}

function createMockEdit(tracks: Array<Array<Record<string, unknown>>>) {
	const clipIds: Record<string, string> = {};
	let counter = 0;
	for (let t = 0; t < tracks.length; t++) {
		for (let c = 0; c < tracks[t].length; c++) {
			counter++;
			clipIds[`${t}-${c}`] = `clip-${String(counter).padStart(8, "0")}`;
		}
	}

	return {
		getDocument: () => ({
			getTrackCount: () => tracks.length,
			getClipsInTrack: (t: number) => tracks[t] ?? []
		}),
		getClipId: (t: number, c: number) => clipIds[`${t}-${c}`] ?? null,
		getDocumentClip: (t: number, c: number) => tracks[t]?.[c] ?? null,
		updateClip: jest.fn()
	};
}

// ── Tests ────────────────────────────────────────────────────────────

describe("findEligibleSourceClips", () => {
	it("returns video/audio/TTS clips in bottom-to-top order", () => {
		const edit = createMockEdit([
			[makeClip("video")],          // Track 0 (top)
			[makeClip("audio")],          // Track 1
			[makeClip("text-to-speech")], // Track 2 (bottom)
		]);

		const result = findEligibleSourceClips(edit as never);

		expect(result).toHaveLength(3);
		// Bottom-to-top: track 2 first, track 0 last
		expect(result[0].trackIndex).toBe(2);
		expect(result[0].assetType).toBe("text-to-speech");
		expect(result[1].trackIndex).toBe(1);
		expect(result[1].assetType).toBe("audio");
		expect(result[2].trackIndex).toBe(0);
		expect(result[2].assetType).toBe("video");
	});

	it("ignores image, text, rich-caption, and rich-text types", () => {
		const edit = createMockEdit([
			[makeClip("image")],
			[makeClip("text")],
			[makeClip("rich-caption")],
			[makeClip("rich-text")],
			[makeClip("video")],
		]);

		const result = findEligibleSourceClips(edit as never);

		expect(result).toHaveLength(1);
		expect(result[0].assetType).toBe("video");
	});

	it("returns empty array for timeline with no eligible clips", () => {
		const edit = createMockEdit([
			[makeClip("image")],
			[makeClip("rich-caption")],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result).toHaveLength(0);
	});

	it("includes existing alias on clips", () => {
		const edit = createMockEdit([
			[makeClip("video", { alias: "my_alias" })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].currentAlias).toBe("my_alias");
	});

	it("generates correct display labels", () => {
		const edit = createMockEdit([
			[makeClip("video")],
			[makeClip("audio")],
			[makeClip("text-to-speech")],
		]);

		const result = findEligibleSourceClips(edit as never);
		const labels = result.map(r => r.displayLabel);
		expect(labels).toContain("Video (Track 1)");
		expect(labels).toContain("Audio (Track 2)");
		expect(labels).toContain("TTS (Track 3)");
	});
});

describe("findCurrentSource", () => {
	it("finds source by alias match", () => {
		const edit = createMockEdit([
			[makeClip("rich-caption", { asset: { type: "rich-caption", src: "alias://my_source" } })],
			[makeClip("video", { alias: "my_source" })],
		]);

		const result = findCurrentSource(edit as never, 0, 0);
		expect(result).not.toBeNull();
		expect(result!.trackIndex).toBe(1);
		expect(result!.assetType).toBe("video");
	});

	it("returns null when src is a URL (not alias)", () => {
		const edit = createMockEdit([
			[makeClip("rich-caption", { asset: { type: "rich-caption", src: "https://example.com/file.srt" } })],
			[makeClip("video")],
		]);

		const result = findCurrentSource(edit as never, 0, 0);
		expect(result).toBeNull();
	});

	it("returns null when alias doesn't match any clip", () => {
		const edit = createMockEdit([
			[makeClip("rich-caption", { asset: { type: "rich-caption", src: "alias://nonexistent" } })],
			[makeClip("video", { alias: "different_alias" })],
		]);

		const result = findCurrentSource(edit as never, 0, 0);
		expect(result).toBeNull();
	});

	it("returns null for caption without src", () => {
		const edit = createMockEdit([
			[makeClip("rich-caption", { asset: { type: "rich-caption" } })],
		]);

		const result = findCurrentSource(edit as never, 0, 0);
		expect(result).toBeNull();
	});
});

describe("generateAlias", () => {
	it("produces valid alias from clip ID", () => {
		const alias = generateAlias("clip-00000001");
		expect(alias).toBe("source_00000001");
	});

	it("conforms to alias pattern ^[A-Za-z0-9_-]+$", () => {
		const ids = ["clip-abc12345", "abcdefghijklmnop", "a1b2c3d4e5f6g7h8"];
		for (const id of ids) {
			const alias = generateAlias(id);
			expect(alias).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it("uses last 8 characters of clip ID", () => {
		const alias = generateAlias("very-long-clip-id-ABCD1234");
		expect(alias).toBe("source_ABCD1234");
	});
});
