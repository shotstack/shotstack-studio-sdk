import type { ResolvedClip } from "@schemas";

export const AI_ASSET_TYPES = new Set(["text-to-image", "image-to-video", "text-to-speech"]);

/**
 * AI asset type definition
 */
export interface AiAsset {
	type: "text-to-image" | "image-to-video" | "text-to-speech";
	prompt?: string;
	src?: string;
}

/**
 * Extended clip type with ID property
 */
export interface ResolvedClipWithId extends ResolvedClip {
	id: string;
}

/**
 * Type guard to check if an asset is an AI asset
 */
export function isAiAsset(asset: unknown): asset is AiAsset {
	return (
		typeof asset === "object" &&
		asset !== null &&
		"type" in asset &&
		typeof (asset as { type: unknown }).type === "string" &&
		AI_ASSET_TYPES.has((asset as { type: string }).type)
	);
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

	const assetType = clip.asset.type;

	// Get sorted clips
	const sortedClips = getSortedClips(allClips);

	// Count clips of same type that appear before this one chronologically
	let count = 0;
	for (const c of sortedClips) {
		if (hasId(c) && c.id === clipId) break;
		if (c.asset && isAiAsset(c.asset) && c.asset.type === assetType) {
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
		"text-to-speech": "Audio"
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
