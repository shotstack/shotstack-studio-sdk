/**
 * Shotstack Schema Types
 *
 * This module exports types from @shotstack/schemas as the canonical source of truth
 * for the Shotstack data model. SDK-specific "Resolved" types are defined locally
 * for runtime values where "auto", "end", and aliases are resolved to concrete values.
 *
 * @see https://github.com/shotstack/oas-api-definition
 */

import type { components } from "@shotstack/schemas";
import {
	editSchema,
	timelineSchema,
	trackSchema,
	clipSchema,
	outputSchema,
	videoAssetSchema,
	audioAssetSchema,
	imageAssetSchema,
	textAssetSchema,
	richTextAssetSchema,
	htmlAssetSchema,
	captionAssetSchema,
	shapeAssetSchema,
	lumaAssetSchema,
	assetSchema,
	tweenSchema,
	cropSchema,
	offsetSchema,
	transitionSchema,
	transformationSchema,
	destinationsSchema,
	sizeSchema
} from "@shotstack/schemas/zod";
import type { Seconds } from "@timing/types";
import { z } from "zod";

// ─── Primary Types (from external package) ─────────────────────────────────

export type Edit = components["schemas"]["Edit"];
export type Timeline = components["schemas"]["Timeline"];
export type Track = components["schemas"]["Track"];
export type Clip = components["schemas"]["Clip"];
export type Output = components["schemas"]["Output"];
export type Asset = components["schemas"]["Asset"];
export type MergeField = components["schemas"]["MergeField"];
export type Soundtrack = components["schemas"]["Soundtrack"];
export type Font = components["schemas"]["Font"];

// Asset types
export type VideoAsset = components["schemas"]["VideoAsset"];
export type AudioAsset = components["schemas"]["AudioAsset"];
export type ImageAsset = components["schemas"]["ImageAsset"];
export type TextAsset = components["schemas"]["TextAsset"];
export type RichTextAsset = components["schemas"]["RichTextAsset"];
export type HtmlAsset = components["schemas"]["HtmlAsset"];
export type CaptionAsset = components["schemas"]["CaptionAsset"];
export type ShapeAsset = components["schemas"]["ShapeAsset"];
export type LumaAsset = components["schemas"]["LumaAsset"];
export type TitleAsset = components["schemas"]["TitleAsset"];

// Sub-types
export type Crop = components["schemas"]["Crop"];
export type Offset = components["schemas"]["Offset"];
export type Transition = components["schemas"]["Transition"];
export type Transformation = components["schemas"]["Transformation"];
export type ChromaKey = components["schemas"]["ChromaKey"];
export type Tween = components["schemas"]["Tween"];

// Destination types (camelCase from external)
export type Destination = components["schemas"]["Destinations"];

// ─── SDK-Specific Resolved Types ───────────────────────────────────────────
// Runtime types where "auto", "end", and aliases are resolved to concrete values

export type ResolvedClip = Omit<Clip, "start" | "length"> & {
	start: Seconds;
	length: Seconds;
};

export type ResolvedTrack = {
	clips: ResolvedClip[];
};

export type ResolvedEdit = Omit<Edit, "timeline"> & {
	timeline: Omit<Edit["timeline"], "tracks"> & {
		tracks: ResolvedTrack[];
	};
};

// ─── Backward Compatibility Aliases ────────────────────────────────────────

/** Alias for Edit type to avoid conflicts with SDK's Edit class */
export type EditConfig = Edit;
export type ClipAnchor = Clip["position"];
export type HtmlAssetPosition = NonNullable<HtmlAsset["position"]>;
export type Keyframe = Tween; // SDK previously called Tween "Keyframe"

// ─── SDK-Extended Asset Types ───────────────────────────────────────────────
// Extended types with additional SDK-specific properties not in external schema

/** SDK-extended CaptionAsset with stroke, width, height, alignment */
export type ExtendedCaptionAsset = CaptionAsset & {
	stroke?: { width: number; color: string };
	width?: number;
	height?: number;
	alignment?: { horizontal?: "left" | "center" | "right"; vertical?: "top" | "center" | "bottom" };
};

// ─── Internal Animation Types ───────────────────────────────────────────────
// Keyframes with all required fields and numeric values for animation interpolation

export interface NumericKeyframe {
	start: number;
	length: number;
	from: number;
	to: number;
	interpolation?: Tween["interpolation"];
	easing?: Tween["easing"];
}

// ─── Zod Schemas (for validation) ──────────────────────────────────────────

// Re-export external schemas with SDK naming convention
export {
	editSchema as EditSchema,
	timelineSchema as TimelineSchema,
	trackSchema as TrackSchema,
	clipSchema as ClipSchema,
	outputSchema as OutputSchema,
	videoAssetSchema as VideoAssetSchema,
	audioAssetSchema as AudioAssetSchema,
	imageAssetSchema as ImageAssetSchema,
	textAssetSchema as TextAssetSchema,
	richTextAssetSchema as RichTextAssetSchema,
	htmlAssetSchema as HtmlAssetSchema,
	captionAssetSchema as CaptionAssetSchema,
	shapeAssetSchema as ShapeAssetSchema,
	lumaAssetSchema as LumaAssetSchema,
	assetSchema as AssetSchema,
	tweenSchema as TweenSchema,
	tweenSchema as KeyframeSchema,
	cropSchema as CropSchema,
	offsetSchema as OffsetSchema,
	transitionSchema as TransitionSchema,
	transformationSchema as TransformationSchema
};

// SDK-specific validation schemas (derived from external schemas)
export const DestinationSchema = destinationsSchema;
export const OutputSizeSchema = sizeSchema;
export const OutputFormatSchema = outputSchema.shape.format;
export const OutputFpsSchema = outputSchema.shape.fps.unwrap(); // unwrap optional
export const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$|^#[0-9A-Fa-f]{8}$/);
