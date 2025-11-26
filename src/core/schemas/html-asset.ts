import * as zod from "zod";

const HtmlAssetPositionSchema = zod.enum(["top", "topRight", "right", "bottomRight", "bottom", "bottomLeft", "left", "topLeft", "center"]);

export const HtmlAssetSchema = zod
	.object({
		type: zod.literal("html"),
		html: zod.string(),
		css: zod.string(),
		width: zod.number().positive().optional(),
		height: zod.number().positive().optional(),
		position: HtmlAssetPositionSchema.optional()
	})
	.strict();

export type HtmlAsset = zod.infer<typeof HtmlAssetSchema>;
export type HtmlAssetPosition = zod.infer<typeof HtmlAssetPositionSchema>;
