/**
 * PlayerReconciler - Manages Player lifecycle based on ResolvedEdit state
 *
 * This is the approach to Player management:
 * - Commands mutate the Document
 * - Resolver produces ResolvedEdit
 * - Reconciler diffs ResolvedEdit against current Players
 * - Creates/updates/disposes Players to match resolved state
 */

import type { Player } from "@canvas/players/player";
import type { ResolvedClip, ResolvedEdit } from "@schemas";

import type { Edit } from "./edit-session";
import { EditEvent, InternalEvent } from "./events/edit-events";
import { isPendingAiAsset } from "./shared/ai-asset-utils";
import { assetTimingIdentitiesEqual, getAssetTimingIdentity } from "./timing/resolver";
import type { Seconds } from "./timing/types";

export interface ReconcileResult {
	created: string[];
	updated: string[];
	disposed: string[];
	pendingLoads: Promise<void>[];
}

/** Properties handled by dedicated checks in updatePlayer — skip in generic diff/patch */
const HANDLED_PROPS = new Set(["asset", "start", "length", "id"]);

export class PlayerReconciler {
	private isReconciling = false;

	/**
	 * When true, the reconciler handles all Player lifecycle:
	 * - Creates Players for new clip IDs
	 * - Disposes Players for removed clip IDs
	 * - Recreates Players when asset type changes
	 */
	private enableCreation = true;

	/** In-flight player load promises, so off-playback captures (captureFrame) can await asset readiness. */
	private readonly inFlightLoads = new Set<Promise<void>>();
	private readonly playerLoads = new WeakMap<Player, Set<Promise<void>>>();
	private isInitialReconcile = false;

	constructor(private readonly edit: Edit) {
		this.edit.getInternalEvents().on(InternalEvent.Resolved, this.onResolved);
	}

	private onResolved = ({ edit: resolved }: { edit: ResolvedEdit }): void => {
		this.reconcile(resolved);
	};

	/**
	 * Initial reconciliation - creates all players from ResolvedEdit.
	 *
	 * Called during load, before any players exist. This method:
	 * 1. Uses reconcile() to create all players
	 * 2. Waits for all player loads to complete
	 *
	 * @param resolved - The fully resolved edit state from the resolver
	 * @returns Promise that resolves when all players are loaded
	 */
	public async reconcileInitial(resolved: ResolvedEdit): Promise<ReconcileResult> {
		this.isInitialReconcile = true;
		try {
			const result = this.reconcile(resolved);
			await Promise.all(result.pendingLoads);
			return result;
		} finally {
			this.isInitialReconcile = false;
		}
	}

	/**
	 * Resolve once all in-flight player loads have settled. Player loads are asynchronous and, for
	 * newly created players, started fire-and-forget by reconcile()/the Resolved handler — so an
	 * off-playback capture taken right after loadEdit() can race them. captureFrame awaits this so it
	 * renders a loaded asset deterministically. Loops because a load can enqueue follow-up work.
	 */
	public async whenSettled(): Promise<void> {
		while (this.inFlightLoads.size > 0) {
			await Promise.allSettled([...this.inFlightLoads]);
		}
	}

