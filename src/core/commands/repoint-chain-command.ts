import { repointChain } from "@core/generation/continue-clip";
import type { ResolvedClip } from "@schemas";

import { SetUpdatedClipCommand } from "./set-updated-clip-command";
import { CommandSuccess, type CommandContext, type CommandResult, type EditCommand } from "./types";

// Reads the tracks when it runs, so edits queued ahead of it can't leave it with stale indices.
export class RepointChainCommand implements EditCommand {
	readonly name = "repointChain";
	private applied: SetUpdatedClipCommand[] = [];
	private recorded: string[] = [];

	/** `lostSrcs` gains the file each repointed clip loses; `onRepoint` runs for every clip repointed. */
	constructor(
		private readonly previous: string,
		private readonly next: string,
		private readonly skipClipId: string,
		private readonly lostSrcs: Map<string, string>,
		private readonly onRepoint: (clipId: string) => void
	) {}

	async execute(context?: CommandContext): Promise<CommandResult> {
		const doc = context?.getDocument();
		if (!context || !doc) throw new Error("RepointChainCommand.execute: context and document are required");
		this.applied = [];
		this.recorded = [];
		const tracks = Array.from({ length: doc.getTrackCount() }, (_, t) => doc.getClipsInTrack(t) as ResolvedClip[]);
		const moves = repointChain(tracks, this.previous, this.next).filter(
			({ trackIndex, clipIndex }) => doc.getClipId(trackIndex, clipIndex) !== this.skipClipId
		);
		for (const { trackIndex, clipIndex, clip } of moves) {
			const id = doc.getClipId(trackIndex, clipIndex);
			const before = structuredClone(tracks[trackIndex]![clipIndex]!);
			const step = new SetUpdatedClipCommand(before, clip, { trackIndex, clipIndex });
			await step.execute(context);
			this.applied.push(step);
			if (id) {
				const lost = (before.asset as { src?: unknown }).src;
				if (typeof lost === "string" && (clip.asset as { src?: unknown }).src === undefined) {
					this.lostSrcs.set(id, lost);
					this.recorded.push(id);
				}
				this.onRepoint(id);
			}
		}
		return CommandSuccess();
	}

	// Undo gives each clip its file back, so the record of losing it no longer holds.
	async undo(context?: CommandContext): Promise<CommandResult> {
		for (const step of [...this.applied].reverse()) await step.undo(context);
		this.recorded.forEach(id => this.lostSrcs.delete(id));
		return CommandSuccess();
	}
}
