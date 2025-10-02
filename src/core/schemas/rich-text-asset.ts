import * as zod from "zod";

const HexColorSchema = zod.string().regex(/^#[A-Fa-f0-9]{6}$/, "Invalid hex color format");

const GradientStopSchema = zod.object({
	offset: zod.number().min(0).max(1),
	color: HexColorSchema
});

const GradientSchema = zod.object({
	type: zod.enum(["linear", "radial"]).default("linear"),
	angle: zod.number().min(0).max(360).default(0),
	stops: zod.array(GradientStopSchema).min(2)
});

const RichTextFontSchema = zod.object({
	family: zod.string().default("Roboto"),
	size: zod.number().min(8).max(500).default(48),
	weight: zod.union([zod.string(), zod.number()]).default("400"),
	style: zod.enum(["normal", "italic", "oblique"]).default("normal"),
	color: HexColorSchema.default("#000000"),
	opacity: zod.number().min(0).max(1).default(1)
});

const RichTextStyleSchema = zod.object({
	letterSpacing: zod.number().default(0),
	lineHeight: zod.number().min(0.1).max(10).default(1.2),
	textTransform: zod.enum(["none", "uppercase", "lowercase", "capitalize"]).default("none"),
	textDecoration: zod.enum(["none", "underline", "line-through"]).default("none"),
	gradient: GradientSchema.optional()
});

const RichTextStrokeSchema = zod.object({
	width: zod.number().min(0).default(0),
	color: HexColorSchema.default("#000000"),
	opacity: zod.number().min(0).max(1).default(1)
});

const RichTextShadowSchema = zod.object({
	offsetX: zod.number().default(0),
	offsetY: zod.number().default(0),
	blur: zod.number().min(0).default(0),
	color: HexColorSchema.default("#000000"),
	opacity: zod.number().min(0).max(1).default(0.5)
});

const RichTextBackgroundSchema = zod.object({
	color: HexColorSchema.optional(),
	opacity: zod.number().min(0).max(1).default(1),
	borderRadius: zod.number().min(0).default(0)
});

const RichTextAlignmentSchema = zod.object({
	horizontal: zod.enum(["left", "center", "right"]).default("left"),
	vertical: zod.enum(["top", "middle", "bottom"]).default("middle")
});

const RichTextAnimationSchema = zod.object({
	preset: zod.enum(["fadeIn", "slideIn", "typewriter", "shift", "ascend", "movingLetters", "bounce", "elastic", "pulse"]),
	speed: zod.number().min(0.1).max(10).default(1),
	duration: zod.number().min(0.1).max(60).optional(),
	style: zod.enum(["character", "word"]).optional(),
	direction: zod.enum(["left", "right", "up", "down"]).optional()
});

export const RichTextAssetSchema = zod.object({
	type: zod.literal("rich-text"),
	text: zod.string().max(10000).default(""),
	width: zod.number().min(1).max(8192).optional(),
	height: zod.number().min(1).max(8192).optional(),
	font: RichTextFontSchema.optional(),
	style: RichTextStyleSchema.optional(),
	stroke: RichTextStrokeSchema.optional(),
	shadow: RichTextShadowSchema.optional(),
	background: RichTextBackgroundSchema.optional(),
	align: RichTextAlignmentSchema.optional(),
	animation: RichTextAnimationSchema.optional(),
	cacheEnabled: zod.boolean().default(true),
	pixelRatio: zod.number().min(1).max(4).default(2)
}).strict();

export type RichTextAsset = zod.infer<typeof RichTextAssetSchema>;
