import { AudioPlayer } from "@canvas/players/audio-player";
import { HtmlPlayer } from "@canvas/players/html-player";
import { ImagePlayer } from "@canvas/players/image-player";
import { LumaPlayer } from "@canvas/players/luma-player";
import type { Player } from "@canvas/players/player";
import { RichTextPlayer } from "@canvas/players/rich-text-player";
import { ShapePlayer } from "@canvas/players/shape-player";
import { TextPlayer } from "@canvas/players/text-player";
import { VideoPlayer } from "@canvas/players/video-player";
import type { Canvas } from "@canvas/shotstack-canvas";
import { AddClipCommand } from "@core/commands/add-clip-command";
import { AddTrackCommand } from "@core/commands/add-track-command";
import { ClearSelectionCommand } from "@core/commands/clear-selection-command";
import { DeleteClipCommand } from "@core/commands/delete-clip-command";
import { DeleteTrackCommand } from "@core/commands/delete-track-command";
import { SelectClipCommand } from "@core/commands/select-clip-command";
import { SetUpdatedClipCommand } from "@core/commands/set-updated-clip-command";
import { SplitClipCommand } from "@core/commands/split-clip-command";
import { UpdateTextContentCommand } from "@core/commands/update-text-content-command";
import { EventEmitter } from "@core/events/event-emitter";
import { applyMergeFields } from "@core/merge/merge-fields";
import { Entity } from "@core/shared/entity";
import { deepMerge } from "@core/shared/utils";
import { calculateTimelineEnd, resolveAutoLength, resolveAutoStart, resolveEndLength } from "@core/timing/resolver";
import { LoadingOverlay } from "@core/ui/loading-overlay";
import type { Size } from "@layouts/geometry";
import { AssetLoader } from "@loaders/asset-loader";
import { FontLoadParser } from "@loaders/font-load-parser";
import { ClipSchema } from "@schemas/clip";
import { EditSchema } from "@schemas/edit";
import { TrackSchema } from "@schemas/track";
import * as pixi from "pixi.js";
import { z } from "zod";

