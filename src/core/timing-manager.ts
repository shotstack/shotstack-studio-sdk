/**
 * TimingManager - Handles async timing resolution and propagation.
 */

import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { calculateTimelineEnd, resolveAutoStart, resolveEndLength } from "@core/timing/resolver";
import { type Seconds, isAliasReference, sec } from "@core/timing/types";

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
	 * Resolve timing for all clips, syncing with the resolver's output.
	 */
	async resolveAllTiming(): Promise<void> {
		const tracks = this.edit.getTracks();
		const resolved = this.edit.getResolvedEdit();

		// Apply resolved timing from the resolver to Players
		for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
			const track = tracks[trackIdx];
			const resolvedTrack = resolved.timeline.tracks[trackIdx];

			for (let clipIdx = 0; clipIdx < track.length; clipIdx += 1) {
				const player = track[clipIdx];
				const resolvedClip = resolvedTrack?.clips[clipIdx];

				if (resolvedClip) {
					const previousStart = player.getStart();
					const previousLength = player.getLength();
					const resolvedStart = resolvedClip.start;
					const resolvedLength = resolvedClip.length;

					player.setResolvedTiming({ start: resolvedStart, length: resolvedLength });
					if (resolvedStart !== previousStart || resolvedLength !== previousLength) {
						player.reconfigureAfterRestore();
					}
				}
			}
		}

		// Calculate timeline end and cache it
		const timelineEnd = calculateTimelineEnd(tracks);
		this.cachedTimelineEnd = timelineEnd;
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
				const newLength = resolveEndLength(newTimelineEnd, clip.getStart());
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

		// Notify SDK consumers of timeline changes
		this.edit.getInternalEvents().emit(EditEvent.TimelineUpdated, {
			current: this.edit.getEdit()
		});
	}

	/**
	 * Propagate alias changes when a clip's timing changes.
	 *
	 * Delegates to the resolver's output for alias values, then updates Players
	 * that have alias references.
	 */
	private propagateAliasChanges(): void {
		const tracks = this.edit.getTracks();
		const resolved = this.edit.getResolvedEdit();

		// Update Players with alias references using resolved values
		for (let trackIdx = 0; trackIdx < tracks.length; trackIdx += 1) {
			const track = tracks[trackIdx];
			const resolvedTrack = resolved.timeline.tracks[trackIdx];

			for (let clipIdx = 0; clipIdx < track.length; clipIdx += 1) {
				const player = track[clipIdx];
				const resolvedClip = resolvedTrack?.clips[clipIdx];
				const intent = player.getTimingIntent();

				// Only update if this clip has alias references
				const hasAliasStart = isAliasReference(intent.start);
				const hasAliasLength = isAliasReference(intent.length);

				if ((hasAliasStart || hasAliasLength) && resolvedClip) {
					const currentStart = player.getStart();
					const currentLength = player.getLength();

					// Check if values differ from resolver's output
					const startDiffers = Math.abs(resolvedClip.start - currentStart) > 0.001;
					const lengthDiffers = Math.abs(resolvedClip.length - currentLength) > 0.001;

					if (startDiffers || lengthDiffers) {
						player.setResolvedTiming({
							start: resolvedClip.start,
							length: resolvedClip.length
						});
						player.reconfigureAfterRestore();
					}
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
