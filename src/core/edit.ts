import { AudioPlayer } from "@canvas/players/audio-player";
import { AlignmentGuides } from "@canvas/system/alignment-guides";
import { CaptionPlayer } from "@canvas/players/caption-player";
import { HtmlPlayer } from "@canvas/players/html-player";
import { ImagePlayer } from "@canvas/players/image-player";
import { LumaPlayer } from "@canvas/players/luma-player";
import { type Player, PlayerType } from "@canvas/players/player";
import { RichTextPlayer } from "@canvas/players/rich-text-player";
import { ShapePlayer } from "@canvas/players/shape-player";
import { TextPlayer } from "@canvas/players/text-player";
import { VideoPlayer } from "@canvas/players/video-player";
import type { Canvas } from "@canvas/shotstack-canvas";
import { resolveAliasReferences } from "@core/alias";
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
import { applyMergeFields, MergeFieldService } from "@core/merge";
import { Entity } from "@core/shared/entity";
import { mergeAssetForExport } from "@core/shared/merge-asset";
import { deepMerge, getNestedValue, setNestedValue } from "@core/shared/utils";
import { calculateTimelineEnd, resolveAutoLength, resolveAutoStart, resolveEndLength } from "@core/timing/resolver";
import { LoadingOverlay } from "@core/ui/loading-overlay";
import type { ToolbarButtonConfig } from "@core/ui/toolbar-button.types";
import type { Size } from "@layouts/geometry";
import { AssetLoader } from "@loaders/asset-loader";
import { FontLoadParser } from "@loaders/font-load-parser";
import type { ResolvedClip } from "@schemas/clip";
import { EditSchema, type Edit as EditConfig, type ResolvedEdit, type Soundtrack } from "@schemas/edit";
import type { ResolvedTrack } from "@schemas/track";
import * as pixi from "pixi.js";

import { SetMergeFieldCommand } from "./commands/set-merge-field-command";
import type { EditCommand, CommandContext } from "./commands/types";

export class Edit extends Entity {
	private static readonly ZIndexPadding = 100;

	public assetLoader: AssetLoader;
	// TODO: Create typed EditEventMap for SDK consumers (autocomplete, type-safe payloads)
	public events: EventEmitter;

	private edit: ResolvedEdit | null;
	private originalEdit: ResolvedEdit | null;
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
	private copiedClip: { trackIndex: number; clipConfiguration: ResolvedClip } | null = null;
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

	// Playback health tracking
	private syncCorrectionCount: number = 0;

	// Toolbar button registry
	private toolbarButtons: ToolbarButtonConfig[] = [];

	/** Merge field service for managing dynamic content placeholders */
	public mergeFields: MergeFieldService;

	private canvas: Canvas | null = null;

	/** @internal */
	private alignmentGuides: AlignmentGuides | null = null;
	private activeLumaMasks: Array<{
		lumaPlayer: LumaPlayer;
		maskSprite: pixi.Sprite;
		tempContainer: pixi.Container;
		contentClip: Player;
		lastVideoTime: number;
	}> = [];

	// Queue for deferred mask sprite cleanup - must wait for PixiJS to finish rendering
	private pendingMaskCleanup: Array<{ maskSprite: pixi.Sprite; frameCount: number }> = [];

