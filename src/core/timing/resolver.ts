/**
 * Timing resolution utilities for auto/end clip values.
 * @internal
 */

import type { Player } from "@canvas/players/player";
import type { Asset } from "@schemas";

import { type ResolutionContext, type ResolvedTiming, type Seconds, type TimingIntent, isAliasReference, sec } from "./types";

const DEFAULT_AUTO_LENGTH_SEC = sec(3);

export function resolveTimingIntent(intent: TimingIntent, context: Readonly<ResolutionContext>): ResolvedTiming {
	// Alias references must be resolved before calling this function
	if (isAliasReference(intent.start)) {
		throw new Error(`Cannot resolve alias reference "${intent.start}" - aliases must be resolved by TimingManager first`);
	}
	if (isAliasReference(intent.length)) {
		throw new Error(`Cannot resolve alias reference "${intent.length}" - aliases must be resolved by TimingManager first`);
	}

	// Resolve start
	const start: Seconds = intent.start === "auto" ? context.previousClipEnd : intent.start;

	// Resolve length
	let length: Seconds;
	if (intent.length === "end") {
		// Extend to timeline end (minimum 0.1s to prevent zero-length clips)
		length = sec(Math.max(context.timelineEnd - start, 0.1));
	} else if (intent.length === "auto") {
		// Use intrinsic duration if available, fallback otherwise
		length = context.intrinsicDuration ?? DEFAULT_AUTO_LENGTH_SEC;
	} else {
		// Fixed value - use as-is
		length = intent.length;
	}

	return { start, length };
}

// ─── Legacy Resolution Functions ──────────────────────────────────────────────
// These still access tracks directly. Prefer resolveTimingIntent with explicit context.

export function resolveAutoLength(asset: Asset, intrinsicDuration: Seconds | null = null): Seconds {
	if (intrinsicDuration === null || !Number.isFinite(intrinsicDuration) || intrinsicDuration <= 0) return DEFAULT_AUTO_LENGTH_SEC;
	const trim = "trim" in asset && typeof asset.trim === "number" && Number.isFinite(asset.trim) ? asset.trim : 0;
	return sec(Math.max(0, intrinsicDuration - trim));
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
