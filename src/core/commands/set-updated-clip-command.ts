import type { Player } from "@canvas/players/player";
import type { ResolvedClip } from "@schemas/clip";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

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

	async execute(context?: CommandContext): Promise<void> {
		if (!context) return;
		if (this.storedFinalConfig) {
			context.restoreClipConfiguration(this.clip, this.storedFinalConfig);
		}

		context.setUpdatedClip(this.clip);

		const trackIndex = this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = clipsByTrack.indexOf(this.clip);

		// Check if asset src changed
		const previousAsset = this.storedInitialConfig?.asset as { src?: string } | undefined;
		const currentAsset = this.storedFinalConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const intent = this.clip.getTimingIntent();
			if (intent.length === "auto") {
				await context.resolveClipAutoLength(this.clip);
			}
		}

		context.emitEvent("clip:updated", {
			previous: { clip: this.storedInitialConfig || this.initialClipConfig, trackIndex, clipIndex },
			current: { clip: this.storedFinalConfig || this.clip.clipConfiguration, trackIndex, clipIndex }
		});
	}

	async undo(context?: CommandContext): Promise<void> {
		if (!context || !this.storedInitialConfig) return;

		context.restoreClipConfiguration(this.clip, this.storedInitialConfig);

		context.setUpdatedClip(this.clip);

		const trackIndex = this.clip.layer - 1;
		const clips = context.getClips();
		const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
		const clipIndex = clipsByTrack.indexOf(this.clip);

		// Check if asset src changed (reverse direction)
		const previousAsset = this.storedFinalConfig?.asset as { src?: string } | undefined;
		const currentAsset = this.storedInitialConfig?.asset as { src?: string } | undefined;

		if (previousAsset?.src !== currentAsset?.src) {
			// Asset changed - if clip has "auto" length, re-resolve it
			const intent = this.clip.getTimingIntent();
			if (intent.length === "auto") {
				await context.resolveClipAutoLength(this.clip);
			}
		}

		context.emitEvent("clip:updated", {
			previous: { clip: this.storedFinalConfig, trackIndex, clipIndex },
			current: { clip: this.storedInitialConfig, trackIndex, clipIndex }
		});
	}
}
