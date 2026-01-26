/**
 * PlayerReconciler - Manages Player lifecycle based on ResolvedEdit state
 *
 * This is the "destination" approach to Player management:
 * - Commands mutate the Document
 * - Resolver produces ResolvedEdit
 * - Reconciler diffs ResolvedEdit against current Players
 * - Creates/updates/disposes Players to match resolved state
 *
 * Benefits:
 * - Single source of truth (Document)
 * - Commands become simple document mutations
 * - Undo/redo just restores document + resolve()
 * - No manual sync between document and Players
 */

import type { Player } from "@canvas/players/player";
import type { ResolvedClip, ResolvedEdit } from "@schemas";

import type { Edit } from "./edit-session";
import { InternalEvent } from "./events/edit-events";
import type { Seconds } from "./timing/types";

export interface ReconcileResult {
	created: string[];
	updated: string[];
	disposed: string[];
}

export class PlayerReconciler {
	private isReconciling = false;

	/**
	 * When true, the reconciler handles all Player lifecycle:
	 * - Creates Players for new clip IDs
	 * - Disposes Players for removed clip IDs
	 * - Recreates Players when asset type changes
	 */
	private enableCreation = true;

	constructor(private readonly edit: Edit) {
		// Subscribe to resolution events
		this.edit.events.on(InternalEvent.Resolved, this.onResolved);
	}

	private onResolved = ({ edit: resolved }: { edit: ResolvedEdit }): void => {
		this.reconcile(resolved);
	};

	/**
	 * Reconcile Players to match the ResolvedEdit.
	 *
	 * Four-pass algorithm:
	 * 1. Add new Players (clips in resolved but not in playerMap)
	 * 2. Update existing Players (timing, track, asset changes)
	 * 3. Dispose orphaned Players (in playerMap but not in resolved)
	 * 4. Sync track containers (add/remove empty containers - runs AFTER disposal)
	 */
	public reconcile(resolved: ResolvedEdit): ReconcileResult {
		if (this.isReconciling) {
			// Prevent recursive reconciliation
			return { created: [], updated: [], disposed: [] };
		}

		this.isReconciling = true;

		try {
			const result: ReconcileResult = {
				created: [],
				updated: [],
				disposed: []
			};

			const resolvedClipIds = new Set<string>();

			// Pass 1 & 2: Create new Players, update existing
			for (let trackIndex = 0; trackIndex < resolved.timeline.tracks.length; trackIndex += 1) {
				const track = resolved.timeline.tracks[trackIndex];

				for (const clip of track.clips) {
					const clipId = (clip as ResolvedClip & { id?: string }).id;
					if (clipId) {
						resolvedClipIds.add(clipId);

						const existingPlayer = this.edit.getPlayerByClipId(clipId);

						if (existingPlayer) {
							// Update existing Player
							const updateResult = this.updatePlayer(existingPlayer, clip, trackIndex);

							if (updateResult === "recreate") {
								// Asset type changed - dispose old and create new
								this.disposePlayer(clipId);
								this.createPlayer(clip, clipId, trackIndex);
								result.disposed.push(clipId);
								result.created.push(clipId);
							} else if (updateResult) {
								result.updated.push(clipId);
							}
						} else if (this.enableCreation) {
							// Create new Player
							this.createPlayer(clip, clipId, trackIndex);
							result.created.push(clipId);
						}
					}
				}
			}

			// Pass 3: Dispose orphaned Players
			const orphanedIds = this.findOrphanedPlayers(resolvedClipIds);
			for (const clipId of orphanedIds) {
				this.disposePlayer(clipId);
				result.disposed.push(clipId);
			}

			// Rebuild tracks array ordering to match resolved order
			// This handles both new/deleted players AND position changes within tracks
			if (result.created.length > 0 || result.disposed.length > 0 || result.updated.length > 0) {
				this.rebuildTracksOrdering(resolved);
			}

			// Sync track containers AFTER players are disposed and tracks rebuilt
			// This ensures empty tracks are correctly identified for removal
			this.syncTrackContainers(resolved.timeline.tracks.length);

			return result;
		} finally {
			this.isReconciling = false;
		}
	}

