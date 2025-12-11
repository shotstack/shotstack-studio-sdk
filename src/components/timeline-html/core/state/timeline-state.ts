import type { Edit } from "@core/edit";
import type { ResolvedClip } from "@schemas/clip";
import type { ResolvedTrack } from "@schemas/track";
import type { TrackState, ClipState, ViewportState, PlaybackState } from "../../html-timeline.types";

type ClipVisualState = "normal" | "selected" | "dragging" | "resizing";

/** Simplified state manager - only holds UI state, derives data from Edit */
export class TimelineStateManager {
	// UI-only state (not in Edit)
	private viewport: ViewportState;
	private clipVisualStates = new Map<string, ClipVisualState>();

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
			const clips = (track.clips || []).map((clip: ResolvedClip, clipIndex: number) =>
				this.createClipState(clip, trackIndex, clipIndex)
			);

			// Derive primary asset type from first clip
			const primaryAssetType =
				clips.length > 0 && clips[0].config.asset ? clips[0].config.asset.type || "unknown" : "empty";

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

	public dispose(): void {
		this.clipVisualStates.clear();
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
				length:
					unresolvedClip?.length === "auto" || unresolvedClip?.length === "end"
						? unresolvedClip.length
						: clip.length
			}
		};
	}
}
