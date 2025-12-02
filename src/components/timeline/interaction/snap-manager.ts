import { TimelineInterface, SnapPoint, SnapResult, AlignmentInfo, InteractionThresholds } from "./types";

export class SnapManager {
	private timeline: TimelineInterface;
	private thresholds: InteractionThresholds;

	constructor(timeline: TimelineInterface, thresholds: InteractionThresholds) {
		this.timeline = timeline;
		this.thresholds = thresholds;
	}

	public getAllSnapPoints(currentTrackIndex: number, excludeClipIndex?: number): SnapPoint[] {
		const snapPoints: SnapPoint[] = [];

		// Get clips from ALL tracks for cross-track alignment
		const tracks = this.timeline.getVisualTracks();
		tracks.forEach((track, trackIdx) => {
			const clips = track.getClips();
			clips.forEach((clip, clipIdx) => {
				// Skip the clip being dragged
				if (trackIdx === currentTrackIndex && clipIdx === excludeClipIndex) return;

				const clipConfig = clip.getClipConfig();
				if (clipConfig) {
					const start = clipConfig.start;
					snapPoints.push({
						time: start,
						type: "clip-start",
						trackIndex: trackIdx,
						clipIndex: clipIdx
					});
					snapPoints.push({
						time: start + clipConfig.length,
						type: "clip-end",
						trackIndex: trackIdx,
						clipIndex: clipIdx
					});
				}
			});
		});

		// Add playhead position
		const playheadTime = this.timeline.getPlayheadTime();
		snapPoints.push({ time: playheadTime, type: "playhead" });

		return snapPoints;
	}

	public getTrackSnapPoints(trackIndex: number, excludeClipIndex?: number): SnapPoint[] {
		return this.getAllSnapPoints(trackIndex, excludeClipIndex).filter(point => point.trackIndex === undefined || point.trackIndex === trackIndex);
	}

	public calculateSnapPosition(dragTime: number, dragTrack: number, clipDuration: number, excludeClipIndex?: number): SnapResult {
		const pixelsPerSecond = this.timeline.getOptions().pixelsPerSecond || 50;
		const snapThresholdTime = this.thresholds.snap.pixels / pixelsPerSecond;

		// Get potential snap points for this track
		const snapPoints = this.getTrackSnapPoints(dragTrack, excludeClipIndex);

		// Check snap points for both clip start and clip end
		let closestSnap: { time: number; type: SnapPoint["type"]; distance: number } | null = null;

		for (const snapPoint of snapPoints) {
			// Check snap for clip start
			const startDistance = Math.abs(dragTime - snapPoint.time);
			if (startDistance < snapThresholdTime) {
				if (!closestSnap || startDistance < closestSnap.distance) {
					closestSnap = { time: snapPoint.time, type: snapPoint.type, distance: startDistance };
				}
			}

			// Check snap for clip end
			const endDistance = Math.abs(dragTime + clipDuration - snapPoint.time);
			if (endDistance < snapThresholdTime) {
				if (!closestSnap || endDistance < closestSnap.distance) {
					// Adjust time so clip end aligns with snap point
					closestSnap = {
						time: snapPoint.time - clipDuration,
						type: snapPoint.type,
						distance: endDistance
					};
				}
			}
		}

		if (closestSnap) {
			return { time: closestSnap.time, snapped: true, snapType: closestSnap.type };
		}

		return { time: dragTime, snapped: false };
	}

	public findAlignedElements(clipStart: number, clipDuration: number, currentTrack: number, excludeClipIndex?: number): AlignmentInfo[] {
		const SNAP_THRESHOLD = 0.1;
		const clipEnd = clipStart + clipDuration;
		const alignments = new Map<number, { tracks: Set<number>; isPlayhead: boolean }>();

		// Check all tracks for alignments
		this.timeline.getVisualTracks().forEach((track, trackIdx) => {
			track.getClips().forEach((clip, clipIdx) => {
				if (trackIdx === currentTrack && clipIdx === excludeClipIndex) return;

				const config = clip.getClipConfig();
				if (!config) return;

				const otherStart = config.start;
				const otherEnd = otherStart + config.length;

				// Check alignments
				[
					{ time: otherStart, aligns: [clipStart, clipEnd] },
					{ time: otherEnd, aligns: [clipStart, clipEnd] }
				].forEach(({ time, aligns }) => {
					if (aligns.some(t => Math.abs(t - time) < SNAP_THRESHOLD)) {
						if (!alignments.has(time)) {
							alignments.set(time, { tracks: new Set(), isPlayhead: false });
						}
						alignments.get(time)!.tracks.add(trackIdx);
					}
				});
			});
		});

		// Check playhead alignment
		const playheadTime = this.timeline.getPlayheadTime();
		if (Math.abs(clipStart - playheadTime) < SNAP_THRESHOLD || Math.abs(clipEnd - playheadTime) < SNAP_THRESHOLD) {
			if (!alignments.has(playheadTime)) {
				alignments.set(playheadTime, { tracks: new Set(), isPlayhead: true });
			}
			alignments.get(playheadTime)!.isPlayhead = true;
		}

		// Convert to array format
		return Array.from(alignments.entries()).map(([time, data]) => ({
			time,
			tracks: Array.from(data.tracks).concat(currentTrack),
			isPlayhead: data.isPlayhead
		}));
	}
}
