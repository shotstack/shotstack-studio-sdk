import isEqual from "fast-deep-equal/es6";

import { TimelineState, StateChanges, StateListener } from "../types";
import { ITimelineState } from "../types/timeline.interfaces";

/**
 * Manages timeline state with immutable updates and subscription pattern
 */
export class TimelineStateManager implements ITimelineState {
	private state: TimelineState;
	private listeners: Set<StateListener> = new Set();
	private snapshots: TimelineState[] = [];
	private maxSnapshots: number = 50;

	constructor(initialState: TimelineState) {
		// Don't use structuredClone as the state contains non-cloneable objects
		this.state = initialState;
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
}
