import type { Clip, ResolvedClip } from "@schemas";

import type { GenerationModelDefinition } from "./model-catalogue";

// Starter values; the prompt and length are edited like any other clip's.
const CONTINUE_PROMPT = "Continue the shot";
const CONTINUE_LENGTH = 5;

const fileSrc = (clip: ResolvedClip | null | undefined): string | undefined => {
	const src = (clip?.asset as { src?: unknown } | undefined)?.src;
	return typeof src === "string" && /^https?:\/\//i.test(src) ? src : undefined;
};

// Audio, text and generations still pending have no frame to start from.
export const canContinueFrom = (clip: ResolvedClip | null | undefined): boolean =>
	(clip?.asset?.type === "video" || clip?.asset?.type === "image") && fileSrc(clip) !== undefined;

export const continuationModel = (models: readonly GenerationModelDefinition[] | undefined): GenerationModelDefinition | undefined =>
	models?.find(model => model.optionNames.includes("startSrc"));

// The exact source URL, so the render's cache key matches the one the preview was generated under.
export const continuationClip = (source: ResolvedClip, model: GenerationModelDefinition, start: number): Clip =>
	({
		id: crypto.randomUUID(),
		asset: { type: "video", model: model.model, prompt: CONTINUE_PROMPT, options: { startSrc: fileSrc(source) } },
		start,
		length: CONTINUE_LENGTH
	}) as Clip;
