import { PlayerType, type Player } from "@canvas/players/player";
import { createAnimatedSpeed } from "@canvas/players/video-player";
import type { VideoAsset } from "@schemas";

import { buildVolumeAutomation, type VolumeTween } from "./export-timing";
import { ExportError } from "./export-utils";

const OUTPUT_SAMPLE_RATE = 48_000;
const OUTPUT_CHANNELS = 2;
// Matches the step VideoPlayer integrates its speed curve at.
const SPEED_STEP_SECONDS = 0.01;

// Player types whose `src` is (or, for text-to-speech, becomes) an audio-bearing file.
const AUDIO_BEARING = new Set<string>([PlayerType.Audio, PlayerType.Video, PlayerType.TextToSpeech]);

interface AudioBearingClip {
	clipId: string | null;
	video: boolean;
	src: string;
	start: number;
	length: number;
	trim: number;
	volume: number | VolumeTween[] | undefined;
	effect: string | undefined;
	speed: VideoAsset["speed"];
}

/**
 * Mixes every audio-bearing clip into one export track
 */
export class AudioProcessor {
	hasAudio(tracks: ReadonlyArray<ReadonlyArray<Player>>): boolean {
		return this.collectClips(tracks).length > 0;
	}

	/** Decode and mix all audio-bearing clips into one buffer; null when there is no audio. */
	async renderMix(tracks: ReadonlyArray<ReadonlyArray<Player>>, totalDuration: number): Promise<AudioBuffer | null> {
		const clips = this.collectClips(tracks);
		if (!clips.length || totalDuration <= 0) return null;

		const frames = Math.max(1, Math.ceil(totalDuration * OUTPUT_SAMPLE_RATE));
		const ctx = new OfflineAudioContext(OUTPUT_CHANNELS, frames, OUTPUT_SAMPLE_RATE);
		const decodeCache = new Map<string, AudioBuffer | null>();
		let scheduled = 0;

		for (const clip of clips) {
			const buffer = await this.decode(clip.src, ctx, decodeCache);
			// A video may have no audio track; an audio or speech clip without its audio would export silent.
			if (!buffer && !clip.video) throw new ExportError("A clip's audio couldn't be loaded", "assets", { clipId: clip.clipId });
			if (buffer) {
				const source = ctx.createBufferSource();
				source.buffer = buffer;

				const gain = ctx.createGain();
				this.applyVolume(gain.gain, clip);
				source.connect(gain).connect(ctx.destination);

				try {
					const when = Math.max(0, clip.start);
					const offset = this.applySpeed(source.playbackRate, clip, when);
					source.start(when, Math.max(0, offset));
					source.stop(when + Math.max(0, clip.length));
					scheduled += 1;
				} catch (error) {
					// e.g. trim past the source end — contribute nothing rather than fail the export.
					console.warn("Export: skipped an audio clip that could not be scheduled:", error);
				}
			}
		}

		if (!scheduled) return null;
		return ctx.startRendering();
	}

	/**
	 * Mirrors the preview's source time: a constant speed scales the trim as well as the rate,
	 * while a speed curve starts at the trim and integrates from there. Returns the source offset.
	 */
	private applySpeed(rate: AudioParam, clip: AudioBearingClip, when: number): number {
		const animated = createAnimatedSpeed(clip.speed, clip.length);
		if (!animated) {
			const speed = typeof clip.speed === "number" ? clip.speed : 1;
			rate.setValueAtTime(speed, when);
			return speed * clip.trim;
		}
		const samples = Math.max(2, Math.ceil(clip.length / SPEED_STEP_SECONDS) + 1);
		const curve = Float32Array.from({ length: samples }, (_, i) => animated.curve.getValue((i * clip.length) / (samples - 1)));
		rate.setValueCurveAtTime(curve, when, clip.length);
		return clip.trim;
	}

	private applyVolume(param: AudioParam, clip: AudioBearingClip): void {
		const points = buildVolumeAutomation(clip.volume, clip.effect, clip.length);
		const base = Math.max(0, clip.start);
		param.setValueAtTime(points[0].value, base + points[0].time);
		for (let i = 1; i < points.length; i += 1) {
			param.linearRampToValueAtTime(points[i].value, base + points[i].time);
		}
	}

	private async decode(src: string, ctx: BaseAudioContext, cache: Map<string, AudioBuffer | null>): Promise<AudioBuffer | null> {
		if (cache.has(src)) return cache.get(src) ?? null;

		let result: AudioBuffer | null = null;
		try {
			const response = await fetch(src);
			// decodeAudioData reads the audio track of audio and video containers; throws if none.
			if (response.ok) result = await ctx.decodeAudioData(await response.arrayBuffer());
		} catch (error) {
			console.warn("Export: no decodable audio for", src, error);
		}
		cache.set(src, result);
		return result;
	}

	private collectClips(tracks: ReadonlyArray<ReadonlyArray<Player>>): AudioBearingClip[] {
		const clips: AudioBearingClip[] = [];
		const seen = new Set<Player>();
		for (const track of tracks) {
			for (const clip of track) {
				const resolved = seen.has(clip) ? null : this.asAudioClip(clip);
				if (resolved) {
					seen.add(clip);
					clips.push(resolved);
				}
			}
		}
		return clips;
	}

	private asAudioClip(clip: Player): AudioBearingClip | null {
		if (!AUDIO_BEARING.has(clip.playerType)) return null;
		const asset = clip.clipConfiguration?.asset as
			{ src?: unknown; trim?: number; volume?: unknown; volumeEffect?: string; effect?: string; speed?: VideoAsset["speed"] } | undefined;
		if (typeof asset?.src !== "string" || !asset.src) return null;

		return {
			clipId: clip.clipId,
			video: clip.playerType === PlayerType.Video,
			src: asset.src,
			start: clip.getStart(),
			length: clip.getLength(),
			trim: asset.trim ?? 0,
			volume: asset.volume as number | VolumeTween[] | undefined,
			effect: asset.volumeEffect ?? asset.effect,
			speed: asset.speed
		};
	}
}
