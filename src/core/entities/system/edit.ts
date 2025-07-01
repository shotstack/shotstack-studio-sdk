import * as pixi from "pixi.js";
import { z } from "zod";

import { EventEmitter } from "../../events/event-emitter";
import type { Size } from "../../layouts/geometry";
import { AssetLoader } from "../../loaders/asset-loader";
import { FontLoadParser } from "../../loaders/font-load-parser";
import { ClipSchema } from "../../schemas/clip";
import { EditSchema } from "../../schemas/edit";
import { TrackSchema } from "../../schemas/track";
import { Entity } from "../base/entity";
import type { Player } from "../base/player";
import { AudioPlayer } from "../players/audio-player";
import { HtmlPlayer } from "../players/html-player";
import { ImagePlayer } from "../players/image-player";
import { LumaPlayer } from "../players/luma-player";
import { ShapePlayer } from "../players/shape-player";
import { TextPlayer } from "../players/text-player";
import { VideoPlayer } from "../players/video-player";

type EditType = z.infer<typeof EditSchema>;
type ClipType = z.infer<typeof ClipSchema>;
type TrackType = z.infer<typeof TrackSchema>;

export class Edit extends Entity {
	private static readonly ZIndexPadding = 100;

	public assetLoader: AssetLoader;
	public events: EventEmitter;

	private edit: EditType | null;
	private tracks: Player[][];
	private clipsToDispose: Player[];
	private clips: Player[];

	public playbackTime: number;
	/** @internal */
	public size: Size;
	/** @internal */
	private backgroundColor: string;
	public totalDuration: number;
	/** @internal */
	public isPlaying: boolean;
	/** @internal */
	private selectedClip: Player | null;
	/** @internal */
	private updatedClip: Player | null;

	constructor(size: Size, backgroundColor: string = "#ffffff") {
		super();

		this.assetLoader = new AssetLoader();
		this.edit = null;

		this.tracks = [];
		this.clipsToDispose = [];
		this.clips = [];

		this.events = new EventEmitter();

		this.size = size;

		this.playbackTime = 0;
		this.totalDuration = 0;
		this.isPlaying = false;
		this.selectedClip = null;
		this.updatedClip = null;
		this.backgroundColor = backgroundColor;
	}

	public override async load(): Promise<void> {
		const background = new pixi.Graphics();
		background.fillStyle = {
			color: this.backgroundColor
		};

		background.rect(0, 0, this.size.width, this.size.height);
		background.fill();

		this.getContainer().addChild(background);
	}

	/** @internal */
	public override update(deltaTime: number, elapsed: number): void {
		for (const clip of this.clips) {
			if (clip.shouldDispose) {
				this.queueDisposeClip(clip);
			}

			clip.update(deltaTime, elapsed);
		}

		this.disposeClips();

		if (this.isPlaying) {
			this.playbackTime = Math.max(0, Math.min(this.playbackTime + elapsed, this.totalDuration));

			if (this.playbackTime === this.totalDuration) {
				this.pause();
			}
		}
	}
	/** @internal */
	public override draw(): void {
		for (const clip of this.clips) {
			clip.draw();
		}
	}
	/** @internal */
	public override dispose(): void {
		this.clearClips();
	}

	public play(): void {
		this.isPlaying = true;
	}
	public pause(): void {
		this.isPlaying = false;
	}
	public seek(target: number): void {
		this.playbackTime = Math.max(0, Math.min(target, this.totalDuration));
		this.pause();
	}
	public stop(): void {
		this.seek(0);
	}

	public async loadEdit(edit: EditType): Promise<void> {
		this.clearClips();

		this.edit = EditSchema.parse(edit);

		this.backgroundColor = this.edit.timeline.background || "#000000";

		await Promise.all(
			(this.edit.timeline.fonts ?? []).map(async font => {
				const identifier = font.src;
				const loadOptions: pixi.UnresolvedAsset = { src: identifier, loadParser: FontLoadParser.Name };

				return this.assetLoader.load<FontFace>(identifier, loadOptions);
			})
		);

		for (const [trackIdx, track] of this.edit.timeline.tracks.entries()) {
			for (const clip of track.clips) {
				const clipPlayer = this.createPlayerFromAssetType(clip);
				clipPlayer.layer = trackIdx + 1;
				await this.addPlayer(trackIdx, clipPlayer);
			}
		}

		this.updateTotalDuration();
	}
	public getEdit(): EditType {
		const tracks: TrackType[] = [];
		const trackMap = new Map<number, TrackType>();

		for (const clip of this.clips) {
			if (!trackMap.has(clip.layer)) {
				trackMap.set(clip.layer, { clips: [] });
			}
			trackMap.get(clip.layer)!.clips.push(clip.clipConfiguration);
		}

		const maxTrack = Math.max(...trackMap.keys(), 0);
		for (let i = 1; i <= maxTrack; i += 1) {
			tracks[i - 1] = trackMap.get(i) || { clips: [] };
		}

		return {
			timeline: {
				background: this.backgroundColor,
				tracks,
				fonts: this.edit?.timeline.fonts || []
			},
			output: this.edit?.output || { size: this.size, format: "mp4" }
		};
	}

