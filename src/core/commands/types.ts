import type { Player } from "@canvas/players/player";
import type { ClipSchema } from "@schemas/clip";
import type { Container } from "pixi.js";
import type { z } from "zod";

type ClipType = z.infer<typeof ClipSchema>;

export type EditCommand = {
	execute(context?: CommandContext): void | Promise<void>;
	undo?(context?: CommandContext): void | Promise<void>;
	readonly name: string;
};

export type CommandContext = {
	getClips(): Player[];
	getTracks(): Player[][];
	getContainer(): Container;
	addPlayer(trackIdx: number, player: Player): Promise<void>;
	createPlayerFromAssetType(clipConfiguration: ClipType): Player;
	queueDisposeClip(player: Player): void;
	disposeClips(): void;
	undeleteClip(trackIdx: number, clip: Player): void;
	setUpdatedClip(clip: Player): void;
	restoreClipConfiguration(clip: Player, previousConfig: ClipType): void;
	updateDuration(): void;
	emitEvent(name: string, data: unknown): void;
};
