/**
 * Clip JSON parse + serialise tests.
 */

import { clipToJsonString, tryParseClipJson, tryParseJsonFlexible, tryParseTracksJson } from "@core/clipboard/clip-json";
import type { Clip } from "@schemas";

describe("tryParseClipJson", () => {
	const validClipJson = JSON.stringify({
		asset: { type: "image", src: "https://example.com/x.jpg" },
		start: 0,
		length: 5,
		fit: "contain"
	});

	it("returns a parsed clip when input is valid clip JSON", () => {
		const clip = tryParseClipJson(validClipJson);
		expect(clip).not.toBeNull();
		expect(clip?.asset?.type).toBe("image");
		expect(clip?.start).toBe(0);
		expect(clip?.length).toBe(5);
	});

	it("returns null for invalid JSON syntax", () => {
		expect(tryParseClipJson("{ not valid json")).toBeNull();
	});

	it("returns null for JSON that is a primitive", () => {
		expect(tryParseClipJson("42")).toBeNull();
		expect(tryParseClipJson('"a string"')).toBeNull();
		expect(tryParseClipJson("null")).toBeNull();
	});

	it("returns null for JSON arrays (not clip-shaped)", () => {
		expect(tryParseClipJson("[1, 2, 3]")).toBeNull();
	});

	it("returns null for an object without required clip fields", () => {
		expect(tryParseClipJson('{"foo": "bar"}')).toBeNull();
	});

	it("returns null for an object with bad clip field types", () => {
		expect(tryParseClipJson('{"asset": {"type": "image"}, "start": "not a number", "length": 5}')).toBeNull();
	});

	it("returns null for an unknown asset.type value", () => {
		expect(
			tryParseClipJson(
				JSON.stringify({
					asset: { type: "definitely-not-a-real-type", src: "x" },
					start: 0,
					length: 5
				})
			)
		).toBeNull();
	});

	it("does not match SVG markup masquerading as clipboard text", () => {
		expect(tryParseClipJson("<svg/>")).toBeNull();
	});
});

describe("clipToJsonString", () => {
	it("serialises a clip and strips the id field", () => {
		const clip = {
			id: "should-be-stripped",
			asset: { type: "image" as const, src: "https://example.com/x.jpg" },
			start: 0,
			length: 5
		} as unknown as Clip;

		const json = clipToJsonString(clip);
		expect(json).toContain('"asset"');
		expect(json).toContain('"start"');
		expect(json).not.toContain("should-be-stripped");
	});

	it("does not mutate the input clip", () => {
		const clip = {
			id: "keep-me",
			asset: { type: "image" as const, src: "https://example.com/x.jpg" },
			start: 0,
			length: 5
		} as unknown as Clip;

		clipToJsonString(clip);
		expect((clip as { id?: string }).id).toBe("keep-me");
	});

	it("produces a string that round-trips through tryParseClipJson", () => {
		const original = {
			asset: { type: "image" as const, src: "https://example.com/x.jpg" },
			start: 1,
			length: 4
		} as unknown as Clip;

		const json = clipToJsonString(original);
		const parsed = tryParseClipJson(json);

		expect(parsed?.start).toBe(1);
		expect(parsed?.length).toBe(4);
		expect(parsed?.asset?.type).toBe("image");
	});
});

