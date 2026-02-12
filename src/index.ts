import pkg from "../package.json";

export { Edit } from "@core/edit-session";
export { Canvas } from "@canvas/shotstack-canvas";
export { Controls } from "@core/inputs/controls";
export { VideoExporter } from "@core/export";
export { Timeline } from "@timeline/index";
export { UIController } from "@core/ui/ui-controller";

export type { UIControllerOptions, ToolbarButtonConfig } from "@core/ui/ui-controller";
export type { TimelineOptions, TimelineFeatures } from "@timeline/index";
export type { EditConfig } from "@core/schemas";

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
	TextToImageAssetSchema,
	ImageToVideoAssetSchema,
	TextToSpeechAssetSchema,
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
	OutputResolutionSchema,
	OutputAspectRatioSchema,
	HexColorSchema
} from "./core/schemas";

export type {
	// Types
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
	TextToImageAsset,
	ImageToVideoAsset,
	TextToSpeechAsset,
	Crop,
	Offset,
	Transition,
	Transformation,
	ChromaKey,
	Tween,
	Destination,
	ClipAnchor,
	HtmlAssetPosition,
	Keyframe,
	ExtendedCaptionAsset,
	NumericKeyframe
} from "./core/schemas";

export const VERSION = pkg.version;