	constructor(size: Size, backgroundColor: string = "#ffffff") {
		super();

		this.assetLoader = new AssetLoader();
		this.edit = null;
		this.originalEdit = null;

		this.tracks = [];
		this.clipsToDispose = [];
		this.clips = [];

		this.events = new EventEmitter();
		this.mergeFields = new MergeFieldService(this.events);

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
		// Enable z-index sorting so track containers render in correct layer order
		this.getContainer().sortableChildren = true;

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

		// Initialize alignment guides (rendered above all clips)
		this.alignmentGuides = new AlignmentGuides(this.getContainer(), this.size.width, this.size.height);
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

		// Process pending mask cleanup AFTER updateLumaMasks
		// This ensures sprites are destroyed only after PixiJS has finished with them
		this.processPendingMaskCleanup();

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

		for (const item of this.pendingMaskCleanup) {
			try {
				item.maskSprite.parent?.removeChild(item.maskSprite);
				item.maskSprite.destroy({ texture: true });
			} catch {
				// Ignore cleanup errors during dispose
			}
		}
		this.pendingMaskCleanup = [];

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

	public async loadEdit(edit: ResolvedEdit): Promise<void> {
		const loading = new LoadingOverlay();
		loading.show();

		const onProgress = () => loading.update(this.assetLoader.getProgress());
		this.assetLoader.loadTracker.on("onAssetLoadInfoUpdated", onProgress);

		try {
			this.clearClips();

			// Store original (unresolved) edit for re-resolution on merge field changes
			this.originalEdit = structuredClone(edit);

			// Load merge fields from edit payload into service
			const serializedMergeFields = edit.merge ?? [];
			this.mergeFields.loadFromSerialized(serializedMergeFields);

			// Apply merge field substitutions for initial load
			const mergedEdit = serializedMergeFields.length > 0 ? applyMergeFields(edit, serializedMergeFields) : edit;

			const parsedEdit = EditSchema.parse(mergedEdit);
			resolveAliasReferences(parsedEdit);
			this.edit = parsedEdit as ResolvedEdit;

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
					const loadOptions: pixi.UnresolvedAsset = { src: identifier, parser: FontLoadParser.Name };

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
			this.setupLumaMaskEventListeners();

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

	private async loadSoundtrack(soundtrack: Soundtrack): Promise<void> {
		const clip: ResolvedClip = {
			asset: {
				type: "audio",
				src: soundtrack.src,
				effect: soundtrack.effect,
				volume: soundtrack.volume ?? 1
			},
			fit: "crop",
			start: 0,
			length: this.totalDuration / 1000
		};

		const player = new AudioPlayer(this, clip);
		player.layer = this.tracks.length + 1;
		await this.addPlayer(this.tracks.length, player);
	}
	public getEdit(): EditConfig {
		const tracks = this.tracks.map((track, trackIdx) => ({
			clips: track
				.filter(player => player && !this.clipsToDispose.includes(player))
				.map((player, clipIdx) => {
					const timing = player.getTimingIntent();

					// Use original clip as base to preserve user input without Zod defaults
					const originalClip = this.originalEdit?.timeline.tracks[trackIdx]?.clips[clipIdx];
					const originalAsset = originalClip?.asset;
					const currentAsset = player.clipConfiguration.asset;
					const mergedAsset = mergeAssetForExport(originalAsset, currentAsset);

					return {
						...(originalClip ?? player.clipConfiguration),
						asset: mergedAsset,
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
			output: this.edit?.output || { size: this.size, format: "mp4" },
			merge: this.mergeFields.toSerializedArray()
		} as EditConfig;
	}

	public getResolvedEdit(): ResolvedEdit {
		const tracks: ResolvedTrack[] = this.tracks.map(track => ({
			clips: track
				.filter(player => player && !this.clipsToDispose.includes(player))
				.map(player => ({
					...player.clipConfiguration,
					start: player.getStart() / 1000,
					length: player.getLength() / 1000
				}))
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

	/**
	 * Get the original parsed edit configuration.
	 * Unlike getResolvedEdit(), this returns the edit as originally parsed,
	 * with all clips present regardless of loading state.
	 */
	public getOriginalEdit(): ResolvedEdit | null {
		return this.edit;
	}

	public addClip(trackIdx: number, clip: ResolvedClip): void | Promise<void> {
		const command = new AddClipCommand(trackIdx, clip);
		return this.executeCommand(command);
	}
	public getClip(trackIdx: number, clipIdx: number): ResolvedClip | null {
		const clipsByTrack = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (clipIdx < 0 || clipIdx >= clipsByTrack.length) return null;

		return clipsByTrack[clipIdx].clipConfiguration;
	}

	public getPlayerClip(trackIdx: number, clipIdx: number): Player | null {
		const clipsByTrack = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (clipIdx < 0 || clipIdx >= clipsByTrack.length) return null;

		return clipsByTrack[clipIdx];
	}

	/** Get the original (unresolved) asset for a clip, preserving merge field templates */
	public getOriginalAsset(trackIndex: number, clipIndex: number): unknown | undefined {
		return this.originalEdit?.timeline.tracks[trackIndex]?.clips[clipIndex]?.asset;
	}

	public deleteClip(trackIdx: number, clipIdx: number): void {
		const track = this.tracks[trackIdx];
		if (!track) return;

		// Get the clip being deleted
		const clipToDelete = track[clipIdx];
		if (!clipToDelete) return;

		// Check if this is a content clip (not a luma)
		const isContentClip = clipToDelete.playerType !== PlayerType.Luma;

		if (isContentClip) {
			// Find attached luma in the same track
			const lumaIndex = track.findIndex(clip => clip.playerType === PlayerType.Luma);

			if (lumaIndex !== -1) {
				// Delete luma first (handles index shifting correctly)
				// If luma comes before content clip, content clip index shifts after luma deletion
				const adjustedContentIdx = lumaIndex < clipIdx ? clipIdx - 1 : clipIdx;

				const lumaCommand = new DeleteClipCommand(trackIdx, lumaIndex);
				this.executeCommand(lumaCommand);

				// Now delete content clip with adjusted index
				const contentCommand = new DeleteClipCommand(trackIdx, adjustedContentIdx);
				this.executeCommand(contentCommand);
				return;
			}
		}

		// No luma attachment or deleting a luma directly - just delete the clip
		const command = new DeleteClipCommand(trackIdx, clipIdx);
		this.executeCommand(command);
	}

	public splitClip(trackIndex: number, clipIndex: number, splitTime: number): void {
		const command = new SplitClipCommand(trackIndex, clipIndex, splitTime);
		this.executeCommand(command);
	}

	public async addTrack(trackIdx: number, track: ResolvedTrack): Promise<void> {
		const command = new AddTrackCommand(trackIdx);
		await this.executeCommand(command);
		for (const clip of track?.clips ?? []) {
			await this.addClip(trackIdx, clip);
		}
	}
	public getTrack(trackIdx: number): ResolvedTrack | null {
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

	public getMemoryStats(): {
		clipCounts: Record<string, number>;
		totalClips: number;
		richTextCacheStats: { clips: number; totalFrames: number };
		textPlayerCount: number;
		lumaMaskCount: number;
		commandHistorySize: number;
		trackCount: number;
	} {
		// Count clips by type
		const clipCounts: Record<string, number> = {};
		for (const clip of this.clips) {
			const type = clip.clipConfiguration.asset?.type || "unknown";
			clipCounts[type] = (clipCounts[type] || 0) + 1;
		}

		// Count text players and RichText cache frames
		let richTextClips = 0;
		let totalFrames = 0;
		let textPlayerCount = 0;
		for (const clip of this.clips) {
			if (clip.playerType === PlayerType.RichText) {
				richTextClips += 1;
				totalFrames += (clip as RichTextPlayer).getCacheSize();
			}
			if (clip.playerType === PlayerType.Text) {
				textPlayerCount += 1;
			}
		}

		return {
			clipCounts,
			totalClips: this.clips.length,
			richTextCacheStats: { clips: richTextClips, totalFrames },
			textPlayerCount,
			lumaMaskCount: this.activeLumaMasks.length,
			commandHistorySize: this.commandHistory.length,
			trackCount: this.tracks.length
		};
	}

	public getComprehensiveMemoryStats(): {
		textureStats: {
			videos: { count: number; totalMB: number; avgDimensions: string };
			images: { count: number; totalMB: number; avgDimensions: string };
			text: { count: number; totalMB: number };
			richText: { count: number; totalMB: number };
			luma: { count: number; totalMB: number };
			animated: { count: number; frames: number; totalMB: number };
			totalTextures: number;
			totalMB: number;
		};
		assetDetails: Array<{
			id: string;
			type: "video" | "image" | "text" | "rich-text" | "luma" | "audio" | "html" | "shape" | "caption" | "unknown";
			label: string;
			width: number;
			height: number;
			estimatedMB: number;
		}>;
		systemStats: {
			clipCount: number;
			trackCount: number;
			commandCount: number;
		};
	} {
		type AssetType = "video" | "image" | "text" | "rich-text" | "luma" | "audio" | "html" | "shape" | "caption" | "unknown";

		const assetDetails: Array<{
			id: string;
			type: AssetType;
			label: string;
			width: number;
			height: number;
			estimatedMB: number;
		}> = [];

		const stats = {
			videos: { count: 0, totalMB: 0, dimensions: [] as Array<{ width: number; height: number }> },
			images: { count: 0, totalMB: 0, dimensions: [] as Array<{ width: number; height: number }> },
			text: { count: 0, totalMB: 0 },
			richText: { count: 0, totalMB: 0 },
			luma: { count: 0, totalMB: 0 },
			animated: { count: 0, frames: 0, totalMB: 0 }
		};

		for (const clip of this.clips) {
			const { asset } = clip.clipConfiguration;
			const rawType = asset?.type || "unknown";
			const type = (
				["video", "image", "text", "rich-text", "luma", "audio", "html", "shape", "caption"].includes(rawType) ? rawType : "unknown"
			) as AssetType;
			const size = clip.getSize();
			const estimatedMB = this.estimateTextureMB(size.width, size.height);

			// Get label for asset
			const label = this.getAssetLabel(clip);

			assetDetails.push({
				id: clip.clipConfiguration.asset?.type || "unknown",
				type,
				label,
				width: size.width,
				height: size.height,
				estimatedMB
			});

			// Aggregate by type
			if (type === "video") {
				stats.videos.count += 1;
				stats.videos.totalMB += estimatedMB;
				stats.videos.dimensions.push({ width: size.width, height: size.height });
			} else if (type === "image") {
				stats.images.count += 1;
				stats.images.totalMB += estimatedMB;
				stats.images.dimensions.push({ width: size.width, height: size.height });
			} else if (type === "text") {
				stats.text.count += 1;
				stats.text.totalMB += estimatedMB;
			} else if (type === "rich-text") {
				stats.richText.count += 1;
				stats.richText.totalMB += estimatedMB;
			} else if (type === "luma") {
				stats.luma.count += 1;
				stats.luma.totalMB += estimatedMB;
			}
		}

		// Add animated text frame caches (RichTextPlayer)
		for (const clip of this.clips) {
			if (clip.playerType === PlayerType.RichText) {
				const frames = (clip as RichTextPlayer).getCacheSize();
				if (frames > 0) {
					stats.animated.count += 1;
					stats.animated.frames += frames;
					// Estimate based on output size for cached frames
					stats.animated.totalMB += frames * this.estimateTextureMB(this.size.width, this.size.height);
				}
			}
		}

		// Calculate average dimensions
		const calcAvgDimensions = (dims: Array<{ width: number; height: number }>): string => {
			if (dims.length === 0) return "";
			if (dims.length === 1) return `${dims[0].width}×${dims[0].height}`;
			const avgW = Math.round(dims.reduce((s, d) => s + d.width, 0) / dims.length);
			const avgH = Math.round(dims.reduce((s, d) => s + d.height, 0) / dims.length);
			return `avg ${avgW}×${avgH}`;
		};

		const totalTextures = stats.videos.count + stats.images.count + stats.text.count + stats.richText.count + stats.luma.count + stats.animated.count;

		const totalMB =
			stats.videos.totalMB + stats.images.totalMB + stats.text.totalMB + stats.richText.totalMB + stats.luma.totalMB + stats.animated.totalMB;

		return {
			textureStats: {
				videos: {
					count: stats.videos.count,
					totalMB: stats.videos.totalMB,
					avgDimensions: calcAvgDimensions(stats.videos.dimensions)
				},
				images: {
					count: stats.images.count,
					totalMB: stats.images.totalMB,
					avgDimensions: calcAvgDimensions(stats.images.dimensions)
				},
				text: { count: stats.text.count, totalMB: stats.text.totalMB },
				richText: { count: stats.richText.count, totalMB: stats.richText.totalMB },
				luma: { count: stats.luma.count, totalMB: stats.luma.totalMB },
				animated: { count: stats.animated.count, frames: stats.animated.frames, totalMB: stats.animated.totalMB },
				totalTextures,
				totalMB
			},
			assetDetails,
			systemStats: {
				clipCount: this.clips.length,
				trackCount: this.tracks.length,
				commandCount: this.commandHistory.length
			}
		};
	}

	private estimateTextureMB(width: number, height: number): number {
		// GPU Memory (MB) = width × height × 4 (RGBA bytes) / 1024 / 1024
		return (width * height * 4) / (1024 * 1024);
	}

	private getAssetLabel(clip: Player): string {
		const asset = clip.clipConfiguration.asset as Record<string, unknown> | undefined;
		if (!asset) return "unknown";

		// For media assets with src, extract filename
		const srcValue = asset["src"];
		if ("src" in asset && typeof srcValue === "string") {
			const filename = srcValue.split("/").pop() || srcValue;
			// Remove query params
			return filename.split("?")[0];
		}

		// For text assets, use the text content
		const textValue = asset["text"];
		if ("text" in asset && typeof textValue === "string") {
			return textValue.length > 20 ? `${textValue.substring(0, 17)}...` : textValue;
		}

		return asset["type"]?.toString() || "unknown";
	}

	public getPlaybackHealth(): {
		activePlayerCount: number;
		totalPlayerCount: number;
		videoMaxDrift: number;
		audioMaxDrift: number;
		syncCorrections: number;
	} {
		let activeCount = 0;
		let videoMaxDrift = 0;
		let audioMaxDrift = 0;

		for (const clip of this.clips) {
			if (clip.isActive()) {
				activeCount += 1;

				if (clip.playerType === PlayerType.Video) {
					const drift = (clip as VideoPlayer).getCurrentDrift();
					videoMaxDrift = Math.max(videoMaxDrift, drift);
				}

				if (clip.playerType === PlayerType.Audio) {
					const drift = (clip as AudioPlayer).getCurrentDrift();
					audioMaxDrift = Math.max(audioMaxDrift, drift);
				}
			}
		}

		return {
			activePlayerCount: activeCount,
			totalPlayerCount: this.clips.length,
			videoMaxDrift,
			audioMaxDrift,
			syncCorrections: this.syncCorrectionCount
		};
	}

	public recordSyncCorrection(): void {
		this.syncCorrectionCount += 1;
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
	public setUpdatedClip(clip: Player, initialClipConfig: ResolvedClip | null = null, finalClipConfig: ResolvedClip | null = null): void {
		// Find track and clip indices
		const trackIdx = clip.layer - 1;
		const track = this.tracks[trackIdx];
		const clipIdx = track ? track.indexOf(clip) : -1;

		// Sync to originalEdit so getEdit() returns updated values
		const originalClip = this.originalEdit?.timeline.tracks[trackIdx]?.clips[clipIdx];
		const templateConfig = finalClipConfig && originalClip
			? deepMerge(structuredClone(originalClip), finalClipConfig)
			: finalClipConfig;

		const command = new SetUpdatedClipCommand(clip, initialClipConfig, finalClipConfig, {
			trackIndex: trackIdx,
			clipIndex: clipIdx,
			templateConfig: templateConfig ?? undefined
		});
		this.executeCommand(command);
	}

	public updateClip(trackIdx: number, clipIdx: number, updates: Partial<ResolvedClip>): void {
		const clip = this.getPlayerClip(trackIdx, clipIdx);
		if (!clip) {
			console.warn(`Clip not found at track ${trackIdx}, index ${clipIdx}`);
			return;
		}

		const initialConfig = structuredClone(clip.clipConfiguration);
		const currentConfig = structuredClone(clip.clipConfiguration);
		const mergedConfig = deepMerge(currentConfig, updates);

		// Also sync to originalEdit so getEdit() returns updated values
		const originalClip = this.originalEdit?.timeline.tracks[trackIdx]?.clips[clipIdx];
		const mergedTemplate = originalClip ? deepMerge(structuredClone(originalClip), updates) : mergedConfig;

		const command = new SetUpdatedClipCommand(clip, initialConfig, mergedConfig, {
			trackIndex: trackIdx,
			clipIndex: clipIdx,
			templateConfig: mergedTemplate
		});
		this.executeCommand(command);
	}

	/**
	 * Update a clip with separate resolved and template configurations.
	 * Use this when the resolved value (for rendering) differs from the template value (for export).
	 * This is typically used when a property contains a merge field template.
	 *
	 * @param trackIdx - Track index
	 * @param clipIdx - Clip index within the track
	 * @param resolvedUpdates - Updates with resolved values (for clipConfiguration/rendering)
	 * @param templateUpdates - Updates with template values (for originalEdit/export)
	 */
	public updateClipWithTemplate(
		trackIdx: number,
		clipIdx: number,
		resolvedUpdates: Partial<ResolvedClip>,
		templateUpdates: Partial<ResolvedClip>
	): void {
		const clip = this.getPlayerClip(trackIdx, clipIdx);
		if (!clip) {
			console.warn(`Clip not found at track ${trackIdx}, index ${clipIdx}`);
			return;
		}

		const initialConfig = structuredClone(clip.clipConfiguration);
		const mergedResolved = deepMerge(structuredClone(initialConfig), resolvedUpdates);

		const templateClip = this.getTemplateClip(trackIdx, clipIdx);
		const mergedTemplate = templateClip
			? deepMerge(structuredClone(templateClip), templateUpdates)
			: deepMerge(structuredClone(initialConfig), templateUpdates);

		const command = new SetUpdatedClipCommand(clip, initialConfig, mergedResolved, {
			trackIndex: trackIdx,
			clipIndex: clipIdx,
			templateConfig: mergedTemplate
		});
		this.executeCommand(command);
	}

	/** @internal */
	public updateTextContent(clip: Player, newText: string, initialConfig: ResolvedClip): void {
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

					// Sync originalEdit - re-insert clip template at same index
					if (this.originalEdit?.timeline.tracks[trackIdx]?.clips) {
						this.originalEdit.timeline.tracks[trackIdx].clips.splice(insertIdx, 0, structuredClone(clip.clipConfiguration));
					}
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
			trackEndLengthClip: clip => this.endLengthClips.add(clip),
			// Merge field context
			getMergeFields: () => this.mergeFields,
			getTemplateClip: (trackIndex, clipIndex) => this.getTemplateClip(trackIndex, clipIndex),
			setTemplateClipProperty: (trackIndex, clipIndex, propertyPath, value) =>
				this.setTemplateClipProperty(trackIndex, clipIndex, propertyPath, value),
			syncTemplateClip: (trackIndex, clipIndex, templateClip) => this.syncTemplateClip(trackIndex, clipIndex, templateClip),
			// originalEdit track sync
			insertOriginalEditTrack: trackIdx => this.insertOriginalEditTrack(trackIdx),
			removeOriginalEditTrack: trackIdx => this.removeOriginalEditTrack(trackIdx)
		};
	}

	private queueDisposeClip(clipToDispose: Player): void {
		this.clipsToDispose.push(clipToDispose);
	}
	protected disposeClips(): void {
		if (this.clipsToDispose.length === 0) {
			return;
		}

		// Clean up luma masks for any luma players being deleted
		for (const clip of this.clipsToDispose) {
			if (clip.playerType === PlayerType.Luma) {
				this.cleanupLumaMaskForPlayer(clip as LumaPlayer);
			}
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

					// Sync originalEdit - remove from template data to keep aligned with tracks array
					if (this.originalEdit?.timeline.tracks[trackIdx]?.clips) {
						this.originalEdit.timeline.tracks[trackIdx].clips.splice(clipIdx, 1);
					}
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
	private createPlayerFromAssetType(clipConfiguration: ResolvedClip): Player {
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
			case "caption": {
				player = new CaptionPlayer(this, clipConfiguration);
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

		// Sync originalEdit with new clip to keep template data aligned with tracks array
		if (this.originalEdit?.timeline.tracks[trackIdx]) {
			this.originalEdit.timeline.tracks[trackIdx].clips.push(structuredClone(clipToAdd.clipConfiguration));
		}

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
			const lumaPlayer = trackClips.find(clip => clip.playerType === PlayerType.Luma) as LumaPlayer | undefined;
			const lumaSprite = lumaPlayer?.getSprite();
			const contentClips = trackClips.filter(clip => clip.playerType !== PlayerType.Luma);

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

		const maskTexture = renderer.generateTexture({
			target: tempContainer,
			resolution: 0.5
		});
		const maskSprite = new pixi.Sprite(maskTexture);
		contentClip.getContainer().addChild(maskSprite);
		contentClip.getContentContainer().setMask({ mask: maskSprite });

		this.activeLumaMasks.push({ lumaPlayer, maskSprite, tempContainer, contentClip, lastVideoTime: -1 });
	}

	private updateLumaMasks(): void {
		if (!this.canvas) return;
		const { renderer } = this.canvas.application;

		const frameInterval = 1 / 30; // 30fps threshold

		for (const mask of this.activeLumaMasks) {
			if (mask.lumaPlayer.isVideoSource()) {
				const videoTime = mask.lumaPlayer.getVideoCurrentTime();

				// Only regenerate if frame has changed (within threshold)
				const frameChanged = Math.abs(videoTime - mask.lastVideoTime) >= frameInterval;
				if (frameChanged) {
					mask.lastVideoTime = videoTime;

					const oldTexture = mask.maskSprite.texture;
					mask.maskSprite.texture = renderer.generateTexture({
						target: mask.tempContainer,
						resolution: 0.5
					});

					oldTexture.destroy(true);
				}
			}
		}
	}

	/**
	 * Set up event listeners for luma mask synchronization.
	 * Ensures canvas masking stays in sync with clip operations.
	 */
	private setupLumaMaskEventListeners(): void {
		// Rebuild masks after clip moves (luma might have moved to new track)
		this.events.on("clip:updated", () => {
			this.rebuildLumaMasksIfNeeded();
		});

		// Rebuild masks after clip deletion undo (luma might be restored)
		this.events.on("clip:restored", () => {
			this.rebuildLumaMasksIfNeeded();
		});

		// Rebuild masks after clip deletion (track shift may re-add luma to scene)
		this.events.on("clip:deleted", () => {
			this.rebuildLumaMasksIfNeeded();
		});

		// Rebuild masks after any timeline change (clips added/removed/tracks changed)
		// This handles the case where AddTrackCommand re-adds luma players to scene
		this.events.on("timeline:updated", () => {
			this.rebuildLumaMasksIfNeeded();
		});
	}

	/** Clean up luma mask when a luma player is deleted. */
	private cleanupLumaMaskForPlayer(player: Player): void {
		const maskIndex = this.activeLumaMasks.findIndex(mask => mask.lumaPlayer === player);
		if (maskIndex === -1) return;

		const mask = this.activeLumaMasks[maskIndex];

		// Clear mask (PixiJS 8 requires direct assignment, not setMask(null))
		if (mask.contentClip) {
			mask.contentClip.getContentContainer().mask = null;
		}

		mask.maskSprite.parent?.removeChild(mask.maskSprite);
		mask.tempContainer.destroy({ children: true });
		this.activeLumaMasks.splice(maskIndex, 1);

		// Defer maskSprite destruction until PixiJS finishes rendering
		this.pendingMaskCleanup.push({ maskSprite: mask.maskSprite, frameCount: 0 });
	}

	/**
	 * Process pending mask cleanup queue.
	 * Sprites are destroyed after 3 frames to ensure PixiJS has finished rendering.
	 * Called at the end of update() after updateLumaMasks().
	 */
	private processPendingMaskCleanup(): void {
		for (let i = this.pendingMaskCleanup.length - 1; i >= 0; i -= 1) {
			const item = this.pendingMaskCleanup[i];
			item.frameCount += 1;

			if (item.frameCount >= 3) {
				try {
					item.maskSprite.parent?.removeChild(item.maskSprite);
					item.maskSprite.destroy({ texture: true });
				} catch {
					// Ignore cleanup errors
				}
				this.pendingMaskCleanup.splice(i, 1);
			}
		}
	}

	/**
	 * Rebuild luma masks for any tracks that need masking but don't have it set up.
	 * Called after clip operations (move, delete, etc.) to ensure canvas stays in sync.
	 * Also ensures luma players are hidden from display even if mask already exists.
	 */
	private async rebuildLumaMasksIfNeeded(): Promise<void> {
		if (!this.canvas) return;

		for (let trackIdx = 0; trackIdx < this.tracks.length; trackIdx += 1) {
			const trackClips = this.tracks[trackIdx];
			const lumaPlayer = trackClips.find(clip => clip.playerType === PlayerType.Luma) as LumaPlayer | undefined;
			const contentClips = trackClips.filter(clip => clip.playerType !== PlayerType.Luma);

			// ALWAYS hide luma player if it has a parent (even if mask exists)
			// This handles the case where AddTrackCommand re-adds luma to scene
			if (lumaPlayer) {
				lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
			}

			const existingMask = lumaPlayer && this.activeLumaMasks.find(m => m.lumaPlayer === lumaPlayer);

			if (lumaPlayer && !existingMask && contentClips.length > 0) {
				// If sprite was destroyed (undo after delete), wait for reload
				if (!lumaPlayer.getSprite()) {
					await lumaPlayer.load();
				}

				const lumaSprite = lumaPlayer.getSprite();
				if (lumaSprite?.texture) {
					this.setupLumaMask(lumaPlayer, lumaSprite.texture, contentClips[0]);
					// Already removed above, but kept for safety
					lumaPlayer.getContainer().parent?.removeChild(lumaPlayer.getContainer());
				}
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

	/**
	 * Copy a clip to the internal clipboard
	 */
	public copyClip(trackIdx: number, clipIdx: number): void {
		const player = this.getClipAt(trackIdx, clipIdx);
		if (player) {
			this.copiedClip = {
				trackIndex: trackIdx,
				clipConfiguration: structuredClone(player.clipConfiguration)
			};
			this.events.emit("clip:copied", { trackIndex: trackIdx, clipIndex: clipIdx });
		}
	}

	/**
	 * Paste the copied clip at the current playhead position
	 */
	public pasteClip(): void {
		if (!this.copiedClip) return;

		const pastedClip = structuredClone(this.copiedClip.clipConfiguration);
		pastedClip.start = this.playbackTime / 1000; // Paste at playhead position

		this.addClip(this.copiedClip.trackIndex, pastedClip);
	}

	/**
	 * Check if there is a clip in the clipboard
	 */
	public hasCopiedClip(): boolean {
		return this.copiedClip !== null;
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

	/**
	 * Get all active players except the specified one.
	 * Used for clip-to-clip alignment snapping.
	 * @internal
	 */
	public getActivePlayersExcept(excludePlayer: Player): Player[] {
		const active: Player[] = [];
		for (const track of this.tracks) {
			for (const player of track) {
				if (player !== excludePlayer && player.isActive()) {
					active.push(player);
				}
			}
		}
		return active;
	}

	/**
	 * Show an alignment guide line.
	 * @internal
	 */
	public showAlignmentGuide(type: "canvas" | "clip", axis: "x" | "y", position: number, bounds?: { start: number; end: number }): void {
		if (!this.alignmentGuides) return;

		if (type === "canvas") {
			this.alignmentGuides.drawCanvasGuide(axis, position);
		} else if (bounds) {
			this.alignmentGuides.drawClipGuide(axis, position, bounds.start, bounds.end);
		}
	}

	/**
	 * Clear all alignment guides.
	 * @internal
	 */
	public clearAlignmentGuides(): void {
		this.alignmentGuides?.clear();
	}

	/**
	 * Move the selected clip by a pixel delta.
	 * Used for keyboard arrow key positioning.
	 */
	public moveSelectedClip(deltaX: number, deltaY: number): void {
		const info = this.getSelectedClipInfo();
		if (!info) return;

		const { player } = info;
		const initialConfig = structuredClone(player.clipConfiguration);

		player.moveBy(deltaX, deltaY);

		this.setUpdatedClip(player, initialConfig, structuredClone(player.clipConfiguration));
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

	public setOutputSize(width: number, height: number): void {
		this.size = { width, height };

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				size: { width, height }
			};
		}

		this.updateViewportMask();
		this.canvas?.zoomToFit();

		if (this.background) {
			this.background.clear();
			this.background.fillStyle = { color: this.backgroundColor };
			this.background.rect(0, 0, width, height);
			this.background.fill();
		}

		this.events.emit("output:size:changed", { width, height });
	}

	public setOutputFps(fps: number): void {
		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				fps
			};
		}

		this.events.emit("output:fps:changed", { fps });
	}

	public getOutputFps(): number {
		return this.edit?.output?.fps ?? 30;
	}

	public getTimelineFonts(): Array<{ src: string }> {
		return this.edit?.timeline?.fonts ?? [];
	}

	public setTimelineBackground(color: string): void {
		this.backgroundColor = color;

		if (this.edit) {
			this.edit.timeline = {
				...this.edit.timeline,
				background: color
			};
		}

		if (this.background) {
			this.background.clear();
			this.background.fillStyle = { color: this.backgroundColor };
			this.background.rect(0, 0, this.size.width, this.size.height);
			this.background.fill();
		}

		this.events.emit("timeline:background:changed", { color });
	}

	public getTimelineBackground(): string {
		return this.backgroundColor;
	}

	// ─── Toolbar Button Registry ─────────────────────────────────────────────────

	public registerToolbarButton(config: ToolbarButtonConfig): void {
		const existing = this.toolbarButtons.findIndex(b => b.id === config.id);
		if (existing >= 0) {
			this.toolbarButtons[existing] = config;
		} else {
			this.toolbarButtons.push(config);
		}
		this.events.emit("toolbar:buttons:changed", { buttons: this.toolbarButtons });
	}

	public unregisterToolbarButton(id: string): void {
		const index = this.toolbarButtons.findIndex(b => b.id === id);
		if (index >= 0) {
			this.toolbarButtons.splice(index, 1);
			this.events.emit("toolbar:buttons:changed", { buttons: this.toolbarButtons });
		}
	}

	public getToolbarButtons(): ToolbarButtonConfig[] {
		return [...this.toolbarButtons];
	}

	// ─── Template Edit Access (for merge field commands) ───────────────────────

	/** Get the template clip from originalEdit */
	private getTemplateClip(trackIndex: number, clipIndex: number): ResolvedClip | null {
		return this.originalEdit?.timeline.tracks[trackIndex]?.clips[clipIndex] ?? null;
	}

	/** Get the text content from the template clip (with merge field placeholders) */
	public getTemplateClipText(trackIdx: number, clipIdx: number): string | null {
		const templateClip = this.getTemplateClip(trackIdx, clipIdx);
		if (!templateClip) return null;
		const asset = templateClip.asset as { text?: string } | undefined;
		return asset?.text ?? null;
	}

	/** Set a property on the template clip in originalEdit using dot notation */
	public setTemplateClipProperty(trackIndex: number, clipIndex: number, propertyPath: string, value: unknown): void {
		const clip = this.originalEdit?.timeline.tracks[trackIndex]?.clips[clipIndex];
		if (!clip) return;
		setNestedValue(clip, propertyPath, value);
	}

	/** Sync the entire template clip in originalEdit with a new clip configuration */
	private syncTemplateClip(trackIndex: number, clipIndex: number, templateClip: ResolvedClip): void {
		if (!this.originalEdit?.timeline.tracks[trackIndex]?.clips) return;
		this.originalEdit.timeline.tracks[trackIndex].clips[clipIndex] = structuredClone(templateClip);
	}

	/** Insert an empty track into originalEdit at the specified index */
	private insertOriginalEditTrack(trackIdx: number): void {
		if (!this.originalEdit?.timeline.tracks) return;
		this.originalEdit.timeline.tracks.splice(trackIdx, 0, { clips: [] });
	}

	/** Remove a track from originalEdit at the specified index */
	private removeOriginalEditTrack(trackIdx: number): void {
		if (!this.originalEdit?.timeline.tracks) return;
		this.originalEdit.timeline.tracks.splice(trackIdx, 1);
	}

	// ─── Merge Field API (command-based) ───────────────────────────────────────

	/**
	 * Apply a merge field to a clip property.
	 * Creates a command for undo/redo support.
	 *
	 * @param trackIndex - Track index
	 * @param clipIndex - Clip index within the track
	 * @param propertyPath - Dot-notation path to property (e.g., "asset.src", "asset.color")
	 * @param fieldName - Name of the merge field (e.g., "MEDIA_URL")
	 * @param value - The resolved value to apply
	 * @param originalValue - Optional: the original value before merge field (for undo)
	 */
	public applyMergeField(
		trackIndex: number,
		clipIndex: number,
		propertyPath: string,
		fieldName: string,
		value: string,
		originalValue?: string
	): void {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return;

		// Get current value from player for undo
		const currentValue = getNestedValue(player.clipConfiguration, propertyPath);
		const previousValue = originalValue ?? (typeof currentValue === "string" ? currentValue : "");

		// Check if there's already a merge field on this property
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const previousFieldName = typeof templateValue === "string" ? this.mergeFields.extractFieldName(templateValue) : null;

		const command = new SetMergeFieldCommand(player, propertyPath, fieldName, previousFieldName, previousValue, value, trackIndex, clipIndex);
		this.executeCommand(command);
	}

	/**
	 * Remove a merge field from a clip property, restoring the original value.
	 *
	 * @param trackIndex - Track index
	 * @param clipIndex - Clip index within the track
	 * @param propertyPath - Dot-notation path to property (e.g., "asset.src")
	 * @param restoreValue - The value to restore (original pre-merge-field value)
	 */
	public removeMergeField(trackIndex: number, clipIndex: number, propertyPath: string, restoreValue: string): void {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return;

		// Get current merge field name
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		const templateValue = templateClip ? getNestedValue(templateClip, propertyPath) : null;
		const currentFieldName = typeof templateValue === "string" ? this.mergeFields.extractFieldName(templateValue) : null;

		if (!currentFieldName) return; // No merge field to remove

		const command = new SetMergeFieldCommand(
			player,
			propertyPath,
			null, // Removing merge field
			currentFieldName,
			restoreValue,
			restoreValue, // New value is the restore value
			trackIndex,
			clipIndex
		);
		this.executeCommand(command);
	}

	/**
	 * Get the merge field name for a clip property, if any.
	 *
	 * @returns The field name if a merge field is applied, null otherwise
	 */
	public getMergeFieldForProperty(trackIndex: number, clipIndex: number, propertyPath: string): string | null {
		const templateClip = this.getTemplateClip(trackIndex, clipIndex);
		if (!templateClip) return null;

		const value = getNestedValue(templateClip, propertyPath);
		return typeof value === "string" ? this.mergeFields.extractFieldName(value) : null;
	}

	/**
	 * Update the value of a merge field. Updates all clips using this field in-place.
	 * This does NOT use the command pattern (no undo) - it's for live preview updates.
	 */
	public updateMergeFieldValueLive(fieldName: string, newValue: string): void {
		// Update the field in the service
		const field = this.mergeFields.get(fieldName);
		if (!field) return;
		this.mergeFields.register({ ...field, defaultValue: newValue }, { silent: true });

		// Find and update all clips using this field
		for (let trackIdx = 0; trackIdx < this.tracks.length; trackIdx += 1) {
			for (let clipIdx = 0; clipIdx < this.tracks[trackIdx].length; clipIdx += 1) {
				const templateClip = this.getTemplateClip(trackIdx, clipIdx);
				if (templateClip) {
					// Check all string properties for this field
					this.updateMergeFieldInObject(this.tracks[trackIdx][clipIdx].clipConfiguration, templateClip, fieldName, newValue);
				}
			}
		}
	}

	/** Helper: Update merge field occurrences in an object */
	private updateMergeFieldInObject(target: unknown, template: unknown, fieldName: string, newValue: string): void {
		if (!target || !template || typeof target !== "object" || typeof template !== "object") return;

		for (const key of Object.keys(template as Record<string, unknown>)) {
			const templateVal = (template as Record<string, unknown>)[key];
			const targetObj = target as Record<string, unknown>;

			if (typeof templateVal === "string") {
				const extractedField = this.mergeFields.extractFieldName(templateVal);
				if (extractedField === fieldName) {
					// Apply proper substitution - replace {{ FIELD }} with newValue, preserving surrounding text
					targetObj[key] = templateVal.replace(new RegExp(`\\{\\{\\s*${fieldName}\\s*\\}\\}`, "gi"), newValue);
				}
			} else if (templateVal && typeof templateVal === "object") {
				this.updateMergeFieldInObject(targetObj[key], templateVal, fieldName, newValue);
			}
		}
	}

	/**
	 * Redraw all clips that use a specific merge field.
	 * Call this after updateMergeFieldValueLive() to refresh the canvas.
	 * Handles both text redraws and asset reloads for URL changes.
	 */
	public redrawMergeFieldClips(fieldName: string): void {
		for (const track of this.tracks) {
			for (const player of track) {
				const indices = this.findClipIndices(player);
				if (indices) {
					const templateClip = this.getTemplateClip(indices.trackIndex, indices.clipIndex);
					if (templateClip) {
						// Check if this clip uses the merge field and where
						const usageInfo = this.getMergeFieldUsage(templateClip, fieldName);
						if (usageInfo.used) {
							// If the merge field is used for asset.src, reload the asset
							if (usageInfo.isSrcField) {
								player.reloadAsset();
							}
							player.reconfigureAfterRestore();
							player.draw();
						}
					}
				}
			}
		}
	}

	/** Helper: Check if and how a clip uses a specific merge field */
	private getMergeFieldUsage(clip: unknown, fieldName: string, path: string = ""): { used: boolean; isSrcField: boolean } {
		if (!clip || typeof clip !== "object") return { used: false, isSrcField: false };

		for (const [key, value] of Object.entries(clip as Record<string, unknown>)) {
			const currentPath = path ? `${path}.${key}` : key;

			if (typeof value === "string") {
				const extractedField = this.mergeFields.extractFieldName(value);
				if (extractedField === fieldName) {
					// Check if this is an asset.src property
					const isSrcField = currentPath === "asset.src" || currentPath.endsWith(".src");
					return { used: true, isSrcField };
				}
			} else if (typeof value === "object" && value !== null) {
				const nested = this.getMergeFieldUsage(value, fieldName, currentPath);
				if (nested.used) return nested;
			}
		}
		return { used: false, isSrcField: false };
	}

	/**
	 * Check if a merge field is used for asset.src in any clip.
	 * Used by UI to determine if URL validation should be applied.
	 */
	public isSrcMergeField(fieldName: string): boolean {
		for (const track of this.tracks) {
			for (const player of track) {
				const indices = this.findClipIndices(player);
				if (indices) {
					const templateClip = this.getTemplateClip(indices.trackIndex, indices.clipIndex);
					if (templateClip) {
						const usageInfo = this.getMergeFieldUsage(templateClip, fieldName);
						if (usageInfo.used && usageInfo.isSrcField) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	// ─── Global Merge Field Operations ──────────────────────────────────────────

	/**
	 * Remove a merge field globally from all clips and the registry.
	 * Restores all affected clip properties to the merge field's default value.
	 *
	 * @param fieldName - The merge field name to remove
	 */
	public deleteMergeFieldGlobally(fieldName: string): void {
		const field = this.mergeFields.get(fieldName);
		if (!field) return;

		const template = this.mergeFields.createTemplate(fieldName);
		const restoreValue = field.defaultValue;

		// Find and restore all clips using this merge field
		for (let trackIdx = 0; trackIdx < this.tracks.length; trackIdx += 1) {
			for (let clipIdx = 0; clipIdx < this.tracks[trackIdx].length; clipIdx += 1) {
				const templateClip = this.getTemplateClip(trackIdx, clipIdx);
				if (templateClip) {
					// Find properties with this template and restore them
					this.restoreMergeFieldInClip(trackIdx, clipIdx, templateClip, template, restoreValue);
				}
			}
		}

		// Remove from registry
		this.mergeFields.remove(fieldName);
	}

	/**
	 * Helper: Find and restore merge field occurrences in a clip
	 */
	private restoreMergeFieldInClip(
		trackIdx: number,
		clipIdx: number,
		templateClip: unknown,
		template: string,
		restoreValue: string,
		path: string = ""
	): void {
		if (!templateClip || typeof templateClip !== "object") return;

		for (const key of Object.keys(templateClip as Record<string, unknown>)) {
			const value = (templateClip as Record<string, unknown>)[key];
			const propertyPath = path ? `${path}.${key}` : key;

			if (typeof value === "string") {
				const extractedField = this.mergeFields.extractFieldName(value);
				const templateFieldName = this.mergeFields.extractFieldName(template);
				if (extractedField && templateFieldName && extractedField === templateFieldName) {
					// Apply proper substitution - replace {{ FIELD }} with restoreValue, preserving surrounding text
					const substitutedValue = value.replace(new RegExp(`\\{\\{\\s*${extractedField}\\s*\\}\\}`, "gi"), restoreValue);
					this.removeMergeField(trackIdx, clipIdx, propertyPath, substitutedValue);
				}
			} else if (typeof value === "object" && value !== null) {
				// Recurse into nested objects
				this.restoreMergeFieldInClip(trackIdx, clipIdx, value, template, restoreValue, propertyPath);
			}
		}
	}

	// ─── Intent Listeners ────────────────────────────────────────────────────────

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
