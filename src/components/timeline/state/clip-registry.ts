import { Player } from "@canvas/players/player";
import { Edit } from "@core/edit";
import * as PIXI from "pixi.js";

import { TimelineClip } from "../rendering/timeline-clip";
import { ITimelineState, ITimeline } from "../types/timeline.interfaces";
import { RegisteredClip } from "../types/timeline.types";

import { ClipIdentityService } from "./identity-service";

/**
 * Sync delta types for tracking changes between Edit and Timeline state
 */
export interface ClipDelta {
	id: string;
	player: Player;
	trackIndex: number;
	clipIndex: number;
	visual?: TimelineClip;
}

export interface SyncDelta {
	added: ClipDelta[];
	moved: ClipDelta[];
	removed: ClipDelta[];
	updated: ClipDelta[];
}

/**
 * Core Timeline component responsible for managing clip state synchronization.
 * Maintains a registry of clips with stable IDs and handles synchronization
 * between Edit state and Timeline visual state.
 */
export class ClipRegistryManager {
	private identityService: ClipIdentityService;
	private syncScheduled = false;
	private syncFrameId: number | null = null;
	private timeline: ITimeline | null = null; // Timeline reference will be set after construction
	private playerToClipId = new WeakMap<Player, string>(); // Moved from state for serializability

	private static readonly SYNC_EVENT_NAMES = {
		SYNCED: "timeline:registrySynced",
		ERROR: "timeline:registrySyncError"
	} as const;

	// Event handlers
	private readonly eventHandlers = {
		"clip:updated": () => this.scheduleSync(),
		"clip:deleted": () => this.scheduleSync(),
		"track:deleted": () => this.scheduleSync()
	};

	constructor(
		private state: ITimelineState,
		private edit: Edit
	) {
		this.identityService = new ClipIdentityService();
		this.initializeRegistry();
		this.setupEventListeners();
	}

	private initializeRegistry(): void {
		const currentState = this.state.getState();
		if (!currentState.clipRegistry) {
			this.state.update({
				clipRegistry: {
					clips: new Map(),
					trackIndex: new Map(),
					generation: 0
				}
			});
		}
	}

	/**
	 * Set the Timeline reference (called after Timeline construction)
	 */
	public setTimeline(timeline: ITimeline): void {
		this.timeline = timeline;
	}

	private setupEventListeners(): void {
		Object.entries(this.eventHandlers).forEach(([event, handler]) => {
			this.edit.events.on(event, handler);
		});
	}

	/**
	 * Schedule a sync operation using requestAnimationFrame to batch updates
	 */
	public scheduleSync(): void {
		if (this.syncScheduled) return;

		this.syncScheduled = true;
		this.syncFrameId = requestAnimationFrame(async () => {
			this.syncScheduled = false;
			this.syncFrameId = null;
			await this.syncWithEdit();
		});
	}

