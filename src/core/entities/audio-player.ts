import * as howler from "howler";
import * as pixi from "pixi.js";

import { KeyframeBuilder } from "../animations/keyframe-builder";
import { type Size } from "../layouts/geometry";
import { AudioLoadParser } from "../loaders/audio-load-parser";
import { type AudioAsset } from "../schemas/audio-asset";
import { type Clip } from "../schemas/clip";

import type { Edit } from "./edit";
import { Player } from "./player";

export class AudioPlayer extends Player {
	private audioResource: howler.Howl | null;
	private isPlaying: boolean;

	private volumeKeyframeBuilder: KeyframeBuilder;

	private syncTimer: number;

	constructor(edit: Edit, clipConfiguration: Clip) {
		super(edit, clipConfiguration);

		this.audioResource = null;
		this.isPlaying = false;

		const audioAsset = clipConfiguration.asset as AudioAsset;

		this.volumeKeyframeBuilder = new KeyframeBuilder(audioAsset.volume ?? 1, this.getLength());
		this.syncTimer = 0;
	}

	public override async load(): Promise<void> {
		await super.load();

		const audioClipConfiguration = this.clipConfiguration.asset as AudioAsset;

		const identifier = audioClipConfiguration.src;
		const loadOptions: pixi.UnresolvedAsset = { src: identifier, loadParser: AudioLoadParser.Name };
		const audioResource = await this.edit.assetLoader.load<howler.Howl>(identifier, loadOptions);

		const isValidAudioSource = audioResource instanceof howler.Howl;
		if (!isValidAudioSource) {
			throw new Error(`Invalid audio source '${audioClipConfiguration.src}'.`);
		}

		this.audioResource = audioResource;
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

	public override getSize(): Size {
		return { width: 0, height: 0 };
	}

	public getVolume(): number {
		return this.volumeKeyframeBuilder.getValue(this.getPlaybackTime());
	}
}
