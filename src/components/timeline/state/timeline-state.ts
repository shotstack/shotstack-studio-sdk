import { Player } from "@canvas/players/player";
import { Edit } from "@core/edit";
import isEqual from "fast-deep-equal/es6";
import * as PIXI from "pixi.js";

import { TimelineClip } from "../rendering/timeline-clip";
import { TimelineState, StateChanges, StateListener, RegisteredClip } from "../types";
import { ITimelineState, ITimeline } from "../types/timeline.interfaces";

import { ClipIdentityService } from "./identity-service";

/**
 * Manages timeline state with immutable updates and subscription pattern
 * Includes clip registry synchronization with Edit state
 */
export class TimelineStateManager implements ITimelineState {
	private state: TimelineState;
	private listeners: Set<StateListener> = new Set();
	private snapshots: TimelineState[] = [];
	private maxSnapshots: number = 50;

	// Clip sync related
	private identityService: ClipIdentityService;
	private syncScheduled = false;
	private syncFrameId: number | null = null;
	private playerToClipId = new WeakMap<Player, string>();
	private timeline: ITimeline | null = null;
	private edit: Edit;
	
	// Event handlers for cleanup
	private eventHandlers: { [key: string]: (data?: any) => void } = {};

	constructor(initialState: TimelineState, edit: Edit) {
		// Don't use structuredClone as the state contains non-cloneable objects
		this.state = initialState;
		this.edit = edit;
		this.identityService = new ClipIdentityService();
		this.setupEditEventListeners();
	}

