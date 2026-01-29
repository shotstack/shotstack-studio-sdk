import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";

import { TransformClipAssetCommand } from "./transform-clip-asset-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Command that detaches a luma mask from a content clip.
 */
export class DetachLumaCommand implements EditCommand {
	readonly name = "detachLuma";

	private transformCommand: TransformClipAssetCommand;
	private wasExecuted = false;
	private storedContentClipId: string | null = null;

	constructor(
		private readonly lumaTrackIndex: number,
		private readonly lumaClipIndex: number,
		private readonly targetAssetType: "image" | "video"
	) {
		this.transformCommand = new TransformClipAssetCommand(lumaTrackIndex, lumaClipIndex, targetAssetType);
	}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("DetachLumaCommand requires context");

		const lumaPlayer = context.getClipAt(this.lumaTrackIndex, this.lumaClipIndex);
		if (!lumaPlayer?.clipId) {
			return CommandNoop("Luma clip not found");
		}

		// Capture document clip BEFORE mutations (for event emission)
		const previousDocClip = structuredClone(context.getDocumentClip(this.lumaTrackIndex, this.lumaClipIndex));

		// Store relationship for undo
		const edit = context.getEditSession();
		this.storedContentClipId = edit.getLumaContentRelationship(lumaPlayer.clipId) ?? null;

		// Clear relationship
		edit.clearLumaContentRelationship(lumaPlayer.clipId);

		// Transform back to original type
		this.transformCommand.execute(context);

		// Resolve
		context.resolve();

		// Emit ClipUpdated event
		const currentDocClip = context.getDocumentClip(this.lumaTrackIndex, this.lumaClipIndex);
		if (previousDocClip && currentDocClip) {
			context.emitEvent(EditEvent.ClipUpdated, {
				previous: {
					trackIndex: this.lumaTrackIndex,
					clipIndex: this.lumaClipIndex,
					clip: stripInternalProperties(previousDocClip)
				},
				current: {
					trackIndex: this.lumaTrackIndex,
					clipIndex: this.lumaClipIndex,
					clip: stripInternalProperties(currentDocClip)
				}
			});
		}

		this.wasExecuted = true;
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		if (!this.wasExecuted || !context) {
			return CommandNoop("Command was not executed");
		}

		// Capture document clip BEFORE undo
		const previousDocClip = structuredClone(context.getDocumentClip(this.lumaTrackIndex, this.lumaClipIndex));

		// Undo transformation (back to luma)
		this.transformCommand.undo(context);

		// Restore relationship
		if (this.storedContentClipId) {
			const lumaPlayer = context.getClipAt(this.lumaTrackIndex, this.lumaClipIndex);
			if (lumaPlayer?.clipId) {
				const edit = context.getEditSession();
				edit.setLumaContentRelationship(lumaPlayer.clipId, this.storedContentClipId);
			}
		}

		// Resolve
		context.resolve();

		// Emit ClipUpdated event
		const restoredDocClip = context.getDocumentClip(this.lumaTrackIndex, this.lumaClipIndex);
		if (previousDocClip && restoredDocClip) {
			context.emitEvent(EditEvent.ClipUpdated, {
				previous: {
					trackIndex: this.lumaTrackIndex,
					clipIndex: this.lumaClipIndex,
					clip: stripInternalProperties(previousDocClip)
				},
				current: {
					trackIndex: this.lumaTrackIndex,
					clipIndex: this.lumaClipIndex,
					clip: stripInternalProperties(restoredDocClip)
				}
			});
		}

		this.wasExecuted = false;
		return CommandSuccess();
	}

	dispose(): void {
		this.transformCommand.dispose?.();
		this.storedContentClipId = null;
	}
}
