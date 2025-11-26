import * as zod from "zod";

export const LumaAssetUrlSchema = zod.string().url("Invalid luma url format.");

export const LumaAssetSchema = zod
	.object({
		type: zod.literal("luma"),
		src: LumaAssetUrlSchema
	})
	.strict();

export type LumaAsset = zod.infer<typeof LumaAssetSchema>;
