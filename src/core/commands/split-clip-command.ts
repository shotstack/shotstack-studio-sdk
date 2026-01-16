import { EditEvent } from "@core/events/edit-events";
import { sec } from "@core/timing/types";
import type { AudioAsset, Clip, VideoAsset } from "@schemas";

import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess, CommandNoop } from "./types";

/**
 * Splits a clip at a specified time point.
 */
export class SplitClipCommand implements EditCommand {
	public readonly name = "SplitClip";
	private originalClipConfig: Clip | null = null;
	private rightClipId: string | null = null;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private splitTime: number // Time in seconds where to split
	) {}

	public execute(context: CommandContext): CommandResult {
		// Get the clip from document
		const document = context.getDocument();
		if (!document) throw new Error("Cannot split clip: no document");

		const clip = document.getClip(this.trackIndex, this.clipIndex);
		if (!clip) return CommandNoop(`No clip at ${this.trackIndex}/${this.clipIndex}`);

		// Get resolved timing for calculations
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		const clipStart = player?.clipConfiguration.start ?? 0;
		const clipLength = player?.clipConfiguration.length ?? 0;

		// Validate split point
		const MIN_CLIP_LENGTH = 0.1;
		const splitPoint = this.splitTime - clipStart;

		if (splitPoint <= MIN_CLIP_LENGTH || splitPoint >= clipLength - MIN_CLIP_LENGTH) {
			return CommandNoop("Split point too close to clip boundaries");
		}

		// Store original configuration for undo
		this.originalClipConfig = structuredClone(clip);

		// Calculate left clip length
		const leftLength = splitPoint;

		// Build right clip config
		const rightClip: Clip = structuredClone(clip);

		// Update timing - use "auto" for sequential positioning
		// The resolver will calculate actual values
		if (clip.start === "auto") {
			// Keep auto for left, right continues auto chain
			rightClip.start = "auto";
		} else {
			// Explicit start: left keeps original, right gets calculated position
			rightClip.start = sec(clipStart + splitPoint) as number;
		}

		// Calculate right clip length
		if (clip.length === "auto" || clip.length === "end") {
			// For auto/end, we need to adjust based on the split
			rightClip.length = sec(clipLength - splitPoint) as number;
		} else {
			rightClip.length = sec(clipLength - splitPoint) as number;
		}

		// Adjust trim values for video/audio assets
		if (clip.asset && (clip.asset.type === "video" || clip.asset.type === "audio")) {
			const originalTrim = (clip.asset as VideoAsset | AudioAsset).trim || 0;

			// Right clip needs trim = original trim + split point
			if (rightClip.asset && (rightClip.asset.type === "video" || rightClip.asset.type === "audio")) {
				(rightClip.asset as VideoAsset | AudioAsset).trim = originalTrim + splitPoint;
			}
		}

		// Document mutations
		// 1. Update left clip with new length
		context.documentUpdateClip(this.trackIndex, this.clipIndex, {
			length: sec(leftLength) as number
		});

		// 2. Add right clip after left
		const addedRightClip = context.documentAddClip(this.trackIndex, rightClip, this.clipIndex + 1);
		this.rightClipId = (addedRightClip as { id?: string }).id ?? null;

		// Resolve triggers reconciler → updates left Player, creates right Player
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.ClipSplit, {
			trackIndex: this.trackIndex,
			originalClipIndex: this.clipIndex,
			newClipIndex: this.clipIndex + 1
		});

		return CommandSuccess();
	}

	public undo(context: CommandContext): CommandResult {
		if (!this.originalClipConfig) return CommandNoop("No original clip config stored");

		// Document mutations
		// 1. Remove the right clip first (while indices are valid)
		context.documentRemoveClip(this.trackIndex, this.clipIndex + 1);

		// 2. Restore left clip to original configuration
		context.documentUpdateClip(this.trackIndex, this.clipIndex, this.originalClipConfig);

		// Resolve triggers reconciler → disposes right Player, updates left Player
		context.resolve();

		context.updateDuration();

		context.emitEvent(EditEvent.ClipDeleted, {
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex + 1
		});

		return CommandSuccess();
	}

	dispose(): void {
		this.originalClipConfig = null;
		this.rightClipId = null;
	}
}
