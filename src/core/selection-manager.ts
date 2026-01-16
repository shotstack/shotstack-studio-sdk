/**
 * SelectionManager - Manages clip selection and clipboard state.
 *
 * Extracted from Edit to reduce God Class complexity.
 * Handles selection state, clipboard operations, and related events.
 */

import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip } from "@core/schemas";
import { ms, toSec } from "@core/timing/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CopiedClip {
	trackIndex: number;
	clipConfiguration: ResolvedClip;
}

export interface SelectedClipInfo {
	trackIndex: number;
	clipIndex: number;
	player: Player;
}

// ─── Context Interface ────────────────────────────────────────────────────────

/**
 * Context interface for SelectionManager dependencies.
 * Allows the manager to interact with Edit without tight coupling.
 */
export interface SelectionContext {
	getTracks(): Player[][];
	getEvents(): EventEmitter;
	getPlayerClip(trackIndex: number, clipIndex: number): Player | null;
	getResolvedClip(trackIndex: number, clipIndex: number): ResolvedClip | null;
	addClip(trackIndex: number, clip: ResolvedClip): void | Promise<void>;
	getPlaybackTime(): number;
	isExporting(): boolean;
}

// ─── SelectionManager ─────────────────────────────────────────────────────────

export class SelectionManager {
	private selectedClip: Player | null = null;
	private copiedClip: CopiedClip | null = null;

	constructor(private readonly context: SelectionContext) {}

	// ─── Selection ────────────────────────────────────────────────────────────

	/**
	 * Select a clip by track and clip index.
	 */
	selectClip(trackIndex: number, clipIndex: number): void {
		const player = this.context.getPlayerClip(trackIndex, clipIndex);
		if (player) {
			this.selectedClip = player;
			const clip = this.context.getResolvedClip(trackIndex, clipIndex);
			if (clip) {
				this.context.getEvents().emit(EditEvent.ClipSelected, {
					clip,
					trackIndex,
					clipIndex
				});
			}
		}
	}

	/**
	 * Select a player directly.
	 */
	selectPlayer(player: Player): void {
		const indices = this.findClipIndices(player);
		if (indices) {
			this.selectClip(indices.trackIndex, indices.clipIndex);
		}
	}

	/**
	 * Clear the current selection.
	 */
	clearSelection(): void {
		this.selectedClip = null;
		this.context.getEvents().emit(EditEvent.SelectionCleared);
	}

	/**
	 * Check if a specific clip is selected by indices.
	 */
	isClipSelected(trackIndex: number, clipIndex: number): boolean {
		if (!this.selectedClip) return false;

		const selectedTrackIndex = this.selectedClip.layer - 1;
		const tracks = this.context.getTracks();
		const track = tracks[selectedTrackIndex];
		if (!track) return false;

		const selectedClipIndex = track.indexOf(this.selectedClip);
		return trackIndex === selectedTrackIndex && clipIndex === selectedClipIndex;
	}

	/**
	 * Check if a specific player is selected.
	 */
	isPlayerSelected(player: Player): boolean {
		if (this.context.isExporting()) return false;
		return this.selectedClip === player;
	}

	/**
	 * Get information about the selected clip.
	 */
	getSelectedClipInfo(): SelectedClipInfo | null {
		if (!this.selectedClip) return null;

		const trackIndex = this.selectedClip.layer - 1;
		const tracks = this.context.getTracks();
		const track = tracks[trackIndex];
		if (!track) return null; // Track was deleted

		const clipIndex = track.indexOf(this.selectedClip);
		return { trackIndex, clipIndex, player: this.selectedClip };
	}

	/**
	 * Get the selected player (for internal use).
	 */
	getSelectedClip(): Player | null {
		return this.selectedClip;
	}

	/**
	 * Set the selected player directly (for internal use by commands).
	 */
	setSelectedClip(clip: Player | null): void {
		this.selectedClip = clip;
	}

	// ─── Clipboard ────────────────────────────────────────────────────────────

	/**
	 * Copy a clip to the internal clipboard.
	 */
	copyClip(trackIdx: number, clipIdx: number): void {
		const clip = this.context.getResolvedClip(trackIdx, clipIdx);
		if (clip) {
			this.copiedClip = {
				trackIndex: trackIdx,
				clipConfiguration: structuredClone(clip)
			};
			this.context.getEvents().emit(EditEvent.ClipCopied, { trackIndex: trackIdx, clipIndex: clipIdx });
		}
	}

	/**
	 * Paste the copied clip at the current playhead position.
	 */
	pasteClip(): void {
		if (!this.copiedClip) return;

		const pastedClip = structuredClone(this.copiedClip.clipConfiguration);
		pastedClip.start = toSec(ms(this.context.getPlaybackTime())); // Paste at playhead position

		// Remove ID so document generates a new one (otherwise reconciler
		// would see duplicate IDs and update instead of create)
		delete (pastedClip as { id?: string }).id;

		this.context.addClip(this.copiedClip.trackIndex, pastedClip);
	}

	/**
	 * Check if there is a clip in the clipboard.
	 */
	hasCopiedClip(): boolean {
		return this.copiedClip !== null;
	}

	// ─── Helpers ──────────────────────────────────────────────────────────────

	/**
	 * Find the track and clip indices for a given player.
	 */
	findClipIndices(player: Player): { trackIndex: number; clipIndex: number } | null {
		const tracks = this.context.getTracks();
		for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
			const clipIndex = tracks[trackIndex].indexOf(player);
			if (clipIndex !== -1) {
				return { trackIndex, clipIndex };
			}
		}
		return null;
	}
}
