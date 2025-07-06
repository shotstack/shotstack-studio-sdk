import type { Player } from "@canvas/players/player";
import { ClipSchema } from "@schemas/clip";
import { z } from "zod";

import type { EditCommand, CommandContext } from "./types";

type ClipType = z.infer<typeof ClipSchema>;

export class SetUpdatedClipCommand implements EditCommand {
	name = "setUpdatedClip";
	private storedInitialConfig: ClipType | null;
	private storedFinalConfig: ClipType;

	constructor(
		private clip: Player,
		private initialClipConfig: ClipType | null,
		private finalClipConfig: ClipType | null
	) {
		this.storedInitialConfig = initialClipConfig ? structuredClone(initialClipConfig) : null;
		this.storedFinalConfig = finalClipConfig ? structuredClone(finalClipConfig) : structuredClone(this.clip.clipConfiguration);
	}

	execute(context?: CommandContext): void {
		if (!context) return;
		if (this.storedFinalConfig) {
			context.restoreClipConfiguration(this.clip, this.storedFinalConfig);
		}

		context.setUpdatedClip(this.clip);

		const trackIndex = this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = clipsByTrack.indexOf(this.clip);

		context.emitEvent("clip:updated", {
			previous: { clip: this.storedInitialConfig || this.initialClipConfig, trackIndex, clipIndex },
			current: { clip: this.storedFinalConfig || this.clip.clipConfiguration, trackIndex, clipIndex }
		});
	}

	undo(context?: CommandContext): void {
		if (!context || !this.storedInitialConfig) return;

		context.restoreClipConfiguration(this.clip, this.storedInitialConfig);

		context.setUpdatedClip(this.clip);

		const trackIndex = this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = clipsByTrack.indexOf(this.clip);

		context.emitEvent("clip:updated", {
			previous: { clip: this.storedFinalConfig, trackIndex, clipIndex },
			current: { clip: this.storedInitialConfig, trackIndex, clipIndex }
		});
	}
}
