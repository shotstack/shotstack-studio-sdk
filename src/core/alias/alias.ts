import type { Clip , Edit } from "@schemas";

const ALIAS_REFERENCE_REGEX = /^alias:\/\/([a-zA-Z0-9_-]+)$/;

function forEachClip(edit: Edit, fn: (clip: Clip, trackIdx: number, clipIdx: number) => void): void {
	for (let t = 0; t < edit.timeline.tracks.length; t += 1) {
		const track = edit.timeline.tracks[t];
		for (let c = 0; c < track.clips.length; c += 1) {
			fn(track.clips[c], t, c);
		}
	}
}

function parseAliasReference(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const match = value.match(ALIAS_REFERENCE_REGEX);
	return match ? match[1] : null;
}

function extractClipAliases(edit: Edit): Record<string, Clip> {
	const aliases: Record<string, Clip> = {};

	forEachClip(edit, (clip, trackIdx, clipIdx) => {
		if (clip.alias) {
			if (aliases[clip.alias]) {
				console.warn(`Duplicate alias "${clip.alias}" at track ${trackIdx}, clip ${clipIdx} - overwriting previous`);
			}
			aliases[clip.alias] = clip;
		}
	});

	return aliases;
}

function buildAliasDependencyGraph(edit: Edit): Map<string, Set<string>> {
	const dependencies = new Map<string, Set<string>>();

	forEachClip(edit, (clip, trackIdx, clipIdx) => {
		const clipId = clip.alias ?? `t${trackIdx}c${clipIdx}`;
		const deps = new Set<string>();

		const startAlias = parseAliasReference(clip.start);
		if (startAlias) deps.add(startAlias);

		const lengthAlias = parseAliasReference(clip.length);
		if (lengthAlias) deps.add(lengthAlias);

		if (deps.size > 0) {
			dependencies.set(clipId, deps);
		}
	});

	return dependencies;
}

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

function topologicalSort(dependencies: Map<string, Set<string>>, aliases: Record<string, Clip>): string[] {
	const result: string[] = [];
	const visited = new Set<string>();
	const allClipIds = new Set([...dependencies.keys(), ...Object.keys(aliases)]);

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

	for (const node of allClipIds) {
		visit(node);
	}

	return result;
}

export function resolveAliasReferences(edit: Edit): void {
	const dependencies = buildAliasDependencyGraph(edit);
	if (dependencies.size === 0) return;

	const cycle = detectCircularReferences(dependencies);
	if (cycle) {
		throw new Error(`Circular alias reference detected: ${cycle.join(" -> ")}`);
	}

	const aliases = extractClipAliases(edit);
	const clipMap = new Map<string, Clip>();

	forEachClip(edit, (clip, trackIdx, clipIdx) => {
		const clipId = clip.alias ?? `t${trackIdx}c${clipIdx}`;
		clipMap.set(clipId, clip);
	});

	const resolveOrder = topologicalSort(dependencies, aliases);

	for (const clipId of resolveOrder) {
		const clip = clipMap.get(clipId);
		if (clip) {
			const startAliasName = parseAliasReference(clip.start);
			if (startAliasName) {
				const targetClip = aliases[startAliasName];
				if (!targetClip) {
					throw new Error(`Alias "${startAliasName}" not found. Available: ${Object.keys(aliases).join(", ") || "none"}`);
				}
				if (typeof targetClip.start !== "number") {
					throw new Error(`Cannot resolve alias "${startAliasName}": target has unresolved start`);
				}
				(clip as { start: number }).start = targetClip.start;
			}

			const lengthAliasName = parseAliasReference(clip.length);
			if (lengthAliasName) {
				const targetClip = aliases[lengthAliasName];
				if (!targetClip) {
					throw new Error(`Alias "${lengthAliasName}" not found. Available: ${Object.keys(aliases).join(", ") || "none"}`);
				}
				if (typeof targetClip.length !== "number") {
					throw new Error(`Cannot resolve alias "${lengthAliasName}": target has unresolved length`);
				}
				(clip as { length: number }).length = targetClip.length;
			}
		}
	}
}
