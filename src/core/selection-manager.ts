/**
 * SelectionManager - Manages clip selection and clipboard state.
 * Handles selection state, clipboard operations, and related events.
 */

import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@core/schemas";
import { stripInternalProperties } from "@core/shared/clip-utils";

import type { Edit } from "./edit-session";

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

// ─── SelectionManager ─────────────────────────────────────────────────────────

export class SelectionManager {
	private selectedClip: Player | null = null;
	private copiedClip: CopiedClip | null = null;

	constructor(private readonly edit: Edit) {}

	// ─── Selection ────────────────────────────────────────────────────────────

	/**
	 * Select a clip by track and clip index.
	 */
	selectClip(trackIndex: number, clipIndex: number): void {
		const player = this.edit.getPlayerClip(trackIndex, clipIndex);
		if (player) {
			this.selectedClip = player;
			const clip = this.edit.getDocumentClip(trackIndex, clipIndex);
			if (clip) {
				this.edit.events.emit(EditEvent.ClipSelected, {
					clip: stripInternalProperties(clip),
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
		this.edit.events.emit(EditEvent.SelectionCleared);
	}

	/**
	 * Check if a specific clip is selected by indices.
	 */
	isClipSelected(trackIndex: number, clipIndex: number): boolean {
		if (!this.selectedClip) return false;

		const selectedTrackIndex = this.selectedClip.layer - 1;
		const tracks = this.edit.getTracks();
		const track = tracks[selectedTrackIndex];
		if (!track) return false;

		const selectedClipIndex = track.indexOf(this.selectedClip);
		return trackIndex === selectedTrackIndex && clipIndex === selectedClipIndex;
	}

	/**
	 * Check if a specific player is selected.
	 */
	isPlayerSelected(player: Player): boolean {
		if (this.edit.isInExportMode()) return false;
		return this.selectedClip === player;
	}

	/**
	 * Get information about the selected clip.
	 */
	getSelectedClipInfo(): SelectedClipInfo | null {
		if (!this.selectedClip) return null;

		const trackIndex = this.selectedClip.layer - 1;
		const tracks = this.edit.getTracks();
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
		const clip = this.edit.getResolvedClip(trackIdx, clipIdx);
		if (clip) {
			this.copiedClip = {
				trackIndex: trackIdx,
				clipConfiguration: structuredClone(clip)
			};
			this.edit.events.emit(EditEvent.ClipCopied, { trackIndex: trackIdx, clipIndex: clipIdx });
		}
	}

	/**
	 * Paste the copied clip at the current playhead position.
	 */
	pasteClip(): void {
		if (!this.copiedClip) return;

		const pastedClip = structuredClone(this.copiedClip.clipConfiguration);
		pastedClip.start = this.edit.playbackTime;

		// Remove ID so document generates a new one (otherwise reconciler
		// would see duplicate IDs and update instead of create)
		delete (pastedClip as { id?: string }).id;

		this.edit.addClip(this.copiedClip.trackIndex, pastedClip);
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
		const tracks = this.edit.getTracks();
		for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
			const clipIndex = tracks[trackIndex].indexOf(player);
			if (clipIndex !== -1) {
				return { trackIndex, clipIndex };
			}
		}
		return null;
	}
}
