import { findEligibleSourceClips, findCurrentSource, generateAlias } from "../src/core/shared/source-clip-finder";

// ── Helpers ──────────────────────────────────────────────────────────

function makeClip(type: string, overrides: Record<string, unknown> = {}) {
	return { asset: { type }, start: 0, length: 5, ...overrides };
}

function createMockEdit(tracks: Array<Array<Record<string, unknown>>>) {
	const clipIds: Record<string, string> = {};
	let counter = 0;
	tracks.forEach((track, t) => {
		track.forEach((_, c) => {
			counter += 1;
			clipIds[`${t}-${c}`] = `clip-${String(counter).padStart(8, "0")}`;
		});
	});

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
			[makeClip("video", { asset: { type: "video", src: "https://cdn.example.com/uploads/my-video.mp4" } })],
			[makeClip("audio", { asset: { type: "audio", src: "https://cdn.example.com/music/background.mp3" } })],
			[makeClip("text-to-speech", { asset: { type: "text-to-speech", text: "Hello, welcome to the show", voice: "Rachel" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		const labels = result.map(r => r.displayLabel);
		expect(labels).toContain("my-video · Video · Track 1 · Clip 1");
		expect(labels).toContain("background · Audio · Track 2 · Clip 1");
		expect(labels).toContain('"Hello, welcome to the sho..." (Rachel) · Track 3 · Clip 1');
	});

	it("extracts filename from src URL for video clips", () => {
		const edit = createMockEdit([
			[makeClip("video", { asset: { type: "video", src: "https://cdn.example.com/uploads/my-video.mp4" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("my-video · Video · Track 1 · Clip 1");
	});

	it("generates TTS label with text preview and voice", () => {
		const edit = createMockEdit([
			[makeClip("text-to-speech", { asset: { type: "text-to-speech", text: "Hello, welcome to our channel", voice: "Rachel" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe('"Hello, welcome to our cha..." (Rachel) · Track 1 · Clip 1');
	});

	it("uses user-set alias as primary label when present", () => {
		const edit = createMockEdit([
			[makeClip("video", { alias: "main_interview", asset: { type: "video", src: "https://cdn.example.com/video.mp4" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("main_interview · Video · Track 1 · Clip 1");
	});

	it("falls back to type and track when no src is available", () => {
		const edit = createMockEdit([
			[makeClip("video")],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("Video · Track 1 · Clip 1");
	});

	it("decodes URL-encoded filenames", () => {
		const edit = createMockEdit([
			[makeClip("video", { asset: { type: "video", src: "https://cdn.example.com/uploads/my%20wedding%20video.mp4" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("my wedding video · Video · Track 1 · Clip 1");
	});

	it("extracts merge field name from src", () => {
		const edit = createMockEdit([
			[makeClip("video", { asset: { type: "video", src: "{{ VIDEO_URL }}" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("VIDEO_URL · Video · Track 1 · Clip 1");
	});

	it("skips auto-generated alias and falls back to filename", () => {
		const edit = createMockEdit([
			[makeClip("video", { alias: "source_196fb550", asset: { type: "video", src: "https://cdn.example.com/ceremony-intro.mp4" } })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("ceremony-intro · Video · Track 1 · Clip 1");
		expect(result[0].currentAlias).toBe("source_196fb550");
	});

	it("skips auto-generated alias and falls back to type when no src", () => {
		const edit = createMockEdit([
			[makeClip("video", { alias: "source_abcd1234" })],
		]);

		const result = findEligibleSourceClips(edit as never);
		expect(result[0].displayLabel).toBe("Video · Track 1 · Clip 1");
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
		ids.forEach(id => {
			const alias = generateAlias(id);
			expect(alias).toMatch(/^[A-Za-z0-9_-]+$/);
		});
	});

	it("uses last 8 characters of clip ID", () => {
		const alias = generateAlias("very-long-clip-id-ABCD1234");
		expect(alias).toBe("source_ABCD1234");
	});

	it("output matches auto-alias detection pattern", () => {
		const alias = generateAlias("clip-00000001");
		// If this fails, AUTO_ALIAS_PATTERN is out of sync with generateAlias
		expect(alias).toMatch(/^source_[\da-f]{8}$/i);
	});
});
