/**
 * Alias Resolution Utilities
 *
 * Provides functions to build dependency graphs and topologically sort clips
 * for alias reference resolution. Used by resolveAllTiming() to resolve
 * "alias://clipName" references at runtime.
 */

import type { Player } from "@canvas/players/player";

import { type AliasReference, type Seconds, isAliasReference, parseAliasName } from "./types";

/**
 * Build a map of alias name → Player for quick lookup.
 */
export function buildAliasPlayerMap(tracks: Player[][]): Map<string, Player> {
	const map = new Map<string, Player>();

	for (const track of tracks) {
		for (const player of track) {
			const { alias } = player.clipConfiguration;
			if (alias) {
				if (map.has(alias)) {
					throw new Error(`Duplicate alias "${alias}" found. Each alias must be unique.`);
				}
				map.set(alias, player);
			}
		}
	}

	return map;
}

/**
 * Build a dependency graph from players based on alias references.
 * Returns a Map where key = effectiveId (alias or fallback), value = Set of alias names it depends on.
 *
 * IMPORTANT: Uses the clip's alias as its ID if available, matching how dependencies reference clips.
 * This ensures "alias://image" references can find the clip with alias="image".
 */
export function buildTimingDependencies(tracks: Player[][]): Map<string, Set<string>> {
	const dependencies = new Map<string, Set<string>>();

	for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
		for (let clipIdx = 0; clipIdx < tracks[trackIdx].length; clipIdx += 1) {
			const player = tracks[trackIdx][clipIdx];
			// Use alias as ID if available (matches how dependencies reference clips)
			const { alias } = player.clipConfiguration;
			const effectiveId = alias ?? `t${trackIdx}c${clipIdx}`;
			const deps = new Set<string>();

			const intent = player.getTimingIntent();

			if (isAliasReference(intent.start)) {
				deps.add(parseAliasName(intent.start as AliasReference));
			}

			if (isAliasReference(intent.length)) {
				deps.add(parseAliasName(intent.length as AliasReference));
			}

			if (deps.size > 0) {
				dependencies.set(effectiveId, deps);
			}
		}
	}

	return dependencies;
}

/**
 * Detect circular references in the dependency graph.
 * Returns the cycle path if found, or null if no cycles exist.
 */
export function detectCircularReferences(dependencies: Map<string, Set<string>>): string[] | null {
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
 * Returns an array of clip IDs in resolution order.
 */
export function topologicalSort(dependencies: Map<string, Set<string>>, allClipIds: Set<string>): string[] {
	const result: string[] = [];
	const visited = new Set<string>();

	function visit(node: string): void {
		if (visited.has(node)) return;
		visited.add(node);

		const deps = dependencies.get(node);
		if (deps) {
			for (const dep of deps) {
				// Only visit if the dep is a known clip ID (it might be an alias name)
				// We need to find the clip ID that has this alias
				visit(dep);
			}
		}

		result.push(node);
	}

	// First visit all nodes that have dependencies (they may depend on aliased clips)
	for (const node of dependencies.keys()) {
		visit(node);
	}

	// Then visit remaining clips (no dependencies, or aliased clips that others depend on)
	for (const clipId of allClipIds) {
		visit(clipId);
	}

	return result;
}

/**
 * Build a map of effectiveId → {player, trackIdx, clipIdx} for quick lookup.
 *
 * IMPORTANT: Uses the clip's alias as its ID if available, matching how dependencies reference clips.
 * This ensures "alias://image" references can find the clip with alias="image".
 */
export function buildClipIdMap(tracks: Player[][]): Map<string, { player: Player; trackIdx: number; clipIdx: number }> {
	const map = new Map<string, { player: Player; trackIdx: number; clipIdx: number }>();

	for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
		for (let clipIdx = 0; clipIdx < tracks[trackIdx].length; clipIdx += 1) {
			const player = tracks[trackIdx][clipIdx];
			// Use alias as ID if available (matches how dependencies reference clips)
			const { alias } = player.clipConfiguration;
			const effectiveId = alias ?? `t${trackIdx}c${clipIdx}`;
			map.set(effectiveId, { player, trackIdx, clipIdx });
		}
	}

	return map;
}

/**
 * Resolved alias timing values.
 */
export interface ResolvedAliasValue {
	start: Seconds;
	length: Seconds;
}
