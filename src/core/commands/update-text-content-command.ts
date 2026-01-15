import type { Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip, TextAsset } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

type ClipType = ResolvedClip;

export class UpdateTextContentCommand implements EditCommand {
	name = "updateTextContent";
	private previousText: string;

	constructor(
		private clip: Player,
		private newText: string,
		private initialConfig: ClipType
	) {
		const { asset } = this.clip.clipConfiguration;
		this.previousText = asset && "text" in asset ? ((asset as TextAsset).text ?? "") : "";
	}

	execute(context?: CommandContext): void {
		if (!context) throw new Error("UpdateTextContentCommand.execute: context is required");
		if (this.clip.clipConfiguration.asset && "text" in this.clip.clipConfiguration.asset) {
			(this.clip.clipConfiguration.asset as TextAsset).text = this.newText;

			const textSprite = (this.clip as any).text;
			if (textSprite) {
				textSprite.text = this.newText;
				(this.clip as any).positionText(this.clip.clipConfiguration.asset as TextAsset);
			}

			context.setUpdatedClip(this.clip);

			const trackIndex = this.clip.layer - 1;
			const clips = context.getClips();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip);

			// Sync text content to document (source of truth)
			context.documentUpdateClip(trackIndex, clipIndex, { asset: this.clip.clipConfiguration.asset });

			context.emitEvent(EditEvent.ClipUpdated, {
				previous: { clip: this.initialConfig, trackIndex, clipIndex },
				current: { clip: this.clip.clipConfiguration, trackIndex, clipIndex }
			});
		}
	}

	undo(context?: CommandContext): void {
		if (!context) throw new Error("UpdateTextContentCommand.undo: context is required");
		if (this.clip.clipConfiguration.asset && "text" in this.clip.clipConfiguration.asset) {
			(this.clip.clipConfiguration.asset as TextAsset).text = this.previousText;

			const textSprite = (this.clip as any).text;
			if (textSprite) {
				textSprite.text = this.previousText;
				(this.clip as any).positionText(this.clip.clipConfiguration.asset as TextAsset);
			}

			context.setUpdatedClip(this.clip);

			const trackIndex = this.clip.layer - 1;
			const clips = context.getClips();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip);

			// Sync restored text to document (source of truth)
			context.documentUpdateClip(trackIndex, clipIndex, { asset: this.clip.clipConfiguration.asset });

			context.emitEvent(EditEvent.ClipUpdated, {
				previous: { clip: this.clip.clipConfiguration, trackIndex, clipIndex },
				current: { clip: this.initialConfig, trackIndex, clipIndex }
			});
		}
	}
}
