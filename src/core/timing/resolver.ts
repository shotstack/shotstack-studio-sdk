/**
 * Timing resolution utilities for auto/end clip values.
 * @internal
 */

import type { Player } from "@canvas/players/player";
import type { Asset } from "@schemas";

import {
	type AssetTimingIdentity,
	type MediaTimingState,
	type ResolutionContext,
	type ResolvedTiming,
	type Seconds,
	type TimingIntent,
	isAliasReference,
	sec
} from "./types";

export const DEFAULT_AUTO_CLIP_LENGTH = sec(3);
export const MINIMUM_END_LENGTH = sec(0);

/** Stable identity for intrinsic metadata. Trim is excluded because it is applied by the resolver. */
export function getAssetTimingIdentity(asset: Asset): AssetTimingIdentity {
	const { type } = asset as { type: string };
	const src = "src" in asset && typeof asset.src === "string" ? asset.src : "";
	const identity: AssetTimingIdentity = { type, src: src || null };

	// URL-backed assets are identified by their source. Rich captions may instead carry
	// their timed words inline, so retain an exact revision to invalidate stale duration
	// metadata and rendering when any word changes.
	if (type === "rich-caption" && !src && "words" in asset && Array.isArray(asset.words)) {
		return { ...identity, revision: JSON.stringify(asset.words) };
	}

	return identity;
}

export function assetTimingIdentitiesEqual(left: AssetTimingIdentity, right: AssetTimingIdentity): boolean {
	return left.type === right.type && left.src === right.src && left.revision === right.revision;
}

export function mediaTimingMatchesAsset(state: MediaTimingState, asset: Asset): boolean {
	return assetTimingIdentitiesEqual(state.asset, getAssetTimingIdentity(asset));
}

/** Apply the one asset-aware policy for `length: "auto"`. */
export function resolveAutoLength(asset: Asset, intrinsicDuration: Seconds | null = null): Seconds {
	if (intrinsicDuration === null || !Number.isFinite(intrinsicDuration) || intrinsicDuration <= 0) return DEFAULT_AUTO_CLIP_LENGTH;

	const supportsTrim =
		asset.type === "video" || asset.type === "audio" || asset.type === "luma" || asset.type === "caption" || asset.type === "text-to-speech";
	const trim = supportsTrim && "trim" in asset && typeof asset.trim === "number" && Number.isFinite(asset.trim) && asset.trim >= 0 ? asset.trim : 0;
	return sec(Math.max(0, intrinsicDuration - trim));
}

export function resolveEndLength(timelineEnd: Seconds, clipStart: Seconds): Seconds {
	if (!Number.isFinite(timelineEnd) || !Number.isFinite(clipStart)) return MINIMUM_END_LENGTH;
	return sec(Math.max(MINIMUM_END_LENGTH, timelineEnd - clipStart));
}

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
		length = resolveEndLength(context.timelineEnd, start);
	} else if (intent.length === "auto") {
		length = context.autoLength ?? DEFAULT_AUTO_CLIP_LENGTH;
	} else {
		// Fixed value - use as-is
		length = intent.length;
	}

	return { start, length };
}

// ─── Legacy Resolution Functions ──────────────────────────────────────────────
// These still access tracks directly. Prefer resolveTimingIntent with explicit context.

export function resolveAutoStart(trackIndex: number, clipIndex: number, tracks: Player[][]): Seconds {
	if (clipIndex === 0) {
		return sec(0);
	}

	const previousClip = tracks[trackIndex][clipIndex - 1];
	return previousClip.getEnd();
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
