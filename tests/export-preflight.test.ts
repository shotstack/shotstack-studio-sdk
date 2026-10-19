import { findBrowserIssue, findEditIssues, MAX_EXPORT_SECONDS } from "@core/export/export-preflight";
import { VideoFrameProcessor } from "@core/export/video-frame-processor";
import { sec } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";
import { canEncodeVideo } from "mediabunny";

jest.mock("mediabunny", () => ({
	canEncodeVideo: jest.fn(),
	Input: jest.fn().mockImplementation(() => ({
		getPrimaryVideoTrack: jest.fn().mockRejectedValue(new Error("Input has an unsupported or unrecognizable format.")),
		dispose: jest.fn()
	})),
	UrlSource: jest.fn(),
	CanvasSink: jest.fn(),
	MP4: {},
	WEBM: {}
}));

// Player modules extend pixi filters at load.
jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs,
	Texture: { from: jest.fn() }
}));

const customFonts: Record<string, string> = {
	"Brand Sans|400": "https://example.com/brand-sans.ttf",
	"Bold Only|700": "https://example.com/bold-only.ttf"
};

const clip = (fields: Partial<ResolvedClip> & Pick<ResolvedClip, "asset">): ResolvedClip => ({
	id: "clip-1",
	start: sec(0),
	length: sec(5),
	...fields
});

function editWith(
	clips: ResolvedClip[],
	{ format = "mp4", duration = 5 }: { format?: string; duration?: number } = {}
): Parameters<typeof findEditIssues>[0] {
	return {
		getResolvedEdit: () => ({ timeline: { tracks: [{ clips }] }, output: { format: "mp4" } }),
		getOutputFormat: () => format,
		getFontUrlByFamilyAndWeight: (family: string, weight: number) => customFonts[`${family}|${weight}`] ?? null,
		totalDuration: duration
	};
}

const codes = (clips: ResolvedClip[], options?: { format?: string; duration?: number }): string[] =>
	findEditIssues(editWith(clips, options)).map(issue => issue.code);

describe("findEditIssues", () => {
	it("passes an edit the browser draws the way the cloud does", () => {
		const faithful = [
			clip({ asset: { type: "image", src: "https://example.com/a.png" }, effect: "zoomInSlow", transition: { in: "fade", out: "none" } }),
			clip({ asset: { type: "rich-text", text: "Hi", font: { family: "Montserrat", weight: 700 } }, transition: { out: "slideLeftFast" } }),
			clip({ asset: { type: "text", text: "Hi", font: { family: "Brand Sans" } } }),
			clip({ asset: { type: "html", html: '<p data-html-type="text">Hi</p>' }, filter: "none" })
		];

		expect(findEditIssues(editWith(faithful))).toEqual([]);
	});

	it("reports a prompt clip that hasn't been generated as ai-pending", () => {
		expect(findEditIssues(editWith([clip({ id: "prompt-clip", asset: { type: "image", prompt: "A red kite" } })]))).toEqual([
			{ code: "ai-pending", message: "This clip hasn't been generated yet.", clipId: "prompt-clip" }
		]);
	});

	it("reports a legacy generative asset as ai-pending", () => {
		expect(codes([clip({ asset: { type: "text-to-image", prompt: "A red kite" } })])).toEqual(["ai-pending"]);
	});

	it("reports a non-MP4 output as output-format", () => {
		expect(codes([], { format: "gif" })).toEqual(["output-format"]);
	});

	it("reports chroma key as chroma-key", () => {
		expect(codes([clip({ asset: { type: "video", src: "https://example.com/a.mp4", chromaKey: { color: "#00b140" } } })])).toEqual(["chroma-key"]);
	});

	it("reports a clip filter as filter", () => {
		expect(codes([clip({ asset: { type: "image", src: "https://example.com/a.png" }, filter: "greyscale" })])).toEqual(["filter"]);
	});

	it("reports HTML that isn't the plain text form, and any html5 clip, as html", () => {
		expect(
			codes([
				clip({ asset: { type: "html", html: "<table><tr><td>Hi</td></tr></table>" } }),
				clip({ asset: { type: "html5", html: "<div>Hi</div>" } })
			])
		).toEqual(["html", "html"]);
	});

	it("reports an effect the presets don't animate as effect", () => {
		// Every schema effect has a preset today; an unknown name stands in for one the schema adds later.
		const effect = "spin" as ResolvedClip["effect"];
		expect(codes([clip({ asset: { type: "image", src: "https://example.com/a.png" }, effect })])).toEqual(["effect"]);
	});

	it("reports a transition the presets don't animate as transition", () => {
		expect(codes([clip({ asset: { type: "image", src: "https://example.com/a.png" }, transition: { in: "shuffleTopRight", out: "fade" } })])).toEqual(
			["transition"]
		);
	});

	it("reports a font that is neither built in nor in the edit's fonts as font", () => {
		expect(codes([clip({ asset: { type: "rich-text", text: "Hi", font: { family: "Not A Real Font" } } })])).toEqual(["font"]);
	});

	it("reads string font weights the way the preview does", () => {
		const withWeight = (weight: string): ResolvedClip[] => [
			clip({ asset: { type: "rich-text", text: "Hi", font: { family: "Bold Only", weight } } })
		];

		expect(codes(withWeight("bold"))).toEqual([]);
		expect(codes(withWeight("700"))).toEqual([]);
		expect(codes(withWeight("normal"))).toEqual(["font"]);
	});

	it("reports an edit longer than the limit as too-long", () => {
		expect(codes([], { duration: MAX_EXPORT_SECONDS + 1 })).toEqual(["too-long"]);
		expect(codes([], { duration: MAX_EXPORT_SECONDS })).toEqual([]);
	});
});

describe("findBrowserIssue", () => {
	it("reports a browser that can't encode the output as browser", async () => {
		jest.mocked(canEncodeVideo).mockResolvedValueOnce(false);

		await expect(findBrowserIssue({ width: 1920, height: 1080 }, 5_000_000)).resolves.toEqual({
			code: "browser",
			message: "This browser can't encode H.264 video at 1920×1080."
		});
		expect(canEncodeVideo).toHaveBeenCalledWith("avc", { width: 1920, height: 1080, bitrate: 5_000_000 });
	});

	it("reports nothing when the encoder accepts the config", async () => {
		jest.mocked(canEncodeVideo).mockResolvedValueOnce(true);

		await expect(findBrowserIssue({ width: 1280, height: 720 }, 2_222_222)).resolves.toBeNull();
	});
});

describe("VideoFrameProcessor.initialize", () => {
	it("reports a video the browser can't decode as video-source", async () => {
		class VideoPlayer {
			playerType = "video";

			clipId = "mov-clip";

			clipConfiguration = { asset: { type: "video", src: "https://example.com/clip.mov" } };
		}

		jest.spyOn(console, "warn").mockImplementation(() => undefined);

		const issues = await new VideoFrameProcessor().initialize([new VideoPlayer()]);

		expect(issues).toEqual([{ code: "video-source", message: "This video's format can't be decoded in the browser.", clipId: "mov-clip" }]);
	});
});
