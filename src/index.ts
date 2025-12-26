import pkg from "../package.json";

export { Edit } from "@core/edit-session";
export { Canvas } from "@canvas/shotstack-canvas";
export { Controls } from "@core/inputs/controls";
export { VideoExporter } from "@core/export";
export { Timeline } from "@timeline/index";

// UI Controller for registering toolbars and utilities
export { UIController } from "@core/ui/ui-controller";
export type { UIRegistration, CanvasOverlayRegistration, UIControllerOptions, ToolbarButtonConfig, ButtonClickPayload } from "@core/ui/ui-controller";

// Canvas overlays (optional - register via UIController)
export { SelectionHandles } from "@core/ui/selection-handles";

// Toolbars (optional - register via UIController)
export { TextToolbar } from "@core/ui/text-toolbar";
export { RichTextToolbar } from "@core/ui/rich-text-toolbar";
export { MediaToolbar } from "@core/ui/media-toolbar";
export { ClipToolbar } from "@core/ui/clip-toolbar";
export { CanvasToolbar } from "@core/ui/canvas-toolbar";
export { AssetToolbar } from "@core/ui/asset-toolbar";

// Utilities (optional - register via UIController)
export { Inspector } from "@canvas/system/inspector";
export { TranscriptionIndicator } from "@core/ui/transcription-indicator";

// Event system
export { EditEvent } from "@core/events/edit-events";
export type { EditEventMap, EditEventName, ClipLocation, ClipReference } from "@core/events/edit-events";

// Export theme types for library users
export type { TimelineTheme, TimelineThemeInput } from "./core/theme/theme.types";
export type { TimelineOptions, TimelineFeatures } from "@timeline/index";

// Export Zod schemas for library users
export * from "./core/schemas";

export const VERSION = pkg.version;
