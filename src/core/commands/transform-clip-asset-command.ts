import type { MergeFieldBinding, Player } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import type { ResolvedClip } from "@schemas/clip";

import type { EditCommand, CommandContext } from "./types";

/**
 * Transforms a clip's asset type by recreating the player.
 * Used for luma attachment (image/video → luma) and detachment (luma → image/video).
 */
export class TransformClipAssetCommand implements EditCommand {
	public readonly name = "TransformClipAsset";

	private originalPlayer: Player | null = null;
	private originalConfig: ResolvedClip | null = null;
	private originalAssetType: "image" | "video" | "luma" | null = null;
	private originalBindings: Map<string, MergeFieldBinding> = new Map();
	private newPlayer: Player | null = null;
	private loadCompleted = false;

	constructor(
		private trackIndex: number,
		private clipIndex: number,
		private targetAssetType: "image" | "video" | "luma"
	) {}

	public execute(context: CommandContext): void {
		const player = context.getClipAt(this.trackIndex, this.clipIndex);
		if (!player?.clipConfiguration) {
			throw new Error("Cannot transform clip: invalid player");
		}

		// Store for undo - including original asset type for reliable restoration
		this.originalPlayer = player;
		this.originalConfig = { ...player.clipConfiguration };
		this.originalAssetType = (this.originalConfig.asset as { type?: string })?.type as "image" | "video" | "luma" ?? null;
		this.originalBindings = new Map(player.getMergeFieldBindings());
		this.loadCompleted = false;

		// Build new config with transformed asset type (only works for src-based assets)
		const originalAsset = this.originalConfig.asset as { src?: string };
		if (!originalAsset.src) {
			throw new Error("Cannot transform clip: asset has no src property");
		}

		const newConfig: ResolvedClip = {
			...this.originalConfig,
			asset: { type: this.targetAssetType, src: originalAsset.src }
		};

		// Create new player
		this.newPlayer = context.createPlayerFromAssetType(newConfig);
		if (!this.newPlayer) {
			throw new Error("Failed to create transformed player");
		}
		this.newPlayer.layer = this.trackIndex + 1;

		// Copy merge field bindings
		if (this.originalBindings.size > 0) {
			this.newPlayer.setInitialBindings(this.originalBindings);
		}

		// Replace in track array
		const track = context.getTrack(this.trackIndex);
		if (!track) throw new Error("Invalid track index");
		track[this.clipIndex] = this.newPlayer;

		// Replace in global clips array
		const clips = context.getClips();
		const globalIndex = clips.indexOf(this.originalPlayer);
		if (globalIndex !== -1) {
			clips[globalIndex] = this.newPlayer;
		}

		// Add to PIXI container and configure
		context.addPlayerToContainer(this.trackIndex, this.newPlayer);
		this.newPlayer.reconfigureAfterRestore();

		// Load async - only dispose original player AFTER successful load
		// This prevents race conditions if undo is triggered during load
		this.newPlayer
			.load()
			.then(() => {
				this.loadCompleted = true;
				if (this.newPlayer) {
					this.newPlayer.draw();
				}
				context.emitEvent(EditEvent.ClipUpdated, {
					previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.originalConfig! },
					current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: newConfig }
				});
				// Safe to dispose original player now that new one is loaded
				if (this.originalPlayer) {
					context.queueDisposeClip(this.originalPlayer);
				}
			})
			.catch(error => {
				console.error("Failed to load transformed clip:", error);
			});
	}

	public undo(context: CommandContext): void {
		if (!this.originalPlayer || !this.originalConfig) return;

		// Restore original player to arrays
		const track = context.getTrack(this.trackIndex);
		if (track && this.newPlayer) {
			track[this.clipIndex] = this.originalPlayer;
		}

		const clips = context.getClips();
		if (this.newPlayer) {
			const globalIndex = clips.indexOf(this.newPlayer);
			if (globalIndex !== -1) {
				clips[globalIndex] = this.originalPlayer;
			}
		}

		// Re-add original player to container
		context.addPlayerToContainer(this.trackIndex, this.originalPlayer);
		this.originalPlayer.reconfigureAfterRestore();
		this.originalPlayer.draw();

		// Queue new player for disposal (safe even if still loading)
		if (this.newPlayer) {
			context.queueDisposeClip(this.newPlayer);
		}

		context.emitEvent(EditEvent.ClipUpdated, {
			previous: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.newPlayer?.clipConfiguration! },
			current: { trackIndex: this.trackIndex, clipIndex: this.clipIndex, clip: this.originalConfig }
		});

		this.newPlayer = null;
	}

	/** Get the stored original asset type (used for reliable restoration) */
	public getOriginalAssetType(): "image" | "video" | "luma" | null {
		return this.originalAssetType;
	}

	/** Check if the async load has completed */
	public isLoadCompleted(): boolean {
		return this.loadCompleted;
	}
}
