import type { Player } from "@canvas/players/player";
import type { EditEventMap, EditEventName } from "@core/events/edit-events";
import type { MergeFieldService } from "@core/merge";
import type { ResolvedClip, ResolvedEdit } from "@schemas";
import type { Container } from "pixi.js";

type ClipType = ResolvedClip;
type EditType = ResolvedEdit;

export interface TimelineUpdatedEvent {
	previous: { timeline: EditType };
	current: { timeline: EditType };
}

export type EditCommand = {
	execute(context?: CommandContext): void | Promise<void>;
	undo?(context?: CommandContext): void | Promise<void>;
	/**
	 * Optional cleanup when command is pruned from history.
	 * Called when command is removed to free memory (e.g., Player references, deep-cloned configs).
	 */
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
};
