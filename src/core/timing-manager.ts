/**
 * TimingManager - Manages timing resolution for clips with "auto", "end", and alias references.
 * Handles dependency graph construction, topological sorting, and propagation of timing changes.
 */

import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import {
	buildAliasPlayerMap,
	buildClipIdMap,
	buildTimingDependencies,
	detectCircularReferences,
	topologicalSort
} from "@core/timing/alias-resolution";
import { calculateTimelineEnd, resolveAutoLength, resolveAutoStart, resolveEndLength } from "@core/timing/resolver";
import { type AliasReference, type Seconds, isAliasReference, parseAliasName, sec } from "@core/timing/types";

import type { Edit } from "./edit-session";

// ─── TimingManager ────────────────────────────────────────────────────────────

export class TimingManager {
	private cachedTimelineEnd: Seconds = sec(0);

	constructor(private readonly edit: Edit) {}

	// ─── Timeline End Cache ──────────────────────────────────────────────────

	/**
	 * Get the cached timeline end (excluding "end" clips).
	 */
	getTimelineEnd(): Seconds {
		return this.cachedTimelineEnd;
	}

	/**
	 * Invalidate the timeline end cache.
	 * Call when clips are added/removed or timing changes.
	 * @internal
	 */
	invalidateTimelineEndCache(): void {
		this.cachedTimelineEnd = sec(0);
	}

	// ─── Full Resolution ─────────────────────────────────────────────────────

	/**
	 * Resolve timing for all clips in topological order.
	 * Handles "auto", "end", and alias references.
	 */
	async resolveAllTiming(): Promise<void> {
		const tracks = this.edit.getTracks();

		// 1. Build alias infrastructure and validate uniqueness
		buildAliasPlayerMap(tracks); // Throws if duplicate aliases found
		const dependencies = buildTimingDependencies(tracks);

		// 2. Check for circular references
		if (dependencies.size > 0) {
			const cycle = detectCircularReferences(dependencies);
			if (cycle) {
				throw new Error(`Circular alias reference detected: ${cycle.join(" -> ")}`);
			}
		}

		// 3. Build clip ID map for lookup
		const clipIdMap = buildClipIdMap(tracks);

		// 4. Topologically sort clip IDs (dependencies resolve first)
		const allClipIds = new Set(clipIdMap.keys());
		const resolveOrder = topologicalSort(dependencies, allClipIds);

		// 5. Map alias names to their clip IDs for lookup during resolution
		const aliasToClipId = new Map<string, string>();
		for (const [clipId, entry] of clipIdMap) {
			const { alias } = entry.player.clipConfiguration;
			if (alias) {
				aliasToClipId.set(alias, clipId);
			}
		}

		// 6. Resolve timing in topological order
		const resolvedAliases = new Map<string, { start: Seconds; length: Seconds }>();

		for (const clipId of resolveOrder) {
			const entry = clipIdMap.get(clipId);
			// Skip if this is an alias name rather than a clip ID
			if (!entry) {
				// eslint-disable-next-line no-continue
				continue;
			}

			const { player, trackIdx, clipIdx } = entry;
			const intent = player.getTimingIntent();

			// Resolve start
			let resolvedStart: Seconds;
			if (intent.start === "auto") {
				resolvedStart = resolveAutoStart(trackIdx, clipIdx, tracks);
			} else if (isAliasReference(intent.start)) {
				const aliasName = parseAliasName(intent.start as AliasReference);
				const aliasValue = resolvedAliases.get(aliasName);
				if (!aliasValue) {
					throw new Error(`Alias "${aliasName}" not found or not yet resolved. Available: ${[...resolvedAliases.keys()].join(", ") || "none"}`);
				}
				resolvedStart = aliasValue.start;
			} else {
				resolvedStart = intent.start as Seconds;
			}

			// Resolve length
			let resolvedLength: Seconds;
			if (intent.length === "auto") {
				resolvedLength = await resolveAutoLength(player.clipConfiguration.asset);
			} else if (intent.length === "end") {
				// Placeholder - will be resolved in second pass
				resolvedLength = sec(0);
			} else if (isAliasReference(intent.length)) {
				const aliasName = parseAliasName(intent.length as AliasReference);
				const aliasValue = resolvedAliases.get(aliasName);
				if (!aliasValue) {
					throw new Error(`Alias "${aliasName}" not found or not yet resolved. Available: ${[...resolvedAliases.keys()].join(", ") || "none"}`);
				}
				resolvedLength = aliasValue.length;
			} else {
				resolvedLength = intent.length as Seconds;
			}

			player.setResolvedTiming({ start: resolvedStart, length: resolvedLength });

			// Store resolved values if this clip has an alias
			const { alias } = player.clipConfiguration;
			if (alias) {
				resolvedAliases.set(alias, { start: resolvedStart, length: resolvedLength });
			}
		}

		// 7. Second pass: resolve "end" clips now that we know the timeline end
		const timelineEnd = calculateTimelineEnd(tracks);
		this.cachedTimelineEnd = timelineEnd;

		const endLengthClips = this.getEndLengthClips();
		for (const clip of endLengthClips) {
			const resolved = clip.getResolvedTiming();
			clip.setResolvedTiming({
				start: resolved.start,
				length: resolveEndLength(resolved.start, timelineEnd)
			});
		}

		// After timing is resolved, reconfigure ALL "end" clips to rebuild keyframes
		for (const clip of endLengthClips) {
			clip.reconfigureAfterRestore();
		}
	}

