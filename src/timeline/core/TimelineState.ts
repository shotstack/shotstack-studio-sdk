import isEqual from "fast-deep-equal/es6";

import { ITimelineState } from "../interfaces";
import { TimelineState, StateChanges, StateListener } from "../types";

/**
 * Manages timeline state with immutable updates and subscription pattern
 */
export class TimelineStateManager implements ITimelineState {
	private state: TimelineState;
	private listeners: Set<StateListener> = new Set();
	private snapshots: TimelineState[] = [];
	private maxSnapshots: number = 50;

	constructor(initialState: TimelineState) {
		this.state = structuredClone(initialState);
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
		// Return a deep clone to ensure immutability
		return structuredClone(this.state);
	}

	public createSnapshot(): TimelineState {
		const snapshot = structuredClone(this.state);

		// Add to snapshots array with size limit
		this.snapshots.push(snapshot);
		if (this.snapshots.length > this.maxSnapshots) {
			this.snapshots.shift(); // Remove oldest snapshot
		}

		return snapshot;
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
			toolStates: updates.toolStates || current.toolStates
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
			playback: !isEqual(oldState.playback, newState.playback)
		};
	}
}
