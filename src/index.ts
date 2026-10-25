import pkg from "../package.json";

export { Edit } from "@core/edit-session";
export { Canvas } from "@canvas/shotstack-canvas";
export { Controls } from "@core/inputs/controls";
export { VideoExporter, ExportError } from "@core/export";
export type { ExportBlobOptions, ExportIssue, ExportIssueCode, ExportPhase } from "@core/export";
export { Timeline } from "@timeline/index";
export { UIController } from "@core/ui/ui-controller";
export { WebGLUnsupportedError } from "@core/webgl-support";

export type { UIControllerOptions, ToolbarButtonConfig } from "@core/ui/ui-controller";
export type { AssetGenerationRequest, AssetGeneratorHandler, AssetGeneratorOptions } from "@core/generation/asset-generator";
export type { EditConfig } from "@core/schemas";
export type { EditOptions } from "@core/edit-session";
export type { CommandResult } from "@core/commands/types";

export const VERSION = pkg.version;
