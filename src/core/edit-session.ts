import { AudioPlayer } from "@canvas/players/audio-player";
import { CaptionPlayer } from "@canvas/players/caption-player";
import { HtmlPlayer } from "@canvas/players/html-player";
import { ImagePlayer } from "@canvas/players/image-player";
import { LumaPlayer } from "@canvas/players/luma-player";
import { type Player, PlayerType } from "@canvas/players/player";
import type { MergeFieldBinding } from "@core/edit-document";
import { RichTextPlayer } from "@canvas/players/rich-text-player";
import { ShapePlayer } from "@canvas/players/shape-player";
import { SvgPlayer } from "@canvas/players/svg-player";
import { TextPlayer } from "@canvas/players/text-player";
import { VideoPlayer } from "@canvas/players/video-player";
import type { Canvas } from "@canvas/shotstack-canvas";
import { AlignmentGuides } from "@canvas/system/alignment-guides";
import { resolveAliasReferences } from "@core/alias";
import { AddClipCommand } from "@core/commands/add-clip-command";
import { AddTrackCommand } from "@core/commands/add-track-command";
import { DeleteClipCommand } from "@core/commands/delete-clip-command";
import { DeleteTrackCommand } from "@core/commands/delete-track-command";
import { SetOutputFpsCommand } from "@core/commands/set-output-fps-command";
import { SetOutputSizeCommand } from "@core/commands/set-output-size-command";
import { SetTimelineBackgroundCommand } from "@core/commands/set-timeline-background-command";
import { SetUpdatedClipCommand } from "@core/commands/set-updated-clip-command";
import { SplitClipCommand } from "@core/commands/split-clip-command";
import { TransformClipAssetCommand } from "@core/commands/transform-clip-asset-command";
import { type TimingUpdateParams, UpdateClipTimingCommand } from "@core/commands/update-clip-timing-command";
import { UpdateTextContentCommand } from "@core/commands/update-text-content-command";
import { EditEvent, InternalEvent, type EditEventMap, type InternalEventMap } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import { parseFontFamily } from "@core/fonts/font-config";
import { LumaMaskController } from "@core/luma-mask-controller";
import { applyMergeFields, MergeFieldService, type SerializedMergeField } from "@core/merge";
import { Entity } from "@core/shared/entity";
import { deepMerge, setNestedValue } from "@core/shared/utils";
import { calculateTimelineEnd, resolveAutoLength, resolveAutoStart, resolveEndLength } from "@core/timing/resolver";
import { type ResolutionContext, type Seconds, ms, sec, toSec } from "@core/timing/types";
import type { ToolbarButtonConfig } from "@core/ui/toolbar-button.types";
import type { Size } from "@layouts/geometry";
import { AssetLoader } from "@loaders/asset-loader";
import { FontLoadParser } from "@loaders/font-load-parser";
import {
	DestinationSchema,
	EditSchema,
	HexColorSchema,
	OutputAspectRatioSchema,
	OutputFormatSchema,
	OutputFpsSchema,
	OutputResolutionSchema,
	OutputSizeSchema,
	type Clip,
	type Destination,
	type Edit as EditConfig,
	type ResolvedClip,
	type ResolvedEdit,
	type ResolvedTrack,
	type Soundtrack,
	type Track
} from "@schemas";
import * as pixi from "pixi.js";

import type { EditCommand, CommandContext } from "./commands/types";
import { EditDocument } from "./edit-document";
import { PlayerReconciler } from "./player-reconciler";
import { resolve as resolveDocument, resolveClip as resolveClipById, type SingleClipContext } from "./resolver";

// ─── Resolution Preset Dimensions ─────────────────────────────────────────────

/**
 * Base dimensions for each resolution preset (16:9 aspect ratio)
 */
const RESOLUTION_DIMENSIONS: Record<string, { width: number; height: number }> = {
	preview: { width: 512, height: 288 },
	mobile: { width: 640, height: 360 },
	sd: { width: 1024, height: 576 },
	hd: { width: 1280, height: 720 },
	"1080": { width: 1920, height: 1080 },
	"4k": { width: 3840, height: 2160 }
};

/**
 * Calculate output size from resolution preset and aspect ratio.
 * Resolution defines the base dimensions (16:9), aspectRatio transforms them.
 */
function calculateSizeFromPreset(resolution: string, aspectRatio: string = "16:9"): Size {
	const base = RESOLUTION_DIMENSIONS[resolution];
	if (!base) {
		throw new Error(`Unknown resolution: ${resolution}`);
	}

	// Apply aspect ratio transformation
	// Base dimensions are 16:9, so we transform to the target aspect ratio
	switch (aspectRatio) {
		case "16:9":
			return { width: base.width, height: base.height };
		case "9:16":
			// Flip width and height for vertical orientation
			return { width: base.height, height: base.width };
		case "1:1":
			// Square - use height as base dimension
			return { width: base.height, height: base.height };
		case "4:5":
			// Short vertical - maintain height, adjust width to 4:5 ratio
			return { width: Math.round((base.height * 4) / 5), height: base.height };
		case "4:3":
			// Legacy TV - maintain height, adjust width to 4:3 ratio
			return { width: Math.round((base.height * 4) / 3), height: base.height };
		default:
			throw new Error(`Unknown aspectRatio: ${aspectRatio}`);
	}
}

/**
 * Magic elapsed value passed to update() during seek operations.
 * Any value > 100 signals to players that a seek occurred rather than normal playback.
 * VideoPlayer uses this to force video sync; RichTextPlayer uses it to reset render state.
 * @internal
 */
export const SEEK_ELAPSED_MARKER = 101;

// ─── Edit Session Class ───────────────────────────────────────────────────────

export class Edit extends Entity {
	private static readonly ZIndexPadding = 100;
	/**
	 * Maximum number of commands to keep in undo history.
	 * Prevents unbounded memory growth in long editing sessions.
	 * Each command may hold Player references and deep-cloned configs.
	 */
	private static readonly MAX_HISTORY_SIZE = 100;

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
	/** @internal Stored for future reconciliation use */
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

	/**
	 * Merge field service for internal template resolution.
	 * @internal Use ShotstackEdit.mergeFields for public API access.
	 */
	protected mergeFieldService: MergeFieldService;

	private canvas: Canvas | null = null;

	/** @internal */
	private alignmentGuides: AlignmentGuides | null = null;
	private lumaMaskController: LumaMaskController;
	private playerReconciler: PlayerReconciler;

