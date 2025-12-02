import * as zod from "zod";

const HexColorSchema = zod.string().regex(/^#[A-Fa-f0-9]{6}$/, "Invalid hex color format");

const GradientStopSchema = zod
	.object({
		offset: zod.number().min(0).max(1),
		color: HexColorSchema
	})
	.strict();

const GradientSchema = zod
	.object({
		type: zod.enum(["linear", "radial"]).default("linear"),
		angle: zod.number().min(0).max(360).default(0),
		stops: zod.array(GradientStopSchema).min(2)
	})
	.strict();

const RichTextFontSchema = zod
	.object({
		family: zod.string().default("Roboto"),
		size: zod.number().min(8).max(500).default(48),
		weight: zod.union([zod.string(), zod.number()]).default("400"),
		color: HexColorSchema.default("#000000"),
		opacity: zod.number().min(0).max(1).default(1)
	})
	.strict();

const RichTextStyleSchema = zod
	.object({
		letterSpacing: zod.number().default(0),
		lineHeight: zod.number().min(0.1).max(10).default(1.2),
		textTransform: zod.enum(["none", "uppercase", "lowercase", "capitalize"]).default("none"),
		textDecoration: zod.enum(["none", "underline", "line-through"]).default("none"),
		gradient: GradientSchema.optional()
	})
	.strict();

const RichTextStrokeSchema = zod
	.object({
		width: zod.number().min(0).default(0),
		color: HexColorSchema.default("#000000"),
		opacity: zod.number().min(0).max(1).default(1)
	})
	.strict();

const RichTextShadowSchema = zod
	.object({
		offsetX: zod.number().default(0),
		offsetY: zod.number().default(0),
		blur: zod.number().min(0).default(0),
		color: HexColorSchema.default("#000000"),
		opacity: zod.number().min(0).max(1).default(0.5)
	})
	.strict();

const RichTextBorderSchema = zod
	.object({
		width: zod.number().min(0).default(0),
		color: HexColorSchema.default("#000000"),
		opacity: zod.number().min(0).max(1).default(1)
	})
	.strict();

const RichTextBackgroundSchema = zod
	.object({
		color: HexColorSchema.optional(),
		opacity: zod.number().min(0).max(1).default(1),
		border: RichTextBorderSchema.optional()
	})
	.strict();

const RichTextPaddingSchema = zod.union([
	zod.number().min(0),
	zod
		.object({
			top: zod.number().min(0).default(0),
			right: zod.number().min(0).default(0),
			bottom: zod.number().min(0).default(0),
			left: zod.number().min(0).default(0)
		})
		.strict()
]);

const RichTextAlignmentSchema = zod
	.object({
		horizontal: zod.enum(["left", "center", "right"]).default("left"),
		vertical: zod.enum(["top", "middle", "bottom"]).default("middle")
	})
	.strict();

const RichTextAnimationSchema = zod
	.object({
		preset: zod.enum(["fadeIn", "slideIn", "typewriter", "shift", "ascend", "movingLetters", "bounce", "elastic", "pulse"]),
		speed: zod.number().min(0.1).max(10).default(1),
		duration: zod.number().min(0.1).max(60).optional(),
		style: zod.enum(["character", "word"]).optional(),
		direction: zod.enum(["left", "right", "up", "down"]).optional()
	})
	.strict();

export const RichTextAssetSchema = zod
	.object({
		type: zod.literal("rich-text"),
		text: zod.string().max(10000).default(""),
		font: RichTextFontSchema.optional(),
		style: RichTextStyleSchema.optional(),
		stroke: RichTextStrokeSchema.optional(),
		shadow: RichTextShadowSchema.optional(),
		background: RichTextBackgroundSchema.optional(),
		padding: RichTextPaddingSchema.optional(),
		align: RichTextAlignmentSchema.optional(),
		animation: RichTextAnimationSchema.optional()
	})
	.strict();

export type RichTextAsset = zod.infer<typeof RichTextAssetSchema>;
