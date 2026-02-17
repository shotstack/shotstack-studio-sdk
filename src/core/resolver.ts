/**
 * Resolver - Pure function that transforms EditDocument → ResolvedEdit
 *
 * Resolves "auto" starts, "end" lengths, "alias://x" timing references,
 * and merge field placeholders. Preserves stable clip IDs for reconciliation.
 *
 * ## Alias System
 *
 * Clips declare `alias: "intro"` to be referenceable.
 * Other clips use `start: "alias://intro"` or `length: "alias://intro"`.
 *
 * **This file:** Resolves alias references in `start`/`length` fields to timing values.
 * **Caption resolver:** Resolves `asset.src: "alias://x"` to extract audio for transcription.
 *
 * Both share the same alias namespace (clip.alias property).
 */

import type { EditDocument } from "./edit-document";
import type { MergeFieldService } from "./merge/merge-field-service";
import type { Clip, ResolvedClip, ResolvedEdit, ResolvedTrack } from "./schemas";
import { type Seconds, sec, isAliasReference, parseAliasName } from "./timing/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolveContext {
	mergeFields: MergeFieldService;
}

/**
 * Internal clip type with stable ID.
 * The `id` field is SDK-internal (not part of Shotstack API) and used for:
 * - Player reconciliation (tracking which player belongs to which clip)
 * - Undo/redo (restoring specific clips by identity)
 * - Single-clip resolution optimization
 */
type InternalClip = Clip & { id?: string };

/** Resolved clip with guaranteed ID and pending flag */
interface PartialResolvedClip extends ResolvedClip {
	id: string;
	pendingEndLength?: boolean;
}

// ─── Alias Types ──────────────────────────────────────────────────────────────

/**
 * Resolved timing values for a clip with an alias.
 * Used during topological resolution to provide values for alias references.
 */
interface AliasValue {
	/** The resolved start time of the aliased clip */
	start: Seconds;
	/** The resolved length of the aliased clip */
	length: Seconds;
}

interface ClipLocation {
	clip: InternalClip;
	trackIndex: number;
	clipIndex: number;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Deep-resolve merge field templates in a clip.
 * Walks all properties recursively and resolves {{ FIELD }} patterns to their values.
 *
 * - Tries numeric conversion first (for timing, scale, offset, etc.)
 * - Falls back to string resolution (for text content)
 */
function resolveMergeFieldsInClip(clip: InternalClip, mergeFields: MergeFieldService): InternalClip {
	function processValue(value: unknown): unknown {
		if (typeof value === "string" && mergeFields.isMergeFieldTemplate(value)) {
			const num = mergeFields.resolveToNumber(value);
			return num !== null ? num : mergeFields.resolve(value);
		}
		if (Array.isArray(value)) {
			return value.map(processValue);
		}
		if (value !== null && typeof value === "object") {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) {
				result[k] = processValue(v);
			}
			return result;
		}
		return value;
	}

	return processValue(structuredClone(clip)) as InternalClip;
}

/**
 * Build a map of dependencies for topological sorting.
 * Includes both alias dependencies AND implicit "auto" start dependencies.
 */
