import * as zod from "zod";

import { KeyframeSchema } from "./keyframe";

export const AudioAssetUrlSchema = zod.string().url("Invalid audio url format.");

export const AudioAssetVolumeSchema = KeyframeSchema.extend({
	from: zod.number().min(0).max(1),
	to: zod.number().min(0).max(1)
})
	.array()
	.or(zod.number().min(0).max(1));

export const AudioAssetEffectSchema = zod.enum(["none", "fadeIn", "fadeOut", "fadeInFadeOut"]);

export const AudioAssetSchema = zod
	.object({
		type: zod.literal("audio"),
		src: AudioAssetUrlSchema,
		trim: zod.number().optional(),
		volume: AudioAssetVolumeSchema.optional(),
		effect: AudioAssetEffectSchema.optional()
	})
	.strict();

export type AudioAsset = zod.infer<typeof AudioAssetSchema>;
