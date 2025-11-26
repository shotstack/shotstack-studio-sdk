import { Edit } from "@core/edit";

import { EditType, ClipConfig } from "../types/timeline";

export interface TimelineEventCallbacks {
	onEditChange: (editType?: EditType) => Promise<void>;
	onSeek: (time: number) => void;
	onClipSelected: (trackIndex: number, clipIndex: number) => void;
	onSelectionCleared: () => void;
	onDragStarted: (trackIndex: number, clipIndex: number) => void;
	onDragEnded: () => void;
}

export class TimelineEventHandler {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private boundHandlers = new Map<string, (...args: any[]) => void>();

	constructor(
		private edit: Edit,
		private callbacks: TimelineEventCallbacks
	) {}

	public setupEventListeners(): void {
		const events = [
			["timeline:updated", this.handleTimelineUpdated],
			["clip:updated", this.handleClipUpdated],
			["clip:selected", this.handleClipSelected],
			["selection:cleared", this.handleSelectionCleared],
			["drag:started", this.handleDragStarted],
			["drag:ended", this.handleDragEnded],
			["track:created", this.handleTrackCreated]
		] as const;

		for (const [event, handler] of events) {
			const bound = handler.bind(this);
			this.boundHandlers.set(event, bound);
			this.edit.events.on(event, bound);
		}
	}

	private async handleTimelineUpdated(event: { current: EditType }): Promise<void> {
		await this.callbacks.onEditChange(event.current);
	}

	private async handleClipUpdated(): Promise<void> {
		await this.callbacks.onEditChange();
	}

	private handleClipSelected(event: { clip: ClipConfig; trackIndex: number; clipIndex: number }): void {
		this.callbacks.onClipSelected(event.trackIndex, event.clipIndex);
	}

	private handleSelectionCleared(): void {
		this.callbacks.onSelectionCleared();
	}

	private handleDragStarted(event: { trackIndex: number; clipIndex: number; startTime: number; offsetX: number; offsetY: number }): void {
		this.callbacks.onDragStarted(event.trackIndex, event.clipIndex);
	}

	private handleDragEnded(): void {
		this.callbacks.onDragEnded();
	}

	private async handleTrackCreated(): Promise<void> {
		await this.callbacks.onEditChange();
	}

	public handleSeek(event: { time: number }): void {
		// Convert timeline seconds to edit milliseconds
		this.callbacks.onSeek(event.time * 1000);
	}

	public dispose(): void {
		for (const [event, handler] of this.boundHandlers) {
			this.edit.events.off(event, handler);
		}
		this.boundHandlers.clear();
	}
}
