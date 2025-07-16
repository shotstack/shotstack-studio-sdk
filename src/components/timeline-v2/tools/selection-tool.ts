import { BaseTool } from "./base-tool";
import { TimelineV2 } from "../timeline-v2";
import { SelectClipCommand } from "@core/commands/select-clip-command";
import { ClearSelectionCommand } from "@core/commands/clear-selection-command";
import * as PIXI from "pixi.js";

export class SelectionTool extends BaseTool {
	public readonly name = "selection";

	private selectedClips = new Set<string>(); // Format: "trackIndex-clipIndex"

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
		
		// Listen for Edit system events to sync with canvas selections
		const edit = this.timeline.getEdit();
		edit.events.on('clip:selected', this.handleEditClipSelected.bind(this), {
			signal: this.abortController?.signal
		});
		edit.events.on('selection:cleared', this.handleEditSelectionCleared.bind(this), {
			signal: this.abortController?.signal
		});
	}

	private handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const target = event.target as PIXI.Container;
		
		// Check if clicked on a clip
		if (target.label) {
			const clipInfo = this.parseClipLabel(target.label);
			if (clipInfo) {
				this.handleClipClick(clipInfo.trackIndex, clipInfo.clipIndex, event);
				return;
			}
		}

		// If clicked on empty space, clear selection
		this.clearSelectionUsingCommand();
	}

	private handleClipClick(trackIndex: number, clipIndex: number, event: PIXI.FederatedPointerEvent): void {
		// Check if clip data exists
		const clipData = this.timeline.getClipData(trackIndex, clipIndex);
		if (!clipData) {
			console.warn(`Clip data not found for track ${trackIndex}, clip ${clipIndex}`);
			return;
		}

		// Use command pattern for proper event emission and undo/redo support
		const command = new SelectClipCommand(trackIndex, clipIndex);
		this.timeline.getEdit().executeEditCommand(command);
		
		// Update visual selection state
		this.updateSelectionFromEdit();
	}

	private selectClip(trackIndex: number, clipIndex: number): void {
		const clipKey = `${trackIndex}-${clipIndex}`;
		
		// Add to selection set
		this.selectedClips.add(clipKey);
		
		// Update visual state
		this.updateClipVisualState(trackIndex, clipIndex, true);
		
		console.log(`Selected clip: track ${trackIndex}, clip ${clipIndex}`);
	}

	private clearSelectionUsingCommand(): void {
		// Use command pattern for proper event emission and undo/redo support
		const command = new ClearSelectionCommand();
		this.timeline.getEdit().executeEditCommand(command);
		
		// Update visual selection state
		this.updateSelectionFromEdit();
	}

	private clearSelection(): void {
		// Update visual state for all selected clips
		for (const clipKey of this.selectedClips) {
			const [trackIndex, clipIndex] = clipKey.split('-').map(Number);
			this.updateClipVisualState(trackIndex, clipIndex, false);
		}
		
		// Clear selection set
		this.selectedClips.clear();
	}

	private handleEditClipSelected(event: { clip: any; trackIndex: number; clipIndex: number }): void {
		console.log('SelectionTool: Edit clip selected event received', event);
		this.updateSelectionFromEdit();
	}

	private handleEditSelectionCleared(): void {
		console.log('SelectionTool: Edit selection cleared event received');
		this.updateSelectionFromEdit();
	}

	private updateSelectionFromEdit(): void {
		// Clear current visual selection
		this.clearSelection();
		
		// Get the selected clip from Edit system
		const selectedClipInfo = this.timeline.getEdit().getSelectedClipInfo();
		if (selectedClipInfo) {
			const { trackIndex, clipIndex } = selectedClipInfo;
			this.selectClip(trackIndex, clipIndex);
		}
	}

	private updateClipVisualState(trackIndex: number, clipIndex: number, selected: boolean): void {
		// Find the visual track and clip to update their selection state
		const tracks = this.timeline.getVisualTracks();
		const track = tracks[trackIndex];
		
		if (track) {
			const clip = track.getClip(clipIndex);
			if (clip) {
				clip.setSelected(selected);
			}
		}
	}

	// Public API for querying selection state
	public getSelectedClip(): { trackIndex: number; clipIndex: number } | null {
		if (this.selectedClips.size === 0) return null;
		
		const clipKey = Array.from(this.selectedClips)[0];
		const [trackIndex, clipIndex] = clipKey.split('-').map(Number);
		return { trackIndex, clipIndex };
	}

	public isClipSelected(trackIndex: number, clipIndex: number): boolean {
		const clipKey = `${trackIndex}-${clipIndex}`;
		return this.selectedClips.has(clipKey);
	}

	public hasSelection(): boolean {
		return this.selectedClips.size > 0;
	}

	protected override cleanup(): void {
		// Clear all selections when tool is deactivated
		this.clearSelectionUsingCommand();
	}
}