	public addClip(trackIdx: number, clip: ClipType): void {
		const validatedClip = ClipSchema.parse(clip);

		const clipPlayer = this.createPlayerFromAssetType(validatedClip);
		clipPlayer.layer = trackIdx + 1;
		this.addPlayer(trackIdx, clipPlayer);

		this.updateTotalDuration();
	}
	public getClip(trackIdx: number, clipIdx: number): ClipType | null {
		const clipsByTrack = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (clipIdx < 0 || clipIdx >= clipsByTrack.length) return null;

		return clipsByTrack[clipIdx].clipConfiguration;
	}
	public deleteClip(trackIdx: number, clipIdx: number): void {
		const clipToDelete = this.clips.find(
			(clip: Player) => clip.layer === trackIdx + 1 && this.clips.filter((c: Player) => c.layer === trackIdx + 1).indexOf(clip) === clipIdx
		);

		if (clipToDelete) {
			this.queueDisposeClip(clipToDelete);
			this.updateTotalDuration();
		}
	}

	public addTrack(trackIdx: number, track: TrackType): void {
		this.tracks.splice(trackIdx, 0, []);

		const affectedClipIndices = this.clips.map((clip, index) => ({ clip, index })).filter(({ clip }) => clip.layer >= trackIdx + 1);

		affectedClipIndices.forEach(({ clip }) => {
			const oldZIndex = 100000 - clip.layer * Edit.ZIndexPadding;
			const oldContainerKey = `shotstack-track-${oldZIndex}`;

			const oldContainer = this.getContainer().getChildByLabel(oldContainerKey, false);
			oldContainer?.removeChild(clip.getContainer());
		});

		for (const { index } of affectedClipIndices) {
			this.clips[index].layer += 1;
		}

		affectedClipIndices.forEach(({ clip }) => {
			const newZIndex = 100000 - clip.layer * Edit.ZIndexPadding;
			const newContainerKey = `shotstack-track-${newZIndex}`;

			let container = this.getContainer().getChildByLabel(newContainerKey, false);
			if (!container) {
				container = new pixi.Container({
					label: newContainerKey,
					zIndex: newZIndex
				});
				this.getContainer().addChild(container);
			}

			container.addChild(clip.getContainer());
		});

		track?.clips?.forEach(clip => this.addClip(trackIdx, clip));

		this.updateTotalDuration();
	}
	public getTrack(trackIdx: number): TrackType | null {
		const trackClips = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (trackClips.length === 0) return null;

		return {
			clips: trackClips.map((clip: Player) => clip.clipConfiguration)
		};
	}
	public deleteTrack(trackIdx: number): void {
		const trackClips = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		for (const clip of trackClips) {
			clip.shouldDispose = true;
		}

		this.disposeClips();

		this.tracks.splice(trackIdx, 1);

		const affectedClipIndices = this.clips.map((clip, index) => ({ clip, index })).filter(({ clip }) => clip.layer > trackIdx + 1);

		affectedClipIndices.forEach(({ clip }) => {
			const oldZIndex = 100000 - clip.layer * Edit.ZIndexPadding;
			const oldContainerKey = `shotstack-track-${oldZIndex}`;
			const oldContainer = this.getContainer().getChildByLabel(oldContainerKey, false);
			oldContainer?.removeChild(clip.getContainer());
		});

		for (const { index } of affectedClipIndices) {
			this.clips[index].layer -= 1;
		}

		affectedClipIndices.forEach(({ clip }) => {
			const newZIndex = 100000 - clip.layer * Edit.ZIndexPadding;
			const newContainerKey = `shotstack-track-${newZIndex}`;

			let container = this.getContainer().getChildByLabel(newContainerKey, false);
			if (!container) {
				container = new pixi.Container({
					label: newContainerKey,
					zIndex: newZIndex
				});
				this.getContainer().addChild(container);
			}

			container.addChild(clip.getContainer());
		});

		this.updateTotalDuration();
	}