describe("tryParseTracksJson", () => {
	const oneClip = { asset: { type: "image", src: "https://example.com/x.jpg" }, start: 0, length: 5 };
	const otherClip = { asset: { type: "image", src: "https://example.com/y.jpg" }, start: 5, length: 3 };

	it("parses a single-track object as a one-element array", () => {
		const track = tryParseTracksJson(JSON.stringify({ clips: [oneClip] }));
		expect(track).not.toBeNull();
		expect(track).toHaveLength(1);
		expect(track?.[0].clips).toHaveLength(1);
	});

	it("parses an array of tracks", () => {
		const tracks = tryParseTracksJson(JSON.stringify([{ clips: [oneClip] }, { clips: [otherClip] }]));
		expect(tracks).toHaveLength(2);
	});

	it("auto-wraps a comma-separated track fragment in [...] before parsing", () => {
		// User copied a chunk of `tracks: [..., ...]` content including the comma.
		const fragment = `${JSON.stringify({ clips: [oneClip] })},${JSON.stringify({ clips: [otherClip] })}`;
		const tracks = tryParseTracksJson(fragment);
		expect(tracks).toHaveLength(2);
	});

	it("recovers from a trailing comma after the last track", () => {
		const fragment = `${JSON.stringify({ clips: [oneClip] })},${JSON.stringify({ clips: [otherClip] })},`;
		const tracks = tryParseTracksJson(fragment);
		expect(tracks).toHaveLength(2);
	});

	it("recovers from a leading comma before the first track", () => {
		const fragment = `,${JSON.stringify({ clips: [oneClip] })},${JSON.stringify({ clips: [otherClip] })}`;
		const tracks = tryParseTracksJson(fragment);
		expect(tracks).toHaveLength(2);
	});

	it("recovers from leading whitespace in the copied chunk", () => {
		const fragment = `   ${JSON.stringify({ clips: [oneClip] })}`;
		const tracks = tryParseTracksJson(fragment);
		expect(tracks).toHaveLength(1);
	});

	it("returns null for clip-shaped JSON (no clips wrapper)", () => {
		expect(tryParseTracksJson(JSON.stringify(oneClip))).toBeNull();
	});

	it("returns null for an empty clips array (TrackSchema requires min 1)", () => {
		expect(tryParseTracksJson('{"clips":[]}')).toBeNull();
	});

	it("returns null for an empty top-level array", () => {
		expect(tryParseTracksJson("[]")).toBeNull();
	});

	it("returns null when any track in the array fails to validate", () => {
		const fragment = `${JSON.stringify({ clips: [oneClip] })},{"foo":"bar"}`;
		expect(tryParseTracksJson(fragment)).toBeNull();
	});

	it("returns null for invalid JSON that is also invalid when wrapped", () => {
		expect(tryParseTracksJson("not json at all")).toBeNull();
	});
});

describe("tryParseJsonFlexible", () => {
	it("parses well-formed JSON directly", () => {
		expect(tryParseJsonFlexible('{"a":1}')).toEqual({ a: 1 });
		expect(tryParseJsonFlexible("[1,2,3]")).toEqual([1, 2, 3]);
	});

	it("trims leading and trailing whitespace", () => {
		expect(tryParseJsonFlexible('   {"a":1}\n')).toEqual({ a: 1 });
	});

	it("strips a single trailing comma", () => {
		expect(tryParseJsonFlexible('{"a":1},')).toEqual({ a: 1 });
	});

	it("strips a single leading comma", () => {
		expect(tryParseJsonFlexible(',{"a":1}')).toEqual({ a: 1 });
	});

	it("strips multiple trailing commas", () => {
		expect(tryParseJsonFlexible('{"a":1},,,')).toEqual({ a: 1 });
	});

	it("wraps a comma-separated fragment in [...] to recover an array", () => {
		expect(tryParseJsonFlexible('{"a":1},{"b":2}')).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("strips trailing comma AND wraps in [...] (the user's case)", () => {
		expect(tryParseJsonFlexible('{"a":1},{"b":2},')).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("returns null for empty or whitespace-only input", () => {
		expect(tryParseJsonFlexible("")).toBeNull();
		expect(tryParseJsonFlexible("   ")).toBeNull();
	});

	it("returns null for completely non-JSON text", () => {
		expect(tryParseJsonFlexible("this is just prose")).toBeNull();
	});

	it("does NOT relax JSON syntax inside the payload (no JSON5)", () => {
		// Trailing comma INSIDE an object — outer-level recovery can't help.
		expect(tryParseJsonFlexible('{"a":1,}')).toBeNull();
		// Single quotes — not relaxed.
		expect(tryParseJsonFlexible("{'a':1}")).toBeNull();
	});
});
