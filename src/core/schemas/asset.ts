import * as zod from "zod";

import { AudioAssetSchema } from "./audio-asset";
import { HtmlAssetSchema } from "./html-asset";
import { ImageAssetSchema } from "./image-asset";
import { LumaAssetSchema } from "./luma-asset";
import { ShapeAssetSchema } from "./shape-asset";
import { TextAssetSchema } from "./text-asset";
import { VideoAssetSchema } from "./video-asset";
import { RichTextAssetSchema } from "./rich-text-asset";

export const AssetSchema = zod
	.union([
		TextAssetSchema,
		ShapeAssetSchema,
		HtmlAssetSchema,
		ImageAssetSchema,
		VideoAssetSchema,
		LumaAssetSchema,
		AudioAssetSchema,
		RichTextAssetSchema
	])
	.refine(schema => {
		if (schema.type === "text") {
			return TextAssetSchema.safeParse(schema);
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

		if (schema.type === "rich-text") {
			return RichTextAssetSchema.safeParse(schema);
		}

		return false;
	});

export type Asset = zod.infer<typeof AssetSchema>;
