/**
 * Smart-clip resolution utility for Shotstack Studio SDK.
 * Resolves "auto" and "end" timing values to numeric seconds.
 * @internal
 */

const DEFAULT_AUTO_LENGTH = 3;

type SmartClipValue = number | "auto" | "end";

interface SmartClip {
	start: SmartClipValue;
	length: SmartClipValue;
	asset: { type: string; src?: string; trim?: number };
}

interface SmartTrack {
	clips: SmartClip[];
}

interface SmartTimeline {
	tracks: SmartTrack[];
}

interface SmartEdit {
	timeline: SmartTimeline;
	[key: string]: unknown;
}

function probeMediaDuration(src: string): Promise<number | null> {
	return new Promise(resolve => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = (): void => resolve(video.duration);
		video.onerror = (): void => resolve(null);
		video.src = src;
	});
}

function getTimelineLength(timeline: SmartTimeline): number {
	let maxEnd = 0;
	for (const track of timeline.tracks) {
		for (const clip of track.clips) {
			const end = (clip.start as number) + (clip.length as number);
			if (end > maxEnd) maxEnd = end;
		}
	}
	return maxEnd;
}

/**
 * Resolves smart-clip timing values ("auto", "end") to numeric seconds.
 * Uses a two-phase approach matching the Shotstack API behavior.
 */
export async function resolveSmartClips<T extends SmartEdit>(edit: T): Promise<T> {
	const hasSmartClips = edit.timeline.tracks.some(track =>
		track.clips.some(clip => clip.start === "auto" || clip.length === "auto" || clip.length === "end")
	);

	if (!hasSmartClips) return edit;

	const resolved = structuredClone(edit);

	// Phase 1: Resolve "auto" start and "auto" length (track-by-track, sequential)
	for (const track of resolved.timeline.tracks) {
		let currentTrackDuration = 0;

		for (let i = 0; i < track.clips.length; i += 1) {
			const clip = track.clips[i];

			// Initialize track duration from first clip's numeric start
			if (i === 0 && typeof clip.start === "number") {
				currentTrackDuration = clip.start;
			}

			// Resolve "auto" start
			if (clip.start === "auto") {
				clip.start = currentTrackDuration;
			}

			// Resolve "auto" length
			if (clip.length === "auto") {
				let autoLength = DEFAULT_AUTO_LENGTH;

				if (["video", "audio"].includes(clip.asset.type) && clip.asset.src) {
					const duration = await probeMediaDuration(clip.asset.src);
					if (duration && !Number.isNaN(duration)) {
						autoLength = duration;
					}
				}

				if (clip.asset.type === "luma" && clip.asset.src) {
					const duration = await probeMediaDuration(clip.asset.src);
					if (duration && !Number.isNaN(duration)) {
						autoLength = duration;
					}
				}

				// Subtract trim if present
				clip.length = autoLength - (clip.asset.trim ?? 0);
			}

			currentTrackDuration = (clip.start as number) + (clip.length as number);
		}
	}

	// Phase 2: Resolve "end" length (requires total timeline duration from Phase 1)
	const timelineEnd = getTimelineLength(resolved.timeline);

	for (const track of resolved.timeline.tracks) {
		for (const clip of track.clips) {
			if (clip.length === "end") {
				clip.length = timelineEnd - (clip.start as number);
			}
		}
	}

	return resolved;
}
