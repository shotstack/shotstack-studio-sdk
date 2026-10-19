/** @jest-environment jsdom */

import { isVideoPlayer, VideoFrameProcessor, type VideoPlayerExtended } from "@core/export/video-frame-processor";
import { CanvasSink, Input } from "mediabunny";

jest.mock("mediabunny", () => ({ Input: jest.fn(), UrlSource: jest.fn(), CanvasSink: jest.fn(), MP4: {}, WEBM: {} }));

// Player modules extend pixi filters at load; the frame processor only builds textures.
jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs,
	Texture: Object.assign(
		jest.fn((options: object) => ({ ...options, destroy: jest.fn() })),
		{ from: jest.fn(() => ({ source: { update: jest.fn() }, destroy: jest.fn() })) }
	)
}));

beforeAll(() => {
	// jsdom has no 2D canvas; the processor only draws into one.
	Object.assign(HTMLCanvasElement.prototype, { getContext: () => ({ drawImage: jest.fn() }) });
});

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

	it("releases a decoder that opens after a cancelled export has cleaned up", async () => {
		const dispose = jest.fn();
		let openTrack = (): void => {};
		jest.mocked(Input).mockImplementationOnce(
			() =>
				({
					getPrimaryVideoTrack: () =>
						new Promise(resolve => {
							openTrack = () => resolve({ canDecode: async () => true });
						}),
					dispose
				}) as unknown as InstanceType<typeof Input>
		);
		const processor = new VideoFrameProcessor();
		const controller = new AbortController();

		const probing = processor.initialize([videoPlayer()], controller.signal);
		controller.abort();
		processor.restore();
		openTrack();
		await probing;

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

describe("VideoFrameProcessor.replaceVideoTexture", () => {
	it("keeps the crop the player's own texture applies", async () => {
		const live = { source: { width: 1920, height: 1080 }, frame: { x: 192, y: 0, width: 1536, height: 1080 } };
		const player = {
			playerType: "video",
			clipConfiguration: { asset: { type: "video", src: "https://example.com/clip.mp4" } },
			texture: live,
			getSourceTime: () => 0
		};
		jest
			.mocked(Input)
			.mockImplementationOnce(
				() => ({ getPrimaryVideoTrack: async () => ({ canDecode: async () => true }), dispose: jest.fn() }) as unknown as InstanceType<typeof Input>
			);
		jest
			.mocked(CanvasSink)
			.mockImplementationOnce(
				() => ({ getCanvas: async () => ({ canvas: { width: 1920, height: 1080 } }) }) as unknown as InstanceType<typeof CanvasSink>
			);
		const processor = new VideoFrameProcessor();
		await processor.initialize([player]);

		await processor.replaceVideoTexture(player as unknown as VideoPlayerExtended);

		expect(player.texture).not.toBe(live);
		expect(player.texture).toMatchObject({ frame: live.frame });
		processor.restore();
	});
});
