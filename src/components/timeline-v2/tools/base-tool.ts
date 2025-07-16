import { TimelineV2Tool } from "../types";
import { TimelineV2 } from "../timeline-v2";

export abstract class BaseTool implements TimelineV2Tool {
	public abstract readonly name: string;
	
	protected timeline: TimelineV2;
	protected abortController?: AbortController;

	constructor(timeline: TimelineV2) {
		this.timeline = timeline;
	}

	/**
	 * Activate the tool - sets up event listeners
	 */
	public onActivate(): void {
		// Create new abort controller for event cleanup
		this.abortController = new AbortController();
		this.setupEventListeners();
	}

	/**
	 * Deactivate the tool - cleans up event listeners
	 */
	public onDeactivate(): void {
		// Abort all event listeners
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = undefined;
		}
		this.cleanup();
	}

	/**
	 * Setup event listeners - to be implemented by subclasses
	 */
	protected abstract setupEventListeners(): void;

	/**
	 * Additional cleanup - can be overridden by subclasses
	 */
	protected cleanup(): void {
		// Default implementation - subclasses can override
	}

	/**
	 * Get the PIXI application for event handling
	 */
	protected getPixiApp() {
		return this.timeline.getPixiApp();
	}

	/**
	 * Get the timeline layout for calculations
	 */
	protected getLayout() {
		return this.timeline.getLayout();
	}

	/**
	 * Parse clip info from PIXI event target label
	 * Expected format: "clip-trackIndex-clipIndex"
	 */
	protected parseClipLabel(label: string): { trackIndex: number; clipIndex: number } | null {
		if (!label?.startsWith('clip-')) {
			return null;
		}

		const parts = label.split('-');
		if (parts.length !== 3) {
			return null;
		}

		const trackIndex = parseInt(parts[1], 10);
		const clipIndex = parseInt(parts[2], 10);

		if (isNaN(trackIndex) || isNaN(clipIndex)) {
			return null;
		}

		return { trackIndex, clipIndex };
	}

	/**
	 * Parse track info from PIXI event target label
	 * Expected format: "track-trackIndex"
	 */
	protected parseTrackLabel(label: string): { trackIndex: number } | null {
		if (!label?.startsWith('track-')) {
			return null;
		}

		const parts = label.split('-');
		if (parts.length !== 2) {
			return null;
		}

		const trackIndex = parseInt(parts[1], 10);

		if (isNaN(trackIndex)) {
			return null;
		}

		return { trackIndex };
	}
}