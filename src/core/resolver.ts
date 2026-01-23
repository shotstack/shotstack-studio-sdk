/**
 * Resolver - Pure function that transforms EditDocument → ResolvedEdit
 *
 * This is the core of unidirectional data flow. Given a document (source of truth)
 * and context (merge field values), it produces a fully resolved edit that can be
 * consumed by Canvas and Timeline independently.
 *
 * Key responsibilities:
 * - Resolve "auto" clip starts (position after previous clip)
 * - Resolve "end" clip lengths (extend to timeline end)
 * - Substitute merge field placeholders in asset properties
 * - Preserve stable clip IDs for reconciliation
 */

import type { EditDocument } from "./edit-document";
import type { MergeFieldService } from "./merge/merge-field-service";
import type { Clip, ResolvedClip, ResolvedEdit, ResolvedTrack, Asset } from "./schemas";
import { type Seconds, sec, isAliasReference } from "./timing/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolveContext {
	mergeFields: MergeFieldService;
}

/** Internal clip type with stable ID */
type InternalClip = Clip & { id?: string };

/** Resolved clip with guaranteed ID and pending flag */
interface PartialResolvedClip extends ResolvedClip {
	id: string;
	pendingEndLength?: boolean;
}

/** Resolved clip with guaranteed ID (exported type) */
export type ResolvedClipWithId = ResolvedClip & { id: string };

// ─── Helper Functions ─────────────────────────────────────────────────────────

function substituteInObject(target: Record<string, unknown>, mergeFields: MergeFieldService): void {
	for (const key of Object.keys(target)) {
		const value = target[key];

		if (typeof value === "string") {
			// eslint-disable-next-line no-param-reassign
			target[key] = mergeFields.resolve(value);
		} else if (typeof value === "object" && value !== null) {
			substituteInObject(value as Record<string, unknown>, mergeFields);
		}
	}
}

function substituteMergeFieldsInAsset(asset: Asset, mergeFields: MergeFieldService): Asset {
	const cloned = structuredClone(asset);
	substituteInObject(cloned as unknown as Record<string, unknown>, mergeFields);
	return cloned;
}

function resolveClipFirstPass(clip: InternalClip, previousClipEnd: Seconds, context: ResolveContext): PartialResolvedClip {
	// Resolve start
	let start: Seconds;
	if (clip.start === "auto") {
		start = previousClipEnd;
	} else if (isAliasReference(clip.start)) {
		start = sec(0); // Placeholder for alias reference
	} else {
		start = sec(clip.start as number);
	}

	// Resolve length (partially - "end" deferred to second pass)
	let length: Seconds;
	let pendingEndLength = false;

	if (clip.length === "end") {
		// Mark for second pass - needs timeline end calculation
		length = sec(1); // Temporary placeholder
		pendingEndLength = true;
	} else if (clip.length === "auto") {
		// Use intrinsic duration if available, else fallback
		// Note: For now use fallback; intrinsic duration will be provided by Players
		length = sec(3);
	} else if (isAliasReference(clip.length)) {
		// Alias reference - TimingManager resolves these before resolve() is called
		length = sec(1);
	} else {
		length = sec(clip.length as number);
	}

	// Resolve merge fields in asset
	const asset = substituteMergeFieldsInAsset(clip.asset, context.mergeFields);

	return {
		...clip,
		id: clip.id ?? crypto.randomUUID(),
		start,
		length,
		asset,
		pendingEndLength: pendingEndLength || undefined
	};
}

function calculateTimelineEndFromTracks(tracks: Array<{ clips: PartialResolvedClip[] }>): number {
	let max = 0;

	for (const track of tracks) {
		for (const clip of track.clips) {
			// Exclude clips with pending "end" length
			if (!clip.pendingEndLength) {
				const end = clip.start + clip.length;
				if (end > max) {
					max = end;
				}
			}
		}
	}

	return max;
}

function cleanupPendingFlags(clip: PartialResolvedClip): ResolvedClipWithId {
	const { pendingEndLength, ...cleanClip } = clip;
	return cleanClip;
}

// ─── Single-Clip Resolution ───────────────────────────────────────────────────

