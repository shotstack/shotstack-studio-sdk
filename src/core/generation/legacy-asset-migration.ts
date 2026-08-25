import type { Clip } from "@schemas";

/** Drop undefined-valued keys so an absent legacy field leaves no trace on the migrated asset. */
function compact<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export function migrateLegacyGeneratedAsset(
	asset: Clip["asset"],
	src: string
): { asset: Clip["asset"]; bindingPathMoves?: Readonly<Record<string, string>> } | null {
	if (asset.type === "text-to-image") {
		return { asset: compact({ type: "image", src, prompt: asset.prompt, model: "flux-schnell", crop: asset.crop }) };
	}
	if (asset.type === "image-to-video") {
		return {
			asset: compact({
				type: "video",
				src,
				prompt: asset.prompt,
				model: "shotstack-itv-mini",
				options: { inputSrc: asset.src },
				speed: asset.speed,
				crop: asset.crop
			}),
			bindingPathMoves: { "asset.src": "asset.options.inputSrc" }
		};
	}
	if (asset.type === "text-to-speech") {
		return {
			asset: compact({
				type: "audio",
				src,
				prompt: asset.text,
				model: "polly-neural",
				options: compact({ voice: asset.voice, language: asset.language, newscaster: asset.newscaster }),
				trim: asset.trim,
				volume: asset.volume,
				speed: asset.speed,
				effect: asset.effect
			}),
			bindingPathMoves: {
				"asset.text": "asset.prompt",
				"asset.voice": "asset.options.voice",
				"asset.language": "asset.options.language",
				"asset.newscaster": "asset.options.newscaster"
			}
		};
	}
	return null;
}
