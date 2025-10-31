/**
 * Shotstack Studio SDK - Zod Schemas
 *
 * This module exports all Zod schemas used by the SDK for validation.
 * Developers can import these schemas to validate data before passing to the SDK,
 * integrate with form libraries, or build custom tooling.
 *
 * @example
 * ```typescript
 * import { EditSchema, ClipSchema } from '@shotstack/shotstack-studio';
 *
 * // Validate data
 * const result = EditSchema.safeParse(userInput);
 * if (result.success) {
 *   const edit = new Edit(result.data);
 * }
 * ```
 */

// ==================== EDIT SCHEMAS ====================
export {
	EditSchema,
	TimelineSchema,
	OutputSchema,
	FontSourceSchema,
	FontSourceUrlSchema,
} from './edit';

// ==================== TRACK SCHEMAS ====================
export { TrackSchema } from './track';

// ==================== CLIP SCHEMAS ====================
export { ClipSchema } from './clip';

// ==================== KEYFRAME SCHEMAS ====================
export {
	KeyframeSchema,
	KeyframeInterpolationSchema,
	KeyframeEasingSchema,
} from './keyframe';

// ==================== ASSET SCHEMAS ====================
export { AssetSchema } from './asset';

// ==================== TEXT ASSET SCHEMAS ====================
export {
	TextAssetSchema,
	TextAssetColorSchema,
	TextAssetFontSchema,
	TextAssetAlignmentSchema,
	TextAssetBackgroundSchema,
	TextAssetStrokeSchema,
} from './text-asset';

// ==================== RICH TEXT ASSET SCHEMAS ====================
export { RichTextAssetSchema } from './rich-text-asset';

// ==================== VIDEO ASSET SCHEMAS ====================
export {
	VideoAssetSchema,
	VideoAssetUrlSchema,
	VideoAssetCropSchema,
	VideoAssetVolumeSchema,
} from './video-asset';

// ==================== IMAGE ASSET SCHEMAS ====================
export {
	ImageAssetSchema,
	ImageAssetUrlSchema,
	ImageAssetCropSchema,
} from './image-asset';

// ==================== AUDIO ASSET SCHEMAS ====================
export {
	AudioAssetSchema,
	AudioAssetUrlSchema,
	AudioAssetVolumeSchema,
} from './audio-asset';

// ==================== HTML ASSET SCHEMAS ====================
export { HtmlAssetSchema } from './html-asset';

// ==================== LUMA ASSET SCHEMAS ====================
export {
	LumaAssetSchema,
	LumaAssetUrlSchema,
} from './luma-asset';

// ==================== SHAPE ASSET SCHEMAS ====================
export {
	ShapeAssetSchema,
	ShapeAssetColorSchema,
	ShapeAssetRectangleSchema,
	ShapeAssetCircleSchema,
	ShapeAssetLineSchema,
	ShapeAssetFillSchema,
	ShapeAssetStrokeSchema,
} from './shape-asset';

// ==================== TYPES ====================
// Re-export all inferred types for convenience
export type { Track } from './edit';
export type { Clip, ClipAnchor } from './clip';
export type { Keyframe } from './keyframe';
export type { Asset } from './asset';
export type { TextAsset } from './text-asset';
export type { RichTextAsset } from './rich-text-asset';
export type { VideoAsset } from './video-asset';
export type { ImageAsset } from './image-asset';
export type { AudioAsset } from './audio-asset';
export type { HtmlAsset, HtmlAssetPosition } from './html-asset';
export type { LumaAsset } from './luma-asset';
export type { ShapeAsset } from './shape-asset';
