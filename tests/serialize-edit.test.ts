import { describe, it, expect } from "@jest/globals";
import { serializeClipForExport, serializeEditForExport, type ClipExportData } from "../src/core/shared/serialize-edit";
import { EditSchema } from "../src/core/schemas/edit";
import type { ResolvedClip, Clip } from "../src/core/schemas/clip";

describe("serializeClipForExport", () => {
	it("preserves timing intent string 'auto' for start", () => {
		const clip: ClipExportData = {
			clipConfiguration: {
				asset: { type: "text", text: "Hello" },
				start: 0,
				length: 5,
				fit: "crop"
			} as ResolvedClip,
			getTimingIntent: () => ({ start: "auto", length: 5 })
		};

		const result = serializeClipForExport(clip, undefined);

		expect(result.start).toBe("auto");
		expect(result.length).toBe(5);
	});

	it("preserves timing intent string 'end' for length", () => {
		const clip: ClipExportData = {
			clipConfiguration: {
				asset: { type: "text", text: "Hello" },
				start: 0,
				length: 10,
				fit: "crop"
			} as ResolvedClip,
			getTimingIntent: () => ({ start: 0, length: "end" })
		};

		const result = serializeClipForExport(clip, undefined);

		expect(result.start).toBe(0);
		expect(result.length).toBe("end");
	});

	it("preserves alias:// references in timing", () => {
		const clip: ClipExportData = {
			clipConfiguration: {
				asset: { type: "video", src: "https://example.com/video.mp4" },
				start: 0,
				length: 5,
				fit: "crop"
			} as ResolvedClip,
			getTimingIntent: () => ({ start: "alias://intro", length: "alias://intro" })
		};

		const result = serializeClipForExport(clip, undefined);

		expect(result.start).toBe("alias://intro");
		expect(result.length).toBe("alias://intro");
	});

	it("merges original asset with current asset", () => {
		const originalClip = {
			asset: { type: "video", src: "{{ URL }}" },
			start: 0,
			length: 5
		} as Clip;
		const clip: ClipExportData = {
			clipConfiguration: {
				asset: { type: "video", src: "https://example.com/video.mp4" },
				start: 0,
				length: 5,
				fit: "crop"
			} as ResolvedClip,
			getTimingIntent: () => ({ start: 0, length: 5 })
		};

		const result = serializeClipForExport(clip, originalClip);

		// Current asset values override original
		expect((result.asset as { src: string }).src).toBe("https://example.com/video.mp4");
	});

	it("includes animation added at runtime", () => {
		const originalClip = {
			asset: { type: "rich-text", text: "Title" },
			start: 0,
			length: 3
		} as Clip;
		const clip: ClipExportData = {
			clipConfiguration: {
				asset: {
					type: "rich-text",
					text: "Title",
					animation: { preset: "fadeIn", duration: 1 }
				},
				start: 0,
				length: 3,
				fit: "cover"
			} as ResolvedClip,
			getTimingIntent: () => ({ start: 0, length: 3 })
		};

		const result = serializeClipForExport(clip, originalClip);

		expect((result.asset as { animation?: { preset: string } }).animation).toBeDefined();
		expect((result.asset as { animation: { preset: string } }).animation.preset).toBe("fadeIn");
	});

	it("uses current clipConfiguration when no originalClip", () => {
		const clip: ClipExportData = {
			clipConfiguration: {
				asset: { type: "text", text: "New Text" },
				start: 2,
				length: 4,
				fit: "crop",
				position: "center"
			} as ResolvedClip,
			getTimingIntent: () => ({ start: 2, length: 4 })
		};

		const result = serializeClipForExport(clip, undefined);

		expect(result.asset.type).toBe("text");
		expect((result.asset as { text: string }).text).toBe("New Text");
	});
});

describe("serializeEditForExport", () => {
	it("output passes EditSchema validation", () => {
		const clips: ClipExportData[][] = [
			[
				{
					clipConfiguration: {
						asset: { type: "text", text: "Hello" },
						start: 0,
						length: 5,
						fit: "crop"
					} as ResolvedClip,
					getTimingIntent: () => ({ start: 0, length: 5 })
				}
			]
		];

		const result = serializeEditForExport(
			clips,
			null,
			"#000000",
			[],
			{ size: { width: 1920, height: 1080 }, format: "mp4" },
			[]
		);

		expect(() => EditSchema.parse(result)).not.toThrow();
	});

	it("preserves merge field array", () => {
		const mergeFields = [
			{ find: "NAME", replace: "John" },
			{ find: "TITLE", replace: "Welcome" }
		];

		const result = serializeEditForExport(
			[],
			null,
			"#000000",
			[],
			{ size: { width: 1920, height: 1080 }, format: "mp4" },
			mergeFields
		);

		expect(result.merge).toEqual(mergeFields);
	});

	it("handles missing originalEdit gracefully", () => {
		const clips: ClipExportData[][] = [
			[
				{
					clipConfiguration: {
						asset: { type: "text", text: "Test" },
						start: 0,
						length: 3,
						fit: "crop"
					} as ResolvedClip,
					getTimingIntent: () => ({ start: "auto", length: 3 })
				}
			]
		];

		const result = serializeEditForExport(
			clips,
			null,
			"#ffffff",
			[],
			{ size: { width: 1280, height: 720 }, format: "mp4" },
			[]
		);

		expect(result.timeline.tracks[0].clips[0].start).toBe("auto");
	});

	it("includes fonts in output", () => {
		const fonts = [
			{ src: "https://fonts.example.com/open-sans.ttf" },
			{ src: "https://fonts.example.com/roboto.ttf" }
		];

		const result = serializeEditForExport(
			[],
			null,
			"#000000",
			fonts,
			{ size: { width: 1920, height: 1080 }, format: "mp4" },
			[]
		);

		expect(result.timeline.fonts).toEqual(fonts);
	});

	it("includes background color in output", () => {
		const result = serializeEditForExport(
			[],
			null,
			"#ff5500",
			[],
			{ size: { width: 1920, height: 1080 }, format: "mp4" },
			[]
		);

		expect(result.timeline.background).toBe("#ff5500");
	});

	it("preserves output configuration", () => {
		const output = {
			size: { width: 1280, height: 720 },
			format: "gif",
			fps: 15
		};

		const result = serializeEditForExport([], null, "#000", [], output, []);

		expect(result.output).toEqual(output);
	});

	it("serializes multiple tracks correctly", () => {
		const clips: ClipExportData[][] = [
			[
				{
					clipConfiguration: {
						asset: { type: "text", text: "Track 1 Clip 1" },
						start: 0,
						length: 3,
						fit: "crop"
					} as ResolvedClip,
					getTimingIntent: () => ({ start: 0, length: 3 })
				}
			],
			[
				{
					clipConfiguration: {
						asset: { type: "text", text: "Track 2 Clip 1" },
						start: 0,
						length: 5,
						fit: "crop"
					} as ResolvedClip,
					getTimingIntent: () => ({ start: "auto", length: 5 })
				}
			]
		];

		const result = serializeEditForExport(
			clips,
			null,
			"#000",
			[],
			{ size: { width: 1920, height: 1080 }, format: "mp4" },
			[]
		);

		expect(result.timeline.tracks.length).toBe(2);
		expect(result.timeline.tracks[0].clips.length).toBe(1);
		expect(result.timeline.tracks[1].clips.length).toBe(1);
		expect(result.timeline.tracks[1].clips[0].start).toBe("auto");
	});
});
