import { type Player, PlayerType } from "@canvas/players/player";
import { PlayerFactory } from "@canvas/players/player-factory";
import type { Canvas } from "@canvas/shotstack-canvas";
// TODO: Consolidate commands - many have overlapping concerns and could be unified
import { AddClipCommand } from "@core/commands/add-clip-command";
import { AddTrackCommand } from "@core/commands/add-track-command";
import { DeleteClipCommand } from "@core/commands/delete-clip-command";
import { DeleteTrackCommand } from "@core/commands/delete-track-command";
import { SetOutputAspectRatioCommand } from "@core/commands/set-output-aspect-ratio-command";
import { SetOutputDestinationsCommand } from "@core/commands/set-output-destinations-command";
import { SetOutputFormatCommand } from "@core/commands/set-output-format-command";
import { SetOutputFpsCommand } from "@core/commands/set-output-fps-command";
import { SetOutputResolutionCommand } from "@core/commands/set-output-resolution-command";
import { SetOutputSizeCommand } from "@core/commands/set-output-size-command";
import { SetTimelineBackgroundCommand } from "@core/commands/set-timeline-background-command";
import { SetUpdatedClipCommand } from "@core/commands/set-updated-clip-command";
import { type TimingUpdateParams, UpdateClipTimingCommand } from "@core/commands/update-clip-timing-command";
import { UpdateTextContentCommand } from "@core/commands/update-text-content-command";
import type { MergeFieldBinding } from "@core/edit-document";
import { EditEvent, InternalEvent, type EditEventMap, type InternalEventMap } from "@core/events/edit-events";
import { EventEmitter, type ReadonlyEventEmitter } from "@core/events/event-emitter";
import { parseFontFamily } from "@core/fonts/font-config";
import { LumaMaskController } from "@core/luma-mask-controller";
import { MergeFieldService, type SerializedMergeField } from "@core/merge";
import { calculateSizeFromPreset, OutputSettingsManager } from "@core/output-settings-manager";
import { SelectionManager } from "@core/selection-manager";
import { findEligibleSourceClips, ensureClipAlias } from "@core/shared/source-clip-finder";
import { deepMerge, setNestedValue } from "@core/shared/utils";
import { calculateTimelineEnd, resolveAutoLength, resolveAutoStart } from "@core/timing/resolver";
import { type Milliseconds, type ResolutionContext, type Seconds, sec, toSec, isAliasReference } from "@core/timing/types";
import { TimingManager } from "@core/timing-manager";
import type { Size } from "@layouts/geometry";
import { AssetLoader } from "@loaders/asset-loader";
import { FontLoadParser } from "@loaders/font-load-parser";
import {
	ClipSchema,
	EditSchema,
	HexColorSchema,
	ResolvedClipSchema,
	TrackSchema,
	type Clip,
	type Destination,
	type Edit as EditConfig,
	type ResolvedClip,
	type ResolvedEdit,
	type Soundtrack,
	type Track
} from "@schemas";
import { calculateOverlap } from "@timeline/interaction/interaction-calculations";
import * as pixi from "pixi.js";

import { CommandQueue } from "./commands/command-queue";
import type { EditCommand, CommandContext, CommandResult } from "./commands/types";
import { EditDocument } from "./edit-document";
import { PlayerReconciler } from "./player-reconciler";
import { resolve as resolveDocument, resolveClip as resolveClipById, type SingleClipContext } from "./resolver";

/** Internal type for clips with hydrated IDs during edit updates */
type ClipWithId = Clip & { id?: string };

// ─── Edit Session Class ───────────────────────────────────────────────────────

export class Edit {
	// ─── Constants ────────────────────────────────────────────────────────────
	private static readonly MAX_HISTORY_SIZE = 100;
	/** @internal */
	public static readonly SEEK_ELAPSED_MARKER = 101 as Milliseconds;

	// ─── Core Configuration ───────────────────────────────────────────────────
	private document: EditDocument;
	/** @internal */
	public size: Size;
	private backgroundColor: string;

	// ─── Primary State ────────────────────────────────────────────────────────
	private tracks: Player[][];
	public playbackTime: number;
	public totalDuration: number;
	public isPlaying: boolean;

	// ─── Derived State ────────────────────────────────────────────────────────
	private get clips(): Player[] {
		return this.tracks.flat();
	}

	// ─── Services ─────────────────────────────────────────────────────────────
	/** @internal */
	public assetLoader: AssetLoader;
	private internalEvents: EventEmitter<EditEventMap & InternalEventMap>;
	public events: ReadonlyEventEmitter<EditEventMap>;
	private canvas: Canvas | null = null;

	// ─── Subsystems ──────────────────────────────────────────────────────────-
	private timingManager!: TimingManager;
	private lumaMaskController: LumaMaskController;
	private playerReconciler: PlayerReconciler;
	private outputSettings!: OutputSettingsManager;
	private selectionManager!: SelectionManager;
	/** @internal */
	protected mergeFieldService: MergeFieldService;

	// ─── Command History ──────────────────────────────────────────────────────
	private commandHistory: EditCommand[] = [];
	private commandIndex: number = -1;
	private commandQueue = new CommandQueue();

	// ─── Internal Bookkeeping ─────────────────────────────────────────────────
	private clipsToDispose = new Set<Player>();
	private clipErrors = new Map<string, { error: string; assetType: string }>();
	private playerByClipId = new Map<string, Player>();
	private lumaContentRelations = new Map<string, string>();
	private fontMetadata = new Map<string, { baseFamilyName: string; weight: number }>();
	private isBatchingEvents: boolean = false;
	private isExporting: boolean = false;
	private lastResolved: ResolvedEdit | null = null;

	/**
	 * Create an Edit instance from a template configuration.
	 */
	constructor(template: EditConfig) {
		// Validate template eagerly so invalid configs fail at construction time
		EditSchema.parse(template);

		this.tracks = [];
		this.playbackTime = sec(0);
		this.totalDuration = sec(0);
		this.isPlaying = false;

		this.document = new EditDocument(template);

		const resolution = this.document.getResolution();
		const aspectRatio = this.document.getAspectRatio();
		this.backgroundColor = this.document.getBackground() ?? "#000000";
		this.size = resolution ? calculateSizeFromPreset(resolution, aspectRatio) : this.document.getSize();

		this.assetLoader = new AssetLoader();
		this.internalEvents = new EventEmitter();
		this.events = this.internalEvents;

		this.lumaMaskController = new LumaMaskController(
			() => this.canvas,
			() => this.tracks,
			this.internalEvents
		);
		this.playerReconciler = new PlayerReconciler(this);
		this.mergeFieldService = new MergeFieldService(this.internalEvents);
		this.outputSettings = new OutputSettingsManager(this);
		this.selectionManager = new SelectionManager(this);
		this.timingManager = new TimingManager(this);

		this.setupIntentListeners();
	}

