import * as zod from "zod";

export const TextAssetColorSchema = zod.string().regex(/^#([A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})|transparent$/, "Invalid color format.");

export const TextAssetFontSchema = zod
	.object({
		color: TextAssetColorSchema.optional(),
		family: zod.string().optional(),
		size: zod.coerce.number().positive().optional(),
		weight: zod.number().optional(),
		lineHeight: zod.number().optional(),
		opacity: zod.number().min(0).max(1).optional()
	})
	.strict();

export const TextAssetAlignmentSchema = zod
	.object({
		horizontal: zod.enum(["left", "center", "right"]).optional(),
		vertical: zod.enum(["top", "center", "bottom"]).optional()
	})
	.strict();

export const TextAssetBackgroundSchema = zod
	.object({
		color: TextAssetColorSchema,
		opacity: zod.number().min(0).max(1).default(1),
		padding: zod.number().min(0).max(100).optional(),
		borderRadius: zod.number().min(0).optional()
	})
	.strict();

export const TextAssetStrokeSchema = zod
	.object({
		width: zod.number().min(0).optional(),
		color: TextAssetColorSchema.optional()
	})
	.strict();

export const TextAssetSchema = zod
	.object({
		type: zod.literal("text"),
		text: zod.string(),
		width: zod.number().positive().optional(),
		height: zod.number().positive().optional(),
		font: TextAssetFontSchema.optional(),
		alignment: TextAssetAlignmentSchema.optional(),
		background: TextAssetBackgroundSchema.optional(),
		stroke: TextAssetStrokeSchema.optional()
	})
	.strict();

export type TextAsset = zod.infer<typeof TextAssetSchema>;
