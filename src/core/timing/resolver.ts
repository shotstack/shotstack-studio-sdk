/**
 * Timing resolution utilities for auto/end clip values.
 * @internal
 */

import type { Player } from "@canvas/players/player";
import type { Asset } from "@schemas";

import { type ResolutionContext, type ResolvedTiming, type Seconds, type TimingIntent, sec } from "./types";

const DEFAULT_AUTO_LENGTH_FALLBACK = sec(1);

const DEFAULT_AUTO_LENGTH_SEC = sec(3);

export function resolveTimingIntent(intent: TimingIntent, context: Readonly<ResolutionContext>): ResolvedTiming {
	// Resolve start
	const start: Seconds = intent.start === "auto" ? context.previousClipEnd : intent.start;

	// Resolve length
	let length: Seconds;
	if (intent.length === "end") {
		// Extend to timeline end (minimum 0.1s to prevent zero-length clips)
		length = sec(Math.max(context.timelineEnd - start, 0.1));
	} else if (intent.length === "auto") {
		// Use intrinsic duration if available, fallback otherwise
		length = context.intrinsicDuration ?? DEFAULT_AUTO_LENGTH_FALLBACK;
	} else {
		// Fixed value - use as-is
		length = intent.length;
	}

	return { start, length };
}

// ─── Legacy Resolution Functions ──────────────────────────────────────────────
// These still access tracks directly. Prefer resolveTimingIntent with explicit context.

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