	/**
	 * Update a single player to match a resolved clip.
	 *
	 * This is the optimized path for single-clip mutations. Instead of running
	 * a full reconcile() which processes ALL clips, this updates just ONE player.
	 *
	 * Extracted from reconcile() logic for single-clip optimization in commands
	 * like resize-clip, update-timing, and transform-asset.
	 *
	 * @param player - The player to update
	 * @param resolvedClip - The resolved clip state to sync to
	 * @param trackIndex - The track index (for track change detection)
	 * @returns true if changes were made, false if no changes, 'recreate' if asset type changed
	 */
	public updateSinglePlayer(player: Player, resolvedClip: ResolvedClip, trackIndex: number): boolean | "recreate" {
		const result = this.updatePlayer(player, resolvedClip, trackIndex);

		// Handle asset type change (rare case - requires full recreation)
		if (result === "recreate") {
			const { clipId } = player;
			if (clipId) {
				this.disposePlayer(clipId);
				this.createPlayer(resolvedClip, clipId, trackIndex);
			}
			return "recreate";
		}

		return result;
	}

	/**
	 * Create a new Player for a clip.
	 */
	private createPlayer(clip: ResolvedClip, clipId: string, trackIndex: number): void {
		const player = this.edit.createPlayerFromAssetType(clip);
		player.layer = trackIndex + 1;
		player.clipId = clipId;

		// Register in ID map
		this.edit.registerPlayerByClipId(clipId, player);

		// Add to tracks array (clips are derived from tracks)
		this.edit.addPlayerToTracksArray(trackIndex, player);

		// Add to PIXI container
		this.edit.addPlayerToContainer(trackIndex, player);

		// Load asynchronously (non-blocking)
		player.load().catch(error => console.error(`Failed to load player for clip ${clipId}:`, error));
	}

	/**
	 * Update an existing Player to match resolved clip state.
	 * Returns true if any changes were made.
	 * Returns 'recreate' if the asset type changed and player needs recreation.
	 */
	private updatePlayer(player: Player, clip: ResolvedClip, trackIndex: number): boolean | "recreate" {
		// Check if asset type changed - requires full recreation
		const currentAssetType = (player.clipConfiguration.asset as { type?: string })?.type;
		const newAssetType = (clip.asset as { type?: string })?.type;

		if (currentAssetType !== newAssetType) {
			return "recreate";
		}

		let changed = false;
		const currentTrackIndex = player.layer - 1;

		// Check timing changes
		const currentStart = player.clipConfiguration.start as Seconds;
		const currentLength = player.clipConfiguration.length as Seconds;

		if (currentStart !== clip.start || currentLength !== clip.length) {
			// Update resolved timing (which also sets clipConfiguration.start/length)
			// Note: timingIntent is now read directly from document by player.getTimingIntent()
			player.setResolvedTiming({
				start: clip.start,
				length: clip.length
			});
			player.reconfigureAfterRestore();
			changed = true;
		}

		// Check track changes
		if (currentTrackIndex !== trackIndex) {
			// eslint-disable-next-line no-param-reassign -- Intentional player state update
			player.layer = trackIndex + 1;
			this.edit.movePlayerBetweenTracks(player, currentTrackIndex, trackIndex);
			changed = true;
		}

		// Check asset changes (property updates within same asset type)
		if (this.assetChanged(player.clipConfiguration.asset, clip.asset)) {
			this.updateAsset(player, clip.asset);
			changed = true;
		}

		// Check other clip configuration changes (position, offset, fit, opacity, etc.)
		if (this.clipPropertiesChanged(player.clipConfiguration, clip)) {
			this.updateClipProperties(player, clip);
			changed = true;
		}

		return changed;
	}