	// ─── Propagation ─────────────────────────────────────────────────────────

	/**
	 * Propagate timing changes through the track.
	 * Updates "auto" start clips and "end" length clips.
	 */
	propagateTimingChanges(trackIndex: number, startFromClipIndex: number): void {
		const tracks = this.edit.getTracks();
		const track = tracks[trackIndex];
		if (!track) return;

		// Include the clip itself (not just subsequent clips) so auto start on first clip resolves to 0
		for (let i = Math.max(0, startFromClipIndex); i < track.length; i += 1) {
			const clip = track[i];
			if (clip.getTimingIntent().start === "auto") {
				const newStart = resolveAutoStart(trackIndex, i, tracks);
				clip.setResolvedTiming({
					start: newStart,
					length: clip.getLength()
				});
				clip.reconfigureAfterRestore();
			}
		}

		// Propagate alias changes (clips referencing other clips via alias)
		this.propagateAliasChanges();

		const newTimelineEnd = calculateTimelineEnd(tracks);
		if (newTimelineEnd !== this.cachedTimelineEnd) {
			this.cachedTimelineEnd = newTimelineEnd;

			const endLengthClips = this.getEndLengthClips();
			for (const clip of endLengthClips) {
				const newLength = resolveEndLength(clip.getStart(), newTimelineEnd);
				const currentLength = clip.getLength();

				if (Math.abs(newLength - currentLength) > 0.001) {
					clip.setResolvedTiming({
						start: clip.getStart(),
						length: newLength
					});
					clip.reconfigureAfterRestore();
				}
			}
		}

		this.edit.updateTotalDuration();

		// Notify Timeline to update visuals with new timing (use resolved values)
		this.edit.events.emit(EditEvent.TimelineUpdated, {
			current: this.edit.getResolvedEdit()
		});
	}

	/**
	 * Propagate alias changes when a clip's timing changes.
	 * Clips referencing the changed clip via "alias://x" will be updated.
	 */
	private propagateAliasChanges(): void {
		const tracks = this.edit.getTracks();

		// 1. Build current alias values from resolved timing
		const aliasValues = new Map<string, { start: Seconds; length: Seconds }>();
		for (const track of tracks) {
			for (const player of track) {
				const { alias } = player.clipConfiguration;
				if (alias) {
					aliasValues.set(alias, {
						start: player.getStart(),
						length: player.getLength()
					});
				}
			}
		}

		// 2. Update clips that depend on aliases
		for (const track of tracks) {
			for (const player of track) {
				const intent = player.getTimingIntent();
				let needsUpdate = false;
				let newStart = player.getStart();
				let newLength = player.getLength();

				if (isAliasReference(intent.start)) {
					const aliasName = parseAliasName(intent.start as AliasReference);
					const resolved = aliasValues.get(aliasName);
					if (resolved && Math.abs(resolved.start - newStart) > 0.001) {
						newStart = resolved.start;
						needsUpdate = true;
					}
				}

				if (isAliasReference(intent.length)) {
					const aliasName = parseAliasName(intent.length as AliasReference);
					const resolved = aliasValues.get(aliasName);
					if (resolved && Math.abs(resolved.length - newLength) > 0.001) {
						newLength = resolved.length;
						needsUpdate = true;
					}
				}

				if (needsUpdate) {
					player.setResolvedTiming({ start: newStart, length: newLength });
					player.reconfigureAfterRestore();
				}
			}
		}
	}

	// ─── Query Helpers ───────────────────────────────────────────────────────

	/**
	 * Get all clips with length: "end" intent.
	 */
	private getEndLengthClips(): Player[] {
		const tracks = this.edit.getTracks();
		const clips: Player[] = [];
		for (const track of tracks) {
			for (const clip of track) {
				if (clip.getTimingIntent().length === "end") {
					clips.push(clip);
				}
			}
		}
		return clips;
	}
}