	// Clip load errors - persisted so Timeline can query them after subscribing
	private clipErrors = new Map<string, { error: string; assetType: string }>();

	/**
	 * Map of clip ID → Player for ID-based lookup.
	 * Enables reconciliation and commands to reference clips by stable ID.
	 * @internal
	 */
	private playerByClipId = new Map<string, Player>();

	// Font metadata storage - maps URL to normalized base family + weight for rich-text font resolution
	private fontMetadata = new Map<string, { baseFamilyName: string; weight: number }>();

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
		// Calculate size from resolution preset, or use explicit size
		const resolution = this.document.getResolution();
		if (resolution) {
			const aspectRatio = this.document.getAspectRatio();
			this.size = calculateSizeFromPreset(resolution, aspectRatio);
		} else {
			this.size = this.document.getSize();
		}
		this.backgroundColor = this.document.getBackground() ?? "#000000";

		// Initialize runtime state
		this.assetLoader = new AssetLoader();
		this.edit = null;
		this.tracks = [];
		this.clipsToDispose = [];
		this.clips = [];

		this.events = new EventEmitter();
		this.mergeFieldService = new MergeFieldService(this.events);
		this.lumaMaskController = new LumaMaskController(
			() => this.canvas,
			() => this.tracks,
			this.events
		);
		this.playerReconciler = new PlayerReconciler(this);

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
		this.mergeFieldService.loadFromSerialized(serializedMergeFields);

		// Detect merge field bindings BEFORE substitution (preserves placeholder info)
		const bindingsPerClip = this.detectMergeFieldBindings(rawEdit as ResolvedEdit, serializedMergeFields);

		// Apply merge field substitutions for initial load
		const mergedEdit = serializedMergeFields.length > 0 ? applyMergeFields(rawEdit as ResolvedEdit, serializedMergeFields) : rawEdit;

		const parsedEdit = EditSchema.parse(mergedEdit) as EditConfig as ResolvedEdit;
		resolveAliasReferences(parsedEdit as unknown as EditConfig);
		this.edit = parsedEdit;

		// Load fonts and store metadata for rich-text font resolution
		await Promise.all(
			(this.edit.timeline.fonts ?? []).map(async font => {
				const identifier = font.src;
				const loadOptions: pixi.UnresolvedAsset = { src: identifier, parser: FontLoadParser.Name };

				const fontFace = await this.assetLoader.load<FontFace>(identifier, loadOptions);

				// Store normalized base family + weight (TTF might report "Lato Light" or "Lato")
				if (fontFace?.family) {
					const { baseFontFamily, fontWeight } = parseFontFamily(fontFace.family);
					this.fontMetadata.set(identifier, { baseFamilyName: baseFontFamily, weight: fontWeight });
				}

				return fontFace;
			})
		);

