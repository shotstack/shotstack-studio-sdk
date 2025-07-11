import { Player } from "@canvas/players/player";
import { Edit } from "@core/edit";
import * as PIXI from "pixi.js";

import { TimelineClip } from "../entities/TimelineClip";
import { TimelineTrack } from "../entities/TimelineTrack";
import { ITimelineState } from "../interfaces";
import { ClipIdentityService } from "../services/ClipIdentityService";
import { RegisteredClip, ClipRegistryState } from "../types";

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
	private state: ITimelineState;
	private edit: Edit;
	private identityService: ClipIdentityService;
	private syncScheduled = false;
	private syncFrameId: number | null = null;
	private timeline: any = null; // Timeline reference will be set after construction
	private playerToClipId = new WeakMap<Player, string>(); // Moved from state for serializability
	
	// Event handler references for cleanup
	private handleClipUpdatedBound: (data: any) => void;
	private handleClipDeletedBound: (data: any) => void;
	private handleTrackDeletedBound: (data: any) => void;

	constructor(state: ITimelineState, edit: Edit) {
		this.state = state;
		this.edit = edit;
		this.identityService = new ClipIdentityService();

		// Bind event handlers for proper cleanup later
		this.handleClipUpdatedBound = this.handleClipUpdated.bind(this);
		this.handleClipDeletedBound = this.handleClipDeleted.bind(this);
		this.handleTrackDeletedBound = this.handleTrackDeleted.bind(this);

		// Initialize registry state if not present
		const currentState = state.getState();
		if (!currentState.clipRegistry) {
			state.update({
				clipRegistry: {
					clips: new Map(),
					trackIndex: new Map(),
					generation: 0
				}
			});
		}

		// Set up event listeners
		this.setupEventListeners();
	}

	/**
	 * Set the Timeline reference (called after Timeline construction)
	 */
	public setTimeline(timeline: any): void {
		this.timeline = timeline;
	}

	/**
	 * Set up event listeners for Edit events
	 */
	private setupEventListeners(): void {
		// Subscribe to Edit events for synchronization
		this.edit.events.on("clip:updated", this.handleClipUpdatedBound);
		this.edit.events.on("clip:deleted", this.handleClipDeletedBound);
		this.edit.events.on("track:deleted", this.handleTrackDeletedBound);
	}

	/**
	 * Handle clip update events from Edit
	 */
	private handleClipUpdated(data: any): void {
		// Schedule sync to batch multiple updates
		this.scheduleSync();
	}

	/**
	 * Handle clip deletion events from Edit
	 */
	private handleClipDeleted(data: any): void {
		// Schedule sync to handle deletion
		this.scheduleSync();
	}

	/**
	 * Handle track deletion events from Edit
	 */
	private handleTrackDeleted(data: any): void {
		// Schedule sync to handle track removal
		this.scheduleSync();
	}

	/**
	 * Schedule a sync operation using requestAnimationFrame to batch updates
	 */
	public scheduleSync(): void {
		if (this.syncScheduled) {
			return; // Already scheduled
		}

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
			if (delta.added.length > 0 || delta.moved.length > 0 || 
			    delta.removed.length > 0 || delta.updated.length > 0) {
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
			this.edit.events.emit("timeline:registrySynced", {
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
			// Emit error event for debugging
			this.edit.events.emit("timeline:registrySyncError", {
				generation: currentGeneration,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/**
	 * Get stable ID for a clip at given position
	 */
	public getClipIdAtPosition(trackIndex: number, clipIndex: number): string | null {
		// First check if we have this clip in the registry
		const registryState = this.state.getState().clipRegistry;
		
		// Look through registered clips to find one at this position
		for (const [clipId, registeredClip] of registryState.clips) {
			if (registeredClip.trackIndex === trackIndex && registeredClip.clipIndex === clipIndex) {
				return clipId;
			}
		}
		
		// If not in registry, check if the clip exists and get its player
		const player = this.edit.getPlayerClip(trackIndex, clipIndex);
		if (!player) {
			return null;
		}
		
		// Check if we have this player in our WeakMap
		let clipId = this.playerToClipId.get(player);
		
		if (!clipId) {
			// Generate new ID if we don't have one
			clipId = this.identityService.generateClipId(player, trackIndex, clipIndex);
			// Store it for future lookups
			this.playerToClipId.set(player, clipId);
		}
		
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
			for (const [_, clip] of registryState.clips) {
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
		const registryState = this.state.getState().clipRegistry;
		const newClips = new Map(registryState.clips);
		const newTrackIndex = new Map(registryState.trackIndex);
		
		// Create registered clip entry
		const registeredClip: RegisteredClip = {
			id: clipId,
			visual,
			trackIndex,
			clipIndex,
			playerSignature: this.identityService.getPlayerSignature(player),
			lastSeen: Date.now()
		};
		
		// Update clips map
		newClips.set(clipId, registeredClip);
		
		// Update track index
		const trackClips = newTrackIndex.get(trackIndex) || new Set<string>();
		trackClips.add(clipId);
		newTrackIndex.set(trackIndex, trackClips);
		
		// Update player to ID mapping
		this.playerToClipId.set(player, clipId);
		
		// Update state
		this.state.update({
			clipRegistry: {
				...registryState,
				clips: newClips,
				trackIndex: newTrackIndex,
				generation: registryState.generation + 1
			}
		});
	}

	/**
	 * Unregister a clip from the registry
	 */
	public unregisterClip(clipId: string): void {
		const registryState = this.state.getState().clipRegistry;
		const clip = registryState.clips.get(clipId);
		
		if (!clip) {
			return; // Clip not found
		}
		
		const newClips = new Map(registryState.clips);
		const newTrackIndex = new Map(registryState.trackIndex);
		
		// Remove from clips map
		newClips.delete(clipId);
		
		// Remove from track index
		const trackClips = newTrackIndex.get(clip.trackIndex);
		if (trackClips) {
			trackClips.delete(clipId);
			if (trackClips.size === 0) {
				newTrackIndex.delete(clip.trackIndex);
			}
		}
		
		// Update state
		this.state.update({
			clipRegistry: {
				...registryState,
				clips: newClips,
				trackIndex: newTrackIndex,
				generation: registryState.generation + 1
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
		const editData = this.edit.getEdit();
		const {tracks} = editData.timeline;

		// Track seen clips to identify removed ones
		const seenClipIds = new Set<string>();

		// Iterate through all clips in Edit state
		for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
			const track = tracks[trackIndex];
			if (!track || !track.clips) continue;

			for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex++) {
				const clip = track.clips[clipIndex];
				if (!clip) continue;

				// Get the player instance for this clip
				// For now, we'll use a placeholder approach - in a real implementation,
				// we'd need access to the actual Player instances
				const player = this.getPlayerForClip(trackIndex, clipIndex);
				if (!player) continue;

				// Check if we have this player registered
				let clipId = this.playerToClipId.get(player);
				const existingClip = clipId ? registryState.clips.get(clipId) : null;

				if (!existingClip) {
					// New clip - generate ID and mark as added
					clipId = this.identityService.generateClipId(player, trackIndex, clipIndex);
					delta.added.push({
						id: clipId,
						player,
						trackIndex,
						clipIndex
					});
				} else {
					// Existing clip - check if it moved or was updated
					if (existingClip.trackIndex !== trackIndex || existingClip.clipIndex !== clipIndex) {
						// Clip moved to different position
						delta.moved.push({
							id: clipId!,  // We know clipId exists here since we found existingClip
							player,
							trackIndex,
							clipIndex,
							visual: existingClip.visual
						});
					} else {
						// Check if clip needs updating
						if (this.isClipUpdated(existingClip, player, trackIndex, clipIndex)) {
							delta.updated.push({
								id: clipId!,  // We know clipId exists here since we found existingClip
								player,
								trackIndex,
								clipIndex,
								visual: existingClip.visual
							});
						}
					}
				}

				if (clipId) {
					seenClipIds.add(clipId);
				}
			}
		}

		// Find removed clips
		for (const [clipId, registeredClip] of registryState.clips) {
			if (!seenClipIds.has(clipId)) {
				delta.removed.push({
					id: clipId,
					player: null as any, // Player no longer exists
					trackIndex: registeredClip.trackIndex,
					clipIndex: registeredClip.clipIndex,
					visual: registeredClip.visual
				});
			}
		}

		return delta;
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
					track.removeClip(removed.visual);
				}
				// Dispose the visual
				removed.visual.dispose();
			}
			// Unregister from registry
			this.unregisterClip(removed.id);
		}

		// Process moved clips (reuse visuals)
		for (const moved of delta.moved) {
			if (!moved.visual) continue;
			
			// Get current registration before updating
			const currentReg = this.findClipById(moved.id);
			if (!currentReg) continue;
			
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

		// Process added clips (create new visuals)
		for (const added of delta.added) {
			// Get the edit clip data
			const editClip = this.edit.getClip(added.trackIndex, added.clipIndex);
			if (!editClip) continue;

			// Create visual clip
			const { TimelineClip } = await import("../entities/TimelineClip");
			const trackId = `track-${added.trackIndex}`;
			const visual = new TimelineClip(
				added.id, 
				trackId, 
				editClip.start || 0, 
				editClip.length || 1, 
				editClip
			);

			// Load the visual
			await visual.load();

			// Set zoom level
			const {zoom} = this.state.getState().viewport;
			visual.setPixelsPerSecond(zoom);

			// Add to track
			const track = this.timeline.getRenderer().getTrackByIndex(added.trackIndex);
			if (track) {
				track.addClip(visual);
			}

			// Register with visual
			this.registerClip(added.id, visual, added.player, added.trackIndex, added.clipIndex);
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
		
		// Trigger a render to show changes
		if (this.timeline.draw) {
			this.timeline.draw();
		}
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
		const oldTrack = this.timeline.getRenderer().getTrackByIndex(fromTrackIndex);
		if (oldTrack) {
			oldTrack.detachClip(clipId);
		}
		
		// Attach to new track
		const newTrack = this.timeline.getRenderer().getTrackByIndex(toTrackIndex);
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
		this.edit.events.off("clip:updated", this.handleClipUpdatedBound);
		this.edit.events.off("clip:deleted", this.handleClipDeletedBound);
		this.edit.events.off("track:deleted", this.handleTrackDeletedBound);

		// Clear identity service cache
		this.identityService.clearAllCache();
	}
}