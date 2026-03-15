import type { Edit } from "@core/edit-session";
import { isAliasReference, parseAliasName } from "@core/timing/types";

export const FALLBACK_SRT_URL = "https://shotstack-assets.s3.amazonaws.com/captions/transcript.srt";

export interface SourceClipInfo {
	trackIndex: number;
	clipIndex: number;
	clipId: string;
	assetType: "video" | "audio" | "text-to-speech";
	displayLabel: string;
	currentAlias: string | undefined;
}

const ELIGIBLE_TYPES = new Set(["video", "audio", "text-to-speech"]);

const TYPE_LABELS: Record<string, string> = {
	video: "Video",
	audio: "Audio",
	"text-to-speech": "TTS"
};

/**
 * Scan all tracks for video/audio/TTS clips eligible as caption sources.
 * Returns results in bottom-to-top order (highest track index first).
 */
export function findEligibleSourceClips(edit: Edit): SourceClipInfo[] {
	const doc = edit.getDocument();
	if (!doc) return [];

	const results: SourceClipInfo[] = [];
	const trackCount = doc.getTrackCount();

	// Bottom-to-top: iterate from last track to first
	for (let t = trackCount - 1; t >= 0; t--) {
		const clips = doc.getClipsInTrack(t);
		for (let c = 0; c < clips.length; c++) {
			const clip = clips[c];
			const assetType = (clip.asset as { type?: string })?.type;
			if (!assetType || !ELIGIBLE_TYPES.has(assetType)) continue;

			const clipId = edit.getClipId(t, c);
			if (!clipId) continue;

			results.push({
				trackIndex: t,
				clipIndex: c,
				clipId,
				assetType: assetType as SourceClipInfo["assetType"],
				displayLabel: `${TYPE_LABELS[assetType] ?? assetType} (Track ${t + 1})`,
				currentAlias: (clip as { alias?: string }).alias
			});
		}
	}

	return results;
}

/**
 * Find which source clip a caption is currently linked to by parsing its asset.src alias.
 */
export function findCurrentSource(edit: Edit, captionTrackIdx: number, captionClipIdx: number): SourceClipInfo | null {
	const captionClip = edit.getDocumentClip(captionTrackIdx, captionClipIdx);
	if (!captionClip) return null;

	const src = (captionClip.asset as { src?: string })?.src;
	if (!src || !isAliasReference(src)) return null;

	const aliasName = parseAliasName(src);
	const eligible = findEligibleSourceClips(edit);
	return eligible.find(info => info.currentAlias === aliasName) ?? null;
}

/**
 * Generate a deterministic alias from a clip ID.
 * Uses the last 8 characters of the ID (stable across track reorders).
 */
export function generateAlias(clipId: string): string {
	return `source_${clipId.slice(-8)}`;
}

/**
 * Ensure a target clip has an alias. If it already has one, return it.
 * Otherwise generate one and apply it via edit.updateClip().
 */
export async function ensureClipAlias(edit: Edit, trackIdx: number, clipIdx: number): Promise<string> {
	const clip = edit.getDocumentClip(trackIdx, clipIdx);
	const existing = (clip as { alias?: string } | null)?.alias;
	if (existing) return existing;

	const clipId = edit.getClipId(trackIdx, clipIdx);
	if (!clipId) throw new Error(`No clip ID at track ${trackIdx}, clip ${clipIdx}`);

	const alias = generateAlias(clipId);
	await edit.updateClip(trackIdx, clipIdx, { alias } as Record<string, unknown>);
	return alias;
}