function buildDependencyGraph(document: EditDocument): {
	dependencies: Map<string, Set<string>>;
	clipsByAlias: Map<string, ClipLocation>;
	allClips: Array<ClipLocation & { id: string }>;
} {
	const dependencies = new Map<string, Set<string>>();
	const clipsByAlias = new Map<string, ClipLocation>();
	const allClips: Array<ClipLocation & { id: string }> = [];

	// First pass: collect all clips and build alias map
	for (let t = 0; t < document.getTrackCount(); t += 1) {
		const trackClips = document.getClipsInTrack(t) as InternalClip[];

		for (let c = 0; c < trackClips.length; c += 1) {
			const clip = trackClips[c];
			if (!clip.id) {
				throw new Error(`Clip at track ${t}, index ${c} is missing an ID. EditDocument hydration may have been skipped.`);
			}
			const clipId = clip.alias ?? clip.id;

			const location: ClipLocation = { clip, trackIndex: t, clipIndex: c };
			allClips.push({ ...location, id: clipId });

			if (clip.alias) {
				if (clipsByAlias.has(clip.alias)) throw new Error(`Duplicate alias "${clip.alias}" found. Each alias must be unique.`);
				clipsByAlias.set(clip.alias, location);
			}
		}
	}

	// Second pass: build dependencies and validate alias references
	for (let t = 0; t < document.getTrackCount(); t += 1) {
		const trackClips = document.getClipsInTrack(t) as InternalClip[];

		for (let c = 0; c < trackClips.length; c += 1) {
			const clip = trackClips[c];
			const clipId = clip.alias ?? clip.id!;
			const deps = new Set<string>();

			if (isAliasReference(clip.start)) {
				const aliasName = parseAliasName(clip.start);
				if (!clipsByAlias.has(aliasName)) {
					throw new Error(`Alias reference "alias://${aliasName}" not found. No clip defines alias "${aliasName}".`);
				}
				deps.add(aliasName);
			}
			if (isAliasReference(clip.length)) {
				const aliasName = parseAliasName(clip.length);
				if (!clipsByAlias.has(aliasName)) {
					throw new Error(`Alias reference "alias://${aliasName}" not found. No clip defines alias "${aliasName}".`);
				}
				deps.add(aliasName);
			}

			if (clip.start === "auto" && c > 0) {
				const prevClip = trackClips[c - 1] as InternalClip;
				const prevClipId = prevClip.alias ?? prevClip.id!;
				deps.add(prevClipId);
			}

			if (deps.size > 0) {
				dependencies.set(clipId, deps);
			}
		}
	}

	return { dependencies, clipsByAlias, allClips };
}

/**
 * Detect circular references in the dependency graph.
 */
function detectCircularReferences(dependencies: Map<string, Set<string>>): string[] | null {
	const visited = new Set<string>();
	const recursionStack = new Set<string>();

	function findCycle(node: string, path: string[]): string[] | null {
		visited.add(node);
		recursionStack.add(node);

		const deps = dependencies.get(node);
		if (deps) {
			for (const dep of deps) {
				if (recursionStack.has(dep)) {
					return [...path, dep];
				}
				if (!visited.has(dep)) {
					const cycle = findCycle(dep, [...path, dep]);
					if (cycle) return cycle;
				}
			}
		}

		recursionStack.delete(node);
		return null;
	}

	for (const node of dependencies.keys()) {
		if (!visited.has(node)) {
			const cycle = findCycle(node, [node]);
			if (cycle) return cycle;
		}
	}

	return null;
}

/**
 * Topologically sort clip IDs so dependencies are resolved first.
 */
function topologicalSort(dependencies: Map<string, Set<string>>, allClipIds: string[]): string[] {
	const result: string[] = [];
	const visited = new Set<string>();

	function visit(node: string): void {
		if (visited.has(node)) return;
		visited.add(node);

		const deps = dependencies.get(node);
		if (deps) {
			for (const dep of deps) {
				visit(dep);
			}
		}

		result.push(node);
	}

	// First visit all nodes that have dependencies
	for (const node of dependencies.keys()) {
		visit(node);
	}

	// Then visit remaining clips
	for (const clipId of allClipIds) {
		visit(clipId);
	}

	return result;
}

/**
 * Resolve a single clip's timing using alias values.
 * This is called after topological sorting ensures dependencies are resolved first.
 * Note: Merge fields should be resolved via resolveMergeFieldsInClip() BEFORE calling this.
 */
