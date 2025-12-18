/**
 * Timing resolution utilities for auto/end clip values.
 * @internal
 */

import type { Player } from "@canvas/players/player";
import type { Asset } from "@schemas/asset";

import { type Milliseconds, type ResolvedTiming, type TimingIntent, ms, toMs } from "./types";

const DEFAULT_AUTO_LENGTH_MS = ms(3000);

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

export async function resolveAutoLength(asset: Asset): Promise<Milliseconds> {
	const assetWithSrc = asset as { type: string; src?: string; trim?: number };

	if (["video", "audio", "luma"].includes(assetWithSrc.type) && assetWithSrc.src) {
		const duration = await probeMediaDuration(assetWithSrc.src);
		if (duration !== null && !Number.isNaN(duration)) {
			const trim = assetWithSrc.trim ?? 0;
			return ms((duration - trim) * 1000);
		}
	}

	return DEFAULT_AUTO_LENGTH_MS;
}

export function resolveAutoStart(trackIndex: number, clipIndex: number, tracks: Player[][]): Milliseconds {
	if (clipIndex === 0) {
		return ms(0);
	}

	const previousClip = tracks[trackIndex][clipIndex - 1];
	return previousClip.getEnd();
}

export function resolveEndLength(clipStart: Milliseconds, timelineEnd: Milliseconds): Milliseconds {
	return ms(Math.max(0, timelineEnd - clipStart));
}

export function calculateTimelineEnd(tracks: Player[][]): Milliseconds {
	let max = ms(0);

	for (const track of tracks) {
		for (const clip of track) {
			// Exclude "end" clips to avoid circular dependency
			if (clip.getTimingIntent().length !== "end") {
				max = ms(Math.max(max, clip.getEnd()));
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
	let resolvedStart: Milliseconds;
	if (intent.start === "auto") {
		resolvedStart = resolveAutoStart(trackIndex, clipIndex, tracks);
	} else {
		resolvedStart = toMs(intent.start);
	}

	let resolvedLength: Milliseconds;
	if (intent.length === "auto") {
		resolvedLength = await resolveAutoLength(asset);
	} else if (intent.length === "end") {
		resolvedLength = ms(0);
	} else {
		resolvedLength = toMs(intent.length);
	}

	return { start: resolvedStart, length: resolvedLength };
}