	public getTotalDuration(): number {
		return this.totalDuration;
	}
	/** @internal */
	public getSelectedClip(): Player | null {
		return this.selectedClip;
	}
	/** @internal */
	public setSelectedClip(clip: Player): void {
		this.selectedClip = clip;

		const trackIndex = clip.layer - 1;
		const clipsByTrack = this.clips.filter((clipItem: Player) => clipItem.layer === clip.layer);
		const clipIndex = clipsByTrack.indexOf(clip);

		const eventData = {
			clip: clip.clipConfiguration,
			trackIndex,
			clipIndex
		};

		this.events.emit("clip:selected", eventData);
	}
	/** @internal */
	public setUpdatedClip(clip: Player, initialClipConfig: any = null): void {
		this.updatedClip = clip;

		const trackIndex = clip.layer - 1;
		const clipsByTrack = this.clips.filter((clipItem: Player) => clipItem.layer === clip.layer);
		const clipIndex = clipsByTrack.indexOf(clip);

		const eventData = {
			previous: {
				clip: initialClipConfig,
				trackIndex,
				clipIndex
			},
			current: {
				clip: clip.clipConfiguration,
				trackIndex,
				clipIndex
			}
		};

		this.events.emit("clip:updated", eventData);
	}

	private queueDisposeClip(clipToDispose: Player): void {
		this.clipsToDispose.push(clipToDispose);
	}
	protected disposeClips(): void {
		if (this.clipsToDispose.length === 0) {
			return;
		}

		for (const clip of this.clipsToDispose) {
			this.disposeClip(clip);
		}

		this.clips = this.clips.filter((clip: Player) => !this.clipsToDispose.includes(clip));
		this.clipsToDispose = [];
		this.updateTotalDuration();
	}
	private disposeClip(clip: Player): void {
		try {
			if (this.getContainer().children.includes(clip.getContainer())) {
				const childIndex = this.getContainer().getChildIndex(clip.getContainer());
				this.getContainer().removeChildAt(childIndex);
			} else {
				for (const child of this.getContainer().children) {
					if (child instanceof pixi.Container && child.label?.toString().startsWith("shotstack-track-")) {
						if (child.children.includes(clip.getContainer())) {
							child.removeChild(clip.getContainer());
							break;
						}
					}
				}
			}
		} catch (error) {
			console.warn("Attempting to unmount an unmounted clip.");
		}

		this.unloadClipAssets(clip);
		clip.dispose();
	}
	private unloadClipAssets(clip: Player): void {
		const { asset } = clip.clipConfiguration;
		if (asset && "src" in asset && typeof asset.src === "string") {
			try {
				pixi.Assets.unload(asset.src);
			} catch (error) {
				console.warn(`Failed to unload asset: ${asset.src}`, error);
			}
		}
	}
	protected clearClips(): void {
		for (const clip of this.clips) {
			this.disposeClip(clip);
		}

		this.clips = [];

		this.clipsToDispose = [];

		this.updateTotalDuration();
	}
	private updateTotalDuration(): void {
		let maxDuration = 0;

		for (const track of this.tracks) {
			for (const clip of track) {
				maxDuration = Math.max(maxDuration, clip.getEnd());
			}
		}

		this.totalDuration = maxDuration;
	}
	private createPlayerFromAssetType(clipConfiguration: ClipType): Player {
		if (!clipConfiguration.asset?.type) {
			throw new Error("Invalid clip configuration: missing asset type");
		}

		let player: Player;

		switch (clipConfiguration.asset.type) {
			case "text": {
				player = new TextPlayer(this, clipConfiguration);
				break;
			}
			case "shape": {
				player = new ShapePlayer(this, clipConfiguration);
				break;
			}
			case "html": {
				player = new HtmlPlayer(this, clipConfiguration);
				break;
			}
			case "image": {
				player = new ImagePlayer(this, clipConfiguration);
				break;
			}
			case "video": {
				player = new VideoPlayer(this, clipConfiguration);
				break;
			}
			case "audio": {
				player = new AudioPlayer(this, clipConfiguration);
				break;
			}
			case "luma": {
				player = new LumaPlayer(this, clipConfiguration);
				break;
			}
			default:
				throw new Error(`Unsupported clip type: ${(clipConfiguration.asset as any).type}`);
		}

		return player;
	}
	private async addPlayer(trackIdx: number, clipToAdd: Player): Promise<void> {
		while (this.tracks.length <= trackIdx) {
			this.tracks.push([]);
		}

		this.tracks[trackIdx].push(clipToAdd);

		this.clips.push(clipToAdd);

		const zIndex = 100000 - (trackIdx + 1) * Edit.ZIndexPadding;

		const trackContainerKey = `shotstack-track-${zIndex}`;
		let trackContainer = this.getContainer().getChildByLabel(trackContainerKey, false);

		if (!trackContainer) {
			trackContainer = new pixi.Container({ label: trackContainerKey, zIndex });
			this.getContainer().addChild(trackContainer);
		}

		trackContainer.addChild(clipToAdd.getContainer());

		const isClipMask = clipToAdd instanceof LumaPlayer;

		await clipToAdd.load();

		if (isClipMask) {
			trackContainer.setMask({ mask: clipToAdd.getMask(), inverse: true });
		}

		this.updateTotalDuration();
	}
}
