export { Edit } from "@core/edit";
export { Canvas } from "@canvas/shotstack-canvas";
export { Controls } from "@core/inputs/controls";
export { VideoExporter } from "@core/export/video-exporter";
export { Timeline } from "./components/timeline/timeline";

// Export theme types for library users
export type { TimelineTheme, TimelineThemeInput } from "./core/theme/theme.types";

export {
	CanvasKitManager,
	TextRenderEngine,
	FontManager,
	CANVAS_CONFIG,
	type CanvasConfig,
	type CustomFont,
	type RenderResult,
	type AnimationType
} from "./core/text-renderer";
