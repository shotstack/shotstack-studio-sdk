import pkg from "../package.json";

export { Edit } from "@core/edit-session";
export { Canvas } from "@canvas/shotstack-canvas";
export { Controls } from "@core/inputs/controls";
export { VideoExporter } from "@core/export";
export { Timeline } from "@timeline/index";
export { UIController } from "@core/ui/ui-controller";

export type { UIControllerOptions, ToolbarButtonConfig } from "@core/ui/ui-controller";
export type { EditConfig } from "@core/schemas";

export const VERSION = pkg.version;
