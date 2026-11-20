import { EditSchema } from "../src/core/schemas";

describe("mute", () => {
	it("accepts a clip that bleeps its muted words", () => {
		const edit = {
			timeline: {
				tracks: [
					{
						clips: [
							{
								asset: { type: "video", src: "https://example.com/interview.mp4", mute: { words: ["bob"], sound: "bleep" } },
								start: 0,
								length: 5
							}
						]
					}
				]
			},
			output: { format: "mp4", size: { width: 1280, height: 720 } }
		};

		expect(EditSchema.parse(edit).timeline.tracks[0]?.clips[0]?.asset).toMatchObject({
			mute: { words: ["bob"], sound: "bleep" }
		});
	});
});
