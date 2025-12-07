/**
 * Resolves alias:// references in caption assets.
 * Extracts audio from referenced clips and transcribes to VTT.
 */

import type { ResolvedEdit } from "@schemas/edit";

import type { TranscriptionProgress } from "./transcription-service";
import { TranscriptionService } from "./transcription-service";

/**
 * Regex pattern for alias:// references.
 * Aligns with pattern used in src/core/alias/alias.ts
 */
const ALIAS_REFERENCE_REGEX = /^alias:\/\/([a-zA-Z0-9_-]+)$/;

/**
 * Check if a source string is an alias reference.
 */
export function isAliasReference(src: unknown): boolean {
	if (typeof src !== "string") return false;
	return ALIAS_REFERENCE_REGEX.test(src);
}

/**
 * Extract the alias name from an alias:// reference.
 */
export function parseAliasName(src: unknown): string | null {
	if (typeof src !== "string") return null;
	const match = src.match(ALIAS_REFERENCE_REGEX);
	return match ? match[1] : null;
}

/**
 * Find a clip by its alias in the edit.
 */
export function findClipByAlias(
	edit: ResolvedEdit,
	aliasName: string
): { clip: ResolvedEdit["timeline"]["tracks"][0]["clips"][0]; trackIndex: number; clipIndex: number } | null {
	for (let trackIndex = 0; trackIndex < edit.timeline.tracks.length; trackIndex += 1) {
		const track = edit.timeline.tracks[trackIndex];
		for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
			const clip = track.clips[clipIndex];
			if (clip.alias === aliasName) {
				return { clip, trackIndex, clipIndex };
			}
		}
	}
	return null;
}

/**
 * Extract audio URL from a clip's asset.
 * Returns the src URL for audio/video assets.
 */
export function extractAudioUrl(asset: any): string | null {
	if (!asset) return null;

	// Video and audio assets have a src property
	if (asset.type === "video" || asset.type === "audio") {
		return asset.src ?? null;
	}

	return null;
}

/**
 * Result of resolving an alias reference.
 */
export interface AliasResolutionResult {
	/** Blob URL to the generated VTT content */
	vttUrl: string;
	/** VTT content as string */
	vttContent: string;
}

/**
 * Resolve an alias reference to a VTT URL.
 * Finds the referenced clip, extracts audio, and transcribes it.
 */
export async function resolveTranscriptionAlias(
	aliasRef: string,
	edit: ResolvedEdit,
	onProgress?: (p: TranscriptionProgress) => void
): Promise<AliasResolutionResult> {
	const aliasName = parseAliasName(aliasRef);
	if (!aliasName) {
		throw new Error(`Invalid alias reference: ${aliasRef}`);
	}

	const result = findClipByAlias(edit, aliasName);
	if (!result) {
		throw new Error(`Alias "${aliasName}" not found in timeline`);
	}

	const audioUrl = extractAudioUrl(result.clip.asset);
	if (!audioUrl) {
		throw new Error(`Cannot extract audio from clip "${aliasName}" - asset type ${result.clip.asset?.type} is not supported`);
	}

	// Transcribe the audio
	const service = new TranscriptionService();
	const transcription = await service.transcribe(audioUrl, onProgress);

	// Create blob URL for the VTT content
	const blob = new Blob([transcription.vtt], { type: "text/vtt" });
	const vttUrl = URL.createObjectURL(blob);

	return {
		vttUrl,
		vttContent: transcription.vtt
	};
}

/**
 * Clean up a blob URL created by resolveTranscriptionAlias.
 */
export function revokeVttUrl(url: string): void {
	if (url.startsWith("blob:")) {
		URL.revokeObjectURL(url);
	}
}
