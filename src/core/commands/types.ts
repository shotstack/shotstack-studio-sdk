import type { Player } from "@canvas/players/player";
import type { ResolvedClip } from "@schemas/clip";
import type { ResolvedEdit } from "@schemas/edit";
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
	undeleteClip(trackIdx: number, clip: Player): void;
	setUpdatedClip(clip: Player): void;
	restoreClipConfiguration(clip: Player, previousConfig: ClipType): void;
	updateDuration(): void;
	emitEvent(name: string, data: unknown): void;
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
};
