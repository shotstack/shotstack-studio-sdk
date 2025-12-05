import * as zod from "zod";

import { TrackSchema } from "./track";

export const FontSourceUrlSchema = zod.string().url("Invalid image url format.");

export const FontSourceSchema = zod
	.object({
		src: FontSourceUrlSchema
	})
	.strict();

export const SoundtrackEffectSchema = zod.enum(["fadeIn", "fadeOut", "fadeInFadeOut"]);

export const SoundtrackSchema = zod
	.object({
		src: zod.string().url(),
		effect: SoundtrackEffectSchema.optional(),
		volume: zod.number().min(0).max(1).optional()
	})
	.strict();

export const TimelineSchema = zod
	.object({
		background: zod.string().optional(),
		fonts: FontSourceSchema.array().optional(),
		tracks: TrackSchema.array(),
		soundtrack: SoundtrackSchema.optional()
	})
	.strict();

export const OutputSchema = zod
	.object({
		size: zod
			.object({
				width: zod.number().positive(),
				height: zod.number().positive()
			})
			.strict(),
		fps: zod.number().positive().optional(),
		format: zod.string()
	})
	.strict();

export const MergeFieldSchema = zod.object({
	find: zod.string().min(1),
	replace: zod.string()
});

export const EditSchema = zod
	.object({
		timeline: TimelineSchema,
		output: OutputSchema,
		merge: zod.array(MergeFieldSchema).optional()
	})
	.strict();

export type Track = zod.infer<typeof TrackSchema>;
export type MergeField = zod.infer<typeof MergeFieldSchema>;
