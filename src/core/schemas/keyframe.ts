import * as zod from "zod";

export const KeyframeInterpolationSchema = zod.enum(["linear", "bezier", "constant"]);

export const KeyframeEasingSchema = zod.enum([
	"smooth",
	"ease",
	"easeIn",
	"easeOut",
	"easeInOut",
	"easeInQuad",
	"easeInCubic",
	"easeInQuart",
	"easeInQuint",
	"easeInSine",
	"easeInExpo",
	"easeInCirc",
	"easeInBack",
	"easeOutQuad",
	"easeOutCubic",
	"easeOutQuart",
	"easeOutQuint",
	"easeOutSine",
	"easeOutExpo",
	"easeOutCirc",
	"easeOutBack",
	"easeInOutQuad",
	"easeInOutCubic",
	"easeInOutQuart",
	"easeInOutQuint",
	"easeInOutSine",
	"easeInOutExpo",
	"easeInOutCirc",
	"easeInOutBack"
]);

export const KeyframeSchema = zod
	.object({
		from: zod.number(),
		to: zod.number(),
		start: zod.number().min(0),
		length: zod.number().positive(),
		interpolation: KeyframeInterpolationSchema.optional(),
		easing: KeyframeEasingSchema.optional()
	})
	.strict();

export type Keyframe = zod.infer<typeof KeyframeSchema>;
