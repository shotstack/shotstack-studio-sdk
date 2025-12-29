import { AudioPlayer } from "@canvas/players/audio-player";
import { CaptionPlayer } from "@canvas/players/caption-player";
import { HtmlPlayer } from "@canvas/players/html-player";
import { ImagePlayer } from "@canvas/players/image-player";
import { LumaPlayer } from "@canvas/players/luma-player";
import { type MergeFieldBinding, type Player, PlayerType } from "@canvas/players/player";
import { RichTextPlayer } from "@canvas/players/rich-text-player";
import { ShapePlayer } from "@canvas/players/shape-player";
import { TextPlayer } from "@canvas/players/text-player";
import { VideoPlayer } from "@canvas/players/video-player";
import type { Canvas } from "@canvas/shotstack-canvas";
import { AlignmentGuides } from "@canvas/system/alignment-guides";
import { resolveAliasReferences } from "@core/alias";
import { AddClipCommand } from "@core/commands/add-clip-command";
import { AddTrackCommand } from "@core/commands/add-track-command";
import { ClearSelectionCommand } from "@core/commands/clear-selection-command";
import { DeleteClipCommand } from "@core/commands/delete-clip-command";
import { DeleteTrackCommand } from "@core/commands/delete-track-command";
import { SelectClipCommand } from "@core/commands/select-clip-command";
import { SetUpdatedClipCommand } from "@core/commands/set-updated-clip-command";
import { SplitClipCommand } from "@core/commands/split-clip-command";
import { TransformClipAssetCommand } from "@core/commands/transform-clip-asset-command";
import { type TimingUpdateParams, UpdateClipTimingCommand } from "@core/commands/update-clip-timing-command";
import { UpdateTextContentCommand } from "@core/commands/update-text-content-command";
import { EditEvent, InternalEvent, type EditEventMap, type InternalEventMap } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import { LumaMaskController } from "@core/luma-mask-controller";
import { applyMergeFields, MergeFieldService, type SerializedMergeField } from "@core/merge";
import { Entity } from "@core/shared/entity";
import { deepMerge, getNestedValue } from "@core/shared/utils";
import { calculateTimelineEnd, resolveAutoLength, resolveAutoStart, resolveEndLength } from "@core/timing/resolver";
import { type Seconds, ms, sec, toSec } from "@core/timing/types";
import type { ToolbarButtonConfig } from "@core/ui/toolbar-button.types";
import type { Size } from "@layouts/geometry";
import { AssetLoader } from "@loaders/asset-loader";
import { FontLoadParser } from "@loaders/font-load-parser";
import {
	DestinationSchema,
	EditSchema,
	HexColorSchema,
	OutputFormatSchema,
	OutputFpsSchema,
	OutputSizeSchema,
	type Destination,
	type Edit as EditConfig,
	type ResolvedEdit,
	type Soundtrack
, ResolvedClip , ResolvedTrack } from "@schemas";
import * as pixi from "pixi.js";

import { SetMergeFieldCommand } from "./commands/set-merge-field-command";
import type { EditCommand, CommandContext } from "./commands/types";
import { EditDocument } from "./edit-document";

export class Edit extends Entity {
	private static readonly ZIndexPadding = 100;

	public assetLoader: AssetLoader;
	public events: EventEmitter<EditEventMap & InternalEventMap>;

	/**
	 * Pure document layer - holds the raw Edit config with "auto", "end", placeholders.
	 * This is the source of truth for serialization to backend.
	 * @internal
	 */
	private document: EditDocument;

	private edit: ResolvedEdit | null;
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
	private isBatchingEvents: boolean = false;

	// Document sync state - skip sync during initial load (document already has clips)
	private isLoadingEdit: boolean = false;

	// Playback health tracking
	private syncCorrectionCount: number = 0;

	// Toolbar button registry
	private toolbarButtons: ToolbarButtonConfig[] = [];

	/** Merge field service for managing dynamic content placeholders */
	public mergeFields: MergeFieldService;

	private canvas: Canvas | null = null;

	/** @internal */
	private alignmentGuides: AlignmentGuides | null = null;
	private lumaMaskController: LumaMaskController;

	// Clip load errors - persisted so Timeline can query them after subscribing
	private clipErrors = new Map<string, { error: string; assetType: string }>();

	/**
	 * Create an Edit instance from a template configuration.
	 *
	 * @param template - The Edit JSON configuration (aligns with Shotstack API contract)
	 *
	 * @example
	 * ```typescript
	 * const edit = new Edit(template);
	 * await edit.load();
	 *
	 * const canvas = new Canvas(edit);
	 * await canvas.load();
	 * ```
	 */
	constructor(template: EditConfig) {
		super();

		// Create document layer from template (pure data, preserves "auto"/"end"/placeholders)
		this.document = new EditDocument(template);

		// Extract configuration from document
		this.size = this.document.getSize();
		this.backgroundColor = this.document.getBackground() ?? "#000000";

		// Initialize runtime state
		this.assetLoader = new AssetLoader();
		this.edit = null;
		this.tracks = [];
		this.clipsToDispose = [];
		this.clips = [];

		this.events = new EventEmitter();
		this.mergeFields = new MergeFieldService(this.events);
		this.lumaMaskController = new LumaMaskController(
			() => this.canvas,
			() => this.tracks,
			this.events
		);

		this.playbackTime = 0;
		this.totalDuration = 0;
		this.isPlaying = false;
		this.selectedClip = null;
		this.updatedClip = null;
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

		// Initialize from document - create players, resolve timing
		await this.initializeFromDocument();
	}

