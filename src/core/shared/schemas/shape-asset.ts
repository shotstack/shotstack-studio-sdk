import * as zod from "zod";

export const ShapeAssetColorSchema = zod.string().regex(/^#([A-Fa-f0-9]{8}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})|transparent$/, "Invalid color format.");

export const ShapeAssetRectangleSchema = zod.object({
	width: zod.number().positive(),
	height: zod.number().positive()
});

export const ShapeAssetCircleSchema = zod.object({
	radius: zod.number().positive()
});

export const ShapeAssetLineSchema = zod.object({
	length: zod.number().positive(),
	thickness: zod.number().positive()
});

export const ShapeAssetFillSchema = zod.object({
	color: ShapeAssetColorSchema,
	opacity: zod.number().min(0).max(1)
});

export const ShapeAssetStrokeSchema = zod.object({
	color: ShapeAssetColorSchema,
	width: zod.number().positive()
});

export const ShapeAssetSchema = zod
	.object({
		type: zod.literal("shape"),
		width: zod.number().positive().optional(),
		height: zod.number().positive().optional(),
		shape: zod.enum(["rectangle", "circle", "line"]),
		fill: ShapeAssetFillSchema.optional(),
		stroke: ShapeAssetStrokeSchema.optional(),
		rectangle: ShapeAssetRectangleSchema.optional(),
		circle: ShapeAssetCircleSchema.optional(),
		line: ShapeAssetLineSchema.optional()
	})
	.refine(schema => {
		if (schema.shape === "rectangle") {
			return ShapeAssetRectangleSchema.safeParse(schema.rectangle);
		}

		if (schema.shape === "circle") {
			return ShapeAssetCircleSchema.safeParse(schema.circle);
		}

		if (schema.shape === "line") {
			return ShapeAssetLineSchema.safeParse(schema.line);
		}

		return false;
	});

export type ShapeAsset = zod.infer<typeof ShapeAssetSchema>;
