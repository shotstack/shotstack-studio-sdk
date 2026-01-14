import type { ClipState, TrackState } from "../timeline.types";
import { getTrackHeight } from "../timeline.types";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ClipRef {
	readonly trackIndex: number;
	readonly clipIndex: number;
}

export interface SnapPoint {
	readonly time: number;
	readonly type: "clip-start" | "clip-end" | "playhead";
}

export interface CollisionResult {
	readonly newStartTime: number;
	readonly pushOffset: number;
}

export type DragTarget = { readonly type: "track"; readonly trackIndex: number } | { readonly type: "insert"; readonly insertionIndex: number };

// ─── Coordinate Transforms ─────────────────────────────────────────────────

export function pixelsToSeconds(px: number, pixelsPerSecond: number): number {
	return px / pixelsPerSecond;
}
export function secondsToPixels(seconds: number, pixelsPerSecond: number): number {
	return seconds * pixelsPerSecond;
}

// ─── Time Formatting ───────────────────────────────────────────────────────

export function formatDragTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	const tenths = Math.floor((seconds % 1) * 10);
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
}

// ─── Track Y Position Calculations ─────────────────────────────────────────

export function buildTrackYPositions(tracks: readonly TrackState[]): number[] {
	const positions: number[] = [];
	let y = 0;
	for (const track of tracks) {
		positions.push(y);
		y += getTrackHeight(track.primaryAssetType);
	}
	return positions;
}

export function getTrackYPosition(trackIndex: number, trackYPositions: readonly number[]): number {
	return trackYPositions[trackIndex] ?? 0;
}

// ─── Drag Target Detection ─────────────────────────────────────────────────

const INSERT_ZONE_SIZE = 12; // pixels at track edges for insert detection

export function getDragTargetAtY(y: number, tracks: readonly TrackState[]): DragTarget {
	// Top edge - insert above first track
	if (y < INSERT_ZONE_SIZE / 2) {
		return { type: "insert", insertionIndex: 0 };
	}

	let currentY = 0;
	for (let i = 0; i < tracks.length; i += 1) {
		const height = getTrackHeight(tracks[i].primaryAssetType);

		// Top edge insert zone (between this track and previous)
		if (i > 0 && y >= currentY - INSERT_ZONE_SIZE / 2 && y < currentY + INSERT_ZONE_SIZE / 2) {
			return { type: "insert", insertionIndex: i };
		}

		// Inside track (not in edge zones)
		if (y >= currentY + INSERT_ZONE_SIZE / 2 && y < currentY + height - INSERT_ZONE_SIZE / 2) {
			return { type: "track", trackIndex: i };
		}

		currentY += height;
	}

	// Bottom edge - insert after last track
	if (y >= currentY - INSERT_ZONE_SIZE / 2) {
		return { type: "insert", insertionIndex: tracks.length };
	}

	// Default to last track
	return { type: "track", trackIndex: Math.max(0, tracks.length - 1) };
}

// ─── Snap Point Logic ──────────────────────────────────────────────────────

export interface BuildSnapPointsInput {
	readonly tracks: readonly TrackState[];
	readonly playheadTimeMs: number;
	readonly excludeClip: ClipRef;
}

export function buildSnapPoints(input: BuildSnapPointsInput): SnapPoint[] {
	const { tracks, playheadTimeMs, excludeClip } = input;
	const snapPoints: SnapPoint[] = [];

	// Add playhead position
	snapPoints.push({
		time: playheadTimeMs / 1000,
		type: "playhead"
	});

	// Add clip edges from all tracks
	for (const track of tracks) {
		for (const clip of track.clips) {
			// Skip the clip being dragged/resized
			const isExcluded = clip.trackIndex === excludeClip.trackIndex && clip.clipIndex === excludeClip.clipIndex;
			if (!isExcluded) {
				snapPoints.push({
					time: clip.config.start,
					type: "clip-start"
				});
				snapPoints.push({
					time: clip.config.start + clip.config.length,
					type: "clip-end"
				});
			}
		}
	}

	return snapPoints;
}

export interface ApplySnapInput {
	readonly time: number;
	readonly snapPoints: readonly SnapPoint[];
	readonly snapThresholdPx: number;
	readonly pixelsPerSecond: number;
}

export function findNearestSnapPoint(input: ApplySnapInput): number | null {
	const { time, snapPoints, snapThresholdPx, pixelsPerSecond } = input;
	const thresholdSeconds = snapThresholdPx / pixelsPerSecond;

	for (const point of snapPoints) {
		if (Math.abs(time - point.time) <= thresholdSeconds) {
			return point.time;
		}
	}

	return null;
}

// ─── Collision Detection ───────────────────────────────────────────────────

