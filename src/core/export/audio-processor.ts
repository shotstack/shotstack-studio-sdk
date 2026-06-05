import { PlayerType, type Player } from "@canvas/players/player";

import { buildVolumeAutomation, type VolumeTween } from "./export-timing";

const OUTPUT_SAMPLE_RATE = 48_000;
const OUTPUT_CHANNELS = 2;

// Player types whose `src` is (or, for text-to-speech, becomes) an audio-bearing file.
const AUDIO_BEARING = new Set<string>([PlayerType.Audio, PlayerType.Video, PlayerType.TextToSpeech]);

interface AudioBearingClip {
	src: string;
	start: number;
	length: number;
	trim: number;
	volume: number | VolumeTween[] | undefined;
	effect: string | undefined;
}

/**
 * Mixes every audio-bearing clip into one export track
 */
export class AudioProcessor {
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
			if (buffer) {
				const source = ctx.createBufferSource();
				source.buffer = buffer;

				const gain = ctx.createGain();
				this.applyVolume(gain.gain, clip);
				source.connect(gain).connect(ctx.destination);

				try {
					// when = timeline start, offset = trim into the source, duration = clip length
					source.start(Math.max(0, clip.start), Math.max(0, clip.trim), Math.max(0, clip.length));
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
			| { src?: unknown; trim?: number; volume?: unknown; volumeEffect?: string; effect?: string }
			| undefined;
		if (typeof asset?.src !== "string" || !asset.src) return null;

		return {
			src: asset.src,
			start: clip.getStart(),
			length: clip.getLength(),
			trim: asset.trim ?? 0,
			volume: asset.volume as number | VolumeTween[] | undefined,
			effect: asset.volumeEffect ?? asset.effect
		};
	}
}
