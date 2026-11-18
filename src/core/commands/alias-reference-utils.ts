import type { EditDocument } from "@core/edit-document";
import { isAliasReference, parseAliasName } from "@core/timing/types";
import type { Clip, Duck, ResolvedEdit } from "@schemas";

/**
 * Stores original alias reference values for a clip.
 */
export interface StoredAliasReference {
	start?: string;
	length?: string;
	/** The clip's original `asset.duck`, before references to removed aliases were pruned. */
	duck?: unknown;
}

/**
 * Map of clipId → original alias references
 */
export type AliasReferenceMap = Map<string, StoredAliasReference>;

/**
 * Find clips referencing the given alias and convert to resolved numeric values.
 * Returns a map of clipId → original references for undo.
 *
 * @param document - The edit document
 * @param resolved - The current resolved edit state
 * @param aliasName - The alias being removed (e.g., "image" for "alias://image")
 * @param skipClipIndices - Optional set of "trackIdx:clipIdx" to skip (the clips being deleted)
 */
export function convertAliasReferencesToValues(
	document: EditDocument,
	resolved: ResolvedEdit,
	aliasName: string,
	skipClipIndices?: Set<string>
): AliasReferenceMap {
	const stored: AliasReferenceMap = new Map();
	const aliasRef = `alias://${aliasName}`;

	for (let t = 0; t < document.getTrackCount(); t += 1) {
		const clips = document.getClipsInTrack(t);
		for (let c = 0; c < clips.length; c += 1) {
			// Process clips not in the skip set
			if (!skipClipIndices?.has(`${t}:${c}`)) {
				const docClip = clips[c];
				const clipId = (docClip as { id?: string }).id;
				const resolvedClip = resolved.timeline.tracks[t]?.clips[c];

				let hasReference = false;
				const original: StoredAliasReference = {};

				if (docClip.start === aliasRef) {
					original.start = docClip.start;
					hasReference = true;
				}
				if (docClip.length === aliasRef) {
					original.length = docClip.length;
					hasReference = true;
				}

				if (hasReference && clipId && resolvedClip) {
					stored.set(clipId, original);
					// Update document with resolved numeric values
					const updates: Partial<Clip> = {};
					if (original.start) updates.start = resolvedClip.start;
					if (original.length) updates.length = resolvedClip.length;
					document.updateClip(t, c, updates);
				}
			}
		}
	}

	return stored;
}

/**
 * Convert all alias references for multiple aliases at once.
 * Used when deleting a track with multiple aliased clips.
 *
 * @param document - The edit document
 * @param resolved - The current resolved edit state
 * @param aliasNames - Array of alias names being removed
 * @param skipClipIndices - Set of "trackIdx:clipIdx" to skip (the clips being deleted)
 */
export function convertMultipleAliasReferences(
	document: EditDocument,
	resolved: ResolvedEdit,
	aliasNames: string[],
	skipClipIndices: Set<string>
): AliasReferenceMap {
	const combined: AliasReferenceMap = new Map();

	for (const aliasName of aliasNames) {
		const refs = convertAliasReferencesToValues(document, resolved, aliasName, skipClipIndices);
		for (const [clipId, original] of refs) {
			// Merge with existing (a clip might reference multiple aliases)
			const existing = combined.get(clipId);
			if (existing) {
				combined.set(clipId, { ...existing, ...original });
			} else {
				combined.set(clipId, original);
			}
		}
	}

	return combined;
}

function readDuck(asset: unknown): Duck | undefined {
	const duck = (asset as { duck?: Duck } | undefined)?.duck;
	return typeof duck?.under === "string" || Array.isArray(duck?.under) ? duck : undefined;
}

/**
 * `duck` without the alias refs that `drop` names, keeping the shape of `under`.
 * Null when no refs remain; undefined when none were dropped.
 */
function trimDuck(duck: Duck, drop: (aliasName: string) => boolean): Duck | null | undefined {
	const refs = [duck.under].flat();
	const kept = refs.filter(ref => !(isAliasReference(ref) && drop(parseAliasName(ref))));
	if (kept.length === refs.length) return undefined;
	if (kept.length === 0) return null;
	return { ...duck, under: typeof duck.under === "string" ? kept[0] : kept };
}

function withDuck(asset: object, duck: unknown): object {
	const next: { duck?: unknown } = { ...asset };
	if (duck) next.duck = duck;
	else delete next.duck;
	return next;
}

/**
 * Remove references to deleted aliases from every clip's `asset.duck.under`, dropping
 * `duck` when none remain.
 *
 * @param document - The edit document
 * @param removedAliases - Names of the aliases being removed (e.g., "voice" for "alias://voice")
 * @param stored - Map to record each pruned clip's original `duck` in, for undo
 * @param skipClipIndices - Optional set of "trackIdx:clipIdx" to skip (the clips being deleted)
 */
export function pruneDuckReferences(
	document: EditDocument,
	removedAliases: Set<string>,
	stored: AliasReferenceMap,
	skipClipIndices?: Set<string>
): void {
	for (let t = 0; t < document.getTrackCount(); t += 1) {
		const clips = document.getClipsInTrack(t);
		for (let c = 0; c < clips.length; c += 1) {
			const clip = clips[c];
			const clipId = (clip as { id?: string }).id;
			const duck = readDuck(clip.asset);

			if (clipId && duck && !skipClipIndices?.has(`${t}:${c}`)) {
				const pruned = trimDuck(duck, name => removedAliases.has(name));
				if (pruned !== undefined) {
					const existing = stored.get(clipId);
					stored.set(clipId, { ...existing, duck: structuredClone(duck) });
					document.updateClip(t, c, { asset: withDuck(clip.asset, pruned) as Clip["asset"] });
				}
			}
		}
	}
}

/**
 * Remove references to aliases that `knownAliases` lacks from a pasted clip's
 * `asset.duck.under`, dropping `duck` when none remain. Edits `clip` in place.
 */
export function pruneMissingDuckReferences(clip: Clip, knownAliases: Set<string>): void {
	const duck = readDuck(clip.asset);
	const pruned = duck ? trimDuck(duck, name => !knownAliases.has(name)) : undefined;
	if (pruned === undefined) return;

	Object.assign(clip, { asset: withDuck(clip.asset, pruned) });
}

/**
 * Restore original alias references after undoing deletion.
 *
 * @param document - The edit document
 * @param convertedReferences - Map of clipId → original alias references
 */
export function restoreAliasReferences(document: EditDocument, convertedReferences: AliasReferenceMap): void {
	for (const [clipId, original] of convertedReferences) {
		const clipInfo = document.getClipById(clipId);
		if (clipInfo) {
			const updates: Partial<Clip> = {};
			if (original.start) updates.start = original.start;
			if (original.length) updates.length = original.length;
			if (original.duck) updates.asset = withDuck(clipInfo.clip.asset, original.duck) as Clip["asset"];
			document.updateClip(clipInfo.trackIndex, clipInfo.clipIndex, updates);
		}
	}
}

/**
 * Extract alias names from an array of clips.
 *
 * @param clips - Array of clips to check for aliases
 * @returns Array of alias names found
 */
export function extractAliasNames(clips: Clip[]): string[] {
	const aliases: string[] = [];
	for (const clip of clips) {
		const { alias } = clip as { alias?: string };
		if (alias) {
			aliases.push(alias);
		}
	}
	return aliases;
}

/** Names of every alias defined in the document. */
export function documentAliasNames(document: EditDocument | null): Set<string> {
	return new Set(document?.getTracks().flatMap(track => extractAliasNames(track.clips)));
}
