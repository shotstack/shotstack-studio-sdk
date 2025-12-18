import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import type { ResolvedClip } from "@schemas/clip";
import type { ResolvedTrack } from "@schemas/track";

import type { TrackState, ClipState, ViewportState, PlaybackState } from "../../timeline.types";

type ClipVisualState = "normal" | "selected" | "dragging" | "resizing";

/** Simplified state manager - only holds UI state, derives data from Edit */
export class TimelineStateManager {
	// UI-only state (not in Edit)
	private viewport: ViewportState;
	private clipVisualStates = new Map<string, ClipVisualState>();

	// Luma attachment map: contentPlayer → lumaPlayer (stable across index changes)
	private lumaAttachments = new Map<Player, Player>();

	// Track which content Players have visible lumas for editing
	private lumaEditingVisible = new Set<Player>();

	constructor(
		private readonly edit: Edit,
		initialViewport: Partial<ViewportState> = {}
	) {
		this.viewport = {
			scrollX: 0,
			scrollY: 0,
			pixelsPerSecond: initialViewport.pixelsPerSecond ?? 50,
			width: initialViewport.width ?? 800,
			height: initialViewport.height ?? 400
		};
	}

	// ========== Derived from Edit (no caching) ==========

	public getTracks(): TrackState[] {
		const resolvedEdit = this.edit.getResolvedEdit();
		if (!resolvedEdit?.timeline?.tracks) return [];

		return resolvedEdit.timeline.tracks.map((track: ResolvedTrack, trackIndex: number) => {
			const clips = (track.clips || []).map((clip: ResolvedClip, clipIndex: number) => this.createClipState(clip, trackIndex, clipIndex));

			// Derive primary asset type from first clip
			const primaryAssetType = clips.length > 0 && clips[0].config.asset ? clips[0].config.asset.type || "unknown" : "empty";

			return {
				index: trackIndex,
				clips,
				primaryAssetType
			};
		});
	}

	public getPlayback(): PlaybackState {
		return {
			time: this.edit.playbackTime,
			isPlaying: this.edit.isPlaying,
			duration: this.edit.totalDuration
		};
	}

	public getClipAt(trackIndex: number, clipIndex: number): ClipState | undefined {
		const tracks = this.getTracks();
		return tracks[trackIndex]?.clips.find(c => c.clipIndex === clipIndex);
	}

	// ========== UI State (local only) ==========

	public getViewport(): ViewportState {
		return this.viewport;
	}

	public setViewport(updates: Partial<ViewportState>): void {
		this.viewport = { ...this.viewport, ...updates };
	}

	public setPixelsPerSecond(pps: number): void {
		this.viewport.pixelsPerSecond = Math.max(10, Math.min(200, pps));
	}

	public setScroll(scrollX: number, scrollY: number): void {
		this.viewport.scrollX = scrollX;
		this.viewport.scrollY = scrollY;
	}

	public setClipVisualState(trackIndex: number, clipIndex: number, state: ClipVisualState): void {
		this.clipVisualStates.set(`${trackIndex}-${clipIndex}`, state);
	}

	public getClipVisualState(trackIndex: number, clipIndex: number): ClipVisualState {
		return this.clipVisualStates.get(`${trackIndex}-${clipIndex}`) ?? "normal";
	}

	public clearVisualStates(): void {
		this.clipVisualStates.clear();
	}

	// ========== Selection (delegate to Edit) ==========

	public selectClip(trackIndex: number, clipIndex: number, _addToSelection: boolean): void {
		// Delegate to Edit - it owns selection state
		this.edit.selectClip(trackIndex, clipIndex);
	}

	public clearSelection(): void {
		this.edit.clearSelection();
	}

	public isClipSelected(trackIndex: number, clipIndex: number): boolean {
		return this.edit.isClipSelected(trackIndex, clipIndex);
	}

	// ========== Utilities ==========

	public getTimelineDuration(): number {
		return this.edit.totalDuration / 1000;
	}

	public getExtendedDuration(): number {
		return Math.max(60, this.getTimelineDuration() * 1.5);
	}

	public getTimelineWidth(): number {
		return Math.max(this.getExtendedDuration() * this.viewport.pixelsPerSecond, this.viewport.width);
	}

	// ========== Luma Attachments ==========

	/** Attach a luma Player to a content Player */
	public attachLumaByPlayer(contentPlayer: Player, lumaPlayer: Player): void {
		this.lumaAttachments.set(contentPlayer, lumaPlayer);
	}

	/** Attach a luma clip to a content clip by indices (resolves to Players) */
	public attachLuma(contentTrack: number, contentClip: number, lumaTrack: number, lumaClip: number): void {
		const contentPlayer = this.edit.getPlayerClip(contentTrack, contentClip);
		const lumaPlayer = this.edit.getPlayerClip(lumaTrack, lumaClip);
		if (contentPlayer && lumaPlayer) {
			this.lumaAttachments.set(contentPlayer, lumaPlayer);
		}
	}

	/** Detach luma from a content clip by indices */
	public detachLuma(contentTrack: number, contentClip: number): void {
		const contentPlayer = this.edit.getPlayerClip(contentTrack, contentClip);
		if (contentPlayer) {
			this.lumaAttachments.delete(contentPlayer);
		}
	}

	/** Detach luma from a content Player */
	public detachLumaByPlayer(contentPlayer: Player): void {
		this.lumaAttachments.delete(contentPlayer);
	}

