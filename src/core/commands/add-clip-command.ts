import type { Edit } from "@core/edit";
import { ClipSchema } from "@schemas/clip";
import type { z } from "zod";

type ClipType = z.infer<typeof ClipSchema>;
type EditCommand = { execute(): void | Promise<void>; name: string };

export class AddClipCommand implements EditCommand {
	name = "addClip";

	constructor(
		private edit: Edit,
		private trackIdx: number,
		private clip: ClipType
	) {}

	async execute(): Promise<void> {
		const validatedClip = ClipSchema.parse(this.clip);
		const clipPlayer = this.edit.createPlayerFromAssetTypeForCommand(validatedClip);
		clipPlayer.layer = this.trackIdx + 1;
		await this.edit.addPlayerForCommand(this.trackIdx, clipPlayer);
		this.edit.updateTotalDurationForCommand();
	}
}