	/**
	 * Initialize players and timing from the document.
	 * Called during initial load() and can be called again via loadEdit() for hot-reload.
	 * @param source - The source identifier for events (default: "load")
	 */
	private async initializeFromDocument(source: string = "load"): Promise<void> {
		// Get raw edit from document
		const rawEdit = this.document.toJSON();

		// Load merge fields from edit payload into service
		const serializedMergeFields = rawEdit.merge ?? [];
		this.mergeFields.loadFromSerialized(serializedMergeFields);

		// Detect merge field bindings BEFORE substitution (preserves placeholder info)
		const bindingsPerClip = this.detectMergeFieldBindings(rawEdit as ResolvedEdit, serializedMergeFields);

		// Apply merge field substitutions for initial load
		const mergedEdit = serializedMergeFields.length > 0 ? applyMergeFields(rawEdit as ResolvedEdit, serializedMergeFields) : rawEdit;

		const parsedEdit = EditSchema.parse(mergedEdit) as EditConfig as ResolvedEdit;
		resolveAliasReferences(parsedEdit as unknown as EditConfig);
		this.edit = parsedEdit;

		// Load fonts
		await Promise.all(
			(this.edit.timeline.fonts ?? []).map(async font => {
				const identifier = font.src;
				const loadOptions: pixi.UnresolvedAsset = { src: identifier, parser: FontLoadParser.Name };

				return this.assetLoader.load<FontFace>(identifier, loadOptions);
			})
		);

		// Create players for each clip (skip document sync - document already has clips)
		this.isLoadingEdit = true;
		for (const [trackIdx, track] of this.edit.timeline.tracks.entries()) {
			for (const [clipIdx, clip] of track.clips.entries()) {
				try {
					const clipPlayer = this.createPlayerFromAssetType(clip);
					clipPlayer.layer = trackIdx + 1;

					// Pass merge field bindings to the player
					const bindings = bindingsPerClip.get(`${trackIdx}-${clipIdx}`);
					if (bindings && bindings.size > 0) {
						clipPlayer.setInitialBindings(bindings);
					}

					await this.addPlayer(trackIdx, clipPlayer);
				} catch (error) {
					// Store and emit error event, continue loading other clips
					const assetType = (clip.asset as { type?: string }).type ?? "unknown";
					const errorMessage = error instanceof Error ? error.message : String(error);
					this.clipErrors.set(`${trackIdx}-${clipIdx}`, { error: errorMessage, assetType });
					this.events.emit(EditEvent.ClipLoadFailed, {
						trackIndex: trackIdx,
						clipIndex: clipIdx,
						error: errorMessage,
						assetType
					});
				}
			}
		}
		this.isLoadingEdit = false;

		// Initialize luma mask relationships
		this.lumaMaskController.initialize();

		// Resolve timing for all clips
		await this.resolveAllTiming();

		// Update total duration
		this.updateTotalDuration();

		// Load soundtrack if present
		if (this.edit.timeline.soundtrack) {
			await this.loadSoundtrack(this.edit.timeline.soundtrack);
		}

		// Emit events
		this.events.emit(EditEvent.TimelineUpdated, { current: this.getResolvedEdit() });
		this.emitEditChanged(source);
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

		this.lumaMaskController.update();

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
		this.lumaMaskController.dispose();

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
		this.events.emit(EditEvent.PlaybackPlay);
	}
	public pause(): void {
		this.isPlaying = false;
		this.events.emit(EditEvent.PlaybackPause);
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

	/**
	 * Reload the edit with a new configuration (hot-reload).
	 * Uses smart diffing to only update what changed when possible.
	 *
	 * For initial loading, use the constructor + load() pattern instead:
	 * ```typescript
	 * const edit = new Edit(template);
	 * await edit.load();
	 * ```
	 *
	 * @param edit - The new Edit configuration to load
	 */
	public async loadEdit(edit: EditConfig): Promise<void> {
		// Smart diff: only do full reload when structure changes (track/clip count, asset type)
		if (this.edit && !this.hasStructuralChanges(edit)) {
			// Update document with new edit (preserves "auto", "end", placeholders)
			this.document = new EditDocument(edit);
			this.isBatchingEvents = true;
			this.applyGranularChanges(edit);
			this.isBatchingEvents = false;
			this.emitEditChanged("loadEdit:granular");
			return;
		}

		// Full reload - replace document and reinitialize
		this.document = new EditDocument(edit);

		// Handle size changes
		const newSize = this.document.getSize();
		if (newSize.width !== this.size.width || newSize.height !== this.size.height) {
			this.size = newSize;
			this.updateViewportMask();
			this.canvas?.zoomToFit();
		}

		// Handle background changes
		this.backgroundColor = this.document.getBackground() ?? "#000000";
		if (this.background) {
			this.background.clear();
			this.background.fillStyle = {
				color: this.backgroundColor
			};
			this.background.rect(0, 0, this.size.width, this.size.height);
			this.background.fill();
		}

		// Clear existing clips and reinitialize from document
		this.clearClips();
		await this.initializeFromDocument("loadEdit");
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
			start: sec(0),
			length: sec(this.totalDuration / 1000) // totalDuration is in ms
		};

		const player = new AudioPlayer(this, clip);
		player.layer = this.tracks.length + 1;
		await this.addPlayer(this.tracks.length, player);
	}
	public getEdit(): EditConfig {
		// Delegate to document layer - preserves "auto"/"end" values
		const doc = this.document.toJSON();
		// Overlay current merge field state (may have changed via setMergeField)
		const mergeFields = this.mergeFields.toSerializedArray();
		if (mergeFields.length > 0) {
			doc.merge = mergeFields;
		}
		return doc;
	}

	/**
	 * Validates an edit configuration without applying it.
	 * Use this to pre-validate user input before calling loadEdit().
	 *
	 * @param edit - The edit configuration to validate
	 * @returns Validation result with valid boolean and any errors
	 */
	public validateEdit(edit: unknown): { valid: boolean; errors: Array<{ path: string; message: string }> } {
		const result = EditSchema.safeParse(edit);
		if (result.success) {
			return { valid: true, errors: [] };
		}
		return {
			valid: false,
			errors: result.error.issues.map(issue => ({
				path: issue.path.join("."),
				message: issue.message
			}))
		};
	}

