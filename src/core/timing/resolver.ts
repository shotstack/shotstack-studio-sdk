/**
 * Timing resolution utilities for auto/end clip values.
 * @internal
 */

import type { Player } from "@canvas/players/player";
import type { Asset } from "@schemas";

import { type ResolvedTiming, type Seconds, type TimingIntent, sec } from "./types";

const DEFAULT_AUTO_LENGTH_SEC = sec(3);

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

export async function resolveAutoLength(asset: Asset): Promise<Seconds> {
	const assetWithSrc = asset as { type: string; src?: string; trim?: number };

	if (["video", "audio", "luma"].includes(assetWithSrc.type) && assetWithSrc.src) {
		const duration = await probeMediaDuration(assetWithSrc.src);
		if (duration !== null && !Number.isNaN(duration)) {
			const trim = assetWithSrc.trim ?? 0;
			return sec(duration - trim);
		}
	}

	return DEFAULT_AUTO_LENGTH_SEC;
}

export function resolveAutoStart(trackIndex: number, clipIndex: number, tracks: Player[][]): Seconds {
	if (clipIndex === 0) {
		return sec(0);
	}

	const previousClip = tracks[trackIndex][clipIndex - 1];
	return previousClip.getEnd();
}

export function resolveEndLength(clipStart: Seconds, timelineEnd: Seconds): Seconds {
	return sec(Math.max(0, timelineEnd - clipStart));
}

export function calculateTimelineEnd(tracks: Player[][]): Seconds {
	let max = sec(0);

	for (const track of tracks) {
		for (const clip of track) {
			// Exclude "end" clips to avoid circular dependency
			if (clip.getTimingIntent().length !== "end") {
				max = sec(Math.max(max, clip.getEnd()));
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
	let resolvedStart: Seconds;
	if (intent.start === "auto") {
		resolvedStart = resolveAutoStart(trackIndex, clipIndex, tracks);
	} else {
		resolvedStart = intent.start;
	}

	let resolvedLength: Seconds;
	if (intent.length === "auto") {
		resolvedLength = await resolveAutoLength(asset);
	} else if (intent.length === "end") {
		resolvedLength = sec(0);
	} else {
		resolvedLength = intent.length;
	}

	return { start: resolvedStart, length: resolvedLength };
}
