import { buildDuckedVolume } from "@shotstack/shotstack-canvas/duck";

import { EditSchema } from "../src/core/schemas";

describe("duck dependencies", () => {
	it("accepts an audio clip with a duck property", () => {
		const edit = {
			timeline: {
				tracks: [
					{ clips: [{ alias: "voice", asset: { type: "audio", src: "https://example.com/voice.mp3" }, start: 0, length: 5 }] },
					{
						clips: [
							{
								asset: { type: "audio", src: "https://example.com/music.mp3", duck: { under: "alias://voice" } },
								start: 0,
								length: 5
							}
						]
					}
				]
			},
			output: { format: "mp4", size: { width: 1280, height: 720 } }
		};

		expect(() => EditSchema.parse(edit)).not.toThrow();
	});

	it("resolves the canvas duck subpath", () => {
		expect(typeof buildDuckedVolume).toBe("function");
	});
});