	public getResolvedEdit(): ResolvedEdit {
		const tracks: ResolvedTrack[] = this.tracks.map(track => ({
			clips: track
				.filter(player => player && !this.clipsToDispose.includes(player))
				.map(player => ({
					...player.clipConfiguration,
					start: player.getStart(),
					length: player.getLength()
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

	/**
	 * Get the pure document layer (holds raw Edit with "auto", "end", placeholders).
	 * This is the source of truth for backend serialization.
	 * @internal
	 */
	public getDocument(): EditDocument | null {
		return this.document;
	}

	public addClip(trackIdx: number, clip: ResolvedClip): void | Promise<void> {
		const command = new AddClipCommand(trackIdx, clip);
		return this.executeCommand(command);
	}
	public getClip(trackIdx: number, clipIdx: number): ResolvedClip | null {
		const track = this.tracks[trackIdx];
		if (!track || clipIdx < 0 || clipIdx >= track.length) return null;
		return track[clipIdx].clipConfiguration;
	}

	/**
	 * Get the error state for a clip that failed to load.
	 * Returns null if the clip loaded successfully.
	 */
	public getClipError(trackIdx: number, clipIdx: number): { error: string; assetType: string } | null {
		return this.clipErrors.get(`${trackIdx}-${clipIdx}`) ?? null;
	}

	/**
	 * Clear the error for a deleted clip and shift indices for remaining errors.
	 * Called when a clip is deleted to keep error indices in sync.
	 */
	private clearClipErrorAndShift(trackIdx: number, clipIdx: number): void {
		// Remove the error for the deleted clip
		this.clipErrors.delete(`${trackIdx}-${clipIdx}`);

		// Shift errors for clips after the deleted one (their indices decrease by 1)
		const keysToUpdate: Array<{ oldKey: string; newKey: string; value: { error: string; assetType: string } }> = [];

		for (const [key, value] of this.clipErrors) {
			const [t, c] = key.split("-").map(Number);
			if (t === trackIdx && c > clipIdx) {
				keysToUpdate.push({ oldKey: key, newKey: `${t}-${c - 1}`, value });
			}
		}

		for (const { oldKey, newKey, value } of keysToUpdate) {
			this.clipErrors.delete(oldKey);
			this.clipErrors.set(newKey, value);
		}
	}

	public getPlayerClip(trackIdx: number, clipIdx: number): Player | null {
		const track = this.tracks[trackIdx];
		if (!track || clipIdx < 0 || clipIdx >= track.length) return null;
		return track[clipIdx];
	}

	/** Get the exportable asset for a clip, preserving merge field templates */
	public getOriginalAsset(trackIndex: number, clipIndex: number): unknown | undefined {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return undefined;
		return player.getExportableClip()?.asset;
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
		// Sync document FIRST, before any async operations that yield to event loop
		if (this.document && !this.isLoadingEdit) {
			this.document.addTrack(trackIdx);
		}

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
			lumaMaskCount: this.lumaMaskController.getActiveMaskCount(),
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
				this.events.emit(EditEvent.EditUndo, { command: command.name });
				this.emitEditChanged(`undo:${command.name}`);
			}
		}
	}

	public redo(): void {
		if (this.commandIndex < this.commandHistory.length - 1) {
			this.commandIndex += 1;
			const command = this.commandHistory[this.commandIndex];
			const context = this.createCommandContext();
			command.execute(context);
			this.events.emit(EditEvent.EditRedo, { command: command.name });
			this.emitEditChanged(`redo:${command.name}`);
		}
	}
	/** @internal */
	public setUpdatedClip(clip: Player, initialClipConfig: ResolvedClip | null = null, finalClipConfig: ResolvedClip | null = null): void {
		// Find track and clip indices
		const trackIdx = clip.layer - 1;
		const track = this.tracks[trackIdx];
		const clipIdx = track ? track.indexOf(clip) : -1;

		const command = new SetUpdatedClipCommand(clip, initialClipConfig, finalClipConfig, {
			trackIndex: trackIdx,
			clipIndex: clipIdx
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

		const command = new SetUpdatedClipCommand(clip, initialConfig, mergedConfig, {
			trackIndex: trackIdx,
			clipIndex: clipIdx
		});
		this.executeCommand(command);
	}

	/**
	 * Update clip timing mode and/or values.
	 * Supports manual values, "auto", and "end" timing modes.
	 * @param trackIdx - Track index
	 * @param clipIdx - Clip index within track
	 * @param params - Timing update parameters (start and/or length in milliseconds)
	 */
	public updateClipTiming(trackIdx: number, clipIdx: number, params: TimingUpdateParams): void {
		const clip = this.getPlayerClip(trackIdx, clipIdx);
		if (!clip) {
			console.warn(`Clip not found at track ${trackIdx}, index ${clipIdx}`);
			return;
		}

		const command = new UpdateClipTimingCommand(trackIdx, clipIdx, params);
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

		// Handle both sync and async commands
		if (result instanceof Promise) {
			return result.then(() => this.emitEditChanged(command.name));
		}
		this.emitEditChanged(command.name);
		return result;
	}

	/**
	 * Emits a unified `edit:changed` event after any state mutation.
	 * Consumers can subscribe to this single event instead of tracking 31+ granular events.
	 */
	private emitEditChanged(source: string): void {
		if (this.isBatchingEvents) return;
		this.events.emit(EditEvent.EditChanged, { source, timestamp: Date.now() });
	}

	/**
	 * Detects merge field placeholders in the raw edit before substitution.
	 * Returns a map of clip keys ("trackIdx-clipIdx") to their merge field bindings.
	 * Each binding maps a property path to its placeholder and resolved value.
	 */
	private detectMergeFieldBindings(edit: ResolvedEdit, mergeFields: SerializedMergeField[]): Map<string, Map<string, MergeFieldBinding>> {
		const result = new Map<string, Map<string, MergeFieldBinding>>();

		if (!mergeFields.length) return result;

		// Build lookup map: FIELD_NAME -> replacement value
		const fieldValues = new Map<string, string>();
		for (const { find, replace } of mergeFields) {
			// Convert unknown replace value to string for placeholder matching
			const replaceStr = typeof replace === "string" ? replace : JSON.stringify(replace);
			fieldValues.set(find.toUpperCase(), replaceStr);
		}

		// Walk each clip and detect placeholder strings
		for (const [trackIdx, track] of edit.timeline.tracks.entries()) {
			for (const [clipIdx, clip] of track.clips.entries()) {
				const bindings = this.detectBindingsInObject(clip, "", fieldValues);
				if (bindings.size > 0) {
					result.set(`${trackIdx}-${clipIdx}`, bindings);
				}
			}
		}

		return result;
	}

	/**
	 * Recursively walks an object to find merge field placeholders.
	 * Returns a map of property paths to their bindings.
	 */
	private detectBindingsInObject(obj: unknown, basePath: string, fieldValues: Map<string, string>): Map<string, MergeFieldBinding> {
		const bindings = new Map<string, MergeFieldBinding>();

		if (typeof obj === "string") {
			// Check if this string contains a merge field placeholder
			const regex = /\{\{\s*([A-Z_0-9]+)\s*\}\}/gi;
			const hasMatch = regex.test(obj);
			if (hasMatch) {
				// Compute the fully resolved text by replacing all merge fields
				const resolvedText = obj.replace(
					/\{\{\s*([A-Z_0-9]+)\s*\}\}/gi,
					(match, fieldName: string) => fieldValues.get(fieldName.toUpperCase()) ?? match
				);
				bindings.set(basePath, {
					placeholder: obj,
					resolvedValue: resolvedText
				});
			}
			return bindings;
		}

		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i += 1) {
				const path = basePath ? `${basePath}[${i}]` : `[${i}]`;
				const childBindings = this.detectBindingsInObject(obj[i], path, fieldValues);
				for (const [p, b] of childBindings) {
					bindings.set(p, b);
				}
			}
			return bindings;
		}

		if (obj !== null && typeof obj === "object") {
			for (const [key, value] of Object.entries(obj)) {
				const path = basePath ? `${basePath}.${key}` : key;
				const childBindings = this.detectBindingsInObject(value, path, fieldValues);
				for (const [p, b] of childBindings) {
					bindings.set(p, b);
				}
			}
		}

		return bindings;
	}

	/**
	 * Checks if edit has structural changes requiring full reload.
	 * Structural = track count, clip count, or asset type changed.
	 */
	private hasStructuralChanges(newEdit: EditConfig): boolean {
		if (!this.edit) return true;

		const currentTracks = this.edit.timeline.tracks;
		const newTracks = newEdit.timeline.tracks;

		// Different track count = structural
		if (currentTracks.length !== newTracks.length) return true;

		// Check each track
		for (let t = 0; t < currentTracks.length; t += 1) {
			// Different clip count = structural
			if (currentTracks[t].clips.length !== newTracks[t].clips.length) return true;

			// Asset TYPE change = structural (ImagePlayer vs VideoPlayer)
			for (let c = 0; c < currentTracks[t].clips.length; c += 1) {
				const currentType = (currentTracks[t].clips[c]?.asset as { type?: string })?.type;
				const newType = (newTracks[t].clips[c]?.asset as { type?: string })?.type;
				if (currentType !== newType) return true;
			}
		}

		// Merge fields changed = structural (affects asset resolution)
		if (JSON.stringify(this.edit.merge ?? []) !== JSON.stringify(newEdit.merge ?? [])) {
			return true;
		}

		// Fonts changed = structural (requires re-loading fonts)
		if (JSON.stringify(this.edit.timeline.fonts ?? []) !== JSON.stringify(newEdit.timeline.fonts ?? [])) {
			return true;
		}

		return false;
	}

	/**
	 * Applies granular changes without full reload (preserves undo history, no flash).
	 * Only called when structure is unchanged (same track/clip counts).
	 */
	private applyGranularChanges(newEdit: EditConfig): void {
		const currentOutput = this.edit?.output;
		const newOutput = newEdit.output;

		// 1. Apply output changes
		if (newOutput?.size && (currentOutput?.size?.width !== newOutput.size.width || currentOutput?.size?.height !== newOutput.size.height)) {
			const width = newOutput.size.width ?? this.size.width;
			const height = newOutput.size.height ?? this.size.height;
			this.setOutputSize(width, height);
		}

		if (newOutput?.fps !== undefined && currentOutput?.fps !== newOutput.fps) {
			this.setOutputFps(newOutput.fps);
		}

		if (newOutput?.format !== undefined && currentOutput?.format !== newOutput.format) {
			this.setOutputFormat(newOutput.format);
		}

		if (newOutput?.destinations && JSON.stringify(currentOutput?.destinations) !== JSON.stringify(newOutput.destinations)) {
			this.setOutputDestinations(newOutput.destinations);
		}

		const newBg = newEdit.timeline?.background;
		if (newBg && this.backgroundColor !== newBg) {
			this.setTimelineBackground(newBg);
		}

		// 2. Diff and update each clip
		const currentTracks = this.edit!.timeline.tracks;
		const newTracks = newEdit.timeline.tracks;

		for (let trackIdx = 0; trackIdx < newTracks.length; trackIdx += 1) {
			const currentClips = currentTracks[trackIdx].clips;
			const newClips = newTracks[trackIdx].clips;

			for (let clipIdx = 0; clipIdx < newClips.length; clipIdx += 1) {
				const currentClip = currentClips[clipIdx];
				const newClip = newClips[clipIdx];

				// Only update if clip changed
				if (JSON.stringify(currentClip) !== JSON.stringify(newClip)) {
					// Cast since newClip may have "auto"/"end" strings; updateClip handles resolution
					this.updateClip(trackIdx, clipIdx, newClip as unknown as Partial<ResolvedClip>);
				}
			}
		}
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
			clearClipError: (trackIdx, clipIdx) => this.clearClipErrorAndShift(trackIdx, clipIdx),
			undeleteClip: (trackIdx, clip) => {
				this.clips.push(clip);

				let insertIdx = 0;
				if (trackIdx >= 0 && trackIdx < this.tracks.length) {
					const track = this.tracks[trackIdx];
					insertIdx = track.length;
					for (let i = 0; i < track.length; i += 1) {
						if (track[i].getStart() > clip.getStart()) {
							insertIdx = i;
							break;
						}
					}
					track.splice(insertIdx, 0, clip);
				}

				// Sync with document layer - restore clip at the same position
				if (this.document) {
					const exportableClip = clip.getExportableClip();
					this.document.addClip(trackIdx, exportableClip, insertIdx);
				}

				this.addPlayerToContainer(trackIdx, clip);

				clip.load().catch(error => {
					// Capture load errors for restored clips (same pattern as initial load)
					const assetType = (clip.clipConfiguration?.asset as { type?: string })?.type ?? "unknown";
					const errorMessage = error instanceof Error ? error.message : String(error);
					this.clipErrors.set(`${trackIdx}-${insertIdx}`, { error: errorMessage, assetType });
					this.events.emit(EditEvent.ClipLoadFailed, {
						trackIndex: trackIdx,
						clipIndex: insertIdx,
						error: errorMessage,
						assetType
					});
				});

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

				// Sync with document layer - update clip configuration
				if (this.document) {
					const indices = this.findClipIndices(clip);
					if (indices) {
						const exportableClip = clip.getExportableClip();
						this.document.replaceClip(indices.trackIndex, indices.clipIndex, exportableClip);
					}
				}
			},
			updateDuration: () => this.updateTotalDuration(),
			emitEvent: (name, ...args) => (this.events as EventEmitter<EditEventMap>).emit(name, ...args),
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
			getMergeFields: () => this.mergeFields
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
				this.lumaMaskController.cleanupForPlayer(clip);
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

					// Sync with document layer - remove clip
					if (this.document) {
						this.document.removeClip(trackIdx, clipIdx);
					}
				}
			}
		}

		this.clipsToDispose = [];
		this.updateTotalDuration();

		// Clean up fonts that are no longer used by any clip
		this.cleanupUnusedFonts();
	}

	/**
	 * Remove fonts from timeline.fonts that are no longer referenced by any clip.
	 * This keeps the document clean and prevents accumulation of unused font URLs.
	 */
	private cleanupUnusedFonts(): void {
		if (!this.document) return;

		const fonts = this.document.getFonts();
		if (fonts.length === 0) return;

		// Collect all font filenames currently used by RichText clips
		const usedFilenames = new Set<string>();
		for (const clip of this.clips) {
			const { asset } = clip.clipConfiguration;
			if (asset && asset.type === "rich-text" && asset.font?.family) {
				usedFilenames.add(asset.font.family);
			}
		}

		// Check each font URL and remove if its filename is not used
		for (const font of fonts) {
			const filename = this.extractFilenameFromUrl(font.src);
			if (filename && !usedFilenames.has(filename)) {
				this.document.removeFont(font.src);
			}
		}
	}

	/**
	 * Extract the filename (without extension) from a font URL.
	 * e.g., "https://fonts.gstatic.com/s/inter/v20/UcCO3Fwr...Bg-4.ttf" → "UcCO3Fwr...Bg-4"
	 */
	private extractFilenameFromUrl(url: string): string | null {
		try {
			const { pathname } = new URL(url);
			const filename = pathname.split("/").pop();
			if (!filename) return null;
			// Remove extension (.ttf, .woff2, etc.)
			return filename.replace(/\.[^.]+$/, "");
		} catch {
			return null;
		}
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
			const safeToUnload = this.assetLoader.decrementRef(asset.src);
			if (safeToUnload && pixi.Assets.cache.has(asset.src)) {
				pixi.Assets.unload(asset.src);
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
		this.clipErrors.clear();

		this.updateTotalDuration();
	}
	private updateTotalDuration(): void {
		let maxDurationSeconds = 0;

		for (const track of this.tracks) {
			for (const clip of track) {
				// clip.getEnd() returns Seconds
				maxDurationSeconds = Math.max(maxDurationSeconds, clip.getEnd());
			}
		}

		// Convert to milliseconds for playbackTime compatibility
		const previousDuration = this.totalDuration;
		this.totalDuration = maxDurationSeconds * 1000;

		// Emit event if duration changed
		if (previousDuration !== this.totalDuration) {
			this.events.emit(EditEvent.DurationChanged, { duration: this.totalDuration });
		}
	}

	private async resolveAllTiming(): Promise<void> {
		for (let trackIdx = 0; trackIdx < this.tracks.length; trackIdx += 1) {
			for (let clipIdx = 0; clipIdx < this.tracks[trackIdx].length; clipIdx += 1) {
				const clip = this.tracks[trackIdx][clipIdx];
				const intent = clip.getTimingIntent();

				let resolvedStart: Seconds;
				if (intent.start === "auto") {
					resolvedStart = resolveAutoStart(trackIdx, clipIdx, this.tracks);
				} else {
					resolvedStart = intent.start;
				}

				let resolvedLength: Seconds;
				if (intent.length === "auto") {
					resolvedLength = await resolveAutoLength(clip.clipConfiguration.asset);
				} else if (intent.length === "end") {
					resolvedLength = sec(0);
				} else {
					resolvedLength = intent.length;
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

		// After timing is resolved, reconfigure audio players to rebuild effect keyframes
		for (const clip of this.clips) {
			if (clip.playerType === PlayerType.Audio) {
				clip.reconfigureAfterRestore();
			}
		}
	}

	public propagateTimingChanges(trackIndex: number, startFromClipIndex: number): void {
		const track = this.tracks[trackIndex];
		if (!track) return;

		// Include the clip itself (not just subsequent clips) so auto start on first clip resolves to 0
		for (let i = Math.max(0, startFromClipIndex); i < track.length; i += 1) {
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

				if (Math.abs(newLength - currentLength) > 0.001) {
					clip.setResolvedTiming({
						start: clip.getStart(),
						length: newLength
					});
					// Sync clipConfiguration with resolved value
					// eslint-disable-next-line no-param-reassign -- Intentional mutation of clip state
					clip.clipConfiguration.length = newLength;
					clip.reconfigureAfterRestore();
				}
			}
		}

		this.updateTotalDuration();

		// Notify Timeline to update visuals with new timing (use resolved values)
		this.events.emit(EditEvent.TimelineUpdated, {
			current: this.getResolvedEdit()
		});
	}

	public async resolveClipAutoLength(clip: Player): Promise<void> {
		const intent = clip.getTimingIntent();
		if (intent.length !== "auto") return;

		// Find clip indices first (needed if start is also auto)
		const indices = this.findClipIndices(clip);

		// Resolve auto start if needed, otherwise use current start
		let resolvedStart = clip.getStart();
		if (intent.start === "auto" && indices) {
			resolvedStart = resolveAutoStart(indices.trackIndex, indices.clipIndex, this.tracks);
		}

		const newLength = await resolveAutoLength(clip.clipConfiguration.asset);
		clip.setResolvedTiming({
			start: resolvedStart,
			length: newLength
		});

		// Sync clipConfiguration with resolved value
		// eslint-disable-next-line no-param-reassign -- Intentional mutation of clip state
		clip.clipConfiguration.length = newLength;

		clip.reconfigureAfterRestore();

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

		// Force parent container to re-sort children by zIndex
		this.getContainer().sortDirty = true;
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

		this.clips.push(clipToAdd);

		// Sync with document layer - add clip to preserve "auto"/"end" values
		// Skip during initial load since document already has clips from constructor
		if (this.document && !this.isLoadingEdit) {
			// Ensure document has enough tracks
			while (this.document.getTrackCount() <= trackIdx) {
				this.document.addTrack(this.document.getTrackCount());
			}
			// Add clip at the position it was added (end of track)
			const clipIdx = this.tracks[trackIdx].length - 1;
			const exportableClip = clipToAdd.getExportableClip();
			this.document.addClip(trackIdx, exportableClip, clipIdx);
		}

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
			this.events.emit(EditEvent.ClipCopied, { trackIndex: trackIdx, clipIndex: clipIdx });
		}
	}

	/**
	 * Paste the copied clip at the current playhead position
	 */
	public pasteClip(): void {
		if (!this.copiedClip) return;

		const pastedClip = structuredClone(this.copiedClip.clipConfiguration);
		pastedClip.start = toSec(ms(this.playbackTime)); // Paste at playhead position

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
		const result = OutputSizeSchema.safeParse({ width, height });
		if (!result.success) {
			throw new Error(`Invalid size: ${result.error.issues[0]?.message}`);
		}

		// We validated with required width/height so we can safely cast
		const size: Size = { width, height };
		this.size = size;

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				size
			};
		}

		// Sync with document layer
		this.document?.setSize(size);

		this.updateViewportMask();
		this.canvas?.zoomToFit();

		if (this.background) {
			this.background.clear();
			this.background.fillStyle = { color: this.backgroundColor };
			this.background.rect(0, 0, width, height);
			this.background.fill();
		}

		this.events.emit(EditEvent.OutputResized, size);
		this.emitEditChanged("output:size");
	}

	public setOutputFps(fps: number): void {
		const result = OutputFpsSchema.safeParse(fps);
		if (!result.success) {
			throw new Error(`Invalid fps: ${result.error.issues[0]?.message}`);
		}

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				fps: result.data
			};
		}

		// Sync with document layer
		this.document?.setFps(result.data);

		this.events.emit(EditEvent.OutputFpsChanged, { fps });
		this.emitEditChanged("output:fps");
	}

