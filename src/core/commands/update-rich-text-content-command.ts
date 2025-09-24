import type { Player } from "@canvas/players/player";
import type { RichTextPlayer } from "@canvas/players/rich-text-player";
import type { ClipSchema } from "@schemas/clip";
import type { RichTextAsset } from "@schemas/rich-text-asset";
import type { z } from "zod";

import type { EditCommand, CommandContext } from "./types";

type ClipType = z.infer<typeof ClipSchema>;

export class UpdateRichTextContentCommand implements EditCommand {
	name = "updateRichTextContent";
	private previousText: string;
	private previousAsset: RichTextAsset;

	constructor(private clip: RichTextPlayer, private newText: string, private initialConfig: ClipType) {
		const { asset } = this.clip.clipConfiguration;
		this.previousText = asset && "text" in asset ? (asset as RichTextAsset).text : "";
		this.previousAsset = { ...(asset as RichTextAsset) };
	}

	execute(context?: CommandContext): void {
		if (!context) return;

		const richTextAsset = this.clip.clipConfiguration.asset as RichTextAsset;
		if (richTextAsset && richTextAsset.type === "rich-text") {
			// Update the asset
			richTextAsset.text = this.newText;

			// Update the player
			this.clip.updateTextContent(this.newText);

			context.setUpdatedClip(this.clip as Player);

			const trackIndex = this.clip.layer - 1;
			const clips = context.getClips();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip as Player);

			context.emitEvent("clip:updated", {
				previous: { clip: this.initialConfig, trackIndex, clipIndex },
				current: { clip: this.clip.clipConfiguration, trackIndex, clipIndex }
			});
		}
	}

	undo(context?: CommandContext): void {
		if (!context) return;

		const richTextAsset = this.clip.clipConfiguration.asset as RichTextAsset;
		if (richTextAsset && richTextAsset.type === "rich-text") {
			// Restore the asset
			Object.assign(richTextAsset, this.previousAsset);

			// Update the player
			this.clip.updateTextContent(this.previousText);

			context.setUpdatedClip(this.clip as Player);

			const trackIndex = this.clip.layer - 1;
			const clips = context.getClips();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip as Player);

			context.emitEvent("clip:updated", {
				previous: { clip: this.clip.clipConfiguration, trackIndex, clipIndex },
				current: { clip: this.initialConfig, trackIndex, clipIndex }
			});
		}
	}
}