	/**
	 * Load the edit session.
	 */
	public async load(): Promise<void> {
		await this.initializeFromDocument();
	}

	/**
	 * Initialize runtime from the document.
	 */
	private async initializeFromDocument(source: string = "load"): Promise<void> {
		const rawEdit = this.document.toJSON();

		// 1. Load merge fields into service
		const serializedMergeFields = rawEdit.merge ?? [];
		this.mergeFieldService.loadFromSerialized(serializedMergeFields);

		// 2. Invalidate resolved cache and detect merge field bindings
		this.lastResolved = null;
		const bindingsPerClip = this.detectMergeFieldBindings(serializedMergeFields);

		// 3. Parse raw edit
		const parsedEdit = EditSchema.parse(rawEdit) as EditConfig;

		// 4. Load fonts
		await Promise.all(
			(parsedEdit.timeline.fonts ?? []).map(async font => {
				const identifier = font.src;
				const loadOptions: pixi.UnresolvedAsset = { src: identifier, parser: FontLoadParser.Name };

				const fontFace = await this.assetLoader.load<FontFace>(identifier, loadOptions);

				// Store normalized base family + weight (TTF might report "Lato Light" or "Lato")
				// CSS FontFace.family wraps multi-word names in quotes — strip them
				if (fontFace?.family) {
					const family = fontFace.family.replace(/^["']|["']$/g, "");
					const { baseFontFamily, fontWeight } = parseFontFamily(family);
					this.fontMetadata.set(identifier, { baseFamilyName: baseFontFamily, weight: fontWeight });
				}

				return fontFace;
			})
		);

		// 5. Resolve the document
		const resolvedEdit = this.getResolvedEdit();

		// 6. Initialize luma mask controller
		this.lumaMaskController.initialize();

		// 7. Create players
		await this.playerReconciler.reconcileInitial(resolvedEdit);

		// 7.5 Establish luma→content relationships before timeline renders
		this.normalizeLumaAttachments();

		// 8. Set up clip bindings for merge field tracking
		for (const [clipId, bindings] of bindingsPerClip) {
			if (bindings.size > 0) {
				this.document.setClipBindingsForClip(clipId, bindings);
			}
		}

		// 9. Resolve async timing (auto-length for videos, etc.)
		await this.timingManager.resolveAllTiming();

		// 10. Update total duration
		this.updateTotalDuration();

		// 11. Load soundtrack if present
		if (parsedEdit.timeline.soundtrack) {
			await this.loadSoundtrack(parsedEdit.timeline.soundtrack);
		}

		this.internalEvents.emit(EditEvent.TimelineUpdated, { current: this.getEdit() });
		this.emitEditChanged(source);
	}

	/** @internal */
	public getInternalEvents(): EventEmitter<EditEventMap & InternalEventMap> {
		return this.internalEvents;
	}

	/** @internal */
	public update(deltaTime: number, elapsed: Milliseconds): void {
		for (const clip of this.clips) {
			if (clip.shouldDispose) this.queueDisposeClip(clip);
			clip.update(deltaTime, elapsed);
		}

		this.disposeClips();

		this.lumaMaskController.update();

		if (this.isPlaying) {
			this.playbackTime = sec(Math.max(0, Math.min(this.playbackTime + toSec(elapsed), this.totalDuration)));
			if (this.playbackTime === this.totalDuration) this.pause();
		}
	}

	/** @internal */
	public dispose(): void {
		this.clearClips();
		this.lumaMaskController.dispose();
		this.playerReconciler.dispose();

		for (const cmd of this.commandHistory) cmd.dispose?.();
		this.commandHistory = [];
		this.commandIndex = -1;

		this.lumaContentRelations.clear();

		PlayerFactory.cleanup();
	}

	/* @internal Update canvas visuals after size change (viewport mask, background, zoom). */
	public updateCanvasForSize(): void {
		this.internalEvents.emit(InternalEvent.ViewportSizeChanged, {
			width: this.size.width,
			height: this.size.height,
			backgroundColor: this.backgroundColor
		});
		this.internalEvents.emit(InternalEvent.ViewportNeedsZoomToFit);
	}

	public play(): void {
		this.isPlaying = true;
		this.internalEvents.emit(EditEvent.PlaybackPlay);
	}

	public pause(): void {
		this.isPlaying = false;
		this.internalEvents.emit(EditEvent.PlaybackPause);
	}

	public seek(target: number): void {
		this.playbackTime = sec(Math.max(0, Math.min(target, this.totalDuration)));
		this.pause();
		this.update(0, Edit.SEEK_ELAPSED_MARKER);
	}

	public stop(): void {
		this.seek(sec(0));
	}

	/**
	 * Reload the edit with a new configuration (hot-reload).
	 */
	public async loadEdit(edit: EditConfig): Promise<void> {
		// Validate the incoming config before any mutations
		EditSchema.parse(edit);

		// Stop playback before mutating — prevents audio bleed from old players
		this.pause();

		if (this.tracks.length > 0 && !this.hasStructuralChanges(edit)) {
			this.lastResolved = null;

			// Clone so preserveClipIdsForGranularUpdate doesn't mutate the caller's object
			const cloned = structuredClone(edit);
			this.preserveClipIdsForGranularUpdate(cloned);

			const oldTracks = this.document.getTracks();
			const oldOutput = this.document.getOutput();

			this.document = new EditDocument(cloned);
			this.isBatchingEvents = true;
			await this.applyGranularChanges(cloned, oldTracks, oldOutput);
			this.updateTotalDuration();
			this.isBatchingEvents = false;
			this.emitEditChanged("loadEdit:granular");
			return;
		}

		// Save state for rollback — if initialization fails after mutation,
		// we restore so the session remains usable for a retry
		const prevDocument = this.document;
		const prevLastResolved = this.lastResolved;
		const prevSize = this.size;
		const prevBackgroundColor = this.backgroundColor;

		try {
			this.lastResolved = null;
			this.document = new EditDocument(edit);

			const resolution = this.document.getResolution();
			const aspectRatio = this.document.getAspectRatio();
			this.size = resolution ? calculateSizeFromPreset(resolution, aspectRatio) : this.document.getSize();
			this.backgroundColor = this.document.getBackground() ?? "#000000";

			this.internalEvents.emit(InternalEvent.ViewportSizeChanged, {
				width: this.size.width,
				height: this.size.height,
				backgroundColor: this.backgroundColor
			});
			this.internalEvents.emit(InternalEvent.ViewportNeedsZoomToFit);
			this.clearClips();

			await this.initializeFromDocument("loadEdit");
		} catch (error) {
			this.document = prevDocument;
			this.lastResolved = prevLastResolved;
			this.size = prevSize;
			this.backgroundColor = prevBackgroundColor;
			throw error;
		}
	}

	private async loadSoundtrack(soundtrack: Soundtrack): Promise<void> {
		const clip: ResolvedClip = {
			id: crypto.randomUUID(),
			asset: {
				type: "audio",
				src: soundtrack.src,
				effect: soundtrack.effect,
				volume: soundtrack.volume ?? 1
			},
			fit: "crop",
			start: sec(0),
			length: sec(this.totalDuration)
		};

		const player = this.createPlayerFromAssetType(clip);
		player.layer = this.tracks.length + 1;
		await this.addPlayer(this.tracks.length, player);
	}
	public getEdit(): EditConfig {
		const doc = this.document.toJSON();
		const mergeFields = this.mergeFieldService.toSerializedArray();
		if (mergeFields.length > 0) doc.merge = mergeFields;
		return doc;
	}

	/**
	 * Validates an edit configuration.
	 * @internal
	 */
	public validateEdit(edit: unknown): { valid: boolean; errors: Array<{ path: string; message: string }> } {
		const result = EditSchema.safeParse(edit);
		if (result.success) return { valid: true, errors: [] };
		return {
			valid: false,
			errors: result.error.issues.map(issue => ({
				path: issue.path.join("."),
				message: issue.message
			}))
		};
	}

	/**
	 * @internal Get the resolved edit state.
	 */
	public getResolvedEdit(): ResolvedEdit {
		if (!this.lastResolved) {
			this.lastResolved = resolveDocument(this.document, {
				mergeFields: this.mergeFieldService
			});
		}
		return this.lastResolved;
	}

	/**
	 * Get a specific clip from the resolved edit.
	 * @internal
	 */
	public getResolvedClip(trackIdx: number, clipIdx: number): ResolvedClip | null {
		const resolved = this.getResolvedEdit();
		return resolved?.timeline?.tracks?.[trackIdx]?.clips?.[clipIdx] ?? null;
	}

	/**
	 * Get a resolved clip by its stable ID.
	 * @internal
	 */
	public getResolvedClipById(clipId: string): ResolvedClip | null {
		const resolved = this.getResolvedEdit();
		for (const track of resolved.timeline.tracks) {
			for (const clip of track.clips) {
				if (clip.id === clipId) return clip;
			}
		}
		return null;
	}

	/**
	 * Get the stable clip ID for a clip at a given position.
	 * @internal
	 */
	public getClipId(trackIdx: number, clipIdx: number): string | null {
		return this.document?.getClipId(trackIdx, clipIdx) ?? null;
	}

	/**
	 * Get the raw document clip at a given position.
	 * @internal
	 */
	public getDocumentClip(trackIdx: number, clipIdx: number): Clip | null {
		return this.document?.getClip(trackIdx, clipIdx) ?? null;
	}

	/**
	 * Get the pure document layer.
	 * @internal
	 */
	public getDocument(): EditDocument | null {
		return this.document;
	}

	/** @internal Resolve the document to a ResolvedEdit and emit the Resolved event.
	 */
	public resolve(): ResolvedEdit {
		this.lastResolved = resolveDocument(this.document, {
			mergeFields: this.mergeFieldService
		});

		// Emit event for components to react
		this.internalEvents.emit(InternalEvent.Resolved, { edit: this.lastResolved });

		return this.lastResolved;
	}

	/** @internal Resolve a single clip and update its player. */
	public resolveClip(clipId: string): boolean {
		const player = this.getPlayerByClipId(clipId);
		if (!player) {
			return false;
		}

		// Check if this clip has an alias that others might depend on
		// If so, fall back to full resolution to update all alias dependents
		const docClip = this.document.getClipById(clipId);
		if (docClip?.clip.alias) {
			this.resolve();
			return true;
		}

		// Check if this clip references an alias (in start or length)
		// Single-clip resolution doesn't have the resolved alias values map,
		// so we need to fall back to full resolution for alias references
		const clip = docClip?.clip;
		if (clip && (isAliasReference(clip.start) || isAliasReference(clip.length))) {
			this.resolve();
			return true;
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
			cachedTimelineEnd: this.timingManager.getTimelineEnd()
		};

		// Resolve just this one clip
		const result = resolveClipById(this.document, clipId, context);
		if (!result) {
			return false;
		}

		// Update lastResolved cache with the newly resolved clip (keeps cache in sync)
		if (this.lastResolved) {
			const cachedTrack = this.lastResolved.timeline.tracks[result.trackIndex];
			if (cachedTrack && cachedTrack.clips[result.clipIndex]) {
				cachedTrack.clips[result.clipIndex] = result.resolved;
			}
		}

		// Update the player via the reconciler's single-player update
		const updated = this.playerReconciler.updateSinglePlayer(player, result.resolved, result.trackIndex, result.clipIndex);

		return updated !== false;
	}

	public addClip(trackIdx: number, clip: Clip): void | Promise<void> {
		ClipSchema.parse(clip);
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
	 * @internal
	 */
	public getClipError(trackIdx: number, clipIdx: number): { error: string; assetType: string } | null {
		return this.clipErrors.get(`${trackIdx}-${clipIdx}`) ?? null;
	}

	/**
	 * Clear the error for a deleted clip and shift indices for remaining errors.
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

	/** @internal */
	public getPlayerClip(trackIdx: number, clipIdx: number): Player | null {
		const track = this.tracks[trackIdx];
		if (!track || clipIdx < 0 || clipIdx >= track.length) return null;
		return track[clipIdx];
	}

	/**
	 * Get a Player by its stable clip ID.
	 * @internal
	 */
	public getPlayerByClipId(clipId: string): Player | null {
		return this.playerByClipId.get(clipId) ?? null;
	}

	/**
	 * Get the document clip by its stable ID.
	 * @internal
	 */
	public getDocumentClipById(clipId: string): Clip | null {
		return this.document?.getClipById(clipId)?.clip ?? null;
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
	 * Ensure a track exists at the given index.
	 * @internal Used by PlayerReconciler for track syncing
	 */
	public ensureTrackExists(trackIndex: number): void {
		while (this.tracks.length <= trackIndex) {
			this.tracks.push([]);
		}
	}

	/**
	 * Remove an empty track at the given index.
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

		this.internalEvents.emit(InternalEvent.TrackContainerRemoved, { trackIndex });

		// Update layer numbers for all players in tracks above the removed one
		for (let i = trackIndex; i < this.tracks.length; i += 1) {
			for (const player of this.tracks[i]) {
				player.layer = i + 1;
			}
		}
	}

	/**
	 * Get the exportable asset for a clip, preserving merge field templates.
	 * @internal
	 */
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

	public async deleteClip(trackIdx: number, clipIdx: number): Promise<void> {
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
				await this.executeCommand(lumaCommand);

				// Now delete content clip with adjusted index
				const contentCommand = new DeleteClipCommand(trackIdx, adjustedContentIdx);
				await this.executeCommand(contentCommand);
				return;
			}
		}

		// No luma attachment or deleting a luma directly - just delete the clip
		const command = new DeleteClipCommand(trackIdx, clipIdx);
		await this.executeCommand(command);
	}

	public async addTrack(trackIdx: number, track: Track): Promise<void> {
		TrackSchema.parse(track);

		const command = new AddTrackCommand(trackIdx);
		await this.executeCommand(command);

		for (const clip of track.clips) {
			await this.addClip(trackIdx, clip);
		}

		// Auto-link caption clips with unresolved alias sources
		await this.autoLinkCaptionSources(trackIdx, track.clips);
	}

	/**
	 * Auto-link rich-caption clips to the first eligible source clip.
	 * If an alias reference in the caption's src can't be resolved, link it automatically.
	 */
	private async autoLinkCaptionSources(trackIdx: number, clips: Clip[]): Promise<void> {
		for (let c = 0; c < clips.length; c += 1) {
			const clip = clips[c];
			const asset = clip.asset as { type?: string; src?: string };
			if (asset.type === "rich-caption" && isAliasReference(asset.src)) {
				const eligible = findEligibleSourceClips(this);
				if (eligible.length > 0) {
					const target = eligible[0];
					const alias = await ensureClipAlias(this, target.trackIndex, target.clipIndex);
					await this.updateClip(trackIdx, c, { asset: { src: `alias://${alias}` } } as Record<string, unknown>);
				}
			}
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

	public undo(): Promise<void> {
		return this.commandQueue.enqueue(async () => {
			if (this.commandIndex >= 0) {
				const command = this.commandHistory[this.commandIndex];
				if (command.undo) {
					const context = this.createCommandContext();
					// Always await - harmless on sync results, works across realms
					await Promise.resolve(command.undo(context));
					// Only decrement after successful completion
					this.commandIndex -= 1;

					this.internalEvents.emit(EditEvent.EditUndo, { command: command.name });
					this.emitEditChanged(`undo:${command.name}`);
				}
			}
		});
	}

	public redo(): Promise<void> {
		return this.commandQueue.enqueue(async () => {
			if (this.commandIndex < this.commandHistory.length - 1) {
				const nextIndex = this.commandIndex + 1;
				const command = this.commandHistory[nextIndex];
				const context = this.createCommandContext();
				// Always await - harmless on sync results, works across realms
				await Promise.resolve(command.execute(context));
				// Only increment after successful completion
				this.commandIndex = nextIndex;

				this.internalEvents.emit(EditEvent.EditRedo, { command: command.name });
				this.emitEditChanged(`redo:${command.name}`);
			}
		});
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

	/**
	 * Update clip in document only, without resolving.
	 * @internal
	 */
	public updateClipInDocument(clipId: string, updates: Partial<ResolvedClip>): void {
		const location = this.document.getClipById(clipId);
		if (!location) return;

		this.document.updateClip(location.trackIndex, location.clipIndex, updates);
	}

	/**
	 * Commit a live update session to the undo history.
	 * @param clipId - The clip ID to commit changes for
	 * @param initialConfig - The clip state before the drag/change began
	 * @param finalConfig - Explicit final state (must match what was already applied to document)
	 * @internal
	 */
	public commitClipUpdate(clipId: string, initialConfig: ResolvedClip, finalConfig: ResolvedClip): void {
		const location = this.document.getClipById(clipId);
		if (!location) {
			console.warn(`commitClipUpdate: clip ${clipId} not found in document`);
			return;
		}

		// Validate the final state before committing to history.
		// Live updates (updateClipInDocument) skip validation for performance,
		// so this is the gate that catches corrupt data from drag/slider interactions.
		ResolvedClipSchema.parse(finalConfig);

		const command = new SetUpdatedClipCommand(initialConfig, structuredClone(finalConfig), {
			trackIndex: location.trackIndex,
			clipIndex: location.clipIndex
		});

		// Add to history without executing
		this.addCommandToHistory(command);
	}

	/**
	 * Manage command history: dispose redo stack, add command, prune old entries.
	 * @internal
	 */
	private pushCommandToHistory(command: EditCommand): void {
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
	}

	/**
	 * Add a command to history without executing it.
	 */
	private addCommandToHistory(command: EditCommand): void {
		this.pushCommandToHistory(command);
		this.emitEditChanged(`commit:${command.name}`);
	}

	public updateClip(trackIdx: number, clipIdx: number, updates: Partial<Clip>): Promise<void> {
		const clip = this.getPlayerClip(trackIdx, clipIdx);
		if (!clip) {
			console.warn(`Clip not found at track ${trackIdx}, index ${clipIdx}`);
			return Promise.resolve();
		}

		const documentClip = this.document?.getClip(trackIdx, clipIdx);
		const initialConfig = structuredClone(documentClip ?? clip.clipConfiguration) as ResolvedClip;
		const currentConfig = structuredClone(documentClip ?? clip.clipConfiguration);
		// Cast to ResolvedClip - the timing resolver handles "auto"/"end" at runtime
		const mergedConfig = deepMerge(currentConfig, updates as unknown as Partial<ResolvedClip>) as ResolvedClip;

		// Validate the merged clip before applying
		ResolvedClipSchema.parse(mergedConfig);

		const command = new SetUpdatedClipCommand(initialConfig, mergedConfig, {
			trackIndex: trackIdx,
			clipIndex: clipIdx
		});
		return this.executeCommand(command);
	}

	/**
	 * Update clip timing mode and/or values.
	 * @internal Use updateClip() for public API access
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

	/** @internal */
	public executeEditCommand(command: EditCommand): void | Promise<void> {
		return this.executeCommand(command);
	}

	/** @internal */
	protected executeCommand(command: EditCommand): Promise<void> {
		return this.commandQueue.enqueue(async () => {
			const context = this.createCommandContext();
			// Always await - harmless on sync results, works across realms
			const result = await Promise.resolve(command.execute(context));
			this.handleCommandResult(command, result);
		});
	}

	/**
	 * Handle command result - only add to history if successful.
	 */
	private handleCommandResult(command: EditCommand, result: CommandResult): void {
		if (result.status === "success") {
			this.pushCommandToHistory(command);
			this.emitEditChanged(command.name);
		}
		// 'noop' - don't add to history, don't emit
	}

	/**
	 * Emits a unified `edit:changed` event after any state mutation.
	 * @internal
	 */
	protected emitEditChanged(source: string): void {
		if (this.isBatchingEvents) return;
		this.internalEvents.emit(EditEvent.EditChanged, { source, timestamp: Date.now() });
	}

	/**
	 * Detects merge field placeholders in the raw edit before substitution.
	 */
	private detectMergeFieldBindings(mergeFields: SerializedMergeField[]): Map<string, Map<string, MergeFieldBinding>> {
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
		for (let t = 0; t < this.document.getTrackCount(); t += 1) {
			const clips = this.document.getClipsInTrack(t);
			for (let c = 0; c < clips.length; c += 1) {
				const clipId = this.document.getClipId(t, c);
				if (clipId) {
					const bindings = this.detectBindingsInObject(clips[c], "", fieldValues);
					if (bindings.size > 0) {
						result.set(clipId, bindings);
					}
				}
			}
		}

		return result;
	}

	/**
	 * Recursively walks an object to find merge field placeholders.
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
	 *
	 * TODO: Expand granular path to handle more cases:
	 * - Clip add/remove: Use existing addClip()/deleteClip() commands
	 * - Soundtrack changes: Add/remove AudioPlayer via commands
	 * - Font changes: Load new fonts incrementally
	 * - Merge field changes: Re-resolve affected clips
	 */
	private hasStructuralChanges(newEdit: EditConfig): boolean {
		if (!this.document) return true;

		const currentTracks = this.document.getTracks();
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
		if (JSON.stringify(this.document.getMergeFields() ?? []) !== JSON.stringify(newEdit.merge ?? [])) {
			return true;
		}

		// Fonts changed = structural (requires re-loading fonts)
		if (JSON.stringify(this.document.getFonts()) !== JSON.stringify(newEdit.timeline.fonts ?? [])) {
			return true;
		}

		// Soundtrack changed = structural (requires creating/destroying AudioPlayer)
		if (JSON.stringify(this.document.getSoundtrack()) !== JSON.stringify(newEdit.timeline.soundtrack)) {
			return true;
		}

		return false;
	}

	/**
	 * Transfers existing clip IDs from the current document to the new edit configuration.
	 */
	private preserveClipIdsForGranularUpdate(newEdit: EditConfig): void {
		if (!this.document) return;

		const existingTracks = this.document.getTracks();

		for (let trackIdx = 0; trackIdx < newEdit.timeline.tracks.length; trackIdx += 1) {
			const existingTrack = existingTracks[trackIdx];
			const newTrack = newEdit.timeline.tracks[trackIdx];

			if (existingTrack && newTrack) {
				for (let clipIdx = 0; clipIdx < newTrack.clips.length; clipIdx += 1) {
					const existingId = this.document.getClipId(trackIdx, clipIdx);
					if (existingId) {
						// Add the ID to the new clip so EditDocument.hydrateIds() preserves it
						(newTrack.clips[clipIdx] as ClipWithId).id = existingId;
					}
				}
			}
		}
	}

	/**
	 * Applies granular changes without full reload.
	 * @param newEdit - The new edit configuration
	 * @param oldTracks - The old tracks (captured before document update)
	 * @param oldOutput - The old output settings (captured before document update)
	 */
	private async applyGranularChanges(newEdit: EditConfig, oldTracks: Track[], oldOutput: EditConfig["output"]): Promise<void> {
		const newOutput = newEdit.output;

		// 1. Apply output changes
		if (newOutput?.size && (oldOutput?.size?.width !== newOutput.size.width || oldOutput?.size?.height !== newOutput.size.height)) {
			const width = newOutput.size.width ?? this.size.width;
			const height = newOutput.size.height ?? this.size.height;
			await this.setOutputSize(width, height);
		}

		if (newOutput?.fps !== undefined && oldOutput?.fps !== newOutput.fps) {
			await this.setOutputFps(newOutput.fps);
		}

		if (newOutput?.format !== undefined && oldOutput?.format !== newOutput.format) {
			await this.setOutputFormat(newOutput.format);
		}

		if (newOutput?.destinations && JSON.stringify(oldOutput?.destinations) !== JSON.stringify(newOutput.destinations)) {
			await this.setOutputDestinations(newOutput.destinations);
		}

		if (newOutput?.resolution !== undefined && oldOutput?.resolution !== newOutput.resolution) {
			await this.setOutputResolution(newOutput.resolution);
		}

		if (newOutput?.aspectRatio !== undefined && oldOutput?.aspectRatio !== newOutput.aspectRatio) {
			await this.setOutputAspectRatio(newOutput.aspectRatio);
		}

		const newBg = newEdit.timeline?.background;
		if (newBg && this.backgroundColor !== newBg) {
			await this.setTimelineBackground(newBg);
		}

		// 2. Diff and update each clip
		const newTracks = newEdit.timeline.tracks;

		for (let trackIdx = 0; trackIdx < newTracks.length; trackIdx += 1) {
			const oldClips = oldTracks[trackIdx].clips;
			const newClips = newTracks[trackIdx].clips;

			for (let clipIdx = 0; clipIdx < newClips.length; clipIdx += 1) {
				const oldClip = oldClips[clipIdx];
				const newClip = newClips[clipIdx];

				// Only update if clip changed
				if (JSON.stringify(oldClip) !== JSON.stringify(newClip)) {
					// Cast since newClip may have "auto"/"end" strings; updateClip handles resolution
					// eslint-disable-next-line no-await-in-loop
					await this.updateClip(trackIdx, clipIdx, newClip as unknown as Partial<ResolvedClip>);
				}
			}
		}
	}

	/** @internal */
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
			getContainer: () => this.getViewportContainer(),
			addPlayer: (trackIdx, player) => this.addPlayer(trackIdx, player),
			addPlayerToContainer: (trackIdx, player) => {
				this.addPlayerToContainer(trackIdx, player);
			},
			createPlayerFromAssetType: clipConfiguration => this.createPlayerFromAssetType(clipConfiguration),
			queueDisposeClip: player => this.queueDisposeClip(player),
			disposeClips: () => this.disposeClips(),
			clearClipError: (trackIdx, clipIdx) => this.clearClipErrorAndShift(trackIdx, clipIdx),
			undeleteClip: (trackIdx, clip) => {
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
					this.internalEvents.emit(EditEvent.ClipLoadFailed, {
						trackIndex: trackIdx,
						clipIndex: insertIdx,
						error: errorMessage,
						assetType
					});
				});

				this.updateTotalDuration();
			},
			setUpdatedClip: () => {
				// No-op: kept for interface compatibility
			},
			restoreClipConfiguration: (clip, previousConfig) => {
				const cloned = structuredClone(previousConfig);
				const config = clip.clipConfiguration as Record<string, unknown>;
				for (const key of Object.keys(config)) {
					delete config[key];
				}
				Object.assign(config, cloned);
				clip.reconfigureAfterRestore();

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
			emitEvent: (name, ...args) => (this.internalEvents.emit as EventEmitter<EditEventMap>["emit"])(name, ...args),
			findClipIndices: player => this.selectionManager.findClipIndices(player),
			getClipAt: (trackIndex, clipIndex) => this.getClipAt(trackIndex, clipIndex),
			getSelectedClip: () => this.selectionManager.getSelectedClip(),
			setSelectedClip: clip => {
				this.selectionManager.setSelectedClip(clip);
			},
			movePlayerToTrackContainer: (player, fromTrackIdx, toTrackIdx) => this.movePlayerToTrackContainer(player, fromTrackIdx, toTrackIdx),
			getEditState: () => this.getResolvedEdit(),
			propagateTimingChanges: (trackIndex, startFromClipIndex) => this.propagateTimingChanges(trackIndex, startFromClipIndex),
			resolveClipAutoLength: clip => this.resolveClipAutoLength(clip),
			getMergeFields: () => this.mergeFieldService,
			getOutputSize: () => this.outputSettings.getSize(),
			setOutputSize: (width, height) => this.outputSettings.setSize(width, height),
			getOutputFps: () => this.outputSettings.getFps(),
			setOutputFps: fps => this.outputSettings.setFps(fps),
			getOutputFormat: () => this.outputSettings.getFormat(),
			setOutputFormat: format => this.outputSettings.setFormat(format),
			getOutputResolution: () => this.outputSettings.getResolution(),
			setOutputResolution: resolution => this.outputSettings.setResolution(resolution),
			getOutputAspectRatio: () => this.outputSettings.getAspectRatio(),
			setOutputAspectRatio: aspectRatio => this.outputSettings.setAspectRatio(aspectRatio),
			getOutputDestinations: () => this.outputSettings.getDestinations(),
			setOutputDestinations: destinations => this.outputSettings.setDestinations(destinations),
			getTimelineBackground: () => this.getTimelineBackground(),
			setTimelineBackground: color => this.setTimelineBackgroundInternal(color),
			getDocument: () => this.document,
			getDocumentTrack: trackIdx => this.document?.getTrack(trackIdx) ?? null,
			getDocumentClip: (trackIdx, clipIdx) => this.document?.getClip(trackIdx, clipIdx) ?? null,
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
			resolve: () => this.resolve(),
			resolveClip: clipId => this.resolveClip(clipId),
			getPlayerByClipId: clipId => this.playerByClipId.get(clipId) ?? null,
			registerPlayerByClipId: (clipId, player) => {
				this.playerByClipId.set(clipId, player);
			},
			unregisterPlayerByClipId: clipId => {
				this.playerByClipId.delete(clipId);
			},
			setClipBinding: (clipId, path, binding) => {
				this.document?.setClipBinding(clipId, path, binding);
			},
			getClipBinding: (clipId, path) => this.document?.getClipBinding(clipId, path),
			removeClipBinding: (clipId, path) => {
				this.document?.removeClipBinding(clipId, path);
			},
			getClipBindings: clipId => this.document?.getClipBindings(clipId),
			getEditSession: () => this
		};
	}

	private queueDisposeClip(clipToDispose: Player): void {
		this.clipsToDispose.add(clipToDispose);
	}

	/** @internal */
	protected disposeClips(): void {
		if (this.clipsToDispose.size === 0) {
			return;
		}

		// Clean up luma masks for any luma players being deleted
		for (const clip of this.clipsToDispose) {
			if (clip.playerType === PlayerType.Luma) {
				this.lumaMaskController.cleanupForPlayer(clip);
				// Remove the luma→content relationship when disposing
				if (clip.clipId) {
					this.lumaContentRelations.delete(clip.clipId);
				}
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

		// Remove from tracks (clips are derived from tracks.flat())
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

		this.clipsToDispose.clear();
		this.updateTotalDuration();

		// Clean up fonts that are no longer used by any clip
		this.cleanupUnusedFonts();
	}

	/**
	 * Remove fonts from timeline.fonts that are no longer referenced by any clip.
	 */
	private cleanupUnusedFonts(): void {
		if (!this.document) return;

		const fonts = this.document.getFonts();
		if (fonts.length === 0) return;

		// Collect all font filenames currently used by RichText clips
		const usedFilenames = new Set<string>();
		for (const clip of this.clips) {
			const { asset } = clip.clipConfiguration;
			if (asset && (asset.type === "rich-text" || asset.type === "rich-caption") && asset.font?.family) {
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
			const viewportContainer = this.canvas?.getViewportContainer();
			if (viewportContainer) {
				for (const child of viewportContainer.children) {
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

		// Invalidate cache since timeline end may have changed
		this.timingManager.invalidateTimelineEndCache();

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

	/** @internal */
	protected clearClips(): void {
		for (const clip of this.clips) {
			this.disposeClip(clip);
		}

		this.tracks = [];
		this.playerByClipId.clear();
		this.clipsToDispose.clear();
		this.clipErrors.clear();
		this.lumaContentRelations.clear();

		this.updateTotalDuration();
	}

	/** @internal */
	public updateTotalDuration(): void {
		let maxDurationSeconds = 0;

		for (const track of this.tracks) {
			for (const clip of track) {
				// clip.getEnd() returns Seconds
				maxDurationSeconds = Math.max(maxDurationSeconds, clip.getEnd());
			}
		}

		// Store in seconds (consistent with Seconds type)
		const previousDuration = this.totalDuration;
		this.totalDuration = sec(maxDurationSeconds);

		// Emit event if duration changed
		if (previousDuration !== this.totalDuration) {
			this.internalEvents.emit(EditEvent.DurationChanged, { duration: this.totalDuration });
		}
	}

	/** @internal */
	public propagateTimingChanges(trackIndex: number, startFromClipIndex: number): void {
		this.timingManager.propagateTimingChanges(trackIndex, startFromClipIndex);
	}

	/** @internal */
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
		// Emit event for Canvas to add player to track container
		this.internalEvents.emit(InternalEvent.PlayerAddedToTrack, { player, trackIndex });
	}

	// Move a player's container to the appropriate track container
	private movePlayerToTrackContainer(player: Player, fromTrackIdx: number, toTrackIdx: number): void {
		this.internalEvents.emit(InternalEvent.PlayerMovedBetweenTracks, {
			player,
			fromTrackIndex: fromTrackIdx,
			toTrackIndex: toTrackIdx
		});
	}
	/**
	 * Create a Player from a clip configuration based on asset type.
	 * @internal Used by PlayerReconciler and commands
	 */
	public createPlayerFromAssetType(clipConfiguration: ResolvedClip): Player {
		return PlayerFactory.create(this, clipConfiguration);
	}

	private async addPlayer(trackIdx: number, clipToAdd: Player): Promise<void> {
		while (this.tracks.length <= trackIdx) {
			this.tracks.push([]);
		}

		this.tracks[trackIdx].push(clipToAdd);

		// Document sync is handled by AddClipCommand - don't duplicate here

		this.internalEvents.emit(InternalEvent.PlayerAddedToTrack, { player: clipToAdd, trackIndex: trackIdx });

		await clipToAdd.load();

		this.updateTotalDuration();
	}

	/** @internal */
	public selectClip(trackIndex: number, clipIndex: number): void {
		this.selectionManager.selectClip(trackIndex, clipIndex);
	}

	/** @internal – Visual focus without selection change or public event. */
	public focusClip(trackIndex: number, clipIndex: number): void {
		this.internalEvents.emit(InternalEvent.ClipFocused, { trackIndex, clipIndex });
	}

	/** @internal – Clear visual focus. */
	public blurClip(): void {
		this.internalEvents.emit(InternalEvent.ClipBlurred);
	}

	/** @internal */
	public clearSelection(): void {
		this.selectionManager.clearSelection();
	}

	/** @internal */
	public isClipSelected(trackIndex: number, clipIndex: number): boolean {
		return this.selectionManager.isClipSelected(trackIndex, clipIndex);
	}

	/** @internal */
	public getSelectedClipInfo(): { trackIndex: number; clipIndex: number; player: Player } | null {
		return this.selectionManager.getSelectedClipInfo();
	}

	/**
	 * Copy a clip to the internal clipboard.
	 * @internal
	 */
	public copyClip(trackIdx: number, clipIdx: number): void {
		this.selectionManager.copyClip(trackIdx, clipIdx);
	}

	/**
	 * Paste the copied clip at the current playhead position.
	 * @internal
	 */
	public pasteClip(): void {
		this.selectionManager.pasteClip();
	}

	/**
	 * Check if there is a clip in the clipboard.
	 * @internal
	 */
	public hasCopiedClip(): boolean {
		return this.selectionManager.hasCopiedClip();
	}

	/** @internal */
	public findClipIndices(player: Player): { trackIndex: number; clipIndex: number } | null {
		return this.selectionManager.findClipIndices(player);
	}

	/** @internal */
	public getClipAt(trackIndex: number, clipIndex: number): Player | null {
		if (trackIndex >= 0 && trackIndex < this.tracks.length && clipIndex >= 0 && clipIndex < this.tracks[trackIndex].length) {
			return this.tracks[trackIndex][clipIndex];
		}
		return null;
	}

	/** @internal */
	public selectPlayer(player: Player): void {
		this.selectionManager.selectPlayer(player);
	}

	/** @internal */
	public isPlayerSelected(player: Player): boolean {
		return this.selectionManager.isPlayerSelected(player);
	}

	/** @internal Get all active players except the specified one. */
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

	/** @internal Show an alignment guide line. */
	public showAlignmentGuide(type: "canvas" | "clip", axis: "x" | "y", position: number, bounds?: { start: number; end: number }): void {
		this.canvas?.showAlignmentGuide(type, axis, position, bounds);
	}

	/** @internal Clear all alignment guides. */
	public clearAlignmentGuides(): void {
		this.canvas?.clearAlignmentGuides();
	}

	/** @internal Move the selected clip by a pixel delta. */
	public moveSelectedClip(deltaX: number, deltaY: number): void {
		const info = this.getSelectedClipInfo();
		if (!info) return;

		const { player, trackIndex, clipIndex } = info;

		const resolvedClip = this.getResolvedClip(trackIndex, clipIndex);
		if (!resolvedClip) return;

		const initialConfig = structuredClone(resolvedClip);

		const newOffset = player.calculateMoveOffset(deltaX, deltaY);

		const finalConfig = structuredClone(initialConfig);
		finalConfig.offset = newOffset;

		this.setUpdatedClip(player, initialConfig, finalConfig);
	}

	/** @internal */
	public setExportMode(exporting: boolean): void {
		this.isExporting = exporting;
	}
	/** @internal */
	public isInExportMode(): boolean {
		return this.isExporting;
	}

	/** @internal */
	public setCanvas(canvas: Canvas): void {
		this.canvas = canvas;
	}

	/** @internal */
	public getCanvas(): Canvas | null {
		return this.canvas;
	}

	/** @internal */
	public getCanvasZoom(): number {
		return this.canvas?.getZoom() ?? 1;
	}

	/**
	 * Get the viewport container for coordinate transforms.
	 * @internal
	 */
	public getViewportContainer(): pixi.Container {
		if (!this.canvas) {
			throw new Error("Canvas not attached. Viewport container requires Canvas.");
		}
		return this.canvas.getViewportContainer();
	}

	// ─── Output Settings (delegated to OutputSettingsManager) ────────────────────

	public setOutputSize(width: number, height: number): Promise<void> {
		const command = new SetOutputSizeCommand(width, height);
		return this.executeCommand(command);
	}

	public setOutputFps(fps: number): Promise<void> {
		const command = new SetOutputFpsCommand(fps);
		return this.executeCommand(command);
	}

	public getOutputFps(): number {
		return this.outputSettings.getFps();
	}

	public setOutputFormat(format: string): Promise<void> {
		const command = new SetOutputFormatCommand(format);
		return this.executeCommand(command);
	}

	public getOutputFormat(): string {
		return this.outputSettings.getFormat();
	}

	public setOutputDestinations(destinations: Destination[]): Promise<void> {
		const command = new SetOutputDestinationsCommand(destinations);
		return this.executeCommand(command);
	}

	public getOutputDestinations(): Destination[] {
		return this.outputSettings.getDestinations();
	}

	public setOutputResolution(resolution: string): Promise<void> {
		const command = new SetOutputResolutionCommand(resolution);
		return this.executeCommand(command);
	}

	public getOutputResolution(): string | undefined {
		return this.outputSettings.getResolution();
	}

	public setOutputAspectRatio(aspectRatio: string): Promise<void> {
		const command = new SetOutputAspectRatioCommand(aspectRatio);
		return this.executeCommand(command);
	}

	public getOutputAspectRatio(): string | undefined {
		return this.outputSettings.getAspectRatio();
	}

	/** @internal */
	public getTimelineFonts(): Array<{ src: string }> {
		return this.document.getFonts();
	}

	/**
	 * Get the font metadata map (URL → parsed binary name and weight).
	 * Used by the font picker to display correct custom font names.
	 * @internal
	 */
	public getFontMetadata(): ReadonlyMap<string, { baseFamilyName: string; weight: number }> {
		return this.fontMetadata;
	}

	/**
	 * Look up a font URL by family name and weight.
	 * @internal
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

	/** @internal */
	public pruneUnusedFonts(): void {
		this.cleanupUnusedFonts();
	}

	public setTimelineBackground(color: string): Promise<void> {
		const command = new SetTimelineBackgroundCommand(color);
		return this.executeCommand(command);
	}

	private setTimelineBackgroundInternal(color: string): void {
		HexColorSchema.parse(color);

		this.backgroundColor = color;

		// Sync with document layer
		this.document.setBackground(color);

		this.internalEvents.emit(InternalEvent.ViewportSizeChanged, {
			width: this.size.width,
			height: this.size.height,
			backgroundColor: this.backgroundColor
		});

		this.internalEvents.emit(EditEvent.TimelineBackgroundChanged, { color });
		// Note: emitEditChanged is handled by executeCommand
	}

	public getTimelineBackground(): string {
		return this.backgroundColor;
	}

	/**
	 * Resolve merge field placeholders in a string.
	 * @internal
	 */
	public resolveMergeFields(input: string): string {
		return this.mergeFieldService.resolve(input);
	}

	// ─── Template Edit Access (via document bindings) ──────────────────────────

	/* @internal Get the exportable clip (with merge field placeholders restored) */
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

	/**
	 * Get the exportable clip by its stable ID (with merge field placeholders restored).
	 * @internal
	 */
	protected getTemplateClipById(clipId: string): ResolvedClip | null {
		const player = this.getPlayerByClipId(clipId);
		if (!player) return null;

		const clip = player.getExportableClip();
		if (!clip || !this.document) return null;

		const bindings = this.document.getClipBindings(clipId);
		if (bindings) {
			for (const [path, { placeholder }] of bindings) {
				setNestedValue(clip as Record<string, unknown>, path, placeholder);
			}
		}

		return clip as ResolvedClip;
	}

	/**
	 * Get the text content from the template clip (with merge field placeholders).
	 * @internal
	 */
	public getTemplateClipText(trackIdx: number, clipIdx: number): string | null {
		const templateClip = this.getTemplateClip(trackIdx, clipIdx);
		if (!templateClip) return null;
		const asset = templateClip.asset as { text?: string } | undefined;
		return asset?.text ?? null;
	}

	// ─── Luma Mask API ──────────────────────────────────────────────────────────

	/**
	 * @internal Get the luma clip ID attached to a content clip.
	 */
	public getLumaClipIdForContent(contentClipId: string): string | null {
		for (const [lumaId, contentId] of this.lumaContentRelations) {
			if (contentId === contentClipId) return lumaId;
		}
		return null;
	}

	/**
	 * Get the content clip ID for a luma clip.
	 * @internal
	 */
	public getContentClipIdForLuma(lumaClipId: string): string | null {
		return this.lumaContentRelations.get(lumaClipId) ?? null;
	}

	/**
	 * Set a luma→content relationship.
	 * @internal Used by commands for managing luma attachments
	 */
	public setLumaContentRelationship(lumaClipId: string, contentClipId: string): void {
		this.lumaContentRelations.set(lumaClipId, contentClipId);
	}

	/**
	 * Clear a luma→content relationship.
	 * @internal Used by commands for managing luma attachments
	 */
	public clearLumaContentRelationship(lumaClipId: string): void {
		this.lumaContentRelations.delete(lumaClipId);
	}

	/**
	 * Get the luma→content relationship for a luma clip.
	 * @internal Used by commands for managing luma attachments
	 */
	public getLumaContentRelationship(lumaClipId: string): string | undefined {
		return this.lumaContentRelations.get(lumaClipId);
	}

	/**
	 * Normalize luma attachments after loading.
	 * @internal
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
						// Establish luma→content relationship using clip IDs
						if (player.clipId && contentPlayer.clipId) {
							this.lumaContentRelations.set(player.clipId, contentPlayer.clipId);
						}

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
				const overlap = calculateOverlap(lumaStart, lumaEnd, contentStart, contentEnd);

				if (overlap > bestOverlap) {
					bestOverlap = overlap;
					bestMatch = player;
				}
			}
		}

		return bestMatch;
	}

	// ─── Intent Listeners ────────────────────────────────────────────────────────

	private setupIntentListeners(): void {
		this.internalEvents.on(InternalEvent.CanvasClipClicked, data => {
			this.selectPlayer(data.player);
		});

		this.internalEvents.on(InternalEvent.CanvasBackgroundClicked, () => {
			this.clearSelection();
		});
	}

	// ─── Protected Accessors for Subclasses ─────────────────────────────────────

	/** @internal Get the tracks array for subclass and reconciler access */
	public getTracks(): Player[][] {
		return this.tracks;
	}
}
