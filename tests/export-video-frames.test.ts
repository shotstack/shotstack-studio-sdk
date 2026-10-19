/** @jest-environment jsdom */

import { isVideoPlayer } from "@core/export/video-frame-processor";

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
