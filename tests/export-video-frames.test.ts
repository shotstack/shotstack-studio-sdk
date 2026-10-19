/** @jest-environment jsdom */

import { isVideoPlayer, VideoFrameProcessor } from "@core/export/video-frame-processor";
import { Input } from "mediabunny";

jest.mock("mediabunny", () => ({ Input: jest.fn(), UrlSource: jest.fn(), CanvasSink: jest.fn(), MP4: {}, WEBM: {} }));

// Player modules extend pixi filters at load; the frame processor only builds textures.
jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs,
	Texture: { from: jest.fn(() => ({ source: { update: jest.fn() }, destroy: jest.fn() })) }
}));

describe("isVideoPlayer", () => {
	it("recognises a video player by its type, whatever name the bundler gives its class", () => {
		// The published build renames VideoPlayer to something like this.
		class UK {
			playerType = "video";
		}

		expect(isVideoPlayer(new UK())).toBe(true);
	});

	it("leaves out a luma matte drawn from a video", () => {
		const luma = { playerType: "luma", texture: { source: { resource: document.createElement("video") } } };

		expect(isVideoPlayer(luma)).toBe(false);
	});
});

describe("VideoFrameProcessor", () => {
	const videoPlayer = (src = "https://example.com/clip.mp4") => ({
		playerType: "video",
		clipId: "clip-1",
		clipConfiguration: { asset: { type: "video", src } },
		skipVideoUpdate: false,
		getSourceTime: () => 0
	});

	it("releases the input of a source with no video track", async () => {
		const dispose = jest.fn();
		jest.mocked(Input).mockImplementationOnce(() => ({ getPrimaryVideoTrack: async () => null, dispose }) as unknown as InstanceType<typeof Input>);

		await new VideoFrameProcessor().initialize([videoPlayer()]);

		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it("restarts every paused video player, including one that got no decoder", () => {
		const processor = new VideoFrameProcessor();
		const player = videoPlayer("");

		processor.disableVideoPlayback([player]);
		expect(player.skipVideoUpdate).toBe(true);
		processor.restore();

		expect(player.skipVideoUpdate).toBe(false);
	});
});
