import type { Player } from "@canvas/players/player";
import type { ClipSchema } from "@schemas/clip";
import type { EditSchema } from "@schemas/edit";
import type { Container } from "pixi.js";
import type { z } from "zod";

type ClipType = z.infer<typeof ClipSchema>;
type EditType = z.infer<typeof EditSchema>;

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
};