	/**
	 * Check if non-timing, non-asset clip properties changed.
	 */
	private clipPropertiesChanged(current: ResolvedClip, resolved: ResolvedClip): boolean {
		// Compare clip-level properties (not timing or asset)
		// Use type-safe keyof access for known Clip properties
		const currentRecord = current as Record<string, unknown>;
		const resolvedRecord = resolved as Record<string, unknown>;

		const propsToCheck = ["fit", "position", "offset", "opacity", "scale", "filter", "transition", "effect", "transform", "width", "height"];

		for (const prop of propsToCheck) {
			if (JSON.stringify(currentRecord[prop]) !== JSON.stringify(resolvedRecord[prop])) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Update player's clip-level properties from resolved clip.
	 */
	private updateClipProperties(player: Player, clip: ResolvedClip): void {
		const playerConfig = player.clipConfiguration as Record<string, unknown>;
		const clipRecord = clip as Record<string, unknown>;

		const propsToUpdate = ["fit", "position", "offset", "opacity", "scale", "filter", "transition", "effect", "transform", "width", "height"];

		for (const prop of propsToUpdate) {
			if (clipRecord[prop] !== undefined) {
				// eslint-disable-next-line no-param-reassign -- Intentional player state update
				playerConfig[prop] = clipRecord[prop];
			} else if (playerConfig[prop] !== undefined) {
				// Remove property if not in resolved clip
				// eslint-disable-next-line no-param-reassign -- Intentional player state update
				delete playerConfig[prop];
			}
		}

		player.reconfigureAfterRestore();
	}

	/**
	 * Check if asset properties changed (excluding type, which is handled separately).
	 */
	private assetChanged(current: unknown, resolved: unknown): boolean {
		return JSON.stringify(current) !== JSON.stringify(resolved);
	}

	/**
	 * Update player's asset and trigger reload if src changed.
	 */
	private updateAsset(player: Player, newAsset: unknown): void {
		const oldSrc = (player.clipConfiguration.asset as { src?: string })?.src;
		const newSrc = (newAsset as { src?: string })?.src;

		// Update the asset
		// eslint-disable-next-line no-param-reassign -- Intentional player state update
		player.clipConfiguration.asset = newAsset as ResolvedClip["asset"];

		// If src changed, trigger async reload
		if (oldSrc !== newSrc && player.reloadAsset) {
			player
				.reloadAsset()
				.then(() => {
					player.reconfigureAfterRestore();
				})
				.catch(error => {
					console.error("Failed to reload asset:", error);
				});
		} else {
			player.reconfigureAfterRestore();
		}
	}

	/**
	 * Sync PIXI track containers to match resolved track count.
	 * Creates new containers for added tracks, removes empty containers for deleted tracks.
	 */
	private syncTrackContainers(newTrackCount: number): void {
		const currentTrackCount = this.edit.getTracks().length;

		if (newTrackCount > currentTrackCount) {
			// Add new track containers and expand tracks array
			for (let i = currentTrackCount; i < newTrackCount; i += 1) {
				this.edit.ensureTrackExists(i);
			}
		} else if (newTrackCount < currentTrackCount) {
			// Remove empty track containers and shrink tracks array
			for (let i = currentTrackCount - 1; i >= newTrackCount; i -= 1) {
				this.edit.removeEmptyTrack(i);
			}
		}
	}

	/**
	 * Find Players that exist in the map but not in resolved clips.
	 */
	private findOrphanedPlayers(resolvedClipIds: Set<string>): string[] {
		const orphaned: string[] = [];

		for (const [clipId] of this.edit.getPlayerMap()) {
			if (!resolvedClipIds.has(clipId)) {
				orphaned.push(clipId);
			}
		}

		return orphaned;
	}

	/**
	 * Dispose a Player by its clip ID.
	 */
	private disposePlayer(clipId: string): void {
		const player = this.edit.getPlayerByClipId(clipId);
		if (!player) return;

		// Remove from ID map
		this.edit.unregisterPlayerByClipId(clipId);

		// Queue for disposal (handles PIXI cleanup, tracks array, etc.)
		this.edit.queuePlayerForDisposal(player);
	}

	/**
	 * Rebuild the tracks array ordering to match resolved order.
	 */
	private rebuildTracksOrdering(resolved: ResolvedEdit): void {
		// Clear existing tracks
		const tracks = this.edit.getTracks();
		for (let i = 0; i < tracks.length; i += 1) {
			tracks[i] = [];
		}

		// Rebuild from resolved order
		for (let trackIndex = 0; trackIndex < resolved.timeline.tracks.length; trackIndex += 1) {
			while (tracks.length <= trackIndex) {
				tracks.push([]);
			}

			for (const clip of resolved.timeline.tracks[trackIndex].clips) {
				const clipId = (clip as ResolvedClip & { id?: string }).id;
				if (clipId) {
					const player = this.edit.getPlayerByClipId(clipId);
					if (player) {
						tracks[trackIndex].push(player);
					}
				}
			}
		}
	}

	/**
	 * Clean up event subscriptions.
	 */
	public dispose(): void {
		this.edit.events.off(InternalEvent.Resolved, this.onResolved);
	}
}