	/**
	 * Core sync logic - computes delta between Edit state and registry, then applies changes
	 */
	public async syncWithEdit(): Promise<void> {
		const registryState = this.state.getState().clipRegistry;
		const currentGeneration = registryState.generation;

		try {
			// Compute delta between Edit state and registry
			const delta = this.computeDelta();

			// Apply delta if there are any changes
			if (delta.added.length > 0 || delta.moved.length > 0 || delta.removed.length > 0 || delta.updated.length > 0) {
				await this.applyDelta(delta);

				// Update generation counter
				this.state.update({
					clipRegistry: {
						...this.state.getState().clipRegistry,
						generation: currentGeneration + 1
					}
				});
			}

			// Emit sync event
			this.edit.events.emit(ClipRegistryManager.SYNC_EVENT_NAMES.SYNCED, {
				generation: currentGeneration + 1,
				delta: {
					added: delta.added.length,
					moved: delta.moved.length,
					removed: delta.removed.length,
					updated: delta.updated.length
				}
			});
		} catch (error) {
			console.error("Error during registry sync:", error);
			this.edit.events.emit(ClipRegistryManager.SYNC_EVENT_NAMES.ERROR, {
				generation: currentGeneration,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Get stable ID for a clip at given position
	 */
	public getClipIdAtPosition(trackIndex: number, clipIndex: number): string | null {
		const registryState = this.state.getState().clipRegistry;

		// First check registry
		for (const [clipId, clip] of registryState.clips) {
			if (clip.trackIndex === trackIndex && clip.clipIndex === clipIndex) {
				return clipId;
			}
		}

		// Check player
		const player = this.edit.getPlayerClip(trackIndex, clipIndex);
		if (!player) return null;

		return this.playerToClipId.get(player) ?? this.generateAndStoreClipId(player);
	}

	private generateAndStoreClipId(player: Player): string {
		const clipId = this.identityService.generateClipId(player);
		this.playerToClipId.set(player, clipId);
		return clipId;
	}

	/**
	 * Find clip by its stable ID
	 */
	public findClipById(clipId: string): RegisteredClip | null {
		const registryState = this.state.getState().clipRegistry;
		return registryState.clips.get(clipId) || null;
	}

	/**
	 * Find a clip by its PIXI container
	 * More efficient container-based lookup
	 */
	public findClipByContainer(container: PIXI.Container): RegisteredClip | null {
		const registryState = this.state.getState().clipRegistry;

		// Walk up the display hierarchy to find a clip container
		let current: PIXI.Container | null = container;
		while (current) {
			for (const [, clip] of registryState.clips) {
				if (clip.visual?.getContainer() === current) {
					return clip;
				}
			}
			current = current.parent;
		}

		return null;
	}

	/**
	 * Register a clip in the registry
	 * This will be used during sync operations
	 */
	public registerClip(clipId: string, visual: TimelineClip, player: Player, trackIndex: number, clipIndex: number): void {
		const registeredClip: RegisteredClip = {
			id: clipId,
			visual,
			trackIndex,
			clipIndex,
			playerSignature: this.identityService.getPlayerSignature(player),
			lastSeen: Date.now()
		};

		this.playerToClipId.set(player, clipId);
		this.modifyClipInRegistry(clipId, "add", registeredClip);
	}

	/**
	 * Unregister a clip from the registry
	 */
	public unregisterClip(clipId: string): void {
		this.modifyClipInRegistry(clipId, "remove");
	}

	private modifyClipInRegistry(clipId: string, action: "add" | "remove", registeredClip?: RegisteredClip): void {
		const registryState = this.state.getState().clipRegistry;
		const newClips = new Map(registryState.clips);
		const newTrackIndex = new Map(registryState.trackIndex);

		if (action === "remove") {
			const clip = newClips.get(clipId);
			if (!clip) return;

			newClips.delete(clipId);
			const trackClips = newTrackIndex.get(clip.trackIndex);
			if (trackClips) {
				trackClips.delete(clipId);
				if (trackClips.size === 0) {
					newTrackIndex.delete(clip.trackIndex);
				}
			}
		} else if (registeredClip) {
			newClips.set(clipId, registeredClip);
			const trackClips = newTrackIndex.get(registeredClip.trackIndex) || new Set<string>();
			trackClips.add(clipId);
			newTrackIndex.set(registeredClip.trackIndex, trackClips);
		}

		this.updateRegistryState({ clips: newClips, trackIndex: newTrackIndex });
	}

	private updateRegistryState(updates: Partial<ReturnType<typeof this.state.getState>["clipRegistry"]>): void {
		const current = this.state.getState().clipRegistry;
		this.state.update({
			clipRegistry: {
				...current,
				...updates,
				generation: current.generation + 1
			}
		});
	}

	/**
	 * Compute delta between Edit state and current registry state
	 */
	private computeDelta(): SyncDelta {
		const delta: SyncDelta = {
			added: [],
			moved: [],
			removed: [],
			updated: []
		};

		const registryState = this.state.getState().clipRegistry;
		const seenClipIds = new Set<string>();

		// Process all tracks
		this.edit.getEdit().timeline.tracks.forEach((track, trackIndex) => {
			track?.clips?.forEach((clip, clipIndex) => {
				if (clip) {
					this.processClipForDelta(trackIndex, clipIndex, registryState, delta, seenClipIds);
				}
			});
		});

		// Find removed clips
		this.findRemovedClips(registryState, seenClipIds, delta);

		return delta;
	}

	private processClipForDelta(
		trackIndex: number,
		clipIndex: number,
		registryState: ReturnType<typeof this.state.getState>["clipRegistry"],
		delta: SyncDelta,
		seenClipIds: Set<string>
	): void {
		const player = this.getPlayerForClip(trackIndex, clipIndex);
		if (!player) return;

		let clipId = this.playerToClipId.get(player);
		const existingClip = clipId ? registryState.clips.get(clipId) : null;

		if (!existingClip) {
			clipId = this.identityService.generateClipId(player);
			delta.added.push({ id: clipId, player, trackIndex, clipIndex });
		} else if (existingClip.trackIndex !== trackIndex || existingClip.clipIndex !== clipIndex) {
			delta.moved.push({
				id: clipId!,
				player,
				trackIndex,
				clipIndex,
				visual: existingClip.visual
			});
		} else if (this.isClipUpdated(existingClip, player, trackIndex, clipIndex)) {
			delta.updated.push({
				id: clipId!,
				player,
				trackIndex,
				clipIndex,
				visual: existingClip.visual
			});
		}

		if (clipId) {
			seenClipIds.add(clipId);
		}
	}

	private findRemovedClips(registryState: ReturnType<typeof this.state.getState>["clipRegistry"], seenClipIds: Set<string>, delta: SyncDelta): void {
		for (const [clipId, registeredClip] of registryState.clips) {
			if (!seenClipIds.has(clipId)) {
				delta.removed.push({
					id: clipId,
					player: null as unknown as Player,
					trackIndex: registeredClip.trackIndex,
					clipIndex: registeredClip.clipIndex,
					visual: registeredClip.visual
				});
			}
		}
	}

	/**
	 * Apply computed delta to update visual state
	 */
	private async applyDelta(delta: SyncDelta): Promise<void> {
		// Check if Timeline reference is available
		if (!this.timeline) {
			console.warn("Timeline reference not available for visual sync");
			return;
		}

		// Process removed clips first to free up resources
		for (const removed of delta.removed) {
			if (removed.visual) {
				// Remove from parent track
				const track = this.timeline.getRenderer().getTrackByIndex(removed.trackIndex);
				if (track) {
					track.removeClip(removed.id);
				}
				// Dispose the visual
				removed.visual.dispose();
			}
			// Unregister from registry
			this.unregisterClip(removed.id);
		}

		// Process moved clips (reuse visuals)
		for (const moved of delta.moved) {
			if (moved.visual) {
				// Get current registration before updating
				const currentReg = this.findClipById(moved.id);
				if (currentReg) {
					// Handle cross-track moves
					if (currentReg.trackIndex !== moved.trackIndex) {
						this.moveClipBetweenTracks(moved.id, currentReg.trackIndex, moved.trackIndex);
					}

					// Update clip properties from Edit state
					const editClip = this.edit.getClip(moved.trackIndex, moved.clipIndex);
					if (editClip) {
						moved.visual.setStart(editClip.start || 0);
						moved.visual.setDuration(editClip.length || 1);
					}

					// Update registry with new position
					this.updateClipPosition(moved.id, moved.trackIndex, moved.clipIndex);
				}
			}
		}

		// Process added clips (create new visuals)
		for (const added of delta.added) {
			// Get the edit clip data
			const editClip = this.edit.getClip(added.trackIndex, added.clipIndex);
			if (editClip) {
				// Create visual clip
				const { TimelineClip: TimelineClipClass } = await import("../rendering/timeline-clip");
				const trackId = `track-${added.trackIndex}`;
				const visual = new TimelineClipClass(added.id, trackId, editClip.start || 0, editClip.length || 1, editClip);

				// Load the visual
				await visual.load();

				// Set zoom level
				const { zoom } = this.state.getState().viewport;
				visual.setPixelsPerSecond(zoom);

				// Add to track
				const track = this.timeline.getRenderer().getTrackByIndex(added.trackIndex);
				if (track) {
					track.addClip(visual);
				}

				// Register with visual
				this.registerClip(added.id, visual, added.player, added.trackIndex, added.clipIndex);
			}
		}

		// Process updated clips (refresh visuals)
		for (const updated of delta.updated) {
			if (updated.visual) {
				// Update visual with new clip data
				const editClip = this.edit.getClip(updated.trackIndex, updated.clipIndex);
				if (editClip) {
					updated.visual.setClipData(editClip);
					updated.visual.setStart(editClip.start || 0);
					updated.visual.setDuration(editClip.length || 1);
					updated.visual.draw();
				}

				// Update signature
				const newSignature = this.identityService.getPlayerSignature(updated.player);
				this.updateClipSignature(updated.id, newSignature);
			}
		}

		// Animation loop will handle rendering
	}

	/**
	 * Get Player instance for a clip at given position
	 */
	private getPlayerForClip(trackIndex: number, clipIndex: number): Player | null {
		// Use Edit's getPlayerClip method to access the Player instance
		return this.edit.getPlayerClip(trackIndex, clipIndex);
	}

	/**
	 * Check if a clip needs updating based on signature or position changes
	 */
	private isClipUpdated(existingClip: RegisteredClip, player: Player, trackIndex: number, clipIndex: number): boolean {
		// Check signature change
		const newSignature = this.identityService.getPlayerSignature(player);
		if (existingClip.playerSignature !== newSignature) {
			return true;
		}

		// Check position change
		const editClip = this.edit.getClip(trackIndex, clipIndex);
		if (editClip && existingClip.visual) {
			const currentStart = existingClip.visual.getStartTime();
			const newStart = editClip.start || 0;
			if (currentStart !== newStart) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Move a clip's visual between tracks
	 */
	private moveClipBetweenTracks(clipId: string, fromTrackIndex: number, toTrackIndex: number): void {
		const clip = this.findClipById(clipId);
		if (!clip?.visual) return;

		// Detach from old track
		const oldTrack = this.timeline?.getRenderer().getTrackByIndex(fromTrackIndex);
		if (oldTrack) {
			oldTrack.detachClip(clipId);
		}

		// Attach to new track
		const newTrack = this.timeline?.getRenderer().getTrackByIndex(toTrackIndex);
		if (newTrack) {
			newTrack.addClip(clip.visual);
		}
	}

	/**
	 * Update clip position in registry
	 */
	private updateClipPosition(clipId: string, newTrackIndex: number, newClipIndex: number): void {
		const registryState = this.state.getState().clipRegistry;
		const clip = registryState.clips.get(clipId);
		if (!clip) return;

		const newClips = new Map(registryState.clips);
		const newTrackIndexMap = new Map(registryState.trackIndex);

		// Remove from old track index
		const oldTrackClips = newTrackIndexMap.get(clip.trackIndex);
		if (oldTrackClips) {
			oldTrackClips.delete(clipId);
			if (oldTrackClips.size === 0) {
				newTrackIndexMap.delete(clip.trackIndex);
			}
		}

		// Add to new track index
		const trackClips = newTrackIndexMap.get(newTrackIndex) || new Set<string>();
		trackClips.add(clipId);
		newTrackIndexMap.set(newTrackIndex, trackClips);

		// Update clip with new position
		newClips.set(clipId, {
			...clip,
			trackIndex: newTrackIndex,
			clipIndex: newClipIndex,
			lastSeen: Date.now()
		});

		// Update state
		this.state.update({
			clipRegistry: {
				...registryState,
				clips: newClips,
				trackIndex: newTrackIndexMap
			}
		});
	}

	/**
	 * Update clip signature in registry
	 */
	private updateClipSignature(clipId: string, newSignature: string): void {
		const registryState = this.state.getState().clipRegistry;
		const clip = registryState.clips.get(clipId);
		if (!clip) return;

		const newClips = new Map(registryState.clips);
		newClips.set(clipId, {
			...clip,
			playerSignature: newSignature,
			lastSeen: Date.now()
		});

		// Update state
		this.state.update({
			clipRegistry: {
				...registryState,
				clips: newClips
			}
		});
	}

	/**
	 * Clean up and dispose of the registry manager
	 */
	public dispose(): void {
		// Cancel any pending sync
		if (this.syncFrameId !== null) {
			cancelAnimationFrame(this.syncFrameId);
			this.syncFrameId = null;
		}

		// Remove event listeners
		Object.entries(this.eventHandlers).forEach(([event, handler]) => {
			this.edit.events.off(event, handler);
		});

		// Clear identity service cache
		this.identityService.clearAllCache();
	}
}