	/** Wait for the current initial load or asset reload for one Player. */
	public async whenPlayerSettled(player: Player): Promise<void> {
		while (this.playerLoads.has(player)) {
			await Promise.allSettled([...(this.playerLoads.get(player) ?? [])]);
		}
	}

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
			return { created: [], updated: [], disposed: [], pendingLoads: [] };
		}

		this.isReconciling = true;

		try {
			const pendingLoads: Promise<void>[] = [];
			const result: ReconcileResult = {
				created: [],
				updated: [],
				disposed: [],
				pendingLoads
			};

			const resolvedClipIds = new Set<string>();

			// Pass 1 & 2: Create new Players, update existing
			for (let trackIndex = 0; trackIndex < resolved.timeline.tracks.length; trackIndex += 1) {
				const track = resolved.timeline.tracks[trackIndex];

				for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
					const clip = track.clips[clipIndex];
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
								pendingLoads.push(this.createPlayer(clip, clipId, trackIndex, clipIndex));
								result.disposed.push(clipId);
								result.created.push(clipId);
							} else if (updateResult) {
								result.updated.push(clipId);
							}
						} else if (this.enableCreation) {
							// Create new Player
							pendingLoads.push(this.createPlayer(clip, clipId, trackIndex, clipIndex));
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
	 * This is the optimised path for single-clip mutations. Instead of running
	 * a full reconcile() which processes ALL clips, this updates just ONE player.
	 *
	 * @param player - The player to update
	 * @param resolvedClip - The resolved clip state to sync to
	 * @param trackIndex - The track index (for track change detection)
	 * @param clipIndex - The clip index within the track (for error events)
	 * @returns true if changes were made, false if no changes, 'recreate' if asset type changed
	 */
	public updateSinglePlayer(player: Player, resolvedClip: ResolvedClip, trackIndex: number, clipIndex: number = 0): boolean | "recreate" {
		const result = this.updatePlayer(player, resolvedClip, trackIndex);

		// Handle asset type change (rare case - requires full recreation)
		if (result === "recreate") {
			const { clipId } = player;
			if (clipId) {
				this.disposePlayer(clipId);
				this.createPlayer(resolvedClip, clipId, trackIndex, clipIndex);
			}
			return "recreate";
		}

		return result;
	}

	/**
	 * Create a new Player for a clip.
	 */
	private createPlayer(clip: ResolvedClip, clipId: string, trackIndex: number, clipIndex: number): Promise<void> {
		const player = this.edit.createPlayerFromAssetType(clip);
		player.layer = trackIndex + 1;
		player.clipId = clipId;

		// Register in ID map
		this.edit.registerPlayerByClipId(clipId, player);

		// Add to tracks array (clips are derived from tracks)
		this.edit.addPlayerToTracksArray(trackIndex, player);

		// Add to PIXI container
		this.edit.addPlayerToContainer(trackIndex, player);

		// Load asynchronously
		const assetType = (clip.asset as { type?: string })?.type ?? "unknown";
		const loadPromise = player
			.load()
			.then(() => {
				// Emit PlayerLoaded for all players
				this.edit.getInternalEvents().emit(InternalEvent.PlayerLoaded, {
					player,
					trackIndex,
					clipIndex
				});

				// Also emit ClipUnresolved for AI assets awaiting generation
				if (isPendingAiAsset(clip.asset)) {
					this.edit.getInternalEvents().emit(EditEvent.ClipUnresolved, {
						trackIndex,
						clipIndex,
						assetType,
						clipId
					});
				}

				// Emit ClipUnresolved for players that need external resolution (e.g. alias captions)
				if (player.needsResolution) {
					this.edit.getInternalEvents().emit(EditEvent.ClipUnresolved, {
						trackIndex,
						clipIndex,
						assetType,
						clipId
					});
				}
			})
			.catch(error => {
				const errorMessage = error instanceof Error ? error.message : String(error);
				this.edit.getInternalEvents().emit(EditEvent.ClipLoadFailed, {
					trackIndex,
					clipIndex,
					error: errorMessage,
					assetType
				});
			});

		return this.trackPlayerLoad(player, loadPromise);
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

		if (currentAssetType !== newAssetType) return "recreate";

		// A pending-generation flip (prompt-only asset realised with src, or src
		// cleared back to prompt-only) changes the player class - recreate
		if (isPendingAiAsset(player.clipConfiguration.asset) !== isPendingAiAsset(clip.asset)) return "recreate";

		let changed = false;
		const currentTrackIndex = player.layer - 1;

		// Check timing changes
		const currentStart = player.clipConfiguration.start as Seconds;
		const currentLength = player.clipConfiguration.length as Seconds;

		if (currentStart !== clip.start || currentLength !== clip.length) {
			// Update resolved timing
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
		const currentRecord = current as Record<string, unknown>;
		const resolvedRecord = resolved as Record<string, unknown>;
		const allKeys = new Set([...Object.keys(currentRecord), ...Object.keys(resolvedRecord)]);

		for (const key of allKeys) {
			if (!HANDLED_PROPS.has(key) && JSON.stringify(currentRecord[key]) !== JSON.stringify(resolvedRecord[key])) {
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
		const allKeys = new Set([...Object.keys(playerConfig), ...Object.keys(clipRecord)]);

		for (const key of allKeys) {
			if (!HANDLED_PROPS.has(key)) {
				if (clipRecord[key] !== undefined) {
					playerConfig[key] = clipRecord[key];
				} else {
					delete playerConfig[key];
				}
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
	 * Update player's asset and trigger reload if the asset content changed.
	 */
	private updateAsset(player: Player, newAsset: unknown): void {
		const oldAsset = player.clipConfiguration.asset;
		const assetType = (newAsset as { type?: string })?.type;
		const intrinsicContentChanged = !assetTimingIdentitiesEqual(
			getAssetTimingIdentity(oldAsset),
			getAssetTimingIdentity(newAsset as ResolvedClip["asset"])
		);

		// eslint-disable-next-line no-param-reassign -- Intentional player state update
		player.clipConfiguration.asset = newAsset as ResolvedClip["asset"];

		let needsReload: boolean;
		if (assetType === "html5") {
			needsReload = JSON.stringify(oldAsset) !== JSON.stringify(newAsset);
		} else {
			needsReload = intrinsicContentChanged;
		}

		if (needsReload && player.reloadAsset) {
			const reloadPromise = player
				.reloadAsset()
				.then(() => {
					player.reconfigureAfterRestore();
				})
				.catch(error => {
					console.error("Failed to reload asset:", error);
				});
			this.trackPlayerLoad(player, reloadPromise);
		} else {
			player.reconfigureAfterRestore();
		}
	}

	private trackPlayerLoad(player: Player, loadPromise: Promise<void>): Promise<void> {
		this.inFlightLoads.add(loadPromise);
		let loads = this.playerLoads.get(player);
		if (!loads) {
			loads = new Set();
			this.playerLoads.set(player, loads);
		}
		loads.add(loadPromise);

		const cleanup = (): void => {
			this.inFlightLoads.delete(loadPromise);
			const currentLoads = this.playerLoads.get(player);
			currentLoads?.delete(loadPromise);
			if (currentLoads?.size === 0) {
				this.playerLoads.delete(player);
				const currentPlayer = player.clipId ? this.edit.getPlayerMap().get(player.clipId) : null;
				if (!this.isInitialReconcile && currentPlayer === player && player.getTimingIntent().length === "auto") {
					queueMicrotask(() => {
						if (player.clipId && this.edit.getPlayerMap().get(player.clipId) === player) {
							this.edit.resolveClipAutoLength(player).catch(error => {
								console.error("Failed to resolve auto clip timing:", error);
							});
						}
					});
				}
			}
		};
		loadPromise.then(cleanup, cleanup);
		return loadPromise;
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
		this.edit.getInternalEvents().off(InternalEvent.Resolved, this.onResolved);
	}
}
