import * as zod from "zod";

import { TrackSchema } from "./track";

export const FontSourceUrlSchema = zod.string().url("Invalid image url format.");

export const FontSourceSchema = zod.object({
	src: FontSourceUrlSchema
});

export const TimelineSchema = zod.object({
	background: zod.string().optional(),
	fonts: FontSourceSchema.array().optional(),
	tracks: TrackSchema.array()
});

export const OutputSchema = zod.object({
	size: zod.object({
		width: zod.number().positive(),
		height: zod.number().positive()
	}),
	fps: zod.number().positive().optional(),
	format: zod.string()
});

export const EditSchema = zod.object({
	timeline: TimelineSchema,
	output: OutputSchema
});

export type Track = zod.infer<typeof TrackSchema>;