	public getOutputFps(): number {
		return this.edit?.output?.fps ?? 30;
	}

	public setOutputFormat(format: string): void {
		const result = OutputFormatSchema.safeParse(format);
		if (!result.success) {
			throw new Error(`Invalid format: ${result.error.issues[0]?.message}`);
		}

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				format: result.data
			};
		}

		// Sync with document layer
		this.document?.setFormat(result.data);

		this.events.emit(EditEvent.OutputFormatChanged, { format: result.data });
		this.emitEditChanged("output:format");
	}

	public getOutputFormat(): string {
		return this.edit?.output?.format ?? "mp4";
	}

	public setOutputDestinations(destinations: Destination[]): void {
		const result = DestinationSchema.array().safeParse(destinations);
		if (!result.success) {
			throw new Error(`Invalid destinations: ${result.error.message}`);
		}

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				destinations: result.data
			};
		}

		this.events.emit(EditEvent.OutputDestinationsChanged, { destinations: result.data });
		this.emitEditChanged("output:destinations");
	}

	public getOutputDestinations(): Destination[] {
		return this.edit?.output?.destinations ?? [];
	}

	public getTimelineFonts(): Array<{ src: string }> {
		return this.edit?.timeline?.fonts ?? [];
	}

	/**
	 * Remove any fonts from timeline.fonts that are no longer used by clips.
	 * Call this after changing a clip's font to clean up the old font.
	 */
	public pruneUnusedFonts(): void {
		this.cleanupUnusedFonts();
	}

	public setTimelineBackground(color: string): void {
		const result = HexColorSchema.safeParse(color);
		if (!result.success) {
			throw new Error(`Invalid color: ${result.error.issues[0]?.message}`);
		}

		this.backgroundColor = result.data;

		if (this.edit) {
			this.edit.timeline = {
				...this.edit.timeline,
				background: result.data
			};
		}

		// Sync with document layer
		this.document?.setBackground(result.data);

		if (this.background) {
			this.background.clear();
			this.background.fillStyle = { color: this.backgroundColor };
			this.background.rect(0, 0, this.size.width, this.size.height);
			this.background.fill();
		}

		this.events.emit(EditEvent.TimelineBackgroundChanged, { color: result.data });
		this.emitEditChanged("timeline:background");
	}

	public getTimelineBackground(): string {
		return this.backgroundColor;
	}

	// ─── Toolbar Button Registry ─────────────────────────────────────────────────

	/**
	 * @deprecated Use `ui.registerButton()` instead.
	 */
	public registerToolbarButton(config: ToolbarButtonConfig): void {
		console.warn(
			"[Shotstack] edit.registerToolbarButton() is deprecated. " +
				"Use ui.registerButton() instead for typed events: " +
				'ui.registerButton({ id: "text", ... }); ui.on("button:text", handler);'
		);
		const existing = this.toolbarButtons.findIndex(b => b.id === config.id);
		if (existing >= 0) {
			this.toolbarButtons[existing] = config;
		} else {
			this.toolbarButtons.push(config);
		}
		this.events.emit(InternalEvent.ToolbarButtonsChanged, { buttons: this.toolbarButtons });
	}

	/**
	 * @deprecated Use `ui.unregisterButton()` instead.
	 */
	public unregisterToolbarButton(id: string): void {
		console.warn("[Shotstack] edit.unregisterToolbarButton() is deprecated. Use ui.unregisterButton() instead.");
		const index = this.toolbarButtons.findIndex(b => b.id === id);
		if (index >= 0) {
			this.toolbarButtons.splice(index, 1);
			this.events.emit(InternalEvent.ToolbarButtonsChanged, { buttons: this.toolbarButtons });
		}
	}

	/**
	 * @deprecated Use `ui.getButtons()` instead.
	 */
	public getToolbarButtons(): ToolbarButtonConfig[] {
		return [...this.toolbarButtons];
	}

	// ─── Template Edit Access (via player bindings) ───────────────────────────

	/** Get the exportable clip (with merge field placeholders restored) */
	private getTemplateClip(trackIndex: number, clipIndex: number): ResolvedClip | null {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return null;
		return player.getExportableClip() as ResolvedClip;
	}

	/** Get the text content from the template clip (with merge field placeholders) */
	public getTemplateClipText(trackIdx: number, clipIdx: number): string | null {
		const templateClip = this.getTemplateClip(trackIdx, clipIdx);
		if (!templateClip) return null;
		const asset = templateClip.asset as { text?: string } | undefined;
		return asset?.text ?? null;
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
				const player = this.tracks[trackIdx][clipIdx];
				const templateClip = this.getTemplateClip(trackIdx, clipIdx);
				if (templateClip) {
					// Update clipConfiguration with new resolved value (for rendering)
					this.updateMergeFieldInObject(player.clipConfiguration, templateClip, fieldName, newValue);

					// Also update the binding's resolvedValue so getExportableClip() can match correctly
					this.updateMergeFieldBindings(player, fieldName, newValue);
				}
			}
		}
	}

	/** Helper: Update merge field binding resolvedValues for a player */
	private updateMergeFieldBindings(player: Player, fieldName: string, _newValue: string): void {
		for (const [path, binding] of player.getMergeFieldBindings()) {
			// Check if this binding's placeholder contains this field
			const extractedField = this.mergeFields.extractFieldName(binding.placeholder);
			if (extractedField === fieldName) {
				// Recompute the resolved value from the placeholder with the new field value
				const newResolvedValue = this.mergeFields.resolve(binding.placeholder);
				player.setMergeFieldBinding(path, {
					placeholder: binding.placeholder,
					resolvedValue: newResolvedValue
				});
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
					// Replace {{ FIELD }} with newValue in the resolved clipConfiguration
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

	// ─── Luma Mask API ──────────────────────────────────────────────────────────

	/** Map of content player → luma player for attachment tracking */
	private lumaAttachments = new Map<Player, Player>();

	/** Map of asset src → original asset type (for reliable luma detachment) */
	private originalAssetTypes = new Map<string, "image" | "video">();

	/**
	 * Attach a luma mask to a specific clip.
	 * Creates a luma clip on the same track with synchronized timing.
	 *
	 * @param trackIndex - Track index of the content clip
	 * @param clipIndex - Clip index of the content clip
	 * @param lumaSrc - URL of the luma mask asset (video or image)
	 */
	public async attachLumaToClip(trackIndex: number, clipIndex: number, lumaSrc: string): Promise<void> {
		const contentPlayer = this.getClipAt(trackIndex, clipIndex);
		if (!contentPlayer) return;

		// Don't attach luma to another luma
		if (contentPlayer.playerType === PlayerType.Luma) return;

		// Check if already has a luma attached
		if (this.lumaAttachments.has(contentPlayer)) {
			// Detach existing luma first
			await this.detachLumaFromClip(trackIndex, clipIndex);
		}

		// Create luma clip config with synced timing
		const contentConfig = contentPlayer.clipConfiguration;
		const lumaClip: ResolvedClip = {
			asset: {
				type: "luma",
				src: lumaSrc
			},
			start: contentConfig.start,
			length: contentConfig.length,
			fit: "crop" // Required by schema transform, not visually relevant for luma masks
		};

		// Add the luma clip to the same track
		await this.addClip(trackIndex, lumaClip);

		// Find the newly added luma player
		const track = this.tracks[trackIndex];
		const lumaPlayer = track.find(p => p.playerType === PlayerType.Luma && p.clipConfiguration.start === contentConfig.start);

		if (lumaPlayer) {
			// Store the attachment
			this.lumaAttachments.set(contentPlayer, lumaPlayer);

			// Emit event
			const lumaClipIndex = track.indexOf(lumaPlayer);
			this.events.emit(EditEvent.LumaAttached, {
				trackIndex,
				clipIndex,
				lumaSrc,
				lumaClipIndex
			});
		}
	}

	/**
	 * Detach the luma mask from a clip.
	 * Removes the luma clip from the track.
	 *
	 * @param trackIndex - Track index of the content clip
	 * @param clipIndex - Clip index of the content clip
	 */
	public async detachLumaFromClip(trackIndex: number, clipIndex: number): Promise<void> {
		const contentPlayer = this.getClipAt(trackIndex, clipIndex);
		if (!contentPlayer) return;

		const lumaPlayer = this.lumaAttachments.get(contentPlayer);
		if (!lumaPlayer) return;

		// Find the luma clip index
		const lumaIndices = this.findClipIndices(lumaPlayer);
		if (lumaIndices) {
			// Remove the attachment first
			this.lumaAttachments.delete(contentPlayer);

			// Delete the luma clip
			const command = new DeleteClipCommand(lumaIndices.trackIndex, lumaIndices.clipIndex);
			this.executeCommand(command);

			// Emit event
			this.events.emit(EditEvent.LumaDetached, { trackIndex, clipIndex });
		}
	}

	/**
	 * Get the luma mask attached to a clip, if any.
	 *
	 * @param trackIndex - Track index of the content clip
	 * @param clipIndex - Clip index of the content clip
	 * @returns Luma info or null if no luma attached
	 */
	public getClipLuma(trackIndex: number, clipIndex: number): { src: string; clipIndex: number } | null {
		const contentPlayer = this.getClipAt(trackIndex, clipIndex);
		if (!contentPlayer) return null;

		const lumaPlayer = this.lumaAttachments.get(contentPlayer);
		if (!lumaPlayer) return null;

		const lumaIndices = this.findClipIndices(lumaPlayer);
		if (!lumaIndices) return null;

		const lumaSrc = (lumaPlayer.clipConfiguration.asset as { src?: string })?.src;
		if (!lumaSrc) return null;

		return { src: lumaSrc, clipIndex: lumaIndices.clipIndex };
	}

	/**
	 * Check if a clip has a luma mask attached.
	 *
	 * @param trackIndex - Track index of the content clip
	 * @param clipIndex - Clip index of the content clip
	 */
	public hasLumaMask(trackIndex: number, clipIndex: number): boolean {
		const contentPlayer = this.getClipAt(trackIndex, clipIndex);
		if (!contentPlayer) return false;
		return this.lumaAttachments.has(contentPlayer);
	}

	/**
	 * Register a luma attachment in the Edit Session's map.
	 * This is called when a luma is attached to a content clip (e.g., during drag-drop).
	 * The map is used by syncAttachedLuma() to coordinate timing between attached clips.
	 */
	public registerLumaAttachment(contentTrackIndex: number, contentClipIndex: number, lumaTrackIndex: number, lumaClipIndex: number): void {
		const contentPlayer = this.getClipAt(contentTrackIndex, contentClipIndex);
		const lumaPlayer = this.getClipAt(lumaTrackIndex, lumaClipIndex);
		if (contentPlayer && lumaPlayer) {
			this.lumaAttachments.set(contentPlayer, lumaPlayer);
		}
	}

	/**
	 * Synchronize attached luma timing with content clip.
	 * Called internally when content clip is moved or resized.
	 * @internal
	 */
	public syncAttachedLuma(contentTrackIndex: number, contentClipIndex: number): void {
		const contentPlayer = this.getClipAt(contentTrackIndex, contentClipIndex);
		if (!contentPlayer) return;

		const lumaPlayer = this.lumaAttachments.get(contentPlayer);
		if (!lumaPlayer) return;

		// Sync timing from content to luma
		const contentConfig = contentPlayer.clipConfiguration;
		lumaPlayer.clipConfiguration.start = contentConfig.start;
		lumaPlayer.clipConfiguration.length = contentConfig.length;

		// Update resolved timing to match content player
		lumaPlayer.setResolvedTiming({
			start: contentPlayer.getStart(),
			length: contentPlayer.getLength()
		});

		// Visually apply the position change
		lumaPlayer.reconfigureAfterRestore();
		lumaPlayer.draw();

		// Also update in document layer
		const lumaIndices = this.findClipIndices(lumaPlayer);
		if (lumaIndices) {
			this.document.updateClip(lumaIndices.trackIndex, lumaIndices.clipIndex, {
				start: contentConfig.start,
				length: contentConfig.length
			});
		}
	}

	/**
	 * Get the luma player attached to a content player.
	 * @internal
	 */
	public getAttachedLumaPlayer(contentPlayer: Player): Player | null {
		return this.lumaAttachments.get(contentPlayer) ?? null;
	}

	/**
	 * Rebuild luma attachments from track state.
	 * Called after loading or undo/redo to restore attachment map.
	 * @internal
	 */
	public rebuildLumaAttachments(): void {
		this.lumaAttachments.clear();

		for (const track of this.tracks) {
			const lumaPlayer = track.find(p => p.playerType === PlayerType.Luma);
			const contentClips = track.filter(p => p.playerType !== PlayerType.Luma);

			if (lumaPlayer && contentClips.length > 0) {
				// Find content clip with matching timing
				const matchingContent = contentClips.find(
					c => c.clipConfiguration.start === lumaPlayer.clipConfiguration.start && c.clipConfiguration.length === lumaPlayer.clipConfiguration.length
				);

				if (matchingContent) {
					this.lumaAttachments.set(matchingContent, lumaPlayer);
				} else if (contentClips.length === 1) {
					// Fallback: if only one content clip, attach to it
					this.lumaAttachments.set(contentClips[0], lumaPlayer);
				}
			}
		}
	}

	/**
	 * Transform a clip to luma type (for attachment).
	 * Recreates the player with luma asset type while preserving the src.
	 *
	 * @param trackIndex - Track index of the clip
	 * @param clipIndex - Clip index of the clip
	 */
	public transformToLuma(trackIndex: number, clipIndex: number): void {
		const player = this.getClipAt(trackIndex, clipIndex);
		if (!player?.clipConfiguration?.asset) return;

		const asset = player.clipConfiguration.asset as { type?: string; src?: string };
		const originalType = asset.type as "image" | "video" | undefined;
		const { src } = asset;

		// Store original type for reliable restoration later
		if (src && (originalType === "image" || originalType === "video")) {
			this.originalAssetTypes.set(src, originalType);
		}

		const command = new TransformClipAssetCommand(trackIndex, clipIndex, "luma");
		this.executeCommand(command);
	}

	/**
	 * Transform a luma clip back to its original type (for detachment).
	 * Uses stored original type for reliability, with URL extension fallback.
	 *
	 * @param trackIndex - Track index of the luma clip
	 * @param clipIndex - Clip index of the luma clip
	 */
	public transformFromLuma(trackIndex: number, clipIndex: number): void {
		const player = this.getClipAt(trackIndex, clipIndex);
		if (!player?.clipConfiguration?.asset) return;

		const { src } = player.clipConfiguration.asset as { src?: string };
		if (!src) return;

		// Use stored original type if available (most reliable)
		let originalType = this.originalAssetTypes.get(src);

		// Fallback: infer from URL extension
		if (!originalType) {
			originalType = this.inferAssetTypeFromUrl(src);
		}

		const command = new TransformClipAssetCommand(trackIndex, clipIndex, originalType);
		this.executeCommand(command);
	}

	/**
	 * Infer asset type from URL extension.
	 * Used as fallback when original type isn't stored.
	 * @internal
	 */
	private inferAssetTypeFromUrl(src: string): "image" | "video" {
		const url = src.toLowerCase().split("?")[0];
		const videoExtensions = [".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv", ".ogv", ".ogg"];

		if (videoExtensions.some(ext => url.endsWith(ext))) {
			return "video";
		}
		return "image";
	}

	// ─── Intent Listeners ────────────────────────────────────────────────────────

	private setupIntentListeners(): void {
		this.events.on(InternalEvent.CanvasClipClicked, data => {
			this.selectPlayer(data.player);
		});

		this.events.on(InternalEvent.CanvasBackgroundClicked, () => {
			this.clearSelection();
		});
	}
}