function resolveClipWithAliases(clip: InternalClip, previousClipEnd: Seconds, resolvedAliases: Map<string, AliasValue>): PartialResolvedClip {
	// Resolve start
	let start: Seconds;
	if (clip.start === "auto") {
		start = previousClipEnd;
	} else if (isAliasReference(clip.start)) {
		const aliasName = parseAliasName(clip.start);
		const aliasValue = resolvedAliases.get(aliasName);
		if (!aliasValue) throw new Error(`Internal error: Alias "${aliasName}" not resolved.`);
		start = aliasValue.start;
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
		const aliasName = parseAliasName(clip.length);
		const aliasValue = resolvedAliases.get(aliasName);
		if (!aliasValue) throw new Error(`Internal error: Alias "${aliasName}" not resolved.`);
		length = aliasValue.length;
	} else {
		length = sec(clip.length as number);
	}

	return {
		...clip,
		id: clip.id ?? crypto.randomUUID(),
		start,
		length,
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

function cleanupPendingFlags(clip: PartialResolvedClip): ResolvedClip {
	const { pendingEndLength, ...cleanClip } = clip;
	return cleanClip;
}

// ─── Single-Clip Resolution ───────────────────────────────────────────────────

/** Result of single-clip resolution */
export interface ResolveClipResult {
	resolved: ResolvedClip;
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

	/**
	 * Resolved alias values for alias reference resolution.
	 */
	resolvedAliases?: Map<string, AliasValue>;
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

	// 2. Pre-process merge fields in entire clip
	const processedClip = resolveMergeFieldsInClip(internalClip, context.mergeFields);

	// 3. Resolve the single clip using alias-aware logic
	const resolvedAliases = context.resolvedAliases ?? new Map();
	const resolvedClip = resolveClipWithAliases(processedClip, context.previousClipEnd, resolvedAliases);

	// 4. Handle "end" length (second pass for this single clip)
	if (resolvedClip.pendingEndLength && context.cachedTimelineEnd !== undefined) {
		resolvedClip.length = sec(Math.max(context.cachedTimelineEnd - resolvedClip.start, 0.1));
	}

	// 5. Clean up and return
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
 *
 * Algorithm:
 * 1. Build alias dependency graph from document
 * 2. Detect circular references (throw if found)
 * 3. Topologically sort clips (dependencies resolve first)
 * 4. Resolve clips in order, building alias values map
 * 5. Second pass: resolve "end" lengths (needs full timeline context)
 */
export function resolve(document: EditDocument, context: ResolveContext): ResolvedEdit {
	// Build dependency graph for alias resolution
	const { dependencies, allClips } = buildDependencyGraph(document);

	// Detect circular references
	if (dependencies.size > 0) {
		const cycle = detectCircularReferences(dependencies);
		if (cycle) {
			throw new Error(`Circular alias reference detected: ${cycle.join(" -> ")}`);
		}
	}

	// Topologically sort clips (dependencies resolve first)
	const allClipIds = allClips.map(c => c.id);
	const resolveOrder = topologicalSort(dependencies, allClipIds);

	// Build clip lookup by ID
	const clipById = new Map<string, ClipLocation & { id: string }>();
	for (const clipInfo of allClips) {
		clipById.set(clipInfo.id, clipInfo);
	}

	// Use a Map to collect resolved clips by position
	const resolvedClipsByPosition = new Map<string, PartialResolvedClip>();

	// Track resolved aliases
	const resolvedAliases = new Map<string, AliasValue>();

	// Track previous clip end per track for "auto" start resolution
	const previousClipEndByTrack = new Map<number, Seconds>();

	// Resolve clips in topological order
	for (const clipId of resolveOrder) {
		const clipInfo = clipById.get(clipId);
		if (clipInfo) {
			const { clip, trackIndex, clipIndex } = clipInfo;

			// Pre-process merge fields in entire clip
			const processedClip = resolveMergeFieldsInClip(clip, context.mergeFields);

			// Get previous clip end for this track (for "auto" start)
			const previousClipEnd = previousClipEndByTrack.get(trackIndex) ?? sec(0);

			// Resolve the clip with alias support
			const resolvedClip = resolveClipWithAliases(processedClip, previousClipEnd, resolvedAliases);

			// Store in map by position key
			resolvedClipsByPosition.set(`${trackIndex}-${clipIndex}`, resolvedClip);

			// Update previous clip end for this track
			const clipEnd = sec(resolvedClip.start + resolvedClip.length);
			const existingEnd = previousClipEndByTrack.get(trackIndex) ?? sec(0);
			if (clipEnd > existingEnd) {
				previousClipEndByTrack.set(trackIndex, clipEnd);
			}

			// Store resolved alias value if this clip has an alias
			if (clip.alias) {
				resolvedAliases.set(clip.alias, {
					start: resolvedClip.start,
					length: resolvedClip.length
				});
			}
		}
	}

	// Rebuild contiguous arrays from the map (preserves document order)
	const partialTracks: Array<{ clips: PartialResolvedClip[] }> = [];
	for (let t = 0; t < document.getTrackCount(); t += 1) {
		const trackClipCount = document.getClipsInTrack(t).length;
		const clips: PartialResolvedClip[] = [];
		for (let c = 0; c < trackClipCount; c += 1) {
			const clip = resolvedClipsByPosition.get(`${t}-${c}`);
			if (!clip) {
				throw new Error(`Internal error: Clip at track ${t}, index ${c} was not resolved.`);
			}
			clips.push(clip);
		}
		partialTracks.push({ clips });
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