		// Create players for each clip (skip document sync - document already has clips)
		this.isLoadingEdit = true;
		for (const [trackIdx, track] of this.edit.timeline.tracks.entries()) {
			for (const [clipIdx, clip] of track.clips.entries()) {
				try {
					const clipPlayer = this.createPlayerFromAssetType(clip);
					clipPlayer.layer = trackIdx + 1;

					// Set stable clip ID from document for reconciliation
					const clipId = this.document.getClipId(trackIdx, clipIdx);
					if (clipId) {
						clipPlayer.clipId = clipId;
						this.playerByClipId.set(clipId, clipPlayer);
					}

					// Store merge field bindings in document (source of truth)
					const bindings = bindingsPerClip.get(`${trackIdx}-${clipIdx}`);
					if (bindings && bindings.size > 0 && clipId) {
						this.document.setClipBindingsForClip(clipId, bindings);
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
		this.playerReconciler.dispose();

		// Dispose all commands in history to free memory
		for (const cmd of this.commandHistory) {
			cmd.dispose?.();
		}
		this.commandHistory = [];
		this.commandIndex = -1;

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

	/** Update canvas visuals after size change (viewport mask, background, zoom) */
	private updateCanvasForSize(): void {
		this.updateViewportMask();
		if (this.background) {
			this.background.clear();
			this.background.fillStyle = { color: this.backgroundColor };
			this.background.rect(0, 0, this.size.width, this.size.height);
			this.background.fill();
		}
		this.canvas?.zoomToFit();
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
		// Force immediate render - SEEK_ELAPSED_MARKER signals seek to all players
		this.update(0, SEEK_ELAPSED_MARKER);
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
			// Preserve existing clip IDs before creating new document
			// This ensures the reconciler sees the same IDs and updates players in-place
			this.preserveClipIdsForGranularUpdate(edit);

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
		const mergeFields = this.mergeFieldService.toSerializedArray();
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
	 * Get a specific clip from the resolved edit.
	 */
	public getResolvedClip(trackIdx: number, clipIdx: number): ResolvedClip | null {
		const resolved = this.getResolvedEdit();
		return resolved?.timeline?.tracks?.[trackIdx]?.clips?.[clipIdx] ?? null;
	}

	/**
	 * Get the stable clip ID for a clip at a given position.
	 */
	public getClipId(trackIdx: number, clipIdx: number): string | null {
		return this.document?.getClipId(trackIdx, clipIdx) ?? null;
	}

	/**
	 * Get the raw document clip at a given position.
	 */
	public getDocumentClip(trackIdx: number, clipIdx: number): Clip | null {
		return this.document?.getClip(trackIdx, clipIdx) ?? null;
	}

	/**
	 * Get the original parsed edit configuration.
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

	/**
	 * Resolve the document to a ResolvedEdit and emit the Resolved event.
	 * Components (Canvas, Timeline) subscribe to this event to update themselves.
	 *
	 * This is the core of unidirectional data flow:
	 * Command → Document → resolve() → ResolvedEdit → Components
	 *
	 * @internal
	 */
	public resolve(): ResolvedEdit {
		const resolved = resolveDocument(this.document, {
			mergeFields: this.mergeFieldService
		});

		// Emit event for components to react
		this.events.emit(InternalEvent.Resolved, { edit: resolved });

		return resolved;
	}

	/**
	 * Resolve a single clip and update its player.
	 *
	 * This is an optimization for single-clip mutations (timing, asset, properties).
	 * Instead of re-resolving ALL clips with O(n) complexity, we resolve just the
	 * one that changed with O(1) complexity.
	 *
	 * Use cases:
	 * - Resize a clip → 10x faster than full resolve()
	 * - Update asset property → instant feedback
	 * - Text content change → no full timeline recalc needed
	 *
	 * NOT for structural changes (use full resolve() instead):
	 * - Adding/deleting clips (affects downstream "auto" starts)
	 * - Moving clips between tracks
	 * - Track add/delete
	 *
	 * @param clipId - The clip to resolve and update
	 * @returns true if clip was found and updated, false otherwise
	 */
	public resolveClip(clipId: string): boolean {
		// Build context with cached values from already-resolved players
		const player = this.getPlayerByClipId(clipId);
		if (!player) {
			return false;
		}

		const trackIndex = player.layer - 1;
		const track = this.tracks[trackIndex];
		const clipIndex = track ? track.indexOf(player) : -1;

		if (clipIndex < 0) {
			return false;
		}

		// Get previous clip's end time (for "auto" start resolution)
		const previousPlayer = clipIndex > 0 ? track[clipIndex - 1] : null;
		const previousClipEnd = previousPlayer ? previousPlayer.getEnd() : sec(0);

		// Build single-clip context
		const context: SingleClipContext = {
			mergeFields: this.mergeFieldService,
			previousClipEnd,
			cachedTimelineEnd: sec(this.cachedTimelineEnd)
		};

		// Resolve just this one clip
		const result = resolveClipById(this.document, clipId, context);
		if (!result) {
			return false;
		}

		// Update the player via the reconciler's single-player update
		const updated = this.playerReconciler.updateSinglePlayer(player, result.resolved, result.trackIndex);

		return updated !== false;
	}

	public addClip(trackIdx: number, clip: Clip): void | Promise<void> {
		// Cast to ResolvedClip - the Player and timing resolver handle "auto"/"end" at runtime
		const command = new AddClipCommand(trackIdx, clip as unknown as ResolvedClip);
		return this.executeCommand(command);
	}
	public getClip(trackIdx: number, clipIdx: number): Clip | null {
		// Return from Player array for position-based ordering (matches Player behavior)
		// Cast to Clip since clipConfiguration is ResolvedClip internally but compatible at runtime
		const track = this.tracks[trackIdx];
		if (!track || clipIdx < 0 || clipIdx >= track.length) return null;
		return track[clipIdx].clipConfiguration as unknown as Clip;
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

	/**
	 * Get a Player by its stable clip ID.
	 * Used for reconciliation and ID-based clip operations.
	 * @internal
	 */
	public getPlayerByClipId(clipId: string): Player | null {
		return this.playerByClipId.get(clipId) ?? null;
	}

	/**
	 * Get the document clip by its stable ID.
	 * Used by reconciler to access original timing intent.
	 * @internal
	 */
	public getDocumentClipById(clipId: string): Clip | null {
		return this.document?.getClipById(clipId)?.clip ?? null;
	}

	/**
	 * Track a clip with length: "end" for timeline-end recalculation.
	 * @internal Used by PlayerReconciler
	 */
	public trackEndLengthClip(player: Player): void {
		this.endLengthClips.add(player);
	}

	/**
	 * Untrack a clip from end-length recalculation.
	 * @internal Used by PlayerReconciler
	 */
	public untrackEndLengthClip(player: Player): void {
		this.endLengthClips.delete(player);
	}

	/**
	 * Register a Player by its clip ID.
	 * @internal Used by PlayerReconciler
	 */
	public registerPlayerByClipId(clipId: string, player: Player): void {
		this.playerByClipId.set(clipId, player);
	}

	/**
	 * Unregister a Player by its clip ID.
	 * @internal Used by PlayerReconciler
	 */
	public unregisterPlayerByClipId(clipId: string): void {
		this.playerByClipId.delete(clipId);
	}

	/**
	 * Get the Player ID map for iteration.
	 * @internal Used by PlayerReconciler
	 */
	public getPlayerMap(): Map<string, Player> {
		return this.playerByClipId;
	}

	/**
	 * Add a Player to the tracks array at the specified index.
	 * @internal Used by PlayerReconciler
	 */
	public addPlayerToTracksArray(trackIndex: number, player: Player): void {
		while (this.tracks.length <= trackIndex) {
			this.tracks.push([]);
		}
		this.tracks[trackIndex].push(player);
	}

	/**
	 * Add a Player to the global clips array.
	 * @internal Used by PlayerReconciler
	 */
	public addPlayerToClipsArray(player: Player): void {
		this.clips.push(player);
	}

	/**
	 * Move a Player between tracks (both container and array).
	 * @internal Used by PlayerReconciler
	 */
	public movePlayerBetweenTracks(player: Player, fromTrackIndex: number, toTrackIndex: number): void {
		// Remove from old track array
		const fromTrack = this.tracks[fromTrackIndex];
		if (fromTrack) {
			const idx = fromTrack.indexOf(player);
			if (idx !== -1) {
				fromTrack.splice(idx, 1);
			}
		}

		// Add to new track array
		while (this.tracks.length <= toTrackIndex) {
			this.tracks.push([]);
		}
		this.tracks[toTrackIndex].push(player);

		// Move PIXI container
		this.movePlayerToTrackContainer(player, fromTrackIndex, toTrackIndex);
	}

	/**
	 * Queue a Player for disposal.
	 * @internal Used by PlayerReconciler
	 */
	public queuePlayerForDisposal(player: Player): void {
		this.queueDisposeClip(player);
		this.disposeClips();
	}

	/**
	 * Ensure a track exists at the given index (creates empty track if needed).
	 * @internal Used by PlayerReconciler for track syncing
	 */
	public ensureTrackExists(trackIndex: number): void {
		while (this.tracks.length <= trackIndex) {
			this.tracks.push([]);
		}
	}

	/**
	 * Remove an empty track at the given index (including PIXI container).
	 * @internal Used by PlayerReconciler for track syncing
	 */
	public removeEmptyTrack(trackIndex: number): void {
		if (trackIndex < 0 || trackIndex >= this.tracks.length) return;

		// Only remove if track is empty
		const track = this.tracks[trackIndex];
		if (track && track.length > 0) {
			console.warn(`Cannot remove non-empty track ${trackIndex}`);
			return;
		}

		// Remove from tracks array
		this.tracks.splice(trackIndex, 1);

		// Remove PIXI container if it exists
		const zIndex = 100000 - (trackIndex + 1) * Edit.ZIndexPadding;
		const trackContainerKey = `shotstack-track-${zIndex}`;
		const trackContainer = this.getContainer().getChildByLabel(trackContainerKey, false);
		if (trackContainer) {
			this.getContainer().removeChild(trackContainer);
		}

		// Update layer numbers for all players in tracks above the removed one
		for (let i = trackIndex; i < this.tracks.length; i += 1) {
			for (const player of this.tracks[i]) {
				player.layer = i + 1;
			}
		}
	}

	/** Get the exportable asset for a clip, preserving merge field templates */
	public getOriginalAsset(trackIndex: number, clipIndex: number): unknown | undefined {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return undefined;

		const clip = player.getExportableClip();
		if (!clip) return undefined;

		// Restore merge field placeholders from document bindings
		const { clipId } = player;
		if (clipId && this.document) {
			const bindings = this.document.getClipBindings(clipId);
			if (bindings) {
				for (const [path, { placeholder }] of bindings) {
					// Only restore if path is within asset
					if (path.startsWith("asset.")) {
						const assetPath = path.slice(6); // Remove "asset." prefix
						setNestedValue(clip.asset as Record<string, unknown>, assetPath, placeholder);
					}
				}
			}
		}

		return clip.asset;
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

	public async addTrack(trackIdx: number, track: Track): Promise<void> {
		if (!track?.clips?.length) {
			throw new Error("Cannot add empty track - at least one clip required");
		}

		const command = new AddTrackCommand(trackIdx);
		await this.executeCommand(command);

		for (const clip of track.clips) {
			await this.addClip(trackIdx, clip);
		}
	}

	public getTrack(trackIdx: number): Track | null {
		// Return from Player array for position-based ordering (matches Player behavior)
		const trackClips = this.clips.filter((clip: Player) => clip.layer === trackIdx + 1);
		if (trackClips.length === 0) return null;

		return {
			clips: trackClips.map((clip: Player) => clip.clipConfiguration as unknown as Clip)
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

		const command = new SetUpdatedClipCommand(initialClipConfig, finalClipConfig, {
			trackIndex: trackIdx,
			clipIndex: clipIdx
		});
		this.executeCommand(command);
	}

	// ─── Live Update API (No Undo) ────────────────────────────────────────────────
	//
	// TODO: Evaluate resolve() performance to enable pure unidirectional data flow.
	// Currently, drag/resize/rotate use optimistic player updates + document sync
	// (without resolve) for 60fps performance. This creates temporary dual source
	// of truth during interactions. If resolve() can be optimized to <2ms, we could
	// call document.updateClip() + resolve() on every frame instead.
	// See: selection-handles.ts handleDrag/handleCornerResize/handleEdgeResize/handleRotation

	/**
	 * Update clip in document only, without resolving.
	 * Used during drag for document sync without performance cost.
	 * Call resolve() at drag end to ensure document/player consistency.
	 *
	 * @param clipId - Stable clip ID
	 * @param updates - Partial clip properties to update
	 * @internal
	 */
	public updateClipInDocument(clipId: string, updates: Partial<ResolvedClip>): void {
		const location = this.document.getClipById(clipId);
		if (!location) return;

		this.document.updateClip(location.trackIndex, location.clipIndex, updates);
	}

	/**
	 * Commit a live update session to the undo history.
	 * Call this at the end of a drag operation.
	 *
	 * Creates a command that can undo back to initialConfig.
	 * Does NOT execute the command (state already correct from optimistic updates).
	 *
	 * @param clipId - The clip that was updated
	 * @param initialConfig - The clip configuration before the drag started
	 * @internal
	 */
	public commitClipUpdate(clipId: string, initialConfig: ResolvedClip): void {
		const location = this.document.getClipById(clipId);
		if (!location) return;

		const finalConfig = this.getResolvedClip(location.trackIndex, location.clipIndex);
		if (!finalConfig) return;

		// Create command for undo (uses current state as "final")
		const command = new SetUpdatedClipCommand(initialConfig, structuredClone(finalConfig), {
			trackIndex: location.trackIndex,
			clipIndex: location.clipIndex
		});

		// Add to history without executing (state already correct)
		this.addCommandToHistory(command);
	}

	/**
	 * Add a command to history without executing it.
	 * Used when the command's effect has already been applied
	 * (e.g., via live updates during drag).
	 * @internal
	 */
	private addCommandToHistory(command: EditCommand): void {
		// Dispose any commands we're about to overwrite (redo history)
		const discarded = this.commandHistory.slice(this.commandIndex + 1);
		for (const cmd of discarded) {
			cmd.dispose?.();
		}

		// Truncate redo history and add new command
		this.commandHistory = this.commandHistory.slice(0, this.commandIndex + 1);
		this.commandHistory.push(command);
		this.commandIndex += 1;

		// Prune old commands
		while (this.commandHistory.length > Edit.MAX_HISTORY_SIZE) {
			const pruned = this.commandHistory.shift();
			pruned?.dispose?.();
			this.commandIndex -= 1;
		}

		// Emit edit changed event (consistent with executeCommand pattern)
		this.emitEditChanged(`commit:${command.name}`);
	}

	public updateClip(trackIdx: number, clipIdx: number, updates: Partial<Clip>): void {
		const clip = this.getPlayerClip(trackIdx, clipIdx);
		if (!clip) {
			console.warn(`Clip not found at track ${trackIdx}, index ${clipIdx}`);
			return;
		}

		// Read from document (source of truth) to preserve timing intent ("auto"/"end")
		// Player's clipConfiguration has resolved numeric values, but document has original strings
		const documentClip = this.document?.getClip(trackIdx, clipIdx);
		const initialConfig = structuredClone(documentClip ?? clip.clipConfiguration) as ResolvedClip;
		const currentConfig = structuredClone(documentClip ?? clip.clipConfiguration);
		// Cast to ResolvedClip - the timing resolver handles "auto"/"end" at runtime
		const mergedConfig = deepMerge(currentConfig, updates as unknown as Partial<ResolvedClip>) as ResolvedClip;

		const command = new SetUpdatedClipCommand(initialConfig, mergedConfig, {
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
	public updateTextContent(clip: Player, newText: string, _initialConfig: ResolvedClip): void {
		const trackIndex = clip.layer - 1;
		const clipIndex = this.tracks[trackIndex]?.indexOf(clip) ?? -1;
		if (clipIndex < 0) {
			console.warn("UpdateTextContent: clip not found in track");
			return;
		}
		const command = new UpdateTextContentCommand(trackIndex, clipIndex, newText);
		this.executeCommand(command);
	}

	public executeEditCommand(command: EditCommand): void | Promise<void> {
		return this.executeCommand(command);
	}

	protected executeCommand(command: EditCommand): void | Promise<void> {
		const context = this.createCommandContext();
		const result = command.execute(context);

		// Dispose any commands we're about to overwrite (redo history)
		const discarded = this.commandHistory.slice(this.commandIndex + 1);
		for (const cmd of discarded) {
			cmd.dispose?.();
		}

		this.commandHistory = this.commandHistory.slice(0, this.commandIndex + 1);
		this.commandHistory.push(command);
		this.commandIndex += 1;

		// Prune old commands to prevent unbounded memory growth
		while (this.commandHistory.length > Edit.MAX_HISTORY_SIZE) {
			const pruned = this.commandHistory.shift();
			pruned?.dispose?.();
			this.commandIndex -= 1;
		}

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
	protected emitEditChanged(source: string): void {
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
	 * Transfers existing clip IDs from the current document to the new edit configuration.
	 * This ensures the reconciler sees the same IDs during granular updates and updates
	 * players in-place rather than creating new ones.
	 */
	private preserveClipIdsForGranularUpdate(newEdit: EditConfig): void {
		if (!this.document) return;

		const existingTracks = this.document.getTracks();

		for (let trackIdx = 0; trackIdx < newEdit.timeline.tracks.length; trackIdx += 1) {
			const existingTrack = existingTracks[trackIdx];
			const newTrack = newEdit.timeline.tracks[trackIdx];

			if (!existingTrack || !newTrack) continue;

			for (let clipIdx = 0; clipIdx < newTrack.clips.length; clipIdx += 1) {
				const existingId = this.document.getClipId(trackIdx, clipIdx);
				if (existingId) {
					// Add the ID to the new clip so EditDocument.hydrateIds() preserves it
					// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Internal ID hydration
					(newTrack.clips[clipIdx] as any).id = existingId;
				}
			}
		}
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

		if (newOutput?.resolution !== undefined && currentOutput?.resolution !== newOutput.resolution) {
			this.setOutputResolution(newOutput.resolution);
		}

		if (newOutput?.aspectRatio !== undefined && currentOutput?.aspectRatio !== newOutput.aspectRatio) {
			this.setOutputAspectRatio(newOutput.aspectRatio);
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

	protected createCommandContext(): CommandContext {
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

					// Update Player's clipId to match new document ID and re-register
					const newClipId = this.document.getClipId(trackIdx, insertIdx);
					if (newClipId) {
						// eslint-disable-next-line no-param-reassign
						clip.clipId = newClipId;
						this.playerByClipId.set(newClipId, clip);
					}
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
			getMergeFields: () => this.mergeFieldService,
			// Output settings
			getOutputSize: () => ({ width: this.size.width, height: this.size.height }),
			setOutputSize: (width, height) => this.setOutputSizeInternal(width, height),
			getOutputFps: () => this.getOutputFps(),
			setOutputFps: fps => this.setOutputFpsInternal(fps),
			getTimelineBackground: () => this.getTimelineBackground(),
			setTimelineBackground: color => this.setTimelineBackgroundInternal(color),
			// Document access (single source of truth)
			getDocument: () => this.document,
			getDocumentTrack: trackIdx => this.document?.getTrack(trackIdx) ?? null,

			// Document-first mutations (Phase 3)
			documentUpdateClip: (trackIdx, clipIdx, updates) => {
				if (!this.document) {
					throw new Error("Document not initialized - cannot update clip");
				}
				this.document.updateClip(trackIdx, clipIdx, updates);
			},

			documentAddClip: (trackIdx, clip, clipIdx) => {
				if (!this.document) {
					throw new Error("Document not initialized - cannot add clip");
				}
				// Ensure document has enough tracks before adding clip
				while (this.document.getTrackCount() <= trackIdx) {
					this.document.addTrack(this.document.getTrackCount());
				}
				return this.document.addClip(trackIdx, clip, clipIdx);
			},

			documentRemoveClip: (trackIdx, clipIdx) => {
				if (!this.document) {
					throw new Error("Document not initialized - cannot remove clip");
				}
				return this.document.removeClip(trackIdx, clipIdx);
			},

			derivePlayerFromDocument: (trackIdx, clipIdx) => {
				const clip = this.document?.getClip(trackIdx, clipIdx);
				if (!clip) {
					throw new Error(`derivePlayerFromDocument: No document clip at ${trackIdx}/${clipIdx} - state desync`);
				}

				const player = this.getClipAt(trackIdx, clipIdx);
				if (!player) {
					throw new Error(`derivePlayerFromDocument: No player at ${trackIdx}/${clipIdx} - state desync`);
				}

				// Only copy timing-related fields from document to player
				// Do NOT copy asset - it contains unresolved merge field placeholders
				// (e.g., "{{ FONT_COLOR }}") that would fail validation.
				// The player's asset already has resolved values from load time.
				const { asset, ...timingFields } = clip;
				Object.assign(player.clipConfiguration, timingFields);
				player.reconfigureAfterRestore();
			},

			buildResolutionContext: (trackIdx, clipIdx): ResolutionContext => {
				// 1. Previous clip end (for start: "auto")
				let previousClipEnd: Seconds = sec(0);
				if (clipIdx > 0) {
					const track = this.tracks[trackIdx];
					if (track && track[clipIdx - 1]) {
						previousClipEnd = track[clipIdx - 1].getEnd();
					}
				}

				// 2. Timeline end excluding "end" clips (for length: "end")
				const timelineEnd = calculateTimelineEnd(this.tracks);

				// 3. Intrinsic duration if available (for length: "auto")
				// Note: This may be null if asset metadata hasn't loaded yet
				let intrinsicDuration: Seconds | null = null;
				const player = this.getClipAt(trackIdx, clipIdx);
				if (player) {
					const intent = player.getTimingIntent();
					// Only lookup intrinsic duration if the clip uses "auto" length
					if (intent.length === "auto") {
						// The player's resolved length IS the intrinsic duration after async load
						intrinsicDuration = player.getLength();
					}
				}

				return {
					previousClipEnd,
					timelineEnd,
					intrinsicDuration
				};
			},

			// Unidirectional data flow: resolve document → ResolvedEdit
			resolve: () => this.resolve(),
			resolveClip: clipId => this.resolveClip(clipId),

			// ID-based Player access (for reconciliation)
			getPlayerByClipId: clipId => this.playerByClipId.get(clipId) ?? null,
			registerPlayerByClipId: (clipId, player) => {
				this.playerByClipId.set(clipId, player);
			},
			unregisterPlayerByClipId: clipId => {
				this.playerByClipId.delete(clipId);
			},

			// Merge field binding management (document-based)
			setClipBinding: (clipId, path, binding) => {
				this.document?.setClipBinding(clipId, path, binding);
			},
			getClipBinding: (clipId, path) => this.document?.getClipBinding(clipId, path),
			removeClipBinding: (clipId, path) => {
				this.document?.removeClipBinding(clipId, path);
			},
			getClipBindings: clipId => this.document?.getClipBindings(clipId)
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

		// Remove from ID→Player map
		for (const clip of this.clipsToDispose) {
			if (clip.clipId) {
				this.playerByClipId.delete(clip.clipId);
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
					// NOTE: Document sync is NOT done here - commands handle document mutations directly.
					// This avoids double-removal when commands already called documentRemoveClip().
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
		// Only prune Google fonts - preserve custom fonts for template integrity
		for (const font of fonts) {
			const isGoogleFont = font.src.includes("fonts.gstatic.com");
			if (isGoogleFont) {
				const filename = this.extractFilenameFromUrl(font.src);
				if (filename && !usedFilenames.has(filename)) {
					this.document.removeFont(font.src);
				}
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

		// After timing is resolved, reconfigure ALL "end" clips to rebuild keyframes
		// This applies to Text, Image, Video, Shape, HTML, Caption - any player type with length: "end"
		for (const clip of this.endLengthClips) {
			clip.reconfigureAfterRestore();
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
		clip.reconfigureAfterRestore();

		if (indices) {
			this.propagateTimingChanges(indices.trackIndex, indices.clipIndex);
		}
	}

	/**
	 * Add a Player to the appropriate PIXI track container.
	 * @internal Used by PlayerReconciler and commands
	 */
	public addPlayerToContainer(trackIndex: number, player: Player): void {
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
	/**
	 * Create a Player from a clip configuration based on asset type.
	 * @internal Used by PlayerReconciler and commands
	 */
	public createPlayerFromAssetType(clipConfiguration: ResolvedClip): Player {
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
			case "svg": {
				player = new SvgPlayer(this, clipConfiguration);
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

		// Document sync is handled by AddClipCommand - don't duplicate here

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
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (player) {
			this.selectedClip = player;
			const clip = this.getResolvedClip(trackIndex, clipIndex);
			if (clip) {
				this.events.emit(EditEvent.ClipSelected, {
					clip,
					trackIndex,
					clipIndex
				});
			}
		}
	}

	public clearSelection(): void {
		this.selectedClip = null;
		this.events.emit(EditEvent.SelectionCleared);
	}
	public isClipSelected(trackIndex: number, clipIndex: number): boolean {
		if (!this.selectedClip) return false;

		const selectedTrackIndex = this.selectedClip.layer - 1;
		const track = this.tracks[selectedTrackIndex];
		if (!track) return false;

		const selectedClipIndex = track.indexOf(this.selectedClip);
		return trackIndex === selectedTrackIndex && clipIndex === selectedClipIndex;
	}
	public getSelectedClipInfo(): { trackIndex: number; clipIndex: number; player: Player } | null {
		if (!this.selectedClip) return null;

		const trackIndex = this.selectedClip.layer - 1;
		const track = this.tracks[trackIndex];
		if (!track) return null; // Track was deleted

		const clipIndex = track.indexOf(this.selectedClip);
		return { trackIndex, clipIndex, player: this.selectedClip };
	}

	/**
	 * Copy a clip to the internal clipboard
	 */
	public copyClip(trackIdx: number, clipIdx: number): void {
		const clip = this.getResolvedClip(trackIdx, clipIdx);
		if (clip) {
			this.copiedClip = {
				trackIndex: trackIdx,
				clipConfiguration: structuredClone(clip)
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

		// Remove ID so document generates a new one (otherwise reconciler
		// would see duplicate IDs and update instead of create)
		delete (pastedClip as { id?: string }).id;

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

		const { player, trackIndex, clipIndex } = info;

		const resolvedClip = this.getResolvedClip(trackIndex, clipIndex);
		if (!resolvedClip) return;

		const initialConfig = structuredClone(resolvedClip);

		// Calculate new offset (pure function, no player mutation)
		const newOffset = player.calculateMoveOffset(deltaX, deltaY);

		// Build final config with new offset
		const finalConfig = structuredClone(initialConfig);
		finalConfig.offset = newOffset;

		// Document update → resolve() → Reconciler syncs offset to player
		this.setUpdatedClip(player, initialConfig, finalConfig);
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
		const command = new SetOutputSizeCommand(width, height);
		this.executeCommand(command);
	}

	/** @internal Called by SetOutputSizeCommand */
	private setOutputSizeInternal(width: number, height: number): void {
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
			// Clear resolution/aspectRatio (mutually exclusive with custom size)
			delete this.edit.output.resolution;
			delete this.edit.output.aspectRatio;
		}

		// Sync with document layer
		this.document?.setSize(size);
		this.document?.clearResolution();
		this.document?.clearAspectRatio();

		this.updateCanvasForSize();

		this.events.emit(EditEvent.OutputResized, size);
		// Note: emitEditChanged is handled by executeCommand
	}

	public setOutputFps(fps: number): void {
		const command = new SetOutputFpsCommand(fps);
		this.executeCommand(command);
	}

	/** @internal Called by SetOutputFpsCommand */
	private setOutputFpsInternal(fps: number): void {
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
		// Note: emitEditChanged is handled by executeCommand
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

	public setOutputResolution(resolution: string): void {
		const result = OutputResolutionSchema.safeParse(resolution);
		if (!result.success || !result.data) {
			throw new Error(`Invalid resolution: ${result.success ? "resolution is required" : result.error.issues[0]?.message}`);
		}

		const validatedResolution = result.data;
		const aspectRatio = this.edit?.output?.aspectRatio ?? "16:9";
		const newSize = calculateSizeFromPreset(validatedResolution, aspectRatio);

		// Update runtime state
		this.size = newSize;

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				resolution: validatedResolution
			};
			// Clear custom size (mutually exclusive with resolution/aspectRatio)
			delete this.edit.output.size;
		}

		// Sync with document layer (size is cleared for mutual exclusivity)
		this.document?.setResolution(validatedResolution);
		this.document?.clearSize();

		this.updateCanvasForSize();

		this.events.emit(EditEvent.OutputResolutionChanged, { resolution: validatedResolution });
		this.events.emit(EditEvent.OutputResized, { width: newSize.width, height: newSize.height });
		this.emitEditChanged("output:resolution");
	}

	public getOutputResolution(): string | undefined {
		return this.edit?.output?.resolution;
	}

	public setOutputAspectRatio(aspectRatio: string): void {
		const result = OutputAspectRatioSchema.safeParse(aspectRatio);
		if (!result.success || !result.data) {
			throw new Error(`Invalid aspectRatio: ${result.success ? "aspectRatio is required" : result.error.issues[0]?.message}`);
		}

		const validatedAspectRatio = result.data;
		const resolution = this.edit?.output?.resolution;
		if (!resolution) {
			// If no resolution is set, just store the aspectRatio without recalculating size
			if (this.edit) {
				this.edit.output = {
					...this.edit.output,
					aspectRatio: validatedAspectRatio
				};
			}
			this.document?.setAspectRatio(validatedAspectRatio);
			this.events.emit(EditEvent.OutputAspectRatioChanged, { aspectRatio: validatedAspectRatio });
			this.emitEditChanged("output:aspectRatio");
			return;
		}

		// Recalculate size based on current resolution and new aspectRatio
		const newSize = calculateSizeFromPreset(resolution, validatedAspectRatio);

		// Update runtime state
		this.size = newSize;

		if (this.edit) {
			this.edit.output = {
				...this.edit.output,
				aspectRatio: validatedAspectRatio
			};
			// Clear custom size (mutually exclusive with resolution/aspectRatio)
			delete this.edit.output.size;
		}

		// Sync with document layer (size is cleared for mutual exclusivity)
		this.document?.setAspectRatio(validatedAspectRatio);
		this.document?.clearSize();

		this.updateCanvasForSize();

		this.events.emit(EditEvent.OutputAspectRatioChanged, { aspectRatio: validatedAspectRatio });
		this.events.emit(EditEvent.OutputResized, { width: newSize.width, height: newSize.height });
		this.emitEditChanged("output:aspectRatio");
	}

	public getOutputAspectRatio(): string | undefined {
		return this.edit?.output?.aspectRatio;
	}

	public getTimelineFonts(): Array<{ src: string }> {
		return this.edit?.timeline?.fonts ?? [];
	}

	/**
	 * Look up a font URL by family name and weight.
	 * Uses normalized metadata extracted from TTF files during font loading.
	 * This enables rich-text font resolution for template fonts with UUID-based URLs.
	 *
	 * @param familyName - The font family name (e.g., "Lato", "Lato Light")
	 * @param weight - The font weight (e.g., 300 for Light, 900 for Black)
	 * @returns The font URL if found, null otherwise
	 */
	public getFontUrlByFamilyAndWeight(familyName: string, weight: number): string | null {
		// Extract base family name (e.g., "Lato Light" → "Lato")
		const { baseFontFamily } = parseFontFamily(familyName);
		const lowerBase = baseFontFamily.toLowerCase();

		// First try exact family + weight match
		for (const [url, meta] of this.fontMetadata) {
			if (meta.baseFamilyName.toLowerCase() === lowerBase && meta.weight === weight) {
				return url;
			}
		}

		// Fallback: match just family (for single-weight fonts or variable fonts)
		for (const [url, meta] of this.fontMetadata) {
			if (meta.baseFamilyName.toLowerCase() === lowerBase) {
				return url;
			}
		}

		return null;
	}

	/**
	 * Remove any fonts from timeline.fonts that are no longer used by clips.
	 * Call this after changing a clip's font to clean up the old font.
	 */
	public pruneUnusedFonts(): void {
		this.cleanupUnusedFonts();
	}

	public setTimelineBackground(color: string): void {
		const command = new SetTimelineBackgroundCommand(color);
		this.executeCommand(command);
	}

	/** @internal Called by SetTimelineBackgroundCommand */
	private setTimelineBackgroundInternal(color: string): void {
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
		// Note: emitEditChanged is handled by executeCommand
	}

	public getTimelineBackground(): string {
		return this.backgroundColor;
	}

	/**
	 * Resolve merge field placeholders in a string.
	 * Replaces {{ FIELD_NAME }} patterns with their current values.
	 *
	 * @param input - String potentially containing merge field placeholders
	 * @returns String with all merge fields resolved to their values
	 */
	public resolveMergeFields(input: string): string {
		return this.mergeFieldService.resolve(input);
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

	// ─── Template Edit Access (via document bindings) ──────────────────────────

	/** Get the exportable clip (with merge field placeholders restored) */
	protected getTemplateClip(trackIndex: number, clipIndex: number): ResolvedClip | null {
		const player = this.getPlayerClip(trackIndex, clipIndex);
		if (!player) return null;

		const clip = player.getExportableClip();
		if (!clip) return null;

		// Restore merge field placeholders from document bindings
		const { clipId } = player;
		if (clipId && this.document) {
			const bindings = this.document.getClipBindings(clipId);
			if (bindings) {
				for (const [path, { placeholder }] of bindings) {
					setNestedValue(clip as Record<string, unknown>, path, placeholder);
				}
			}
		}

		return clip as ResolvedClip;
	}

	/** Get the text content from the template clip (with merge field placeholders) */
	public getTemplateClipText(trackIdx: number, clipIdx: number): string | null {
		const templateClip = this.getTemplateClip(trackIdx, clipIdx);
		if (!templateClip) return null;
		const asset = templateClip.asset as { text?: string } | undefined;
		return asset?.text ?? null;
	}

	// ─── Luma Mask API ──────────────────────────────────────────────────────────

	/** Map of asset src → original asset type (for reliable luma detachment during undo) */
	private originalAssetTypes = new Map<string, "image" | "video">();

	/**
	 * Find the luma clip attached to a content clip via timing match.
	 * Attachment is determined by: same track + exact timing match.
	 * PURE FUNCTION - no stored state.
	 */
	private findAttachedLumaPlayer(trackIndex: number, clipIndex: number): Player | null {
		const contentPlayer = this.getClipAt(trackIndex, clipIndex);
		if (!contentPlayer || contentPlayer.playerType === PlayerType.Luma) return null;

		const track = this.tracks[trackIndex];
		if (!track) return null;

		const contentStart = contentPlayer.getStart();
		const contentLength = contentPlayer.getLength();

		// Find luma with exact timing match on same track
		return track.find(p => p.playerType === PlayerType.Luma && p.getStart() === contentStart && p.getLength() === contentLength) ?? null;
	}

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

		// Check if already has a luma attached (via timing match)
		if (this.findAttachedLumaPlayer(trackIndex, clipIndex)) {
			// Detach existing luma first
			await this.detachLumaFromClip(trackIndex, clipIndex);
		}

		// Read timing from document (source of truth), not player's copy
		const contentConfig = this.getResolvedClip(trackIndex, clipIndex);
		if (!contentConfig) return;

		// Create luma clip config with synced timing
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

		// Find the newly added luma player by timing match
		const track = this.tracks[trackIndex];
		const lumaPlayer = track.find(p => p.playerType === PlayerType.Luma && p.getStart() === contentConfig.start);

		if (lumaPlayer) {
			// Emit event (attachment is implicit via timing match)
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
		const lumaPlayer = this.findAttachedLumaPlayer(trackIndex, clipIndex);
		if (!lumaPlayer) return;

		// Find the luma clip index
		const lumaIndices = this.findClipIndices(lumaPlayer);
		if (lumaIndices) {
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
		const lumaPlayer = this.findAttachedLumaPlayer(trackIndex, clipIndex);
		if (!lumaPlayer) return null;

		const lumaIndices = this.findClipIndices(lumaPlayer);
		if (!lumaIndices) return null;

		// Read from document (source of truth), not player's copy
		const lumaClip = this.getResolvedClip(lumaIndices.trackIndex, lumaIndices.clipIndex);
		const lumaSrc = (lumaClip?.asset as { src?: string })?.src;
		if (!lumaSrc) return null;

		return { src: lumaSrc, clipIndex: lumaIndices.clipIndex };
	}

	/**
	 * Check if a clip has a luma mask attached.
	 * Uses pure timing-based lookup (no stored state).
	 *
	 * @param trackIndex - Track index of the content clip
	 * @param clipIndex - Clip index of the content clip
	 */
	public hasLumaMask(trackIndex: number, clipIndex: number): boolean {
		return this.findAttachedLumaPlayer(trackIndex, clipIndex) !== null;
	}

	/**
	 * Sync luma timing to match content clip.
	 * Call after content clip is moved/resized to keep luma aligned.
	 *
	 * @param contentTrackIdx - Track index of the content clip
	 * @param contentClipIdx - Clip index of the content clip
	 * @param lumaTrackIdx - Track index of the luma clip
	 * @param lumaClipIdx - Clip index of the luma clip
	 */
	public syncLumaToContent(contentTrackIdx: number, contentClipIdx: number, lumaTrackIdx: number, lumaClipIdx: number): void {
		const contentPlayer = this.getClipAt(contentTrackIdx, contentClipIdx);
		const lumaPlayer = this.getClipAt(lumaTrackIdx, lumaClipIdx);
		if (!contentPlayer || !lumaPlayer) return;

		// Sync luma timing to content
		lumaPlayer.setResolvedTiming({
			start: contentPlayer.getStart(),
			length: contentPlayer.getLength()
		});
		lumaPlayer.reconfigureAfterRestore();
		lumaPlayer.draw();

		// Update document
		this.document.updateClip(lumaTrackIdx, lumaClipIdx, {
			start: contentPlayer.getStart(),
			length: contentPlayer.getLength()
		});
	}

	/**
	 * Normalize luma attachments after loading.
	 * For each luma, find the best content match and sync timing.
	 * Handles legacy JSON where luma timing doesn't match content.
	 * Call once after loadEdit() completes.
	 */
	public normalizeLumaAttachments(): void {
		let needsResolve = false;

		for (let trackIdx = 0; trackIdx < this.tracks.length; trackIdx += 1) {
			const track = this.tracks[trackIdx];

			for (const player of track) {
				if (player.playerType === PlayerType.Luma) {
					// Find best content match (by overlap, not exact timing)
					const contentPlayer = this.findBestContentMatch(trackIdx, player);
					if (contentPlayer) {
						const lumaIdx = track.indexOf(player);
						this.document.updateClip(trackIdx, lumaIdx, {
							start: contentPlayer.getStart(),
							length: contentPlayer.getLength()
						});
						needsResolve = true;
					}
				}
			}
		}

		// Single resolve at end → Reconciler syncs all players
		if (needsResolve) {
			this.resolve();
		}
	}

	/**
	 * Find the content clip that best matches a luma (by temporal overlap).
	 * Used during normalization for legacy JSON.
	 */
	private findBestContentMatch(trackIdx: number, lumaPlayer: Player): Player | null {
		const track = this.tracks[trackIdx];
		const lumaStart = lumaPlayer.getStart();
		const lumaEnd = lumaStart + lumaPlayer.getLength();

		let bestMatch: Player | null = null;
		let bestOverlap = 0;

		for (const player of track) {
			if (player.playerType !== PlayerType.Luma) {
				const contentStart = player.getStart();
				const contentEnd = contentStart + player.getLength();

				// Calculate overlap
				const overlapStart = Math.max(lumaStart, contentStart);
				const overlapEnd = Math.min(lumaEnd, contentEnd);
				const overlap = Math.max(0, overlapEnd - overlapStart);

				if (overlap > bestOverlap) {
					bestOverlap = overlap;
					bestMatch = player;
				}
			}
		}

		return bestMatch;
	}

	/**
	 * Transform a clip to luma type (for attachment).
	 * Recreates the player with luma asset type while preserving the src.
	 *
	 * @param trackIndex - Track index of the clip
	 * @param clipIndex - Clip index of the clip
	 */
	public transformToLuma(trackIndex: number, clipIndex: number): void {
		// Read from document (source of truth), not player's copy
		const clip = this.getResolvedClip(trackIndex, clipIndex);
		if (!clip?.asset) return;

		const asset = clip.asset as { type?: string; src?: string };
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
		const clip = this.getResolvedClip(trackIndex, clipIndex);
		if (!clip?.asset) return;

		const { src } = clip.asset as { src?: string };
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

	// ─── Protected Accessors for Subclasses ─────────────────────────────────────

	/** @internal Get the tracks array for subclass and reconciler access */
	public getTracks(): Player[][] {
		return this.tracks;
	}

	/** @internal Get the number of tracks */
	protected getTrackCount(): number {
		return this.document.getTrackCount();
	}

	/** @internal Get the number of clips in a track */
	protected getClipCountInTrack(trackIndex: number): number {
		return this.document.getClipCountInTrack(trackIndex);
	}
}
