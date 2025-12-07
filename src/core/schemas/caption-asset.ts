import * as zod from "zod";

export const CaptionAssetColorSchema = zod
	.string()
	.regex(/^#([A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})|transparent$/, "Invalid color format.");

export const CaptionAssetFontSchema = zod
	.object({
		family: zod.string().optional(),
		size: zod.coerce.number().min(1).max(512).optional(),
		weight: zod.number().optional(),
		color: CaptionAssetColorSchema.optional(),
		lineHeight: zod.number().min(0).max(10).optional(),
		opacity: zod.number().min(0).max(1).optional()
	})
	.strict();

export const CaptionAssetStrokeSchema = zod
	.object({
		width: zod.number().min(0).max(10).optional(),
		color: CaptionAssetColorSchema.optional()
	})
	.strict();

export const CaptionAssetBackgroundSchema = zod
	.object({
		color: CaptionAssetColorSchema.optional(),
		opacity: zod.number().min(0).max(1).optional(),
		padding: zod.number().min(0).max(100).optional(),
		borderRadius: zod.number().min(0).optional()
	})
	.strict();

export const CaptionAssetAlignmentSchema = zod
	.object({
		horizontal: zod.enum(["left", "center", "right"]).optional(),
		vertical: zod.enum(["top", "center", "bottom"]).optional()
	})
	.strict();

const ALIAS_REFERENCE_PATTERN = /^alias:\/\/[a-zA-Z0-9_-]+$/;

export const CaptionAssetSchema = zod
	.object({
		type: zod.literal("caption"),
		src: zod.union([
			zod.string().url("Invalid subtitle URL format."),
			zod.string().regex(ALIAS_REFERENCE_PATTERN, "Invalid alias reference format.")
		]),
		font: CaptionAssetFontSchema.optional(),
		stroke: CaptionAssetStrokeSchema.optional(),
		background: CaptionAssetBackgroundSchema.optional(),
		alignment: CaptionAssetAlignmentSchema.optional(),
		width: zod.number().min(1).optional(),
		height: zod.number().min(1).optional(),
		trim: zod.number().min(0).optional()
	})
	.strict();

export type CaptionAsset = zod.infer<typeof CaptionAssetSchema>;