export function getTrackClipsExcluding(track: TrackState, excludeClip: ClipRef): ClipState[] {
	return track.clips
		.filter(c => !(c.trackIndex === excludeClip.trackIndex && c.clipIndex === excludeClip.clipIndex))
		.sort((a, b) => a.config.start - b.config.start);
}

export function findOverlappingClip(
	clips: readonly ClipState[],
	desiredStart: number,
	clipLength: number
): { clip: ClipState; index: number } | null {
	const desiredEnd = desiredStart + clipLength;

	for (let i = 0; i < clips.length; i += 1) {
		const clip = clips[i];
		const clipStart = clip.config.start;
		const clipEnd = clipStart + clip.config.length;

		if (desiredStart < clipEnd && desiredEnd > clipStart) {
			return { clip, index: i };
		}
	}

	return null;
}

export function resolveOverlapSnap(
	targetClip: ClipState,
	targetIndex: number,
	desiredStart: number,
	clipLength: number,
	sortedClips: readonly ClipState[]
): CollisionResult {
	const targetStart = targetClip.config.start;
	const targetEnd = targetStart + targetClip.config.length;

	// Determine snap direction based on dragged clip center vs target clip center
	const draggedCenter = desiredStart + clipLength / 2;
	const targetCenter = targetStart + targetClip.config.length / 2;
	const snapRight = draggedCenter >= targetCenter;

	if (snapRight) {
		// Snap to RIGHT of target clip
		const newStartTime = targetEnd;
		const newEndTime = newStartTime + clipLength;
		const nextClip = sortedClips[targetIndex + 1];

		if (nextClip && newEndTime > nextClip.config.start) {
			return { newStartTime, pushOffset: newEndTime - nextClip.config.start };
		}
		return { newStartTime, pushOffset: 0 };
	}

	// Snap to LEFT of target clip
	const prevClipEnd = targetIndex > 0 ? sortedClips[targetIndex - 1].config.start + sortedClips[targetIndex - 1].config.length : 0;
	const availableSpace = targetStart - prevClipEnd;

	if (availableSpace >= clipLength) {
		return { newStartTime: targetStart - clipLength, pushOffset: 0 };
	}

	// No space on left - push target clip forward
	const newStartTime = prevClipEnd;
	return { newStartTime, pushOffset: newStartTime + clipLength - targetStart };
}

export interface ResolveCollisionInput {
	readonly track: TrackState;
	readonly desiredStart: number;
	readonly clipLength: number;
	readonly excludeClip: ClipRef;
}

/** Default result when no collision detected */
const NO_COLLISION: CollisionResult = { newStartTime: 0, pushOffset: 0 };

export function resolveClipCollision(input: ResolveCollisionInput): CollisionResult {
	const { track, desiredStart, clipLength, excludeClip } = input;

	const clips = getTrackClipsExcluding(track, excludeClip);
	if (clips.length === 0) {
		return { ...NO_COLLISION, newStartTime: desiredStart };
	}

	const overlap = findOverlappingClip(clips, desiredStart, clipLength);
	if (overlap) {
		// Skip collision for luma assets - they should be overlayable
		if (overlap.clip.config.asset?.type === "luma") {
			return { newStartTime: desiredStart, pushOffset: 0 };
		}
		return resolveOverlapSnap(overlap.clip, overlap.index, desiredStart, clipLength, clips);
	}

	return { newStartTime: desiredStart, pushOffset: 0 };
}

// ─── Content Clip Detection ────────────────────────────────────────────────

export interface FindContentClipInput {
	readonly track: TrackState;
	readonly time: number;
	readonly excludeClip?: ClipRef;
}

export function findContentClipAtPosition(input: FindContentClipInput): ClipState | null {
	const { track, time, excludeClip } = input;

	for (const clip of track.clips) {
		// Skip excluded clip (can't attach to self)
		const isExcluded = excludeClip && clip.trackIndex === excludeClip.trackIndex && clip.clipIndex === excludeClip.clipIndex;

		// Only consider non-luma content clips that aren't excluded
		if (!isExcluded && clip.config.asset?.type !== "luma") {
			const clipStart = clip.config.start;
			const clipEnd = clipStart + clip.config.length;

			// Check if time falls within this clip
			if (time >= clipStart && time < clipEnd) {
				return clip;
			}
		}
	}

	return null;
}

// ─── Distance Calculations ─────────────────────────────────────────────────

export function distance(dx: number, dy: number): number {
	return Math.sqrt(dx * dx + dy * dy);
}

export function exceedsDragThreshold(dx: number, dy: number, threshold: number): boolean {
	return distance(dx, dy) >= threshold;
}
