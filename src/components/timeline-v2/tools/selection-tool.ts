import { BaseTool } from "./base-tool";
import { TimelineV2 } from "../timeline-v2";
import { SelectClipCommand } from "@core/commands/select-clip-command";
import { ClearSelectionCommand } from "@core/commands/clear-selection-command";
import * as PIXI from "pixi.js";

export class SelectionTool extends BaseTool {
	public readonly name = "selection";

	constructor(timeline: TimelineV2) {
		super(timeline);
	}

	protected setupEventListeners(): void {
		const pixiApp = this.getPixiApp();
		
		// Ensure the stage is interactive
		pixiApp.stage.interactive = true;
		
		// Listen for PIXI click events on the timeline stage
		pixiApp.stage.on('pointerdown', this.handlePointerDown.bind(this), {
			signal: this.abortController?.signal
		});
	}

	private handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;
		
		// Check if clicked on a clip
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo) {
				this.handleClipClick(clipInfo.trackIndex, clipInfo.clipIndex);
				return;
			}
		}

		// If clicked on empty space, clear selection
		this.clearSelection();
	}

	private handleClipClick(trackIndex: number, clipIndex: number): void {
		// Check if clip data exists
		const clipData = this.timeline.getClipData(trackIndex, clipIndex);
		if (!clipData) {
			console.warn(`Clip data not found for track ${trackIndex}, clip ${clipIndex}`);
			return;
		}

		// Use command pattern for proper event emission and undo/redo support
		const command = new SelectClipCommand(trackIndex, clipIndex);
		this.timeline.getEdit().executeEditCommand(command);
	}

	private clearSelection(): void {
		// Use command pattern for proper event emission and undo/redo support
		const command = new ClearSelectionCommand();
		this.timeline.getEdit().executeEditCommand(command);
	}
}