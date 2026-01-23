import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { EditEvent, InternalEvent } from "@core/events/edit-events";
import type { ResolvedClip, ResolvedTrack } from "@schemas";

import type { TrackState, ClipState, ViewportState, PlaybackState, ClipVisualState, InteractionQuery } from "./timeline.types";

export class TimelineStateManager {
	private viewport: ViewportState;
	private interactionQuery: InteractionQuery | null = null;
	/** Track luma visibility by clip ID for stability across reconciliation */
	private lumaEditingVisibleByClipId = new Set<string>();
	private cachedTracks: TrackState[] | null = null;

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

		// Document changes trigger Resolved event
		this.edit.events.on(InternalEvent.Resolved, this.invalidateCache);

		// Selection changes are UI state (not document mutations)
		this.edit.events.on(EditEvent.ClipSelected, this.invalidateCache);
		this.edit.events.on(EditEvent.SelectionCleared, this.invalidateCache);
	}

	private invalidateCache = (): void => {
		this.cachedTracks = null;
	};

	// ========== Derived from Edit (memoized) ==========

	public getTracks(): TrackState[] {
		if (this.cachedTracks) {
			return this.cachedTracks;
		}

		const resolvedEdit = this.edit.getResolvedEdit();
		if (!resolvedEdit?.timeline?.tracks) return [];

		this.cachedTracks = resolvedEdit.timeline.tracks.map((track: ResolvedTrack, trackIndex: number) => {
			const clips = (track.clips || []).map((clip: ResolvedClip, clipIndex: number) => this.createClipState(clip, trackIndex, clipIndex));

			const primaryAssetType = clips.length > 0 && clips[0].config.asset ? clips[0].config.asset.type || "unknown" : "empty";

			return {
				index: trackIndex,
				clips,
				primaryAssetType
			};
		});

		return this.cachedTracks;
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

	// ========== UI State ==========

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

	public setInteractionQuery(query: InteractionQuery | null): void {
		this.interactionQuery = query;
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
		return this.edit.totalDuration; // totalDuration is in seconds
	}

	public getExtendedDuration(): number {
		return Math.max(60, this.getTimelineDuration() * 1.5);
	}

	public getTimelineWidth(): number {
		return Math.max(this.getExtendedDuration() * this.viewport.pixelsPerSecond, this.viewport.width);
	}

	// ========== Luma Query Functions ==========

	public findAttachedLuma(contentTrackIdx: number, contentClipIdx: number): { trackIndex: number; clipIndex: number } | null {
		const tracks = this.getTracks();
		const track = tracks[contentTrackIdx];
		if (!track) return null;

		const content = track.clips[contentClipIdx];
		if (!content || content.config.asset?.type === "luma") return null;

		const contentStart = content.config.start;
		const contentLength = content.config.length;

		const lumaIndex = track.clips.findIndex(
			clip => clip.config.asset?.type === "luma" && clip.config.start === contentStart && clip.config.length === contentLength
		);

		return lumaIndex !== -1 ? { trackIndex: contentTrackIdx, clipIndex: lumaIndex } : null;
	}

	public findContentForLuma(lumaTrackIdx: number, lumaClipIdx: number): { trackIndex: number; clipIndex: number } | null {
		const tracks = this.getTracks();
		const track = tracks[lumaTrackIdx];
		if (!track) return null;

		const luma = track.clips[lumaClipIdx];
		if (!luma || luma.config.asset?.type !== "luma") return null;

		const lumaStart = luma.config.start;
		const lumaLength = luma.config.length;

		const contentIndex = track.clips.findIndex(
			clip => clip.config.asset?.type !== "luma" && clip.config.start === lumaStart && clip.config.length === lumaLength
		);

		return contentIndex !== -1 ? { trackIndex: lumaTrackIdx, clipIndex: contentIndex } : null;
	}

	public hasAttachedLuma(contentTrackIdx: number, contentClipIdx: number): boolean {
		return this.findAttachedLuma(contentTrackIdx, contentClipIdx) !== null;
	}

	public getAttachedLumaPlayer(trackIndex: number, clipIndex: number): Player | null {
		const lumaRef = this.findAttachedLuma(trackIndex, clipIndex);
		if (!lumaRef) return null;
		return this.edit.getPlayerClip(lumaRef.trackIndex, lumaRef.clipIndex);
	}

	// ========== Luma UI State ==========

	public toggleLumaVisibility(contentTrack: number, contentClip: number): boolean {
		const contentPlayer = this.edit.getPlayerClip(contentTrack, contentClip);
		if (!contentPlayer?.clipId) return false;

		if (this.lumaEditingVisibleByClipId.has(contentPlayer.clipId)) {
			this.lumaEditingVisibleByClipId.delete(contentPlayer.clipId);
			return false; // Now hidden
		}
		this.lumaEditingVisibleByClipId.add(contentPlayer.clipId);
		return true; // Now visible
	}

	public isLumaVisibleForEditing(contentTrack: number, contentClip: number): boolean {
		const contentPlayer = this.edit.getPlayerClip(contentTrack, contentClip);
		if (!contentPlayer?.clipId) return false;
		return this.lumaEditingVisibleByClipId.has(contentPlayer.clipId);
	}

	public clearLumaVisibility(): void {
		this.lumaEditingVisibleByClipId.clear();
	}

	public clearLumaVisibilityFor(contentPlayer: Player): void {
		if (contentPlayer.clipId) {
			this.lumaEditingVisibleByClipId.delete(contentPlayer.clipId);
		}
	}

	public clearLumaVisibilityForClipId(clipId: string): void {
		this.lumaEditingVisibleByClipId.delete(clipId);
	}

	public dispose(): void {
		// Remove event listeners
		this.edit.events.off(InternalEvent.Resolved, this.invalidateCache);
		this.edit.events.off(EditEvent.ClipSelected, this.invalidateCache);
		this.edit.events.off(EditEvent.SelectionCleared, this.invalidateCache);

		// Clear state
		this.cachedTracks = null;
		this.interactionQuery = null;
		this.lumaEditingVisibleByClipId.clear();
	}

	// ========== Private ==========

	private getComputedVisualState(trackIndex: number, clipIndex: number, isSelected: boolean): ClipVisualState {
		if (this.interactionQuery?.isDragging(trackIndex, clipIndex)) return "dragging";
		if (this.interactionQuery?.isResizing(trackIndex, clipIndex)) return "resizing";
		if (isSelected) return "selected";
		return "normal";
	}

	private createClipState(clip: ResolvedClip, trackIndex: number, clipIndex: number): ClipState {
		const unresolvedEdit = this.edit.getEdit();
		const unresolvedClip = unresolvedEdit?.timeline?.tracks?.[trackIndex]?.clips?.[clipIndex];

		const isSelected = this.edit.isClipSelected(trackIndex, clipIndex);
		const visualState = this.getComputedVisualState(trackIndex, clipIndex, isSelected);

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
