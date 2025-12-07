import * as zod from "zod";

import { AudioAssetSchema } from "./audio-asset";
import { CaptionAssetSchema } from "./caption-asset";
import { HtmlAssetSchema } from "./html-asset";
import { ImageAssetSchema } from "./image-asset";
import { LumaAssetSchema } from "./luma-asset";
import { RichTextAssetSchema } from "./rich-text-asset";
import { ShapeAssetSchema } from "./shape-asset";
import { TextAssetSchema } from "./text-asset";
import { VideoAssetSchema } from "./video-asset";

export const AssetSchema = zod
	.union([
		TextAssetSchema,
		RichTextAssetSchema,
		ShapeAssetSchema,
		HtmlAssetSchema,
		ImageAssetSchema,
		VideoAssetSchema,
		LumaAssetSchema,
		AudioAssetSchema,
		CaptionAssetSchema
	])
	.refine(schema => {
		if (schema.type === "text") {
			return TextAssetSchema.safeParse(schema);
		}

		if (schema.type === "rich-text") {
			return RichTextAssetSchema.safeParse(schema);
		}

		if (schema.type === "shape") {
			return ShapeAssetSchema.safeParse(schema);
		}

		if (schema.type === "html") {
			return HtmlAssetSchema.safeParse(schema);
		}

		if (schema.type === "image") {
			return ImageAssetSchema.safeParse(schema);
		}

		if (schema.type === "video") {
			return VideoAssetSchema.safeParse(schema);
		}

		if (schema.type === "luma") {
			return LumaAssetSchema.safeParse(schema);
		}

		if (schema.type === "audio") {
			return AudioAssetSchema.safeParse(schema);
		}

		if (schema.type === "caption") {
			return CaptionAssetSchema.safeParse(schema);
		}

		return false;
	});

export type Asset = zod.infer<typeof AssetSchema>;
