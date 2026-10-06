import { repointChain } from "@core/generation/continue-clip";
import type { ResolvedClip } from "@schemas";

import { SetUpdatedClipCommand } from "./set-updated-clip-command";
import { CommandSuccess, type CommandContext, type CommandResult, type EditCommand } from "./types";

// Reads the tracks when it runs, so edits queued ahead of it can't leave it with stale indices.
export class RepointChainCommand implements EditCommand {
	readonly name = "repointChain";
	/** Ids of the clips repointed by the last execute. */
	readonly repointed: string[] = [];
	private applied: SetUpdatedClipCommand[] = [];

	constructor(
		private readonly previous: string,
		private readonly next: string,
		private readonly skipClipId: string
	) {}

	async execute(context?: CommandContext): Promise<CommandResult> {
		const doc = context?.getDocument();
		if (!context || !doc) throw new Error("RepointChainCommand.execute: context and document are required");
		this.repointed.length = 0;
		this.applied = [];
		const tracks = Array.from({ length: doc.getTrackCount() }, (_, t) => doc.getClipsInTrack(t) as ResolvedClip[]);
		const moves = repointChain(tracks, this.previous, this.next).filter(
			({ trackIndex, clipIndex }) => doc.getClipId(trackIndex, clipIndex) !== this.skipClipId
		);
		for (const { trackIndex, clipIndex, clip } of moves) {
			const id = doc.getClipId(trackIndex, clipIndex);
			const step = new SetUpdatedClipCommand(structuredClone(tracks[trackIndex]![clipIndex]!), clip, { trackIndex, clipIndex });
			await step.execute(context);
			this.applied.push(step);
			if (id) this.repointed.push(id);
		}
		return CommandSuccess();
	}

	async undo(context?: CommandContext): Promise<CommandResult> {
		for (const step of [...this.applied].reverse()) await step.undo(context);
		return CommandSuccess();
	}
}
