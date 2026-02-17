import type { ResolvedClip } from "@schemas";

// Polyfill for structuredClone (for older environments like Jest)
const clone = <T>(obj: T): T => {
	if (typeof structuredClone === "function") {
		return structuredClone(obj);
	}
	return JSON.parse(JSON.stringify(obj)) as T;
};

/**
 * Represents an active drag session for a specific UI control.
 */
export interface DragSession {
	/** The clip being modified during this drag */
	clipId: string;
	/** Snapshot of the clip's resolved state when the drag started */
	initialState: ResolvedClip;
	/** Timestamp when the drag session started (for debugging/telemetry) */
	startTime: number;
}

/**
 * Holds per-control drag sessions so the toolbar can snapshot clip state on
 * pointerdown and commit a single undo entry on release.
 */
export class DragStateManager {
	private sessions = new Map<string, DragSession>();

	/**
	 * Start a new drag session for the specified control.
	 *
	 * @param controlId - Unique identifier for the control (e.g., "background-opacity")
	 * @param clipId - ID of the clip being modified
	 * @param initialState - Snapshot of the clip's resolved state at drag start
	 */
	start(controlId: string, clipId: string, initialState: ResolvedClip): void {
		this.sessions.set(controlId, {
			clipId,
			initialState: clone(initialState),
			startTime: Date.now()
		});
	}

	/**
	 * Get the active drag session for a control, if one exists.
	 *
	 * @param controlId - Unique identifier for the control
	 * @returns The active drag session, or null if no session exists
	 */
	get(controlId: string): DragSession | null {
		return this.sessions.get(controlId) ?? null;
	}

	/**
	 * End the drag session for a control and return its state.
	 *
	 * @param controlId - Unique identifier for the control
	 * @returns The drag session that was ended, or null if no session existed
	 */
	end(controlId: string): DragSession | null {
		const session = this.sessions.get(controlId);
		this.sessions.delete(controlId);
		return session ?? null;
	}

	/**
	 * Clear drag sessions. Can clear all sessions or only those for a specific clip.
	 *
	 * @param clipId - Optional clip ID to filter sessions. If provided, only clears
	 *                 sessions for that clip. If omitted, clears all sessions.
	 */
	clear(clipId?: string): void {
		if (clipId) {
			// Clear sessions for specific clip (when clip selection changes)
			for (const [id, session] of this.sessions.entries()) {
				if (session.clipId === clipId) {
					this.sessions.delete(id);
				}
			}
		} else {
			// Clear all sessions
			this.sessions.clear();
		}
	}

	/**
	 * Check if a control is currently in a drag session.
	 *
	 * @param controlId - Unique identifier for the control
	 * @returns true if the control has an active drag session
	 */
	isDragging(controlId: string): boolean {
		return this.sessions.has(controlId);
	}
}
