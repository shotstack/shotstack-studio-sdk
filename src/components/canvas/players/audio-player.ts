import { KeyframeBuilder } from "@animations/keyframe-builder";
import type { Edit } from "@core/edit-session";
import { type Size } from "@layouts/geometry";
import { AudioLoadParser } from "@loaders/audio-load-parser";
import { type AudioAsset, type ResolvedClip, type Keyframe } from "@schemas";
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
		if (!identifier) {
			// Prompt-bearing assets route to pending placeholder players — reaching here without a src is invalid data
			throw new Error("Audio asset has no src to load.");
		}
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

		// Set initial volume immediately so the Howl never sits at the default of 1.0
		this.audioResource.volume(this.getVolume());

		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		this.syncTimer += elapsed;

		this.getContainer().alpha = 0;

		if (!this.audioResource) {
			return;
		}

		// Howler rate() crashes when _sounds is empty (e.g. after unload); skip until ready again.
		if (!this.isHowlControllable()) {
			this.isPlaying = false;
			return;
		}

		const speed = this.getAssetSpeed();
		const sourceTime = this.getSourceTime();
		const shouldClipPlay = this.edit.isPlaying && this.isActive() && speed > 0;

		if (shouldClipPlay) {
			if (!this.isPlaying) {
				this.isPlaying = true;
				this.setHowlVolume(this.getVolume());
				this.setHowlRate(speed);
				this.audioResource.seek(sourceTime);
				this.audioResource.play();
			}

			const currentVolume = this.getHowlVolume();
			if (currentVolume !== this.getVolume()) {
				this.setHowlVolume(this.getVolume());
			}

			const currentRate = this.getHowlRate();
			if (currentRate !== speed) {
				this.setHowlRate(speed);
			}

			// Desync threshold: 0.1 seconds (100ms)
			const desyncThreshold = 0.1;
			// Both audioResource.seek() and sourceTime are in source-media seconds
			const shouldSync = Math.abs((this.audioResource.seek() as number) - sourceTime) > desyncThreshold;

			if (shouldSync) {
				this.audioResource.seek(sourceTime);
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
			this.audioResource.seek(sourceTime);
		}
	}

	public override dispose(): void {
		if (this.audioResource) {
			this.audioResource.stop();
			this.audioResource.unload();
		}
		this.audioResource = null;

		super.dispose();
	}

	/** Reload the audio asset when asset.src changes (e.g., merge field update or loadEdit) */
	public override async reloadAsset(): Promise<void> {
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
			throw new Error("Audio asset has no src to load.");
		}
		const loadOptions: pixi.UnresolvedAsset = { src, parser: AudioLoadParser.Name };
		const audioResource = await this.edit.assetLoader.load<howler.Howl>(src, loadOptions);

		if (!(audioResource instanceof howler.Howl)) {
			throw new Error(`Invalid audio source '${audioAsset.src}'.`);
		}

		this.audioResource = audioResource;
		this.audioResource.volume(this.getVolume());
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

	public override getSourceDuration(): number | null {
		const duration = this.audioResource?.duration();
		return typeof duration === "number" && duration > 0 ? duration : null;
	}

	public getCurrentDrift(): number {
		if (!this.audioResource) return 0;
		// Both seek() and getSourceTime() are in source-media seconds
		return Math.abs((this.audioResource.seek() as number) - this.getSourceTime());
	}

	/**
	 * Howler's rate() getter does `self._sounds[0]._id` with no empty-pool check.
	 * After unload (or if the sound pool was cleared while we still hold a reference),
	 * that throws TypeError during the Pixi ticker. Guard before calling rate/volume/play.
	 */
	private isHowlControllable(): boolean {
		const howl = this.audioResource;
		if (!howl) {
			return false;
		}
		if (howl.state() !== "loaded") {
			return false;
		}
		// eslint-disable-next-line no-underscore-dangle -- Howler private sound pool; public rate() crashes when empty
		const sounds = (howl as howler.Howl & { _sounds?: unknown[] })._sounds;
		return Array.isArray(sounds) && sounds.length > 0;
	}

	private getHowlRate(): number {
		if (!this.audioResource || !this.isHowlControllable()) {
			return 1;
		}
		return this.audioResource.rate() as number;
	}

	private setHowlRate(speed: number): void {
		if (!this.audioResource || !this.isHowlControllable()) {
			return;
		}
		this.audioResource.rate(speed);
	}

	private getHowlVolume(): number {
		if (!this.audioResource || !this.isHowlControllable()) {
			return 0;
		}
		return this.audioResource.volume() as number;
	}

	private setHowlVolume(volume: number): void {
		if (!this.audioResource || !this.isHowlControllable()) {
			return;
		}
		this.audioResource.volume(volume);
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
