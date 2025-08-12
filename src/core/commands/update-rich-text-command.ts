import type { EditCommand, CommandContext } from "./types";
import type { RichTextAsset } from "../schemas/rich-text-asset";
import { RichTextPlayer } from "../../components/canvas/players/rich-text-player";

export interface UpdateRichTextCommandParams {
	trackIndex: number;
	clipIndex: number;
	updates: Partial<RichTextAsset>;
}

export class UpdateRichTextCommand implements EditCommand {
	public readonly name = "UpdateRichText";
	private params: UpdateRichTextCommandParams;
	private previousState: RichTextAsset | null = null;

	constructor(params: UpdateRichTextCommandParams) {
		this.params = params;
	}

	execute(context: CommandContext): void {
		const player = context.getClipAt(this.params.trackIndex, this.params.clipIndex);

		if (!player) {
			throw new Error(`Clip at track ${this.params.trackIndex}, index ${this.params.clipIndex} not found`);
		}

		if (!(player instanceof RichTextPlayer)) {
			throw new Error("Clip is not a rich-text player");
		}

		const asset = player.clipConfiguration.asset;
		if (!this.isRichTextAsset(asset)) {
			throw new Error("Clip asset is not rich-text type");
		}

		this.previousState = { ...asset };

		Object.assign(asset, this.params.updates);

		player.updateStyle(this.params.updates);

		context.emitEvent("clip:updated", {
			trackIndex: this.params.trackIndex,
			clipIndex: this.params.clipIndex,
			clip: player.clipConfiguration
		});
	}

	undo(context: CommandContext): void {
		if (!this.previousState) return;

		const player = context.getClipAt(this.params.trackIndex, this.params.clipIndex);

		if (!player || !(player instanceof RichTextPlayer)) return;

		player.clipConfiguration.asset = this.previousState;

		player.updateStyle(this.previousState);

		context.emitEvent("clip:updated", {
			trackIndex: this.params.trackIndex,
			clipIndex: this.params.clipIndex,
			clip: player.clipConfiguration
		});
	}

	private isRichTextAsset(asset: any): asset is RichTextAsset {
		return asset && asset.type === "rich-text";
	}
}