/** Result of single-clip resolution */
export interface ResolveClipResult {
	resolved: ResolvedClipWithId;
	trackIndex: number;
	clipIndex: number;
}

/** Extended context for single-clip resolution with cached values */
export interface SingleClipContext extends ResolveContext {
	/**
	 * End time of the previous clip in the same track.
	 * Required for clips with start: "auto".
	 * Get from previous player's getEnd() for already-resolved timing.
	 */
	previousClipEnd: Seconds;

	/**
	 * Cached timeline end for clips with length: "end".
	 * Get from edit.cachedTimelineEnd for already-calculated value.
	 */
	cachedTimelineEnd?: Seconds;
}

/**
 * Resolve a single clip by ID.
 *
 * This is an optimization for single-clip mutations (timing, asset, properties).
 * Instead of re-resolving ALL clips, we resolve just the one that changed.
 *
 * Use cases:
 * - Resize a clip → resolveClip() is 10x faster than resolve()
 * - Update asset property → instant feedback
 * - Text content change → no full timeline recalc needed
 *
 * NOT for structural changes:
 * - Adding/deleting clips (affects downstream "auto" starts)
 * - Moving clips between tracks
 * - Track add/delete
 *
 * @param document - The EditDocument (source of truth)
 * @param clipId - The clip to resolve
 * @param context - Resolution context with cached values for efficiency
 * @returns Resolved clip with location, or null if clip not found
 */
export function resolveClip(document: EditDocument, clipId: string, context: SingleClipContext): ResolveClipResult | null {
	// 1. Locate clip in document
	const lookup = document.getClipById(clipId);
	if (!lookup) {
		return null;
	}

	const { clip, trackIndex, clipIndex } = lookup;
	const internalClip = clip as InternalClip;

	// 2. Resolve the single clip using first-pass logic
	const resolvedClip = resolveClipFirstPass(internalClip, context.previousClipEnd, context);

	// 3. Handle "end" length (second pass for this single clip)
	if (resolvedClip.pendingEndLength && context.cachedTimelineEnd !== undefined) {
		resolvedClip.length = sec(Math.max(context.cachedTimelineEnd - resolvedClip.start, 0.1));
	}

	// 4. Clean up and return
	return {
		resolved: cleanupPendingFlags(resolvedClip),
		trackIndex,
		clipIndex
	};
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolve an EditDocument to a ResolvedEdit.
 *
 * This is a pure function - given the same document and context, it always
 * produces the same output. No side effects, no mutations.
 */
export function resolve(document: EditDocument, context: ResolveContext): ResolvedEdit {
	const partialTracks: Array<{ clips: PartialResolvedClip[] }> = [];

	// First pass: resolve "auto" starts (sequential dependency within track)
	for (let t = 0; t < document.getTrackCount(); t += 1) {
		const resolvedClips: PartialResolvedClip[] = [];
		const trackClips = document.getClipsInTrack(t) as InternalClip[];

		for (let c = 0; c < trackClips.length; c += 1) {
			const clip = trackClips[c];
			const previousClip = resolvedClips[c - 1];
			const previousClipEnd = previousClip ? sec(previousClip.start + previousClip.length) : sec(0);

			const resolvedClip = resolveClipFirstPass(clip, previousClipEnd, context);
			resolvedClips.push(resolvedClip);
		}

		partialTracks.push({ clips: resolvedClips });
	}

	// Second pass: resolve "end" lengths (needs full timeline context)
	const timelineEnd = calculateTimelineEndFromTracks(partialTracks);

	const tracks: ResolvedTrack[] = partialTracks.map(track => ({
		clips: track.clips.map(clip => {
			if (clip.pendingEndLength) {
				// Resolve "end" length now that we know the timeline end
				const resolvedLength = sec(Math.max(timelineEnd - clip.start, 0.1));
				return cleanupPendingFlags({ ...clip, length: resolvedLength });
			}
			return cleanupPendingFlags(clip);
		})
	}));

	return {
		timeline: {
			background: document.getBackground(),
			tracks,
			fonts: document.getFonts()
		},
		output: document.getOutput()
	};
}
