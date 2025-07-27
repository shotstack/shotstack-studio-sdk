import { TimelineInterface } from "./types";

interface ClipBounds {
	start: number;
	end: number;
}

export interface CollisionResult {
	validTime: number;
	wouldOverlap: boolean;
}

export class CollisionDetector {
	private timeline: TimelineInterface;

	constructor(timeline: TimelineInterface) {
		this.timeline = timeline;
	}

	public getValidDropPosition(time: number, duration: number, trackIndex: number, excludeClipIndex?: number): CollisionResult {
		const track = this.timeline.getVisualTracks()[trackIndex];
		if (!track) return { validTime: time, wouldOverlap: false };

		// Get all clips except the one being dragged
		const otherClips = this.getOtherClipBounds(track, excludeClipIndex);

		// Find the first overlap
		const dragEnd = time + duration;
		const overlap = otherClips.find(
			clip => !(dragEnd <= clip.start || time >= clip.end) // Not if completely before or after
		);

		if (!overlap) {
			return { validTime: time, wouldOverlap: false };
		}

		// Find nearest valid position
		const beforeGap = overlap.start - duration;
		const afterGap = overlap.end;

		// Choose position closest to original intent
		const validTime = Math.abs(time - beforeGap) < Math.abs(time - afterGap) && beforeGap >= 0 ? beforeGap : afterGap;

		// Recursively check if new position is valid
		const recursiveCheck = this.getValidDropPosition(validTime, duration, trackIndex, excludeClipIndex);

		return {
			validTime: recursiveCheck.validTime,
			wouldOverlap: true
		};
	}

	public checkOverlap(time: number, duration: number, trackIndex: number, excludeClipIndex?: number): boolean {
		const track = this.timeline.getVisualTracks()[trackIndex];
		if (!track) return false;

		const otherClips = this.getOtherClipBounds(track, excludeClipIndex);
		const clipEnd = time + duration;

		return otherClips.some(clip => !(clipEnd <= clip.start || time >= clip.end));
	}

	private getOtherClipBounds(track: import("./types").VisualTrack, excludeClipIndex?: number): ClipBounds[] {
		return track
			.getClips()
			.map((clip, index) => ({ clip, index }))
			.filter(({ index }: { index: number }) => index !== excludeClipIndex)
			.map(({ clip }) => {
				const config = clip.getClipConfig();
				return config
					? {
							start: config.start || 0,
							end: (config.start || 0) + (config.length || 0)
						}
					: null;
			})
			.filter((clip: ClipBounds | null): clip is ClipBounds => clip !== null)
			.sort((a: ClipBounds, b: ClipBounds) => a.start - b.start);
	}

	public findAvailableGaps(trackIndex: number, minDuration: number): Array<{ start: number; end: number }> {
		const track = this.timeline.getVisualTracks()[trackIndex];
		if (!track) return [];

		const clips = this.getOtherClipBounds(track);
		const gaps: Array<{ start: number; end: number }> = [];

		// Check gap before first clip
		if (clips.length > 0 && clips[0].start >= minDuration) {
			gaps.push({ start: 0, end: clips[0].start });
		}

		// Check gaps between clips
		for (let i = 0; i < clips.length - 1; i += 1) {
			const gap = clips[i + 1].start - clips[i].end;
			if (gap >= minDuration) {
				gaps.push({ start: clips[i].end, end: clips[i + 1].start });
			}
		}

		// Note: We don't add a gap after the last clip as timeline extends infinitely

		return gaps;
	}
}
