import type { Clip, ResolvedClip, Edit as EditConfig, ResolvedEdit } from "@schemas";

import { mergeAssetForExport } from "./merge-asset";

export interface ClipExportData {
	clipConfiguration: ResolvedClip;
	getTimingIntent: () => { start: number | "auto" | string; length: number | "auto" | "end" | string };
}

export function serializeClipForExport(clip: ClipExportData, originalClip: Clip | undefined): Clip {
	const timing = clip.getTimingIntent();
	const mergedAsset = mergeAssetForExport(originalClip?.asset, clip.clipConfiguration.asset);

	return {
		...(originalClip ?? clip.clipConfiguration),
		asset: mergedAsset,
		start: timing.start,
		length: timing.length
	} as Clip;
}

export function serializeEditForExport(
	clips: ClipExportData[][],
	originalEdit: ResolvedEdit | null,
	backgroundColor: string,
	fonts: Array<{ src: string }>,
	output: EditConfig["output"],
	mergeFields: Array<{ find: string; replace: string }>
): EditConfig {
	const tracks = clips.map((track, trackIdx) => ({
		clips: track.map((clip, clipIdx) => {
			const originalClip = originalEdit?.timeline.tracks[trackIdx]?.clips[clipIdx];
			return serializeClipForExport(clip, originalClip);
		})
	}));

	return {
		timeline: {
			background: backgroundColor,
			tracks,
			fonts
		},
		output,
		merge: mergeFields
	};
}
