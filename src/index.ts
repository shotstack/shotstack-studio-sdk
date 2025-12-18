import pkg from "../package.json";

export { Edit } from "@core/edit";
export { Canvas } from "@canvas/shotstack-canvas";
export { Controls } from "@core/inputs/controls";
export { VideoExporter } from "@core/export";
export { Timeline } from "@timeline/index";

// Event system
export { EditEvent } from "@core/events/edit-events";
export type { EditEventMap, EditEventName, ClipLocation, ClipReference } from "@core/events/edit-events";

// Export theme types for library users
export type { TimelineTheme, TimelineThemeInput } from "./core/theme/theme.types";
export type { TimelineOptions, TimelineFeatures } from "@timeline/index";

// Export Zod schemas for library users
export * from "./core/schemas";

export const VERSION = pkg.version;