	public subscribe(listener: StateListener): () => void {
		this.listeners.add(listener);
		// Call listener immediately with current state
		listener(this.state, {});

		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	public update(updates: Partial<TimelineState>): void {
		const oldState = this.state;

		// Create immutable update
		const newState = this.mergeState(this.state, updates);

		// Update state
		this.state = newState;

		// Detect what changed
		const changes = this.detectChanges(oldState, newState);

		// Notify listeners
		this.listeners.forEach(listener => {
			try {
				listener(newState, changes);
			} catch (error) {
				console.error("Error in state listener:", error);
			}
		});
	}

	public getState(): TimelineState {
		// Return the state directly - Maps and Sets are already immutable through our update patterns
		// We cannot use structuredClone because the state may contain non-cloneable objects like:
		// - WeakMaps (removed but was an issue)
		// - Functions in toolStates
		// - PIXI objects in clipRegistry
		return this.state;
	}

	public createSnapshot(): TimelineState {
		// Create a manual deep copy that handles Maps, Sets, and skips non-cloneable objects
		const snapshot = this.deepCloneState(this.state);

		// Add to snapshots array with size limit
		this.snapshots.push(snapshot);
		if (this.snapshots.length > this.maxSnapshots) {
			this.snapshots.shift(); // Remove oldest snapshot
		}

		return snapshot;
	}

	private deepCloneState(state: TimelineState): TimelineState {
		return {
			viewport: { ...state.viewport },
			selection: {
				selectedClipIds: new Set(state.selection.selectedClipIds),
				selectedTrackIds: new Set(state.selection.selectedTrackIds),
				lastSelectedId: state.selection.lastSelectedId
			},
			playback: { ...state.playback },
			features: {
				snapping: { ...state.features.snapping },
				autoScroll: { ...state.features.autoScroll }
			},
			activeTool: state.activeTool,
			// Don't clone toolStates as it may contain functions
			toolStates: state.toolStates,
			// Create new Maps but don't deep clone the clip registry contents
			// as they contain PIXI objects and other non-cloneable items
			clipRegistry: {
				clips: new Map(state.clipRegistry.clips),
				trackIndex: new Map(state.clipRegistry.trackIndex),
				generation: state.clipRegistry.generation
			}
		};
	}

	public restoreSnapshot(snapshot: TimelineState): void {
		this.update(snapshot);
	}

	private mergeState(current: TimelineState, updates: Partial<TimelineState>): TimelineState {
		const newState: TimelineState = {
			...current,
			viewport: updates.viewport ? { ...current.viewport, ...updates.viewport } : current.viewport,
			selection: updates.selection ? this.mergeSelection(current.selection, updates.selection) : current.selection,
			playback: updates.playback ? { ...current.playback, ...updates.playback } : current.playback,
			features: updates.features ? this.mergeFeatures(current.features, updates.features) : current.features,
			activeTool: updates.activeTool !== undefined ? updates.activeTool : current.activeTool,
			toolStates: updates.toolStates || current.toolStates,
			clipRegistry: updates.clipRegistry || current.clipRegistry
		};

		return newState;
	}

	private mergeSelection(current: TimelineState["selection"], updates: Partial<TimelineState["selection"]>): TimelineState["selection"] {
		return {
			selectedClipIds: updates.selectedClipIds !== undefined ? new Set(updates.selectedClipIds) : current.selectedClipIds,
			selectedTrackIds: updates.selectedTrackIds !== undefined ? new Set(updates.selectedTrackIds) : current.selectedTrackIds,
			lastSelectedId: updates.lastSelectedId !== undefined ? updates.lastSelectedId : current.lastSelectedId
		};
	}

	private mergeFeatures(current: TimelineState["features"], updates: Partial<TimelineState["features"]>): TimelineState["features"] {
		return {
			snapping: updates.snapping ? { ...current.snapping, ...updates.snapping } : current.snapping,
			autoScroll: updates.autoScroll ? { ...current.autoScroll, ...updates.autoScroll } : current.autoScroll
		};
	}

	private detectChanges(oldState: TimelineState, newState: TimelineState): StateChanges {
		return {
			viewport: !isEqual(oldState.viewport, newState.viewport),
			selection: !isEqual(oldState.selection, newState.selection),
			features: !isEqual(oldState.features, newState.features),
			activeTool: oldState.activeTool !== newState.activeTool,
			playback: !isEqual(oldState.playback, newState.playback),
			clipRegistry: !isEqual(oldState.clipRegistry, newState.clipRegistry)
		};
	}

	// ===== Clip Registry Methods =====

	/**
	 * Set the Timeline reference (called after Timeline construction)
	 */
	public setTimeline(timeline: ITimeline): void {
		this.timeline = timeline;
	}

	private setupEditEventListeners(): void {
		// Store event handlers for cleanup
		this.eventHandlers["clip:updated"] = (data?: any) => {
			// For move operations, sync immediately to avoid stale indices
			if (data?.previous?.trackIndex !== data?.current?.trackIndex || data?.previous?.clipIndex !== data?.current?.clipIndex) {
				this.syncClipsImmediately();
			} else {
				this.scheduleClipSync();
			}
		};
		this.eventHandlers["clip:deleted"] = () => this.scheduleClipSync();
		this.eventHandlers["track:deleted"] = () => this.scheduleClipSync();
		this.eventHandlers["track:added"] = () => this.syncClipsImmediately();
		this.eventHandlers["edit:undo"] = () => this.syncClipsImmediately();
		this.eventHandlers["edit:redo"] = () => this.syncClipsImmediately();
		
		// Register all event handlers
		Object.entries(this.eventHandlers).forEach(([event, handler]) => {
			this.edit.events.on(event, handler);
		});
	}

	/**
	 * Schedule a sync operation using requestAnimationFrame
	 */
	public scheduleClipSync(): void {
		if (this.syncScheduled) return;

		this.syncScheduled = true;
		this.syncFrameId = requestAnimationFrame(async () => {
			this.syncScheduled = false;
			this.syncFrameId = null;
			await this.syncClipsWithEdit();
		});
	}

	/**
	 * Sync immediately (synchronously) - use for critical operations
	 */
	public syncClipsImmediately(): void {
		if (this.syncFrameId !== null) {
			cancelAnimationFrame(this.syncFrameId);
			this.syncFrameId = null;
			this.syncScheduled = false;
		}
		this.syncClipsWithEdit();
	}

	/**
	 * Find a clip by its PIXI container
	 */
	public findClipByContainer(container: PIXI.Container): RegisteredClip | null {
		const { clipRegistry } = this.state;

		let current: PIXI.Container | null = container;
		while (current) {
			// Check if container has a label that matches a clip ID
			if (current.label) {
				const clipId = current.label.toString();
				const clip = clipRegistry.clips.get(clipId);
				if (clip && clip.visual?.getContainer() === current) {
					return clip;
				}
			}

			// Check all clips
			for (const [, clip] of clipRegistry.clips) {
				if (clip.visual?.getContainer() === current) {
					return clip;
				}
			}
			current = current.parent;
		}

		return null;
	}

	/**
	 * Get clip ID for a player object
	 */
	public getClipIdForPlayer(player: Player): string | null {
		return this.playerToClipId.get(player) ?? null;
	}

	/**
	 * Find clip by ID
	 */
	public findClipById(clipId: string): RegisteredClip | null {
		return this.state.clipRegistry.clips.get(clipId) || null;
	}

	/**
	 * Core sync logic - sync clips between Edit and Timeline state
	 */
	public async syncClipsWithEdit(): Promise<void> {
		// First, ensure all tracks from edit data have visual representations
		this.ensureAllTracksExist();
		
		const delta = this.computeClipDelta();

		if (delta.added.length > 0 || delta.moved.length > 0 || delta.removed.length > 0 || delta.updated.length > 0) {
			await this.applyClipDelta(delta);

			// Update state with new generation
			this.update({
				clipRegistry: {
					...this.state.clipRegistry,
					generation: this.state.clipRegistry.generation + 1
				}
			});
		}
	}

	/**
	 * Ensure all tracks from edit data have visual representations
	 */
	private ensureAllTracksExist(): void {
		if (!this.timeline) {
			console.warn("Timeline not available, cannot sync tracks");
			return;
		}
		
		const renderer = this.timeline.getRenderer();
		if (!renderer) {
			console.warn("Timeline renderer not available, cannot sync tracks");
			return;
		}

		const editData = this.edit.getEdit();
		const trackCount = editData.timeline.tracks.length;
		
		console.log(`Ensuring ${trackCount} visual tracks exist`);
		
		for (let i = 0; i < trackCount; i++) {
			const trackId = `track-${i}`;
			if (!renderer.getTrackByIndex(i)) {
				console.log(`Creating missing visual track at index ${i}`);
				renderer.addTrack(trackId, i);
			}
		}
		
		// Also remove any excess visual tracks
		const currentVisualTracks = renderer.getTracks();
		for (const visualTrack of currentVisualTracks) {
			const trackIndex = parseInt(visualTrack.getTrackId().replace("track-", ""), 10);
			if (trackIndex >= trackCount) {
				console.log(`Removing excess visual track at index ${trackIndex}`);
				renderer.removeTrack(visualTrack.getTrackId());
			}
		}
	}

	/**
	 * Compute delta between Edit state and registry
	 */
	private computeClipDelta(): any {
		const delta = {
			added: [] as any[],
			moved: [] as any[],
			removed: [] as any[],
			updated: [] as any[]
		};

		const seenClipIds = new Set<string>();

		// Process all tracks
		this.edit.getEdit().timeline.tracks.forEach((track, trackIndex) => {
			track?.clips?.forEach((clip, clipIndex) => {
				if (clip) {
					const player = this.edit.getPlayerClip(trackIndex, clipIndex);
					if (player) {
						this.processClipForDelta(player, trackIndex, clipIndex, delta, seenClipIds);
					}
				}
			});
		});

		// Find removed clips
		for (const [clipId, registeredClip] of this.state.clipRegistry.clips) {
			if (!seenClipIds.has(clipId)) {
				delta.removed.push({
					id: clipId,
					player: null,
					trackIndex: registeredClip.trackIndex,
					clipIndex: registeredClip.clipIndex,
					visual: registeredClip.visual
				});
			}
		}

		return delta;
	}

	private processClipForDelta(player: Player, trackIndex: number, clipIndex: number, delta: any, seenClipIds: Set<string>): void {
		let clipId = this.playerToClipId.get(player);
		const existingClip = clipId ? this.state.clipRegistry.clips.get(clipId) : null;

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

	private isClipUpdated(existingClip: RegisteredClip, player: Player, trackIndex: number, clipIndex: number): boolean {
		// Check signature change
		const newSignature = this.identityService.getPlayerSignature(player);
		if (existingClip.playerSignature !== newSignature) {
			return true;
		}

		// Check position/duration changes
		const editClip = this.edit.getClip(trackIndex, clipIndex);
		if (editClip && existingClip.visual) {
			if (existingClip.visual.getStartTime() !== (editClip.start || 0)) {
				return true;
			}
			if (existingClip.visual.getDuration() !== (editClip.length || 1)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Apply delta to update visual state
	 */
	private async applyClipDelta(delta: any): Promise<void> {
		if (!this.timeline) return;

		// Remove clips
		for (const removed of delta.removed) {
			if (removed.visual) {
				const track = this.timeline.getRenderer().getTrackByIndex(removed.trackIndex);
				if (track) {
					track.removeClip(removed.id);
				}
				removed.visual.dispose();
			}
			this.unregisterClip(removed.id);
		}

		// Move clips
		for (const moved of delta.moved) {
			if (moved.visual) {
				const oldTrack = this.timeline.getRenderer().getTrackByIndex(this.state.clipRegistry.clips.get(moved.id)?.trackIndex ?? -1);
				
				// Ensure new track exists, create if necessary
				let newTrack = this.timeline.getRenderer().getTrackByIndex(moved.trackIndex);
				if (!newTrack) {
					console.log(`Creating missing visual track at index ${moved.trackIndex} for moved clip`);
					const trackId = `track-${moved.trackIndex}`;
					newTrack = this.timeline.getRenderer().addTrack(trackId, moved.trackIndex);
				}

				if (oldTrack && newTrack && oldTrack !== newTrack) {
					oldTrack.detachClip(moved.id);
					newTrack.addClip(moved.visual);
				}

				// Update position
				const editClip = this.edit.getClip(moved.trackIndex, moved.clipIndex);
				if (editClip) {
					moved.visual.setStart(editClip.start || 0);
					moved.visual.setDuration(editClip.length || 1);
				}

				this.updateClipPosition(moved.id, moved.trackIndex, moved.clipIndex);
			}
		}

		// Add new clips
		for (const added of delta.added) {
			const editClip = this.edit.getClip(added.trackIndex, added.clipIndex);
			if (editClip) {
				const trackId = `track-${added.trackIndex}`;
				const visual = new TimelineClip(added.id, trackId, editClip.start || 0, editClip.length || 1, editClip);
				await visual.load();

				const { zoom } = this.state.viewport;
				visual.setPixelsPerSecond(zoom);

				// The track should exist since the Edit state maintains empty tracks
				// Ensure track exists, create if necessary
				let track = this.timeline.getRenderer().getTrackByIndex(added.trackIndex);
				if (!track) {
					console.log(`Creating missing visual track at index ${added.trackIndex}`);
					const trackId = `track-${added.trackIndex}`;
					track = this.timeline.getRenderer().addTrack(trackId, added.trackIndex);
				}
				
				track.addClip(visual);

				this.registerClip(added.id, visual, added.player, added.trackIndex, added.clipIndex);
			}
		}

		// Update existing clips
		for (const updated of delta.updated) {
			if (updated.visual) {
				const editClip = this.edit.getClip(updated.trackIndex, updated.clipIndex);
				if (editClip) {
					updated.visual.setClipData(editClip);
					updated.visual.setStart(editClip.start || 0);
					updated.visual.setDuration(editClip.length || 1);
					updated.visual.draw();
				}

				const newSignature = this.identityService.getPlayerSignature(updated.player);
				this.updateClipSignature(updated.id, newSignature);
			}
		}
	}

	private registerClip(clipId: string, visual: TimelineClip, player: Player, trackIndex: number, clipIndex: number): void {
		const registeredClip: RegisteredClip = {
			id: clipId,
			visual,
			trackIndex,
			clipIndex,
			playerSignature: this.identityService.getPlayerSignature(player),
			lastSeen: Date.now()
		};

		this.playerToClipId.set(player, clipId);

		const newClips = new Map(this.state.clipRegistry.clips);
		newClips.set(clipId, registeredClip);

		this.update({
			clipRegistry: {
				...this.state.clipRegistry,
				clips: newClips
			}
		});
	}

	private unregisterClip(clipId: string): void {
		const newClips = new Map(this.state.clipRegistry.clips);
		newClips.delete(clipId);

		this.update({
			clipRegistry: {
				...this.state.clipRegistry,
				clips: newClips
			}
		});
	}

	private updateClipPosition(clipId: string, newTrackIndex: number, newClipIndex: number): void {
		const clip = this.state.clipRegistry.clips.get(clipId);
		if (!clip) return;

		const newClips = new Map(this.state.clipRegistry.clips);
		newClips.set(clipId, {
			...clip,
			trackIndex: newTrackIndex,
			clipIndex: newClipIndex,
			lastSeen: Date.now()
		});

		this.update({
			clipRegistry: {
				...this.state.clipRegistry,
				clips: newClips
			}
		});
	}

	private updateClipSignature(clipId: string, newSignature: string): void {
		const clip = this.state.clipRegistry.clips.get(clipId);
		if (!clip) return;

		const newClips = new Map(this.state.clipRegistry.clips);
		newClips.set(clipId, {
			...clip,
			playerSignature: newSignature,
			lastSeen: Date.now()
		});

		this.update({
			clipRegistry: {
				...this.state.clipRegistry,
				clips: newClips
			}
		});
	}

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

		// Clear caches
		this.identityService.clearAllCache();
	}
}
