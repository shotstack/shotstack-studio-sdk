import { KeyframeBuilder } from "@animations/keyframe-builder";
import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import { type Size } from "@layouts/geometry";
import { AudioLoadParser } from "@loaders/audio-load-parser";
import { type AudioAsset, type ResolvedClip, type Keyframe } from "@schemas";
import * as howler from "howler";
import * as pixi from "pixi.js";

import { Player, PlayerType } from "./player";

export class AudioPlayer extends Player {
	private audioResource: howler.Howl | null;
	private isPlaying: boolean;
	private assetAcquisitions = new Map<number, string>();

	private volumeKeyframeBuilder!: KeyframeBuilder;

	private syncTimer: number;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Audio);

		this.audioResource = null;
		this.isPlaying = false;
		this.syncTimer = 0;
	}

	public override async load(): Promise<void> {
		const revision = this.beginMediaTimingLoad();
		await super.load();
		if (!this.isMediaTimingLoadCurrent(revision)) return;

		const audioClipConfiguration = this.clipConfiguration.asset as AudioAsset;

		const identifier = audioClipConfiguration.src;
		if (!identifier) {
			this.completeMediaTimingLoad(revision, null);
			// Prompt-bearing assets route to pending placeholder players — reaching here without a src is invalid data
			throw new Error("Audio asset has no src to load.");
		}
		const loadOptions: pixi.UnresolvedAsset = { src: identifier, parser: AudioLoadParser.Name };
		this.assetAcquisitions.set(revision, identifier);
		const audioResource = await this.edit.assetLoader.load<howler.Howl>(identifier, loadOptions);
		if (!this.isMediaTimingLoadCurrent(revision)) {
			if (audioResource) this.releaseAssetAcquisition(revision);
			else this.assetAcquisitions.delete(revision);
			return;
		}

		const isValidAudioSource = audioResource instanceof howler.Howl;
		if (!isValidAudioSource) {
			if (audioResource) this.releaseAssetAcquisition(revision);
			else this.assetAcquisitions.delete(revision);
			this.completeMediaTimingLoad(revision, null);
			throw new Error(`Invalid audio source '${audioClipConfiguration.src}'.`);
		}

		this.audioResource = audioResource;
		this.completeMediaTimingLoad(revision, sec(audioResource.duration()));

		// Create volume keyframes after timing is resolved (not in constructor)
		const baseVolume = typeof audioClipConfiguration.volume === "number" ? audioClipConfiguration.volume : 1;
		this.volumeKeyframeBuilder = new KeyframeBuilder(this.createVolumeKeyframes(audioClipConfiguration, baseVolume), this.getLength(), baseVolume);

		// Set initial volume immediately so the Howl never sits at the default of 1.0
		this.audioResource.volume(this.getVolume());

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
		// getPlaybackTime() returns seconds
		const playbackTime = this.getPlaybackTime();

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;
				this.audioResource.volume(this.getVolume());
				this.audioResource.seek(playbackTime + trim);
				this.audioResource.play();
			}

			if (this.audioResource.volume() !== this.getVolume()) {
				this.audioResource.volume(this.getVolume());
			}

			// Desync threshold: 0.1 seconds (100ms)
			const desyncThreshold = 0.1;
			// Both audioResource.seek() and playbackTime are in seconds
			const shouldSync = Math.abs(this.audioResource.seek() - trim - playbackTime) > desyncThreshold;

			if (shouldSync) {
				this.audioResource.seek(playbackTime + trim);
			}
		}

		if (this.isPlaying && !shouldClipPlay) {
			this.isPlaying = false;
			this.audioResource.pause();
		}

		// When paused, sync every 100ms for scrubbing
		const shouldSync = this.syncTimer > 100;
		if (!this.edit.isPlaying && this.isActive() && shouldSync) {
			this.syncTimer = 0;
			this.audioResource.seek(playbackTime + trim);
		}
	}

	public override dispose(): void {
		const { src } = this.clipConfiguration.asset as AudioAsset;
		this.releaseAssetAcquisitions(src);
		if (this.audioResource) {
			this.audioResource.stop();
			this.audioResource.unload();
		}
		this.audioResource = null;

		super.dispose();
	}

	/** Reload the audio asset when asset.src changes (e.g., merge field update or loadEdit) */
	public override async reloadAsset(): Promise<void> {
		const revision = this.beginMediaTimingLoad();
		this.releaseAssetAcquisitions();
		if (this.audioResource) {
			this.audioResource.stop();
			this.audioResource.unload();
		}
		this.audioResource = null;
		this.isPlaying = false;
		this.syncTimer = 0;

		const audioAsset = this.clipConfiguration.asset as AudioAsset;
		const { src } = audioAsset;
		if (!src) {
			this.completeMediaTimingLoad(revision, null);
			throw new Error("Audio asset has no src to load.");
		}
		const loadOptions: pixi.UnresolvedAsset = { src, parser: AudioLoadParser.Name };
		this.assetAcquisitions.set(revision, src);
		const audioResource = await this.edit.assetLoader.load<howler.Howl>(src, loadOptions);
		if (!this.isMediaTimingLoadCurrent(revision)) {
			if (audioResource) this.releaseAssetAcquisition(revision);
			else this.assetAcquisitions.delete(revision);
			return;
		}

		if (!(audioResource instanceof howler.Howl)) {
			if (audioResource) this.releaseAssetAcquisition(revision);
			else this.assetAcquisitions.delete(revision);
			this.completeMediaTimingLoad(revision, null);
			throw new Error(`Invalid audio source '${audioAsset.src}'.`);
		}

		this.audioResource = audioResource;
		this.completeMediaTimingLoad(revision, sec(audioResource.duration()));
		this.audioResource.volume(this.getVolume());
	}

	private releaseAssetAcquisition(revision: number): void {
		const identifier = this.assetAcquisitions.get(revision);
		if (!identifier) return;
		this.assetAcquisitions.delete(revision);
		this.edit.assetLoader.release(identifier);
	}

	private releaseAssetAcquisitions(alreadyReleasedIdentifier?: string): void {
		let skipIdentifier = alreadyReleasedIdentifier;
		for (const [revision, identifier] of this.assetAcquisitions) {
			this.assetAcquisitions.delete(revision);
			if (identifier === skipIdentifier) {
				skipIdentifier = undefined;
			} else {
				this.edit.assetLoader.release(identifier);
			}
		}
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
		// getPlaybackTime() returns seconds, audioTime is also seconds
		const playbackTime = this.getPlaybackTime();
		return Math.abs(audioTime - trim - playbackTime);
	}

	private createVolumeKeyframes(asset: AudioAsset, baseVolume: number): Keyframe[] | number {
		const { effect, volume } = asset;

		if (!effect || effect === "none" || Array.isArray(volume)) {
			return volume ?? 1;
		}

		const clipLength = this.getLength();
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