import type { EditCommand, CommandContext } from "./commands/types";

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
	private commandHistory: EditCommand[] = [];
	private commandIndex: number = -1;

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
	/** @internal */
	private viewportMask?: pixi.Graphics;
	/** @internal */
	private background: pixi.Graphics | null;
	/** @internal */
	private isExporting: boolean = false;

	// Performance optimization: cache timeline end and track "end" length clips
	private cachedTimelineEnd: number = 0;
	private endLengthClips: Set<Player> = new Set();

	private canvas: Canvas | null = null;
	private activeLumaMasks: Array<{
		lumaPlayer: LumaPlayer;
		maskSprite: pixi.Sprite;
		tempContainer: pixi.Container;
	}> = [];

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
		this.background = null;

		// Set up event-driven architecture
		this.setupIntentListeners();
	}

	public override async load(): Promise<void> {
		const background = new pixi.Graphics();
		this.background = background;
		background.fillStyle = {
			color: this.backgroundColor
		};

		background.rect(0, 0, this.size.width, this.size.height);
		background.fill();

		this.getContainer().addChild(background);

		// Ensure content outside the edit viewport is not visible
		this.viewportMask = new pixi.Graphics();
		this.viewportMask.rect(0, 0, this.size.width, this.size.height);
		this.viewportMask.fill(0xffffff);
		this.getContainer().addChild(this.viewportMask);
		this.getContainer().setMask({ mask: this.viewportMask });
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

		// Update luma masks for video sources (regenerate mask texture each frame)
		this.updateLumaMasks();

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

		for (const mask of this.activeLumaMasks) {
			mask.tempContainer.destroy({ children: true });
			mask.maskSprite.texture.destroy(true);
		}
		this.activeLumaMasks = [];

		if (this.viewportMask) {
			try {
				this.getContainer().setMask(null as any);
			} catch {
				// Ignore errors when removing mask during dispose
			}
			this.viewportMask.destroy();
			this.viewportMask = undefined;
		}

		TextPlayer.resetFontCache();
	}

	private updateViewportMask(): void {
		if (this.viewportMask) {
			this.viewportMask.clear();
			this.viewportMask.rect(0, 0, this.size.width, this.size.height);
			this.viewportMask.fill(0xffffff);
		}
	}

	public play(): void {
		this.isPlaying = true;
		this.events.emit("playback:play", {});
	}
	public pause(): void {
		this.isPlaying = false;
		this.events.emit("playback:pause", {});
	}
	public seek(target: number): void {
		this.playbackTime = Math.max(0, Math.min(target, this.totalDuration));
		this.pause();
		// Force immediate render - elapsed > 100 triggers VideoPlayer sync
		this.update(0, 101);
		this.draw();
	}
	public stop(): void {
		this.seek(0);
	}

	public async loadEdit(edit: EditType): Promise<void> {
		const loading = new LoadingOverlay();
		loading.show();

		const onProgress = () => loading.update(this.assetLoader.getProgress());
		this.assetLoader.loadTracker.on("onAssetLoadInfoUpdated", onProgress);

		try {
			this.clearClips();

			const mergeFields = edit.merge ?? [];
			const mergedEdit = mergeFields.length > 0 ? applyMergeFields(edit, mergeFields) : edit;

			this.edit = EditSchema.parse(mergedEdit);

			const newSize = this.edit.output?.size;
			if (newSize && (newSize.width !== this.size.width || newSize.height !== this.size.height)) {
				this.size = newSize;
				this.updateViewportMask();
				this.canvas?.zoomToFit();
			}

			this.backgroundColor = this.edit.timeline.background || "#000000";

			if (this.background) {
				this.background.clear();
				this.background.fillStyle = {
					color: this.backgroundColor
				};
				this.background.rect(0, 0, this.size.width, this.size.height);
				this.background.fill();
			}

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

			this.finalizeLumaMasking();

			await this.resolveAllTiming();

			this.updateTotalDuration();

			if (this.edit.timeline.soundtrack) {
				await this.loadSoundtrack(this.edit.timeline.soundtrack);
			}

			this.events.emit("timeline:updated", { current: this.getResolvedEdit() });
		} finally {
			this.assetLoader.loadTracker.off("onAssetLoadInfoUpdated", onProgress);
			loading.hide();
		}
	}

	private async loadSoundtrack(soundtrack: { src: string; effect?: string; volume?: number }): Promise<void> {
		const clip = ClipSchema.parse({
			asset: {
				type: "audio",
				src: soundtrack.src,
				effect: soundtrack.effect,
				volume: soundtrack.volume ?? 1
			},
			start: 0,
			length: this.totalDuration / 1000
		});

		const player = new AudioPlayer(this, clip);
		player.layer = this.tracks.length + 1;
		await this.addPlayer(this.tracks.length, player);
	}
	public getEdit(): EditType {
		return this.buildEditSnapshot(player => player.getTimingIntent());
	}

	public getResolvedEdit(): EditType {
		return this.buildEditSnapshot(player => ({
			start: player.getStart() / 1000,
			length: player.getLength() / 1000
		}));
	}

	private buildEditSnapshot(getClipTiming: (player: Player) => { start: number | "auto"; length: number | "auto" | "end" }): EditType {
		const tracks: TrackType[] = this.tracks.map(track => ({
			clips: track
				.filter(player => player && !this.clipsToDispose.includes(player))
				.map(player => {
					const timing = getClipTiming(player);
					return {
						...player.clipConfiguration,
						start: timing.start,
						length: timing.length
					};
				})
		}));

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
		const command = new AddClipCommand(trackIdx, clip);
		this.executeCommand(command);
	}
	public getClip(trackIdx: number, clipIdx: number): ClipType | null {
		const clipsByTrack = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (clipIdx < 0 || clipIdx >= clipsByTrack.length) return null;

		return clipsByTrack[clipIdx].clipConfiguration;
	}

	public getPlayerClip(trackIdx: number, clipIdx: number): Player | null {
		const clipsByTrack = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (clipIdx < 0 || clipIdx >= clipsByTrack.length) return null;

		return clipsByTrack[clipIdx];
	}
	public deleteClip(trackIdx: number, clipIdx: number): void {
		const command = new DeleteClipCommand(trackIdx, clipIdx);
		this.executeCommand(command);
	}

	public splitClip(trackIndex: number, clipIndex: number, splitTime: number): void {
		const command = new SplitClipCommand(trackIndex, clipIndex, splitTime);
		this.executeCommand(command);
	}

	public addTrack(trackIdx: number, track: TrackType): void {
		const command = new AddTrackCommand(trackIdx);
		this.executeCommand(command);
		track?.clips?.forEach(clip => this.addClip(trackIdx, clip));
	}
	public getTrack(trackIdx: number): TrackType | null {
		const trackClips = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (trackClips.length === 0) return null;

		return {
			clips: trackClips.map((clip: Player) => clip.clipConfiguration)
		};
	}
	public deleteTrack(trackIdx: number): void {
		const command = new DeleteTrackCommand(trackIdx);
		this.executeCommand(command);
	}

	public getTotalDuration(): number {
		return this.totalDuration;
	}

	public undo(): void {
		if (this.commandIndex >= 0) {
			const command = this.commandHistory[this.commandIndex];
			if (command.undo) {
				const context = this.createCommandContext();
				command.undo(context);
				this.commandIndex -= 1;
				this.events.emit("edit:undo", { command: command.name });
			}
		}
	}

	public redo(): void {
		if (this.commandIndex < this.commandHistory.length - 1) {
			this.commandIndex += 1;
			const command = this.commandHistory[this.commandIndex];
			const context = this.createCommandContext();
			command.execute(context);
			this.events.emit("edit:redo", { command: command.name });
		}
	}
	/** @internal */
	public setUpdatedClip(clip: Player, initialClipConfig: ClipType | null = null, finalClipConfig: ClipType | null = null): void {
		const command = new SetUpdatedClipCommand(clip, initialClipConfig, finalClipConfig);
		this.executeCommand(command);
	}

	public updateClip(trackIdx: number, clipIdx: number, updates: Partial<ClipType>): void {
		const clip = this.getPlayerClip(trackIdx, clipIdx);
		if (!clip) {
			console.warn(`Clip not found at track ${trackIdx}, index ${clipIdx}`);
			return;
		}

		const initialConfig = structuredClone(clip.clipConfiguration);
		const currentConfig = structuredClone(clip.clipConfiguration);
		const mergedConfig = deepMerge(currentConfig, updates);
		this.setUpdatedClip(clip, initialConfig, mergedConfig);
	}

	/** @internal */
	public updateTextContent(clip: Player, newText: string, initialConfig: ClipType): void {
		const command = new UpdateTextContentCommand(clip, newText, initialConfig);
		this.executeCommand(command);
	}

	public executeEditCommand(command: EditCommand): void | Promise<void> {
		return this.executeCommand(command);
	}

	private executeCommand(command: EditCommand): void | Promise<void> {
		const context = this.createCommandContext();
		const result = command.execute(context);
		this.commandHistory = this.commandHistory.slice(0, this.commandIndex + 1);
		this.commandHistory.push(command);
		this.commandIndex += 1;
		return result;
	}

	private createCommandContext(): CommandContext {
		return {
			getClips: () => this.clips,
			getTracks: () => this.tracks,
			getTrack: trackIndex => {
				if (trackIndex >= 0 && trackIndex < this.tracks.length) {
					return this.tracks[trackIndex];
				}
				return null;
			},
			getContainer: () => this.getContainer(),
			addPlayer: (trackIdx, player) => this.addPlayer(trackIdx, player),
			addPlayerToContainer: (trackIdx, player) => {
				this.addPlayerToContainer(trackIdx, player);
			},
			createPlayerFromAssetType: clipConfiguration => this.createPlayerFromAssetType(clipConfiguration),
			queueDisposeClip: player => this.queueDisposeClip(player),
			disposeClips: () => this.disposeClips(),
			undeleteClip: (trackIdx, clip) => {
				this.clips.push(clip);

				if (trackIdx >= 0 && trackIdx < this.tracks.length) {
					const track = this.tracks[trackIdx];
					let insertIdx = track.length;
					for (let i = 0; i < track.length; i += 1) {
						if (track[i].getStart() > clip.getStart()) {
							insertIdx = i;
							break;
						}
					}
					track.splice(insertIdx, 0, clip);
				}

				this.addPlayerToContainer(trackIdx, clip);

				clip.load();

				this.updateTotalDuration();
			},
			setUpdatedClip: clip => {
				this.updatedClip = clip;
			},
			restoreClipConfiguration: (clip, previousConfig) => {
				const cloned = structuredClone(previousConfig);
				const config = clip.clipConfiguration as Record<string, unknown>;
				for (const key of Object.keys(config)) {
					delete config[key];
				}
				Object.assign(config, cloned);
				clip.reconfigureAfterRestore();
				clip.draw();
			},
			updateDuration: () => this.updateTotalDuration(),
			emitEvent: (name, data) => this.events.emit(name, data),
			findClipIndices: player => this.findClipIndices(player),
			getClipAt: (trackIndex, clipIndex) => this.getClipAt(trackIndex, clipIndex),
			getSelectedClip: () => this.selectedClip,
			setSelectedClip: clip => {
				this.selectedClip = clip;
			},
			movePlayerToTrackContainer: (player, fromTrackIdx, toTrackIdx) => this.movePlayerToTrackContainer(player, fromTrackIdx, toTrackIdx),
			getEditState: () => this.getResolvedEdit(),
			propagateTimingChanges: (trackIndex, startFromClipIndex) => this.propagateTimingChanges(trackIndex, startFromClipIndex),
			resolveClipAutoLength: clip => this.resolveClipAutoLength(clip),
			untrackEndLengthClip: clip => this.endLengthClips.delete(clip),
			trackEndLengthClip: clip => this.endLengthClips.add(clip)
		};
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

		for (const clip of this.clipsToDispose) {
			const trackIdx = clip.layer - 1;
			if (trackIdx >= 0 && trackIdx < this.tracks.length) {
				const clipIdx = this.tracks[trackIdx].indexOf(clip);
				if (clipIdx !== -1) {
					this.tracks[trackIdx].splice(clipIdx, 1);
				}
			}
		}

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
			console.warn(`Attempting to unmount an unmounted clip: ${error}`);
		}

		this.unloadClipAssets(clip);

		// Remove from endLengthClips tracking
		this.endLengthClips.delete(clip);

		// Invalidate cache since timeline end may have changed
		this.cachedTimelineEnd = 0;

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
		this.tracks = [];
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

		const previousDuration = this.totalDuration;
		this.totalDuration = maxDuration;

		// Emit event if duration changed
		if (previousDuration !== this.totalDuration) {
			this.events.emit("duration:changed", { duration: this.totalDuration });
		}
	}

	private async resolveAllTiming(): Promise<void> {
		for (let trackIdx = 0; trackIdx < this.tracks.length; trackIdx += 1) {
			for (let clipIdx = 0; clipIdx < this.tracks[trackIdx].length; clipIdx += 1) {
				const clip = this.tracks[trackIdx][clipIdx];
				const intent = clip.getTimingIntent();

				let resolvedStart: number;
				if (intent.start === "auto") {
					resolvedStart = resolveAutoStart(trackIdx, clipIdx, this.tracks);
				} else {
					resolvedStart = intent.start * 1000;
				}

				let resolvedLength: number;
				if (intent.length === "auto") {
					resolvedLength = await resolveAutoLength(clip.clipConfiguration.asset);
				} else if (intent.length === "end") {
					resolvedLength = 0;
				} else {
					resolvedLength = intent.length * 1000;
				}

				clip.setResolvedTiming({ start: resolvedStart, length: resolvedLength });
			}
		}

		const timelineEnd = calculateTimelineEnd(this.tracks);

		this.cachedTimelineEnd = timelineEnd;

		for (const clip of [...this.endLengthClips]) {
			const resolved = clip.getResolvedTiming();
			clip.setResolvedTiming({
				start: resolved.start,
				length: resolveEndLength(resolved.start, timelineEnd)
			});
		}
	}

	public propagateTimingChanges(trackIndex: number, startFromClipIndex: number): void {
		const track = this.tracks[trackIndex];
		if (!track) return;

		for (let i = Math.max(0, startFromClipIndex + 1); i < track.length; i += 1) {
			const clip = track[i];
			if (clip.getTimingIntent().start === "auto") {
				const newStart = resolveAutoStart(trackIndex, i, this.tracks);
				clip.setResolvedTiming({
					start: newStart,
					length: clip.getLength()
				});
				clip.reconfigureAfterRestore();
			}
		}

		const newTimelineEnd = calculateTimelineEnd(this.tracks);
		if (newTimelineEnd !== this.cachedTimelineEnd) {
			this.cachedTimelineEnd = newTimelineEnd;

			for (const clip of [...this.endLengthClips]) {
				const newLength = resolveEndLength(clip.getStart(), newTimelineEnd);
				const currentLength = clip.getLength();

				if (Math.abs(newLength - currentLength) > 1) {
					clip.setResolvedTiming({
						start: clip.getStart(),
						length: newLength
					});
					clip.reconfigureAfterRestore();
				}
			}
		}

		this.updateTotalDuration();

		// Notify Timeline to update visuals with new timing (use resolved values)
		this.events.emit("timeline:updated", {
			current: this.getResolvedEdit()
		});
	}

	public async resolveClipAutoLength(clip: Player): Promise<void> {
		const intent = clip.getTimingIntent();
		if (intent.length !== "auto") return;

		const newLength = await resolveAutoLength(clip.clipConfiguration.asset);
		clip.setResolvedTiming({
			start: clip.getStart(),
			length: newLength
		});
		clip.reconfigureAfterRestore();

		const indices = this.findClipIndices(clip);
		if (indices) {
			this.propagateTimingChanges(indices.trackIndex, indices.clipIndex);
		}
	}

	private addPlayerToContainer(trackIndex: number, player: Player): void {
		const zIndex = 100000 - (trackIndex + 1) * Edit.ZIndexPadding;
		const trackContainerKey = `shotstack-track-${zIndex}`;
		let trackContainer = this.getContainer().getChildByLabel(trackContainerKey, false);

		if (!trackContainer) {
			trackContainer = new pixi.Container({ label: trackContainerKey, zIndex });
			this.getContainer().addChild(trackContainer);
		}

		trackContainer.addChild(player.getContainer());
	}

	// Move a player's container to the appropriate track container
	private movePlayerToTrackContainer(player: Player, fromTrackIdx: number, toTrackIdx: number): void {
		if (fromTrackIdx === toTrackIdx) return;

		// Calculate z-indices for track containers
		const fromZIndex = 100000 - (fromTrackIdx + 1) * Edit.ZIndexPadding;
		const toZIndex = 100000 - (toTrackIdx + 1) * Edit.ZIndexPadding;

		// Get track containers
		const fromTrackContainerKey = `shotstack-track-${fromZIndex}`;
		const toTrackContainerKey = `shotstack-track-${toZIndex}`;

		const fromTrackContainer = this.getContainer().getChildByLabel(fromTrackContainerKey, false);
		let toTrackContainer = this.getContainer().getChildByLabel(toTrackContainerKey, false);

		// Create new track container if it doesn't exist
		if (!toTrackContainer) {
			toTrackContainer = new pixi.Container({ label: toTrackContainerKey, zIndex: toZIndex });
			this.getContainer().addChild(toTrackContainer);
		}

		// Move player container from old track container to new one
		if (fromTrackContainer) {
			fromTrackContainer.removeChild(player.getContainer());
		}
		toTrackContainer.addChild(player.getContainer());
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
			case "rich-text": {
				player = new RichTextPlayer(this, clipConfiguration);
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

		if (clipToAdd.getTimingIntent().length === "end") {
			this.endLengthClips.add(clipToAdd);
		}

		const zIndex = 100000 - (trackIdx + 1) * Edit.ZIndexPadding;

		const trackContainerKey = `shotstack-track-${zIndex}`;
		let trackContainer = this.getContainer().getChildByLabel(trackContainerKey, false);

		if (!trackContainer) {
			trackContainer = new pixi.Container({ label: trackContainerKey, zIndex });
			this.getContainer().addChild(trackContainer);
		}

		trackContainer.addChild(clipToAdd.getContainer());

		await clipToAdd.load();

		this.updateTotalDuration();
	}

	/**
	 * Luma mattes use grayscale video to mask content clips.
	 * PixiJS masks are inverted vs backend convention (white=visible, not transparent),
	 * so we bake a negative filter into the mask texture via generateTexture().
	 * For video luma sources, we regenerate the mask texture each frame.
	 */
	private finalizeLumaMasking(): void {
		if (!this.canvas) return;

		for (const trackClips of this.tracks) {
			const lumaPlayer = trackClips.find(clip => clip instanceof LumaPlayer) as LumaPlayer | undefined;
			const lumaSprite = lumaPlayer?.getSprite();
			const contentClips = trackClips.filter(clip => !(clip instanceof LumaPlayer));

			if (lumaPlayer && lumaSprite?.texture && contentClips.length > 0) {
				this.setupLumaMask(lumaPlayer, lumaSprite.texture, contentClips[0]);
				lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
			}
		}
	}

	private setupLumaMask(lumaPlayer: LumaPlayer, lumaTexture: pixi.Texture, contentClip: Player): void {
		const { renderer } = this.canvas!.application;
		const { width, height } = contentClip.getSize();

		const tempContainer = new pixi.Container();
		const tempSprite = new pixi.Sprite(lumaTexture);
		tempSprite.width = width;
		tempSprite.height = height;

		const invertFilter = new pixi.ColorMatrixFilter();
		invertFilter.negative(false);
		tempSprite.filters = [invertFilter];
		tempContainer.addChild(tempSprite);

		const maskTexture = renderer.generateTexture(tempContainer);
		const maskSprite = new pixi.Sprite(maskTexture);
		contentClip.getContainer().addChild(maskSprite);
		contentClip.getContentContainer().setMask({ mask: maskSprite });

		this.activeLumaMasks.push({ lumaPlayer, maskSprite, tempContainer });
	}

	private updateLumaMasks(): void {
		if (!this.canvas) return;
		const { renderer } = this.canvas.application;

		for (const mask of this.activeLumaMasks) {
			if (mask.lumaPlayer.isVideoSource()) {
				const oldTexture = mask.maskSprite.texture;
				mask.maskSprite.texture = renderer.generateTexture(mask.tempContainer);

				oldTexture.destroy(true);
			}
		}
	}

	public selectClip(trackIndex: number, clipIndex: number): void {
		const command = new SelectClipCommand(trackIndex, clipIndex);
		this.executeCommand(command);
	}
	public clearSelection(): void {
		const command = new ClearSelectionCommand();
		this.executeCommand(command);
	}
	public isClipSelected(trackIndex: number, clipIndex: number): boolean {
		if (!this.selectedClip) return false;

		const selectedTrackIndex = this.selectedClip.layer - 1;
		const selectedClipIndex = this.tracks[selectedTrackIndex].indexOf(this.selectedClip);

		return trackIndex === selectedTrackIndex && clipIndex === selectedClipIndex;
	}
	public getSelectedClipInfo(): { trackIndex: number; clipIndex: number; player: Player } | null {
		if (!this.selectedClip) return null;

		const trackIndex = this.selectedClip.layer - 1;
		const clipIndex = this.tracks[trackIndex].indexOf(this.selectedClip);

		return { trackIndex, clipIndex, player: this.selectedClip };
	}
	public findClipIndices(player: Player): { trackIndex: number; clipIndex: number } | null {
		for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
			const clipIndex = this.tracks[trackIndex].indexOf(player);
			if (clipIndex !== -1) {
				return { trackIndex, clipIndex };
			}
		}
		return null;
	}
	public getClipAt(trackIndex: number, clipIndex: number): Player | null {
		if (trackIndex >= 0 && trackIndex < this.tracks.length && clipIndex >= 0 && clipIndex < this.tracks[trackIndex].length) {
			return this.tracks[trackIndex][clipIndex];
		}
		return null;
	}
	public selectPlayer(player: Player): void {
		const indices = this.findClipIndices(player);
		if (indices) {
			this.selectClip(indices.trackIndex, indices.clipIndex);
		}
	}
	public isPlayerSelected(player: Player): boolean {
		if (this.isExporting) return false;
		return this.selectedClip === player;
	}
	public setExportMode(exporting: boolean): void {
		this.isExporting = exporting;
	}
	public isInExportMode(): boolean {
		return this.isExporting;
	}

	public setCanvas(canvas: Canvas): void {
		this.canvas = canvas;
	}

	public getCanvasZoom(): number {
		return this.canvas?.getZoom() ?? 1;
	}

	private setupIntentListeners(): void {
		this.events.on("timeline:clip:clicked", (data: { player: Player; trackIndex: number; clipIndex: number }) => {
			if (data.player) {
				this.selectPlayer(data.player);
			} else {
				this.selectClip(data.trackIndex, data.clipIndex);
			}
		});

		this.events.on("timeline:background:clicked", () => {
			this.clearSelection();
		});

		this.events.on("canvas:clip:clicked", (data: { player: Player }) => {
			this.selectPlayer(data.player);
		});

		this.events.on("canvas:background:clicked", () => {
			this.clearSelection();
		});
	}
}
