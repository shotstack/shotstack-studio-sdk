import type { EditDocument } from "@core/edit-document";
import type { Clip, ResolvedEdit } from "@schemas";

/**
 * Stores original alias reference values for a clip.
 */
export interface StoredAliasReference {
	start?: string;
	length?: string;
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
