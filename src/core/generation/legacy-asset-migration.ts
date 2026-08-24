import type { Clip } from "@schemas";

export function migrateLegacyGeneratedAsset(
	asset: Clip["asset"],
	src: string
): { asset: Clip["asset"]; bindingPathMoves?: Readonly<Record<string, string>> } | null {
	if (asset.type === "text-to-image") {
		return { asset: { type: "image", src, prompt: asset.prompt, model: "flux-schnell", crop: asset.crop } };
	}
	if (asset.type === "image-to-video") {
		return {
			asset: {
				type: "video",
				src,
				prompt: asset.prompt,
				model: "shotstack-itv-mini",
				options: { inputSrc: asset.src },
				speed: asset.speed,
				crop: asset.crop
			}
		};
	}
	if (asset.type === "text-to-speech") {
		return {
			asset: {
				type: "audio",
				src,
				prompt: asset.text,
				model: "polly-neural",
				options: {
					voice: asset.voice,
					...(asset.language === undefined ? {} : { language: asset.language }),
					...(asset.newscaster === undefined ? {} : { newscaster: asset.newscaster })
				},
				trim: asset.trim,
				volume: asset.volume,
				speed: asset.speed,
				effect: asset.effect
			},
			bindingPathMoves: { "asset.text": "asset.prompt" }
		};
	}
	return null;
}
