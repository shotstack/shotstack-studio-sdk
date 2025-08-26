import * as zod from "zod";

const HEX6 = /^#[A-Fa-f0-9]{6}$/;

const GradientSchema = zod.object({
	type: zod.enum(["linear", "radial"]).default("linear"),
	angle: zod.number().min(0).max(360).default(0),
	stops: zod
		.array(
			zod.object({
				offset: zod.number().min(0).max(1),
				color: zod.string().regex(HEX6, "Invalid hex color")
			})
		)
		.min(2)
});

const ShadowSchema = zod.object({
	offsetX: zod.number().default(0),
	offsetY: zod.number().default(0),
	blur: zod.number().min(0).default(0),
	color: zod.string().regex(HEX6).default("#000000"),
	opacity: zod.number().min(0).max(1).default(0.5)
});

const StrokeSchema = zod.object({
	width: zod.number().min(0).default(0),
	color: zod.string().regex(HEX6).default("#000000"),
	opacity: zod.number().min(0).max(1).default(1)
});

const FontSchema = zod.object({
	family: zod.string().default("Roboto"),
	size: zod.number().min(1).max(512).default(48),
	weight: zod.union([zod.string(), zod.number()]).default("400"),
	style: zod.enum(["normal", "italic", "oblique"]).default("normal"),
	color: zod.string().regex(HEX6, "Invalid hex color (use #RRGGBB)").default("#ffffff"),
	opacity: zod.number().min(0).max(1).default(1)
});

const StyleSchema = zod.object({
	letterSpacing: zod.number().default(0),
	lineHeight: zod.number().min(0).max(10).default(1.2),
	textTransform: zod.enum(["none", "uppercase", "lowercase", "capitalize"]).default("none"),
	textDecoration: zod.enum(["none", "underline", "line-through"]).default("none"),
	gradient: GradientSchema.optional()
});

const AlignmentSchema = zod.object({
	horizontal: zod.enum(["left", "center", "right"]).default("center"),
	vertical: zod.enum(["top", "middle", "bottom"]).default("middle")
});

const AnimationSchemaBase = zod.object({
	preset: zod.enum(["typewriter", "movingLetters", "fadeIn", "slideIn", "ascend", "shift"]),
	speed: zod.number().min(0.1).max(10).default(1),
	duration: zod.number().min(0.1).max(30).optional(),
	style: zod.enum(["character", "word"]).optional(),
	direction: zod.enum(["left", "right", "up", "down", "top", "bottom"]).optional()
});

const AnimationSchema = AnimationSchemaBase.superRefine((val, ctx) => {
	const { preset, style, direction } = val;

	if (style && !(preset === "typewriter" || preset === "shift")) {
		ctx.addIssue({
			code: zod.ZodIssueCode.custom,
			path: ["style"],
			message: 'Animation style is only valid for "typewriter" or "shift" presets'
		});
	}

	const norm = (d: string | undefined) => (d === "top" ? "up" : d === "bottom" ? "down" : d);

	const validDirections: Record<string, string[] | undefined> = {
		ascend: ["up", "down"],
		shift: ["left", "right", "up", "down"],
		slideIn: ["left", "right", "up", "down"],
		movingLetters: ["left", "right", "up", "down"]
	};

	if (direction) {
		const d = norm(direction);
		const allowed = validDirections[preset];
		if (allowed && !allowed.includes(d!)) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				path: ["direction"],
				message: `Invalid direction "${direction}" for ${preset}. Must be one of: ${allowed
					.map(s => (s === "up" ? "up/top" : s === "down" ? "down/bottom" : s))
					.join(", ")}`
			});
		}
		if (!allowed && (preset === "fadeIn" || preset === "typewriter")) {
			ctx.addIssue({
				code: zod.ZodIssueCode.custom,
				path: ["direction"],
				message: `Direction is not applicable for the "${preset}" preset`
			});
		}
	}
});

const BackgroundSchema = zod.object({
	color: zod.string().regex(HEX6).optional(),
	opacity: zod.number().min(0).max(1).default(1),
	borderRadius: zod.number().min(0).default(0)
});

const CustomFontSchema = zod.object({
	src: zod.string().url(),
	family: zod.string(),
	weight: zod.union([zod.string(), zod.number()]).optional(),
	style: zod.string().optional(),
	originalFamily: zod.string().optional()
});

export const RichTextAssetSchema = zod.object({
	type: zod.literal("rich-text"),
	text: zod.string().default(""),
	width: zod.number().min(100).max(1920).optional(),
	height: zod.number().min(50).max(1080).optional(),
	font: FontSchema.optional(),
	style: StyleSchema.optional(),
	stroke: StrokeSchema.optional(),
	shadow: ShadowSchema.optional(),
	background: BackgroundSchema.optional(),
	align: AlignmentSchema.optional(),
	animation: AnimationSchema.optional(),
	customFonts: zod.array(CustomFontSchema).optional(),
	cacheEnabled: zod.boolean().default(true),
	pixelRatio: zod.number().min(1).max(3).default(2)
});

export type RichTextAsset = zod.infer<typeof RichTextAssetSchema>;

export function validateRichTextAsset(data: unknown): RichTextAsset {
	return RichTextAssetSchema.parse(data);
}

export function isRichTextAsset(asset: unknown): asset is RichTextAsset {
	try {
		RichTextAssetSchema.parse(asset);
		return true;
	} catch {
		return false;
	}
}
