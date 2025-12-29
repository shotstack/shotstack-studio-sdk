import { KeyframeBuilder } from "@animations/keyframe-builder";
import type { Edit } from "@core/edit-session";
import { type Size } from "@layouts/geometry";
import { AudioLoadParser } from "@loaders/audio-load-parser";
import { type AudioAsset , type ResolvedClip , type Keyframe } from "@schemas";
import * as howler from "howler";
import * as pixi from "pixi.js";

import { Player, PlayerType } from "./player";

export class AudioPlayer extends Player {
	private audioResource: howler.Howl | null;
	private isPlaying: boolean;

	private volumeKeyframeBuilder!: KeyframeBuilder;

	private syncTimer: number;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Audio);

		this.audioResource = null;
		this.isPlaying = false;
		this.syncTimer = 0;
	}

	public override async load(): Promise<void> {
		await super.load();

		const audioClipConfiguration = this.clipConfiguration.asset as AudioAsset;

		const identifier = audioClipConfiguration.src;
		const loadOptions: pixi.UnresolvedAsset = { src: identifier, parser: AudioLoadParser.Name };
		const audioResource = await this.edit.assetLoader.load<howler.Howl>(identifier, loadOptions);

		const isValidAudioSource = audioResource instanceof howler.Howl;
		if (!isValidAudioSource) {
			throw new Error(`Invalid audio source '${audioClipConfiguration.src}'.`);
		}

		this.audioResource = audioResource;

		// Create volume keyframes after timing is resolved (not in constructor)
		const baseVolume = typeof audioClipConfiguration.volume === "number" ? audioClipConfiguration.volume : 1;
		this.volumeKeyframeBuilder = new KeyframeBuilder(this.createVolumeKeyframes(audioClipConfiguration, baseVolume), this.getLength(), baseVolume);

		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		const { trim = 0 } = this.clipConfiguration.asset as AudioAsset;

		this.syncTimer += elapsed;

		this.getContainer().alpha = 0;

		if (!this.audioResource) {
			return;
		}

		const shouldClipPlay = this.edit.isPlaying && this.isActive();
		const playbackTime = this.getPlaybackTime();

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;

				this.audioResource.seek(playbackTime / 1000 + trim);
				this.audioResource.play();
			}

			if (this.audioResource.volume() !== this.getVolume()) {
				this.audioResource.volume(this.getVolume());
			}

			const desyncThreshold = 100;
			const shouldSync = Math.abs((this.audioResource.seek() - trim) * 1000 - playbackTime) > desyncThreshold;

			if (shouldSync) {
				this.audioResource.seek(playbackTime / 1000 + trim);
				this.edit.recordSyncCorrection();
			}
		}

		if (this.isPlaying && !shouldClipPlay) {
			this.isPlaying = false;
			this.audioResource.pause();
		}

		const shouldSync = this.syncTimer > 100;
		if (!this.edit.isPlaying && this.isActive() && shouldSync) {
			this.syncTimer = 0;
			this.audioResource.seek(playbackTime / 1000 + trim);
		}
	}

	public override draw(): void {
		super.draw();
	}

	public override dispose(): void {
		this.audioResource?.unload();
		this.audioResource = null;
	}

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();

		// Rebuild volume keyframes with updated timing
		const audioAsset = this.clipConfiguration.asset as AudioAsset;
		const baseVolume = typeof audioAsset.volume === "number" ? audioAsset.volume : 1;
		this.volumeKeyframeBuilder = new KeyframeBuilder(this.createVolumeKeyframes(audioAsset, baseVolume), this.getLength(), baseVolume);
	}

	public override getSize(): Size {
		return { width: 0, height: 0 };
	}

	public getVolume(): number {
		return this.volumeKeyframeBuilder.getValue(this.getPlaybackTime());
	}

	public getCurrentDrift(): number {
		if (!this.audioResource) return 0;
		const { trim = 0 } = this.clipConfiguration.asset as AudioAsset;
		const audioTime = this.audioResource.seek() as number;
		const playbackTime = this.getPlaybackTime();
		return Math.abs((audioTime - trim) * 1000 - playbackTime);
	}

	private createVolumeKeyframes(asset: AudioAsset, baseVolume: number): Keyframe[] | number {
		const { effect, volume } = asset;

		if (!effect || effect === "none" || Array.isArray(volume)) {
			return volume ?? 1;
		}

		const clipLength = this.getLength() / 1000;
		const fade = Math.min(2, clipLength / 2);

		if (effect === "fadeIn") {
			return [{ from: 0, to: baseVolume, start: 0, length: fade }];
		}
		if (effect === "fadeOut") {
			return [{ from: baseVolume, to: 0, start: clipLength - fade, length: fade }];
		}
		// fadeInFadeOut
		return [
			{ from: 0, to: baseVolume, start: 0, length: fade },
			{ from: baseVolume, to: 0, start: clipLength - fade, length: fade }
		];
	}
}
