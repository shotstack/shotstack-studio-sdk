import { AudioPlayer } from "@canvas/players/audio-player";
import { PlayerType } from "@canvas/players/player";
import type { AudioAsset } from "@schemas";
import { Output, AudioSampleSource, AudioSample } from "mediabunny";

export class AudioProcessor {
	private audioTracks: { data: ArrayBuffer; start: number; duration: number; volume: number }[] = [];

	async setupAudioTracks(tracks: ReadonlyArray<ReadonlyArray<unknown>>, output: Output): Promise<AudioSampleSource | null> {
		const audioPlayers = this.findAudioPlayers(tracks);
		if (!audioPlayers.length) return null;

		this.audioTracks = [];
		for (const player of audioPlayers) {
			const track = await this.processAudioTrack(player);
			if (track) this.audioTracks.push(track);
		}

		if (!this.audioTracks.length) return null;

		const audioSource = new AudioSampleSource({ codec: "aac", bitrate: 128000 });
		output.addAudioTrack(audioSource);
		return audioSource;
	}

	async processAudioSamples(audioSource: AudioSampleSource): Promise<void> {
		if (!this.audioTracks?.length) return;

		const audioContext = new AudioContext();
		for (const track of this.audioTracks) {
			const audioBuffer = await audioContext.decodeAudioData(track.data.slice(0));
			const { numberOfChannels, sampleRate, length: frameCount } = audioBuffer;
			const framesToUse = Math.min(frameCount, Math.floor((sampleRate * track.duration) / 1000));
			const interleavedData = new Float32Array(framesToUse * numberOfChannels);

			for (let ch = 0; ch < numberOfChannels; ch += 1) {
				const channelData = audioBuffer.getChannelData(ch);
				for (let i = 0; i < framesToUse; i += 1) {
					interleavedData[i * numberOfChannels + ch] = channelData[i] * track.volume;
				}
			}

			await audioSource.add(
				new AudioSample({
					data: interleavedData,
					format: "f32",
					numberOfChannels,
					sampleRate,
					timestamp: track.start / 1000
				})
			);
		}
		this.audioTracks = [];
	}

	private findAudioPlayers(tracks: ReadonlyArray<ReadonlyArray<unknown>>): AudioPlayer[] {
		const players: AudioPlayer[] = [];

		for (const track of tracks) {
			for (const clip of track) {
				if (this.isAudioPlayer(clip) && !players.includes(clip)) {
					players.push(clip);
				}
			}
		}

		return players;
	}

	private async processAudioTrack(player: AudioPlayer) {
		try {
			const asset = player.clipConfiguration?.asset as AudioAsset;
			if (!asset?.src) return null;

			const response = await fetch(asset.src);
			if (!response.ok) return null;

			return {
				data: await response.arrayBuffer(),
				start: player.getStart(),
				duration: player.getLength(),
				volume: player.getVolume()
			};
		} catch (error) {
			console.warn("Failed to process audio track:", error);
			return null;
		}
	}

	private isAudioPlayer(clip: unknown): clip is AudioPlayer {
		if (!clip || typeof clip !== "object") return false;
		const c = clip as { playerType?: string };
		if (c.playerType === PlayerType.Audio) return true;
		// Fallback for cases where playerType might not exist
		const config = (clip as { clipConfiguration?: { asset?: { type?: string } } }).clipConfiguration;
		return config?.asset?.type === "audio";
	}
}
