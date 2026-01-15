import type { Player } from "@canvas/players/player";
import type { EditDocument, MergeFieldBinding } from "@core/edit-document";
import type { EditEventMap, EditEventName } from "@core/events/edit-events";
import type { MergeFieldService } from "@core/merge";
import type { ResolutionContext } from "@core/timing/types";
import type { Clip, ResolvedClip, ResolvedEdit } from "@schemas";
import type { Container } from "pixi.js";

type ClipType = ResolvedClip;
type EditType = ResolvedEdit;
// Document clip type (allows "auto"/"end" for timing)
type DocumentClipType = Clip;

export interface TimelineUpdatedEvent {
	previous: { timeline: EditType };
	current: { timeline: EditType };
}

export type EditCommand = {
	execute(context?: CommandContext): void | Promise<void>;
	undo?(context?: CommandContext): void | Promise<void>;
	dispose?(): void;
	readonly name: string;
};

export type CommandContext = {
	getClips(): Player[];
	getTracks(): Player[][];
	getTrack(trackIndex: number): Player[] | null;
	getContainer(): Container;
	addPlayer(trackIdx: number, player: Player): Promise<void>;
	addPlayerToContainer(trackIdx: number, player: Player): void;
	createPlayerFromAssetType(clipConfiguration: ClipType): Player;
	queueDisposeClip(player: Player): void;
	disposeClips(): void;
	clearClipError(trackIdx: number, clipIdx: number): void;
	undeleteClip(trackIdx: number, clip: Player): void;
	setUpdatedClip(clip: Player): void;
	restoreClipConfiguration(clip: Player, previousConfig: ClipType): void;
	updateDuration(): void;
	emitEvent<T extends EditEventName>(name: T, ...args: EditEventMap[T] extends void ? [] : [EditEventMap[T]]): void;
	findClipIndices(player: Player): { trackIndex: number; clipIndex: number } | null;
	getClipAt(trackIndex: number, clipIndex: number): Player | null;
	getSelectedClip(): Player | null;
	setSelectedClip(clip: Player | null): void;
	movePlayerToTrackContainer(player: Player, fromTrackIdx: number, toTrackIdx: number): void;
	getEditState(): EditType;
	propagateTimingChanges(trackIndex: number, startFromClipIndex: number): void;
	resolveClipAutoLength(clip: Player): Promise<void>;
	untrackEndLengthClip(clip: Player): void;
	trackEndLengthClip(clip: Player): void;
	// Merge field context
	getMergeFields(): MergeFieldService;

	// Output settings
	getOutputSize(): { width: number; height: number };
	setOutputSize(width: number, height: number): void;
	getOutputFps(): number;
	setOutputFps(fps: number): void;
	getTimelineBackground(): string;
	setTimelineBackground(color: string): void;

	// Document access
	getDocument(): EditDocument | null;
	/** Get a track from the document by index */
	getDocumentTrack(trackIdx: number): { clips: DocumentClipType[] } | null;
	/** Update a clip's properties in the document */
	documentUpdateClip(trackIdx: number, clipIdx: number, updates: Partial<DocumentClipType>): void;
	/** Add a clip to the document, returns the added clip */
	documentAddClip(trackIdx: number, clip: DocumentClipType, clipIdx?: number): DocumentClipType;
	/** Remove a clip from the document, returns the removed clip or null */
	documentRemoveClip(trackIdx: number, clipIdx: number): DocumentClipType | null;
	/** Derive runtime Player state from document clip */
	derivePlayerFromDocument(trackIdx: number, clipIdx: number): void;

	/**
	 * Build resolution context for a clip at the given position.
	 * Extracts all dependencies upfront so resolution can be pure.
	 *
	 * @param trackIdx - Track index
	 * @param clipIdx - Clip index on that track
	 * @returns Context with previousClipEnd, timelineEnd, intrinsicDuration
	 */
	buildResolutionContext(trackIdx: number, clipIdx: number): ResolutionContext;

	/**
	 * Resolve the document to a ResolvedEdit and emit the Resolved event.
	 * This is the core of unidirectional data flow:
	 * Command → Document → resolve() → ResolvedEdit → Components
	 */
	resolve(): EditType;

	// ID-based Player access (for reconciliation)
	/** Get a Player by its stable clip ID */
	getPlayerByClipId(clipId: string): Player | null;
	/** Register a Player with its clip ID for lookup */
	registerPlayerByClipId(clipId: string, player: Player): void;
	/** Unregister a Player from the ID map */
	unregisterPlayerByClipId(clipId: string): void;

	// Merge field binding management (document-based)
	/** Set a merge field binding for a clip property */
	setClipBinding(clipId: string, path: string, binding: MergeFieldBinding): void;
	/** Get a merge field binding for a clip property */
	getClipBinding(clipId: string, path: string): MergeFieldBinding | undefined;
	/** Remove a merge field binding for a clip property */
	removeClipBinding(clipId: string, path: string): void;
	/** Get all bindings for a clip */
	getClipBindings(clipId: string): Map<string, MergeFieldBinding> | undefined;
};
