import type { MergeFieldBinding, Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { sec, type Seconds } from "@core/timing/types";
import type { AudioAsset, ResolvedClip, VideoAsset } from "@schemas";

import type { EditCommand, CommandContext } from "./types";

export class SplitClipCommand implements EditCommand {
	public readonly name = "SplitClip";
	private originalClipConfig: ResolvedClip | null = null;
	private rightClipPlayer: Player | null = null;
	private splitSuccessful = false;
	private originalBindings: Map<string, MergeFieldBinding> = new Map();

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private splitTime: number // Time in seconds where to split
	) {}

	public execute(context: CommandContext): void {
		// Get the player to split
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player || !player.clipConfiguration) {
			throw new Error("Cannot split clip: invalid player or clip configuration");
		}

		const clipConfig = player.clipConfiguration;
		// clipConfig.start/length are Seconds branded types
		const clipStart: Seconds = clipConfig.start;
		const clipLength: Seconds = clipConfig.length;

		// Validate split point
		const MIN_CLIP_LENGTH = 0.1;
		const splitPoint = this.splitTime - clipStart;

		if (splitPoint <= MIN_CLIP_LENGTH || splitPoint >= clipLength - MIN_CLIP_LENGTH) {
			throw new Error("Cannot split clip: split point too close to clip boundaries");
		}

		// Store original configuration and bindings for undo
		this.originalClipConfig = { ...clipConfig };
		this.originalBindings = new Map(player.getMergeFieldBindings());

		// Calculate left and right clip configurations (use sec() for branded Seconds type)
		const leftClip: ResolvedClip = {
			...clipConfig,
			length: sec(splitPoint)
		};

		const rightClip: ResolvedClip = {
			...clipConfig,
			start: sec(clipStart + splitPoint),
			length: sec(clipLength - splitPoint)
		};

		// Deep clone assets to avoid shared references
		if (clipConfig.asset) {
			leftClip.asset = { ...clipConfig.asset };
			rightClip.asset = { ...clipConfig.asset };
		}

		// Adjust trim values for video/audio assets
		if (clipConfig.asset && (clipConfig.asset.type === "video" || clipConfig.asset.type === "audio")) {
			// The trim value indicates how much was trimmed from the start of the original asset
			const originalTrim = (clipConfig.asset as VideoAsset | AudioAsset).trim || 0;

			// Left clip keeps the original trim
			if (leftClip.asset && (leftClip.asset.type === "video" || leftClip.asset.type === "audio")) {
				(leftClip.asset as VideoAsset | AudioAsset).trim = originalTrim;
			}

			// Right clip needs trim = original trim + split point
			if (rightClip.asset && (rightClip.asset.type === "video" || rightClip.asset.type === "audio")) {
				(rightClip.asset as VideoAsset | AudioAsset).trim = originalTrim + splitPoint;
			}
		}

		// Update the existing clip to be the left portion
		Object.assign(player.clipConfiguration, leftClip);
		player.reconfigureAfterRestore();
		player.draw();

		// Create the right clip player
		this.rightClipPlayer = context.createPlayerFromAssetType(rightClip);
		if (!this.rightClipPlayer) {
			// Restore original if creation failed
			Object.assign(player.clipConfiguration, this.originalClipConfig);
			player.reconfigureAfterRestore();
			throw new Error("Failed to create right clip player");
		}

		this.rightClipPlayer.layer = this.trackIndex + 1;

		// Copy merge field bindings to right clip (both clips inherit same bindings)
		if (this.originalBindings.size > 0) {
			this.rightClipPlayer.setInitialBindings(this.originalBindings);
		}

		// Insert right clip after the current clip
		const track = context.getTrack(this.trackIndex);
		if (!track) {
			throw new Error("Invalid track index");
		}

		track.splice(this.clipIndex + 1, 0, this.rightClipPlayer);

		// Update global clips array
		const clips = context.getClips();
		const globalIndex = clips.indexOf(player);
		if (globalIndex !== -1) {
			clips.splice(globalIndex + 1, 0, this.rightClipPlayer);
		}

		// Add to PIXI container
		context.addPlayerToContainer(this.trackIndex, this.rightClipPlayer);

		// Configure and position the new player before loading
		this.rightClipPlayer.reconfigureAfterRestore();

		// Load the new player
		this.rightClipPlayer
			.load()
			.then(() => {
				this.splitSuccessful = true;
				// Draw the new player after loading
				if (this.rightClipPlayer) {
					this.rightClipPlayer.draw();
				}
				context.updateDuration();
				context.emitEvent(EditEvent.ClipSplit, {
					trackIndex: this.trackIndex,
					originalClipIndex: this.clipIndex,
					newClipIndex: this.clipIndex + 1
				});
			})
			.catch(error => {
				console.error("Failed to load split clip:", error);
				// Clean up will happen in undo if needed
			});
	}

	public undo(context: CommandContext): void {
		if (!this.originalClipConfig) {
			return;
		}

		// Get the left clip (original player)
		const leftPlayer = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!leftPlayer) {
			return;
		}

		// Restore original configuration
		Object.assign(leftPlayer.clipConfiguration, this.originalClipConfig);
		leftPlayer.reconfigureAfterRestore();

		// Remove the right clip if it was created
		if (this.rightClipPlayer) {
			const track = context.getTrack(this.trackIndex);
			if (track) {
				const rightIndex = track.indexOf(this.rightClipPlayer);
				if (rightIndex !== -1) {
					track.splice(rightIndex, 1);
				}
			}

			const clips = context.getClips();
			const globalIndex = clips.indexOf(this.rightClipPlayer);
			if (globalIndex !== -1) {
				clips.splice(globalIndex, 1);
			}

			// Queue for disposal
			context.queueDisposeClip(this.rightClipPlayer);
			this.rightClipPlayer = null;
		}

		context.updateDuration();
		// Emit ClipDeleted for the merged (removed) right clip
		context.emitEvent(EditEvent.ClipDeleted, {
			trackIndex: this.trackIndex,
			clipIndex: this.clipIndex + 1
		});
	}
}