	/** Get attached luma Player for a content clip (by indices) */
	public getAttachedLumaPlayer(trackIndex: number, clipIndex: number): Player | null {
		const contentPlayer = this.edit.getPlayerClip(trackIndex, clipIndex);
		if (!contentPlayer) return null;
		return this.lumaAttachments.get(contentPlayer) ?? null;
	}

	/** Get attached luma indices for a content clip (derives from Player references) */
	public getAttachedLuma(trackIndex: number, clipIndex: number): { trackIndex: number; clipIndex: number } | null {
		const lumaPlayer = this.getAttachedLumaPlayer(trackIndex, clipIndex);
		if (!lumaPlayer) return null;
		return this.edit.findClipIndices(lumaPlayer);
	}

	/** Check if a luma clip is attached to any content clip */
	public isLumaAttached(lumaTrack: number, lumaClip: number): boolean {
		const lumaPlayer = this.edit.getPlayerClip(lumaTrack, lumaClip);
		if (!lumaPlayer) return false;
		for (const attachedLuma of this.lumaAttachments.values()) {
			if (attachedLuma === lumaPlayer) return true;
		}
		return false;
	}

	/** Get the content clip that a luma is attached to */
	public getContentClipForLuma(lumaTrack: number, lumaClip: number): { trackIndex: number; clipIndex: number } | null {
		const lumaPlayer = this.edit.getPlayerClip(lumaTrack, lumaClip);
		if (!lumaPlayer) return null;
		for (const [contentPlayer, attachedLuma] of this.lumaAttachments.entries()) {
			if (attachedLuma === lumaPlayer) {
				return this.edit.findClipIndices(contentPlayer);
			}
		}
		return null;
	}

	/** Clear all luma attachments */
	public clearLumaAttachments(): void {
		this.lumaAttachments.clear();
		this.lumaEditingVisible.clear();
	}

	/** Toggle visibility of attached luma for editing (by indices) */
	public toggleLumaVisibility(contentTrack: number, contentClip: number): boolean {
		const contentPlayer = this.edit.getPlayerClip(contentTrack, contentClip);
		if (!contentPlayer) return false;
		if (this.lumaEditingVisible.has(contentPlayer)) {
			this.lumaEditingVisible.delete(contentPlayer);
			return false; // Now hidden
		}
		this.lumaEditingVisible.add(contentPlayer);
		return true; // Now visible
	}

	/** Check if attached luma is currently visible for editing */
	public isLumaVisibleForEditing(contentTrack: number, contentClip: number): boolean {
		const contentPlayer = this.edit.getPlayerClip(contentTrack, contentClip);
		if (!contentPlayer) return false;
		return this.lumaEditingVisible.has(contentPlayer);
	}

	/** Auto-detect and register luma attachments based on clip overlap */
	public detectAndAttachLumas(): void {
		// Preserve existing visibility states for attachments that still exist
		const previousVisibility = new Set(this.lumaEditingVisible);

		// Clear existing attachments (will re-detect)
		this.lumaAttachments.clear();
		this.lumaEditingVisible.clear();

		const tracks = this.getTracks();

		// Find all luma clips and attach them to overlapping content clips
		for (const track of tracks) {
			for (const clip of track.clips) {
				if (clip.config.asset?.type === "luma") {
					const contentClip = this.findContentClipInSameTrack(clip, tracks);
					if (contentClip) {
						const contentPlayer = this.edit.getPlayerClip(contentClip.trackIndex, contentClip.clipIndex);
						const lumaPlayer = this.edit.getPlayerClip(clip.trackIndex, clip.clipIndex);
						if (contentPlayer && lumaPlayer) {
							this.lumaAttachments.set(contentPlayer, lumaPlayer);

							// Restore visibility state if it existed before
							if (previousVisibility.has(contentPlayer)) {
								this.lumaEditingVisible.add(contentPlayer);
							}
						}
					}
				}
			}
		}
	}

	/** Find the content clip in the same track as the luma clip */
	private findContentClipInSameTrack(lumaClip: ClipState, tracks: TrackState[]): ClipState | null {
		const lumaTrack = tracks[lumaClip.trackIndex];
		if (!lumaTrack) return null;

		for (const clip of lumaTrack.clips) {
			if (clip.config.asset?.type !== "luma") {
				return clip;
			}
		}
		return null;
	}

	public dispose(): void {
		this.clipVisualStates.clear();
		this.lumaAttachments.clear();
		this.lumaEditingVisible.clear();
	}

	// ========== Private ==========

	private createClipState(clip: ResolvedClip, trackIndex: number, clipIndex: number): ClipState {
		const unresolvedEdit = this.edit.getEdit();
		const unresolvedClip = unresolvedEdit?.timeline?.tracks?.[trackIndex]?.clips?.[clipIndex];

		const isSelected = this.edit.isClipSelected(trackIndex, clipIndex);
		const visualState = this.clipVisualStates.get(`${trackIndex}-${clipIndex}`) ?? (isSelected ? "selected" : "normal");

		return {
			id: `${trackIndex}-${clipIndex}`,
			trackIndex,
			clipIndex,
			config: clip,
			visualState,
			timingIntent: {
				start: unresolvedClip?.start === "auto" ? "auto" : clip.start,
				length: unresolvedClip?.length === "auto" || unresolvedClip?.length === "end" ? unresolvedClip.length : clip.length
			}
		};
	}
}
