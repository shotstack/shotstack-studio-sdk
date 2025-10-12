import * as zod from "zod";

import { KeyframeSchema } from "./keyframe";

export const VideoAssetUrlSchema = zod.string().url("Invalid video url format.");

export const VideoAssetCropSchema = zod.object({
	top: zod.number().min(0).optional(),
	right: zod.number().min(0).optional(),
	bottom: zod.number().min(0).optional(),
	left: zod.number().min(0).optional()
});

export const VideoAssetVolumeSchema = KeyframeSchema.extend({
	from: zod.number().min(0).max(1),
	to: zod.number().min(0).max(1)
})
	.array()
	.or(zod.number().min(0).max(1));

export const VideoAssetSchema = zod.object({
	type: zod.literal("video"),
	src: VideoAssetUrlSchema,
	trim: zod.number().optional(),
	crop: VideoAssetCropSchema.optional(),
	volume: VideoAssetVolumeSchema.optional(),
	anchor: zod.enum(["topLeft", "top", "topRight", "left", "center", "right", "bottomLeft", "bottom", "bottomRight"]).optional()
});

export type VideoAsset = zod.infer<typeof VideoAssetSchema>;
