export { CanvasKitManager } from "./canvas-kit-manager";
export { TextRenderEngine } from "./text-render-engine";
export { FontManager } from "./font-manager";
export { TextLayoutEngine } from "./text-layout-engine";
export { GradientBuilder } from "./gradient-builder";
export { TextStyleManager } from "./text-style-manager";
export { TextMeasurement } from "./text-measurement";
export { CANVAS_CONFIG } from "./config";

export {
	AnimationEngine,
	BaseAnimation,
	TypewriterAnimation,
	MovingLettersAnimation,
	FadeInAnimation,
	SlideInAnimation,
	AscendAnimation,
	ShiftAnimation,
	FrameCache
} from "./animations";

export type { CanvasConfig, GradientConfig, ShadowConfig, StrokeConfig, CustomFont, TextMetrics, AnimationFrame, RenderResult } from "./types";
export type { AnimationType } from "./config";
export type { TextLine, CharacterLayout, WordLayout } from "./text-layout-engine";
export type { AnimationState, AnimationUnit } from "./animations";
