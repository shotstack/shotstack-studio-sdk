/**
 * Timing resolution utilities for auto/end clip values.
 * @internal
 */

import type { Player } from "@canvas/players/player";
import type { Asset } from "@schemas/asset";

import type { ResolvedTiming, TimingIntent } from "./types";

const DEFAULT_AUTO_LENGTH_MS = 3000;

export function probeMediaDuration(src: string): Promise<number | null> {
	return new Promise(resolve => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.crossOrigin = "anonymous";
		video.onloadedmetadata = (): void => resolve(video.duration);
		video.onerror = (): void => resolve(null);
		video.src = src;
	});
}

export async function resolveAutoLength(asset: Asset): Promise<number> {
	const assetWithSrc = asset as { type: string; src?: string; trim?: number };

	if (["video", "audio", "luma"].includes(assetWithSrc.type) && assetWithSrc.src) {
		const duration = await probeMediaDuration(assetWithSrc.src);
		if (duration !== null && !Number.isNaN(duration)) {
			const trim = assetWithSrc.trim ?? 0;
			return (duration - trim) * 1000;
		}
	}

	return DEFAULT_AUTO_LENGTH_MS;
}

export function resolveAutoStart(trackIndex: number, clipIndex: number, tracks: Player[][]): number {
	if (clipIndex === 0) {
		return 0;
	}

	const previousClip = tracks[trackIndex][clipIndex - 1];
	return previousClip.getEnd();
}

export function resolveEndLength(clipStart: number, timelineEnd: number): number {
	return Math.max(0, timelineEnd - clipStart);
}

export function calculateTimelineEnd(tracks: Player[][]): number {
	let max = 0;

	for (const track of tracks) {
		for (const clip of track) {
			// Exclude "end" clips to avoid circular dependency
			if (clip.getTimingIntent().length !== "end") {
				max = Math.max(max, clip.getEnd());
			}
		}
	}

	return max;
}

export async function resolveClipTiming(
	intent: TimingIntent,
	asset: Asset,
	trackIndex: number,
	clipIndex: number,
	tracks: Player[][]
): Promise<ResolvedTiming> {
	let resolvedStart: number;
	if (intent.start === "auto") {
		resolvedStart = resolveAutoStart(trackIndex, clipIndex, tracks);
	} else {
		resolvedStart = intent.start * 1000;
	}

	let resolvedLength: number;
	if (intent.length === "auto") {
		resolvedLength = await resolveAutoLength(asset);
	} else if (intent.length === "end") {
		resolvedLength = 0;
	} else {
		resolvedLength = intent.length * 1000;
	}

	return { start: resolvedStart, length: resolvedLength };
}
