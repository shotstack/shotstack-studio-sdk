import * as zod from "zod";

export const ImageAssetUrlSchema = zod.string().url("Invalid image url format.");

export const ImageAssetCropSchema = zod
	.object({
		top: zod.number().min(0).optional(),
		right: zod.number().min(0).optional(),
		bottom: zod.number().min(0).optional(),
		left: zod.number().min(0).optional()
	})
	.strict();

export const ImageAssetSchema = zod
	.object({
		type: zod.literal("image"),
		src: ImageAssetUrlSchema,
		crop: ImageAssetCropSchema.optional()
	})
	.strict();

export type ImageAsset = zod.infer<typeof ImageAssetSchema>;
