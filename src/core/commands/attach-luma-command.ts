import { EditEvent } from "@core/events/edit-events";
import { stripInternalProperties } from "@core/shared/clip-utils";
import { type Seconds } from "@core/timing/types";

import { TransformClipAssetCommand } from "./transform-clip-asset-command";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Compound command that attaches a luma mask to a content clip atomically.
 */
export class AttachLumaCommand implements EditCommand {
	readonly name = "attachLuma";

	private transformCommand: TransformClipAssetCommand;
	private wasExecuted = false;

	// Store state for undo
	private lumaClipId: string | null = null;
	private contentClipId: string | null = null;
	private originalLumaStart: Seconds | null = null;
	private originalLumaLength: Seconds | null = null;

	constructor(
		private readonly lumaTrackIndex: number,
		private readonly lumaClipIndex: number,
		private readonly contentTrackIndex: number,
		private readonly contentClipIndex: number
	) {
		// Pre-create transform command
		this.transformCommand = new TransformClipAssetCommand(lumaTrackIndex, lumaClipIndex, "luma");
	}

	execute(context?: CommandContext): CommandResult {
		if (!context) throw new Error("AttachLumaCommand requires context");

		// 1. Get references BEFORE transformation
		const contentPlayer = context.getClipAt(this.contentTrackIndex, this.contentClipIndex);
		const lumaPlayerBefore = context.getClipAt(this.lumaTrackIndex, this.lumaClipIndex);

		if (!contentPlayer || !lumaPlayerBefore) {
			return CommandNoop("Clips not found");
		}

		// Store for undo
		this.contentClipId = contentPlayer.clipId;
		this.originalLumaStart = lumaPlayerBefore.getStart();
		this.originalLumaLength = lumaPlayerBefore.getLength();

		// Capture document clip BEFORE mutations (for event emission)
		const previousDocClip = structuredClone(context.getDocumentClip(this.lumaTrackIndex, this.lumaClipIndex));

		// 2. Transform to luma type
		this.transformCommand.execute(context);

		// 3. Get NEW luma player after transformation (clipId changes during asset type transformation!)
		const lumaPlayerAfter = context.getClipAt(this.lumaTrackIndex, this.lumaClipIndex);
		if (!lumaPlayerAfter) {
			throw new Error("Luma player not found after transformation");
		}

		this.lumaClipId = lumaPlayerAfter.clipId;

		// 4. Establish relationship
		if (!this.lumaClipId || !this.contentClipId) {
			throw new Error("Failed to capture clip IDs for luma attachment");
		}
		const edit = context.getEditSession();
		edit.setLumaContentRelationship(this.lumaClipId, this.contentClipId);

		// 5. Sync timing: luma matches content
		lumaPlayerAfter.setResolvedTiming({
			start: contentPlayer.getStart(),
			length: contentPlayer.getLength()
		});
		lumaPlayerAfter.reconfigureAfterRestore();

		// 6. Update document
		context.documentUpdateClip(this.lumaTrackIndex, this.lumaClipIndex, {
			start: contentPlayer.getStart(),
			length: contentPlayer.getLength()
		});

		// 7. Resolve to reconcile players and emit event
		context.resolve();

		// Emit ClipUpdated event for the luma clip (it changed from image/video → luma + synced timing)
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

		// Capture document clip BEFORE undo (for event emission)
		const previousDocClip = structuredClone(context.getDocumentClip(this.lumaTrackIndex, this.lumaClipIndex));

		// 1. Clear relationship FIRST
		if (this.lumaClipId) {
			const edit = context.getEditSession();
			edit.clearLumaContentRelationship(this.lumaClipId);
		}

		// 2. Restore original timing
		if (this.originalLumaStart !== null && this.originalLumaLength !== null) {
			const lumaPlayer = context.getClipAt(this.lumaTrackIndex, this.lumaClipIndex);
			if (lumaPlayer) {
				lumaPlayer.setResolvedTiming({
					start: this.originalLumaStart,
					length: this.originalLumaLength
				});
				lumaPlayer.reconfigureAfterRestore();
			}

			context.documentUpdateClip(this.lumaTrackIndex, this.lumaClipIndex, {
				start: this.originalLumaStart,
				length: this.originalLumaLength
			});
		}

		// 3. Undo transformation (luma → original type)
		this.transformCommand.undo(context);

		// 4. Resolve
		context.resolve();

		// Emit ClipUpdated event for restored clip
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
		this.lumaClipId = null;
		this.contentClipId = null;
		this.originalLumaStart = null;
		this.originalLumaLength = null;
	}
}
