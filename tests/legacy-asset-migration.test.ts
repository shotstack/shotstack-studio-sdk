import { migrateLegacyGeneratedAsset } from "@core/generation/legacy-asset-migration";
import type { Clip } from "@schemas";

const generatedSrc = "https://cdn.example.com/generated";

describe("legacy generated asset migration", () => {
	it.each([
		{
			name: "text-to-image",
			asset: { type: "text-to-image", prompt: "a painted fox", width: 512, height: 768 },
			expected: {
				asset: {
					type: "image",
					src: generatedSrc,
					prompt: "a painted fox",
					model: "flux-schnell"
				}
			}
		},
		{
			name: "image-to-video",
			asset: {
				type: "image-to-video",
				src: "https://cdn.example.com/start.jpg",
				prompt: "orbit the subject",
				aspectRatio: "16:9",
				speed: 1.5
			},
			expected: {
				asset: {
					type: "video",
					src: generatedSrc,
					prompt: "orbit the subject",
					model: "shotstack-itv-mini",
					options: { inputSrc: "https://cdn.example.com/start.jpg" },
					speed: 1.5
				},
				bindingPathMoves: { "asset.src": "asset.options.inputSrc" }
			}
		},
		{
			name: "text-to-speech",
			asset: {
				type: "text-to-speech",
				text: "Welcome to the show",
				voice: "Matthew",
				language: "en-US",
				newscaster: true,
				volume: 0.8
			},
			expected: {
				asset: {
					type: "audio",
					src: generatedSrc,
					prompt: "Welcome to the show",
					model: "polly-neural",
					options: { voice: "Matthew", language: "en-US", newscaster: true },
					volume: 0.8
				},
				bindingPathMoves: {
					"asset.text": "asset.prompt",
					"asset.voice": "asset.options.voice",
					"asset.language": "asset.options.language",
					"asset.newscaster": "asset.options.newscaster"
				}
			}
		}
	])("migrates a $name asset", ({ asset, expected }) => {
		expect(migrateLegacyGeneratedAsset(asset as Clip["asset"], generatedSrc)).toStrictEqual(expected);
	});

	it("ignores media assets", () => {
		expect(migrateLegacyGeneratedAsset({ type: "image", src: "https://cdn.example.com/source.jpg" }, generatedSrc)).toBeNull();
	});
});
