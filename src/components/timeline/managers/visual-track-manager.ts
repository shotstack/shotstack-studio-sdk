import * as PIXI from "pixi.js";

import { TimelineTheme } from "../../../core/theme";
import { TimelineLayout } from "../timeline-layout";
import { EditType, ClipInfo } from "../types/timeline";
import { VisualTrack, VisualTrackOptions } from "../visual/visual-track";

export class VisualTrackManager {
	private visualTracks: VisualTrack[] = [];

	constructor(
		private container: PIXI.Container,
		private layout: TimelineLayout,
		private theme: TimelineTheme,
		private getPixelsPerSecond: () => number,
		private getExtendedTimelineWidth: () => number
	) {}

	public async rebuildFromEdit(editType: EditType, pixelsPerSecond: number): Promise<void> {
		// Create visual representation directly from event payload
		if (!editType?.timeline?.tracks) {
			return;
		}

		// Clear all existing visual tracks first to avoid stale event handlers
		this.clearAllVisualState();

		// Create visual tracks
		for (let trackIndex = 0; trackIndex < editType.timeline.tracks.length; trackIndex += 1) {
			const trackData = editType.timeline.tracks[trackIndex];

			const visualTrackOptions: VisualTrackOptions = {
				pixelsPerSecond,
				trackHeight: this.layout.trackHeight,
				trackIndex,
				width: this.getExtendedTimelineWidth(),
				theme: this.theme
			};

			const visualTrack = new VisualTrack(visualTrackOptions);
			await visualTrack.load();

			// Rebuild track with track data
			visualTrack.rebuildFromTrackData(trackData, pixelsPerSecond);

			// Add to container and track array
			this.container.addChild(visualTrack.getContainer());
			this.visualTracks.push(visualTrack);
		}
	}

	public clearAllVisualState(): void {
		// Dispose all visual tracks
		this.visualTracks.forEach(track => {
			this.container.removeChild(track.getContainer());
			track.dispose();
		});

		this.visualTracks = [];
	}

	public updateVisualSelection(trackIndex: number, clipIndex: number): void {
		// Clear all existing selections first
		this.clearVisualSelection();

		// Set the specified clip as selected
		const track = this.visualTracks[trackIndex];
		if (track) {
			const clip = track.getClip(clipIndex);
			if (clip) {
				clip.setSelected(true);
			}
		}
	}

	public clearVisualSelection(): void {
		// Clear selection from all clips
		this.visualTracks.forEach(track => {
			const clips = track.getClips();
			clips.forEach(clip => {
				clip.setSelected(false);
			});
		});
	}

	public findClipAtPosition(x: number, y: number): ClipInfo | null {
		// Hit test using visual tracks for accurate positioning
		const trackIndex = Math.floor(y / this.layout.trackHeight);

		if (trackIndex < 0 || trackIndex >= this.visualTracks.length) {
			return null;
		}

		const visualTrack = this.visualTracks[trackIndex];
		const relativeY = y - trackIndex * this.layout.trackHeight;

		const result = visualTrack.findClipAtPosition(x, relativeY);
		if (result) {
			return {
				trackIndex,
				clipIndex: result.clipIndex,
				clipConfig: result.clip.getClipConfig(),
				x: (result.clip.getClipConfig().start || 0) * this.getPixelsPerSecond(),
				y: trackIndex * this.layout.trackHeight,
				width: (result.clip.getClipConfig().length || 0) * this.getPixelsPerSecond(),
				height: this.layout.trackHeight
			};
		}

		return null;
	}

	public updateTrackWidths(extendedWidth: number): void {
		this.visualTracks.forEach(track => {
			track.setWidth(extendedWidth);
		});
	}

	public getVisualTracks(): VisualTrack[] {
		return this.visualTracks;
	}

	public updatePixelsPerSecond(pixelsPerSecond: number): void {
		// Update pixels per second for all existing tracks without rebuilding
		this.visualTracks.forEach(track => {
			track.setPixelsPerSecond(pixelsPerSecond);
		});
	}

	public dispose(): void {
		this.clearAllVisualState();
	}
}