import type { ResolvedClip } from "@schemas";

export const AI_ASSET_TYPES = new Set(["text-to-image", "image-to-video", "text-to-speech"]);

const PROMPTABLE_MEDIA_TYPES = new Set(["image", "video", "audio"]);

/**
 * AI asset type definition
 */
export interface AiAsset {
	type: string;
	prompt?: string;
	src?: string;
	seed?: string;
}

/** Visual kind of an AI asset; doubles as the overlay/timeline icon key. */
export type AiMediaKind = "image" | "video" | "mic";

const AI_KIND_BY_TYPE: Record<string, AiMediaKind> = {
	"text-to-image": "image",
	"image-to-video": "video",
	"text-to-speech": "mic",
	image: "image",
	video: "video",
	audio: "mic"
};

function hasText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * Extended clip type with ID property
 */
export interface ResolvedClipWithId extends ResolvedClip {
	id: string;
}

/**
 * Type guard to check if an asset is AI-generative: a legacy generative type
 * (text-to-image, image-to-video, text-to-speech) or a media asset (image,
 * video, audio) carrying a prompt. Remains true after realisation fills `src`.
 */
export function isAiAsset(asset: unknown): asset is AiAsset {
	if (typeof asset !== "object" || asset === null || !("type" in asset)) return false;
	const { type } = asset as { type: unknown };
	if (typeof type !== "string") return false;

	if (AI_ASSET_TYPES.has(type)) return true;
	return PROMPTABLE_MEDIA_TYPES.has(type) && hasText((asset as AiAsset).prompt);
}

/**
 * Whether an AI asset is still awaiting generation. Legacy generative types
 * are always pending (realisation replaces them with a media type); a
 * prompt-bearing media asset is pending until generation fills `src`.
 */
export function isPendingAiAsset(asset: unknown): asset is AiAsset {
	if (!isAiAsset(asset)) return false;
	if (AI_ASSET_TYPES.has(asset.type)) return true;
	return !hasText(asset.src);
}

/**
 * Visual kind of an AI asset (image, video, mic), or null for non-AI assets.
 */
export function aiAssetKind(asset: unknown): AiMediaKind | null {
	if (!isAiAsset(asset)) return null;
	return AI_KIND_BY_TYPE[asset.type] ?? null;
}

/**
 * Type guard to check if a clip has an ID
 */
function hasId(clip: ResolvedClip): clip is ResolvedClipWithId {
	return "id" in clip && typeof (clip as { id: unknown }).id === "string";
}

/**
 * Cache for sorted clips to avoid redundant sorting.
 */
const sortedClipsCache = new WeakMap<ResolvedClip[], ResolvedClip[]>();

/**
 * Get chronologically sorted clips, using cache when available.
 * @param allClips - Array of clips to sort
 * @returns Sorted array of clips by start time
 */
function getSortedClips(allClips: ResolvedClip[]): ResolvedClip[] {
	let sortedClips = sortedClipsCache.get(allClips);

	if (!sortedClips) {
		sortedClips = [...allClips].sort((a, b) => a.start - b.start);
		sortedClipsCache.set(allClips, sortedClips);
	}

	return sortedClips;
}

/**
 * Compute the sequential number for an AI asset based on chronological position.
 */
export function computeAiAssetNumber(allClips: ResolvedClip[], clipId: string): number | null {
	const clip = allClips.find(c => hasId(c) && c.id === clipId);
	if (!clip || !hasId(clip)) return null;

	if (!clip.asset || !isAiAsset(clip.asset)) return null;

	// Number by visual kind so legacy generative types and prompt-bearing
	// media assets of the same kind share one sequence (no duplicate "Image 1")
	const kind = aiAssetKind(clip.asset);

	// Get sorted clips
	const sortedClips = getSortedClips(allClips);

	// Count clips of same kind that appear before this one chronologically
	let count = 0;
	for (const c of sortedClips) {
		if (hasId(c) && c.id === clipId) break;
		if (c.asset && aiAssetKind(c.asset) === kind) {
			count += 1;
		}
	}

	return count + 1;
}

/**
 * Generate HSL hue values for aurora layers using golden angle distribution.
 * Returns array of 5 hues for the multi-layer aurora effect.
 */
export function getAuroraHues(assetNumber: number): number[] {
	const baseHue = (assetNumber * 137.5) % 360;
	return [baseHue, (baseHue + 30) % 360, (baseHue + 60) % 360, (baseHue + 90) % 360, (baseHue + 120) % 360];
}

/**
 * Convert HSL to hex color code for use in PIXI.
 */
export function hslToHex(h: number, s: number, l: number): number {
	const hDecimal = h / 360;
	const sDecimal = s / 100;
	const lDecimal = l / 100;

	let r: number;
	let g: number;
	let b: number;

	if (sDecimal === 0) {
		r = lDecimal;
		g = lDecimal;
		b = lDecimal;
	} else {
		const hue2rgb = (p: number, q: number, tParam: number): number => {
			let t = tParam;
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = lDecimal < 0.5 ? lDecimal * (1 + sDecimal) : lDecimal + sDecimal - lDecimal * sDecimal;
		const p = 2 * lDecimal - q;

		r = hue2rgb(p, q, hDecimal + 1 / 3);
		g = hue2rgb(p, q, hDecimal);
		b = hue2rgb(p, q, hDecimal - 1 / 3);
	}

	// Pack RGB into PIXI color format: 0xRRGGBB
	const red = Math.round(r * 255) * 65536; // Shift left 16 bits
	const green = Math.round(g * 255) * 256; // Shift left 8 bits
	const blue = Math.round(b * 255);
	return red + green + blue;
}

/**
 * Get friendly label for AI asset type.
 */
export function getAiAssetTypeLabel(assetType: string): string {
	const labels: Record<string, string> = {
		"text-to-image": "Image",
		"image-to-video": "Video",
		"text-to-speech": "Audio",
		image: "Image",
		video: "Video",
		audio: "Audio"
	};
	return labels[assetType] || assetType;
}

/**
 * Truncate prompt text for display.
 */
export function truncatePrompt(prompt: string, maxLength = 60): string {
	if (prompt.length <= maxLength) {
		return prompt;
	}
	return `${prompt.substring(0, maxLength - 3)}...`;
}
