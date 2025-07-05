import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit";
import type { ClipSchema } from "@schemas/clip";
import type { TextAsset } from "@schemas/text-asset";
import type { z } from "zod";

type ClipType = z.infer<typeof ClipSchema>;
type EditCommand = { execute(): void | Promise<void>; name: string };

export class UpdateTextContentCommand implements EditCommand {
	name = "updateTextContent";

	constructor(
		private edit: Edit,
		private clip: Player,
		private newText: string,
		private initialConfig: ClipType
	) {}

	execute(): void {
		if (this.clip.clipConfiguration.asset && "text" in this.clip.clipConfiguration.asset) {
			(this.clip.clipConfiguration.asset as TextAsset).text = this.newText;

			const textSprite = (this.clip as any).text;
			if (textSprite) {
				textSprite.text = this.newText;
				(this.clip as any).positionText(this.clip.clipConfiguration.asset as TextAsset);
			}

			this.edit.setUpdatedClipForCommand(this.clip);

			const trackIndex = this.clip.layer - 1;
			const clips = this.edit.getClipsForCommand();
			const clipsByTrack = clips.filter((c: Player) => c.layer === this.clip.layer);
			const clipIndex = clipsByTrack.indexOf(this.clip);

			this.edit.events.emit("clip:updated", {
				previous: { clip: this.initialConfig, trackIndex, clipIndex },
				current: { clip: this.clip.clipConfiguration, trackIndex, clipIndex }
			});
		}
	}
}
