import * as zod from "zod";

import { AssetSchema } from "./asset";
import { KeyframeSchema } from "./keyframe";

/**
 * TODO: Rename all these to clip configuration
 * TODO: Change all default to optional
 */

const ClipAnchorSchema = zod.enum(["topLeft", "top", "topRight", "left", "center", "right", "bottomLeft", "bottom", "bottomRight"]);

const ClipFitSchema = zod.enum(["crop", "cover", "contain", "none"]);

const ClipOffsetValueSchema = zod.coerce.number().min(-10).max(10).default(0);

const ClipOffsetXSchema = KeyframeSchema.extend({
	from: ClipOffsetValueSchema,
	to: ClipOffsetValueSchema
})
	.array()
	.or(ClipOffsetValueSchema);

const ClipOffsetYSchema = KeyframeSchema.extend({
	from: ClipOffsetValueSchema,
	to: ClipOffsetValueSchema
})
	.array()
	.or(ClipOffsetValueSchema);

const ClipOffsetSchema = zod
	.object({
		x: ClipOffsetXSchema.default(0),
		y: ClipOffsetYSchema.default(0)
	})
	.strict();

const ClipOpacitySchema = KeyframeSchema.extend({
	from: zod.number().min(0).max(1),
	to: zod.number().min(0).max(1)
})
	.array()
	.or(zod.number().min(0).max(1));

const ClipScaleSchema = KeyframeSchema.extend({
	from: zod.number().min(0),
	to: zod.number().min(0)
})
	.array()
	.or(zod.number().min(0));

const ClipTransformRotationSchema = zod
	.object({
		angle: KeyframeSchema.extend({
			from: zod.number(),
			to: zod.number()
		})
			.array()
			.or(zod.number())
	})
	.strict();

const ClipEffectSchema = zod.string();
const ClipTransitionValueSchema = zod.string();

const ClipTransitionSchema = zod
	.object({
		in: ClipTransitionValueSchema.optional(),
		out: ClipTransitionValueSchema.optional()
	})
	.strict();

const ClipTransformSchema = zod
	.object({
		rotate: ClipTransformRotationSchema.default({ angle: 0 })
	})
	.strict();

export const ClipSchema = zod
	.object({
		asset: AssetSchema,
		start: zod.union([zod.number().min(0), zod.literal("auto")]),
		length: zod.union([zod.number().positive(), zod.literal("auto"), zod.literal("end")]),
		position: ClipAnchorSchema.default("center").optional(),
		fit: ClipFitSchema.optional(),
		offset: ClipOffsetSchema.default({ x: 0, y: 0 }).optional(),
		opacity: ClipOpacitySchema.default(1).optional(),
		scale: ClipScaleSchema.default(1).optional(),
		transform: ClipTransformSchema.default({ rotate: { angle: 0 } }).optional(),
		effect: ClipEffectSchema.optional(),
		transition: ClipTransitionSchema.optional(),
		width: zod.number().min(1).max(3840).optional(),
		height: zod.number().min(1).max(2160).optional()
	})
	.strict()
	.transform(data => ({
		...data,
		fit: data.fit ?? (data.asset.type === "rich-text" ? "cover" : "crop")
	}));

export type ClipAnchor = zod.infer<typeof ClipAnchorSchema>;
export type Clip = zod.infer<typeof ClipSchema>;

/** Clip with resolved numeric timing values in seconds (no "auto" or "end") */
export type ResolvedClipConfig = Omit<Clip, "start" | "length"> & {
	start: number;
	length: number;
};
