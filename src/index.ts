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

// Export schema types and Zod schemas for library users
// Note: Edit and Timeline types are intentionally not re-exported here
// to avoid conflict with the Edit and Timeline classes exported above.
// Use EditConfig for the schema type, or import from @schemas directly.
export type { EditConfig } from "./core/schemas";
export {
	// Zod schemas
	EditSchema,
	TimelineSchema,
	TrackSchema,
	ClipSchema,
	OutputSchema,
	VideoAssetSchema,
	AudioAssetSchema,
	ImageAssetSchema,
	TextAssetSchema,
	RichTextAssetSchema,
	HtmlAssetSchema,
	CaptionAssetSchema,
	ShapeAssetSchema,
	LumaAssetSchema,
	AssetSchema,
	TweenSchema,
	KeyframeSchema,
	CropSchema,
	OffsetSchema,
	TransitionSchema,
	TransformationSchema,
	DestinationSchema,
	OutputSizeSchema,
	OutputFormatSchema,
	OutputFpsSchema,
	HexColorSchema
} from "./core/schemas";
export type {
	// Types (excluding Edit and Timeline to avoid conflicts)
	Track,
	Clip,
	Output,
	Asset,
	MergeField,
	Soundtrack,
	Font,
	VideoAsset,
	AudioAsset,
	ImageAsset,
	TextAsset,
	RichTextAsset,
	HtmlAsset,
	CaptionAsset,
	ShapeAsset,
	LumaAsset,
	TitleAsset,
	Crop,
	Offset,
	Transition,
	Transformation,
	ChromaKey,
	Tween,
	Destination,
	ResolvedClip,
	ResolvedTrack,
	ResolvedEdit,
	ClipAnchor,
	HtmlAssetPosition,
	Keyframe,
	ExtendedCaptionAsset,
	NumericKeyframe
} from "./core/schemas";

export const VERSION = pkg.version;
