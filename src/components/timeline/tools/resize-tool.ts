import { ResizeClipCommand } from "@core/commands/resize-clip-command";
import { Theme } from "@core/theme/theme-context";
import * as PIXI from "pixi.js";

import { TimelinePointerEvent } from "../types";
import { IToolInterceptor, ITimelineToolContext, ITimelineState } from "../types/timeline.interfaces";

/**
 * Resize interceptor for adjusting clip duration by dragging right edge
 * This runs with higher priority than regular tools and intercepts resize operations
 */
export class ResizeInterceptor implements IToolInterceptor {
	public readonly name = "resize-interceptor";
	public readonly priority = 100; // High priority to intercept before selection tool

	private static readonly CONFIG = {
		EDGE_THRESHOLD: 15, // Increased to cover resize handle bars
		MIN_DURATION: 0.1,
		OVERLAP_BUFFER: 0.001
	} as const;

	// Resize state
	private resizeState = {
		isResizing: false,
		targetClip: null as { trackIndex: number; clipIndex: number } | null,
		dragStartX: 0,
		originalDuration: 0,
		previewDuration: 0,
		guidelines: [] as number[] // X positions for alignment guides
	};

	// Graphics for rendering guidelines
	private guidelinesGraphics: PIXI.Graphics | null = null;

	constructor(
		private state: ITimelineState,
		private context: ITimelineToolContext
	) {}

	public interceptPointerDown(event: TimelinePointerEvent): boolean {
		if (!this.isOnClipRightEdge(event)) return false;

		const registeredClip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);
		if (!registeredClip) return false;

		const player = this.context.edit.getPlayerClip(registeredClip.trackIndex, registeredClip.clipIndex);
		if (!player?.clipConfiguration) return false;

		// Start resize operation
		this.resizeState = {
			isResizing: true,
			targetClip: {
				trackIndex: registeredClip.trackIndex,
				clipIndex: registeredClip.clipIndex
			},
			dragStartX: event.global.x,
			originalDuration: player.clipConfiguration.length || 1,
			previewDuration: player.clipConfiguration.length || 1,
			guidelines: []
		};

		// Create graphics for guidelines
		this.createGuidelinesGraphics();

		event.stopPropagation();
		return true;
	}

	public interceptPointerMove(event: TimelinePointerEvent): boolean {
		if (!this.resizeState.isResizing) return false;

		if (!this.resizeState.targetClip) {
			this.resetState();
			return false;
		}

		this.resizeState.previewDuration = this.calculateNewDuration(event.global.x);
		
		// Calculate the new end time for alignment detection
		const player = this.context.edit.getPlayerClip(
			this.resizeState.targetClip.trackIndex, 
			this.resizeState.targetClip.clipIndex
		);
		if (player?.clipConfiguration) {
			const clipStart = player.clipConfiguration.start || 0;
			const newEndTime = clipStart + this.resizeState.previewDuration;
			this.detectAlignments(newEndTime);
		}
		
		this.updateClipVisual();
		this.updateGuidelinesGraphics();
		return true;
	}

	public interceptPointerUp(_event: TimelinePointerEvent): boolean {
		if (!this.resizeState.isResizing) return false;

		const { targetClip, previewDuration } = this.resizeState;
		if (targetClip && previewDuration > 0) {
			const finalDuration = Math.max(ResizeInterceptor.CONFIG.MIN_DURATION, previewDuration);
			const command = new ResizeClipCommand(targetClip.trackIndex, targetClip.clipIndex, finalDuration);

			try {
				this.context.executeCommand(command);
			} catch (error) {
				console.error("Failed to execute resize command:", error);
				this.handleResizeError(error);
			}
		}

		this.resetState();
		return true;
	}

	public getCursor(event: TimelinePointerEvent): string | null {
		return this.resizeState.isResizing || this.isOnClipRightEdge(event) ? "ew-resize" : null;
	}

	/**
	 * Check if pointer is on clip's right edge
	 */
	private isOnClipRightEdge(event: TimelinePointerEvent): boolean {
		try {
			// Find clip at pointer position
			const registeredClip = this.context.clipRegistry.findClipByContainer(event.target as PIXI.Container);
			if (!registeredClip || !registeredClip.visual) {
				return false;
			}

			// Now we can trust the registry indices since we sync immediately on moves
			const player = this.context.edit.getPlayerClip(registeredClip.trackIndex, registeredClip.clipIndex);
			if (!player || !player.clipConfiguration) {
				return false;
			}

			const clipConfig = player.clipConfiguration;
			const state = this.state.getState();

			// Validate clip dimensions
			if (clipConfig.start === undefined || !clipConfig.length || clipConfig.length <= 0) {
				return false;
			}

			// Get the visual duration directly from the registered clip
			const visualDuration = registeredClip.visual.getDuration();

			// Calculate clip's right edge position in screen coordinates
			const clipEndTime = clipConfig.start + visualDuration;
			const clipRightEdgeX = this.timeToScreen(clipEndTime, state.viewport.zoom, state.viewport.scrollX);

			// Check if pointer is near the right edge
			const distance = Math.abs(event.global.x - clipRightEdgeX);
			return distance <= ResizeInterceptor.CONFIG.EDGE_THRESHOLD;
		} catch (_error) {
			// Fail gracefully on any error
			return false;
		}
	}

	/**
	 * Convert timeline time to screen X coordinate
	 */
	private timeToScreen(time: number, zoom: number, scrollX: number): number {
		const timelineX = time * zoom;
		return timelineX - scrollX;
	}

	/**
	 * Calculate new duration based on drag distance
	 */
	private calculateNewDuration(currentX: number): number {
		const { zoom } = this.state.getState().viewport;
		const deltaTime = (currentX - this.resizeState.dragStartX) / zoom;
		const newDuration = this.resizeState.originalDuration + deltaTime;
		return this.applyDurationConstraints(newDuration);
	}

	/**
	 * Apply duration constraints and validation
	 */
	private applyDurationConstraints(duration: number): number {
		let constrainedDuration = Math.max(ResizeInterceptor.CONFIG.MIN_DURATION, duration);

		if (this.resizeState.targetClip) {
			const maxDuration = this.getMaxDurationForClip(this.resizeState.targetClip);
			if (maxDuration !== null) {
				constrainedDuration = Math.min(constrainedDuration, maxDuration);
			}
		}

		// Apply grid snapping to 0.1s intervals
		constrainedDuration = Math.round(constrainedDuration * 10) / 10;

		return constrainedDuration;
	}

	/**
	 * Get maximum allowed duration for a clip based on adjacent clips
	 */
	private getMaxDurationForClip(clipInfo: { trackIndex: number; clipIndex: number }): number | null {
		try {
			// Get the clip player to check its start time
			const player = this.context.edit.getPlayerClip(clipInfo.trackIndex, clipInfo.clipIndex);
			if (!player || !player.clipConfiguration) {
				return null;
			}

			const clipStart = player.clipConfiguration.start || 0;

			// Get track data
			const track = this.context.edit.getTrack(clipInfo.trackIndex);
			if (!track || !track.clips) {
				return null;
			}

			const { clips } = track;

			// Find the next clip in the track
			let nextClipStart: number | null = null;

			for (let i = 0; i < clips.length; i += 1) {
				if (i !== clipInfo.clipIndex) {
					const otherClip = clips[i];
					const otherStart = otherClip.start || 0;

					// Check if this clip is after our clip
					if (otherStart > clipStart) {
						if (nextClipStart === null || otherStart < nextClipStart) {
							nextClipStart = otherStart;
						}
					}
				}
			}

			// If there's a next clip, calculate max duration to avoid overlap
			if (nextClipStart !== null) {
				const maxDuration = nextClipStart - clipStart;
				// Add a small buffer to prevent exact overlap
				return Math.max(ResizeInterceptor.CONFIG.MIN_DURATION, maxDuration - ResizeInterceptor.CONFIG.OVERLAP_BUFFER);
			}

			// No constraint from adjacent clips
			return null;
		} catch (error) {
			console.warn("Failed to calculate max duration constraint:", error);
			return null;
		}
	}

	/**
	 * Detect clip alignments at the current resize position
	 */
	private detectAlignments(resizedClipEndTime: number): void {
		if (!this.resizeState.targetClip) return;
		
		const { zoom, scrollX } = this.state.getState().viewport;
		const viewportWidth = this.state.getState().viewport.width;
		const guidelines = new Set<number>();
		
		// Calculate visible time range for optimization
		const startTime = scrollX / zoom;
		const endTime = (scrollX + viewportWidth) / zoom;
		
		// Get all tracks by iterating until we get null
		for (let i = 0; i < 100; i++) { // Reasonable max track limit
			const track = this.context.edit.getTrack(i);
			if (track === null) break;
			if (!track.clips) continue;
			
			track.clips.forEach((clip, clipIndex) => {
				// Skip the clip being resized
				if (i === this.resizeState.targetClip!.trackIndex && 
					clipIndex === this.resizeState.targetClip!.clipIndex) {
					return;
				}
				
				const clipStart = clip.start || 0;
				const clipEnd = clipStart + (clip.length || 0);
				
				// Skip clips outside visible range for performance
				if (clipEnd < startTime || clipStart > endTime) {
					return;
				}
				
				// Check if resized edge aligns with clip start or end
				const threshold = 0.05; // Within 0.05s counts as aligned
				if (Math.abs(resizedClipEndTime - clipStart) < threshold) {
					const x = this.timeToScreen(clipStart, zoom, scrollX);
					if (x >= 0 && x <= viewportWidth) {
						guidelines.add(x);
					}
				} else if (Math.abs(resizedClipEndTime - clipEnd) < threshold) {
					const x = this.timeToScreen(clipEnd, zoom, scrollX);
					if (x >= 0 && x <= viewportWidth) {
						guidelines.add(x);
					}
				}
			});
		}
		
		this.resizeState.guidelines = Array.from(guidelines);
	}

	/**
	 * Create graphics object for rendering guidelines
	 */
	private createGuidelinesGraphics(): void {
		if (!this.guidelinesGraphics) {
			this.guidelinesGraphics = new PIXI.Graphics();
			const overlayLayer = this.context.timeline.getRenderer().getLayer("overlay");
			overlayLayer.addChild(this.guidelinesGraphics);
		}
	}

	/**
	 * Update guidelines graphics
	 */
	private updateGuidelinesGraphics(): void {
		if (!this.guidelinesGraphics) return;
		
		this.guidelinesGraphics.clear();
		if (this.resizeState.guidelines.length === 0) return;
		
		const guidelineColor = Theme.colors.ui.selection;
		const alpha = 0.3;
		const { zoom } = this.state.getState().viewport;
		
		// Get track height to calculate approximate bounds
		const trackHeight = Theme.dimensions.track.height;
		const trackGap = Theme.dimensions.track.gap;
		const rulerHeight = Theme.dimensions.ruler.height;
		
		// For each guideline, determine the lowest track that has an alignment
		this.resizeState.guidelines.forEach(x => {
			let lowestTrack = -1;
			
			// Check each track for clips that align at this x position
			for (let trackIndex = 0; trackIndex < 20; trackIndex++) {
				const track = this.context.edit.getTrack(trackIndex);
				if (!track || !track.clips) continue;
				
				// Check if any clip in this track aligns at this x position
				const hasAlignment = track.clips.some(clip => {
					const clipStart = clip.start || 0;
					const clipEnd = clipStart + (clip.length || 0);
					
					// Convert clip times to screen positions and check alignment
					const startX = this.timeToScreen(clipStart, zoom, this.state.getState().viewport.scrollX);
					const endX = this.timeToScreen(clipEnd, zoom, this.state.getState().viewport.scrollX);
					
					return Math.abs(x - startX) < 1 || Math.abs(x - endX) < 1;
				});
				
				if (hasAlignment) {
					lowestTrack = trackIndex;
				}
			}
			
			// Draw guideline to the bottom of the lowest track with alignment
			if (lowestTrack >= 0) {
				const startY = rulerHeight;
				const endY = rulerHeight + ((lowestTrack + 1) * (trackHeight + trackGap));
				
				this.guidelinesGraphics!.moveTo(x, startY);
				this.guidelinesGraphics!.lineTo(x, endY);
			}
		});
		
		if (this.resizeState.guidelines.length > 0) {
			this.guidelinesGraphics.stroke({ width: 1, color: guidelineColor, alpha });
		}
	}

	/**
	 * Clear guidelines graphics
	 */
	private clearGuidelinesGraphics(): void {
		if (this.guidelinesGraphics) {
			this.guidelinesGraphics.clear();
			const overlayLayer = this.context.timeline.getRenderer().getLayer("overlay");
			overlayLayer.removeChild(this.guidelinesGraphics);
			this.guidelinesGraphics.destroy();
			this.guidelinesGraphics = null;
		}
	}

	/**
	 * Reset all resize state
	 */
	private resetState(): void {
		this.resizeState = {
			isResizing: false,
			targetClip: null,
			dragStartX: 0,
			originalDuration: 0,
			previewDuration: 0,
			guidelines: []
		};
		this.clearGuidelinesGraphics();
	}

	/**
	 * Update clip visual during drag
	 */
	private updateClipVisual(): void {
		const { targetClip, previewDuration } = this.resizeState;
		if (!targetClip) return;

		// Get the player from Edit to find the correct clip ID
		const player = this.context.edit.getPlayerClip(targetClip.trackIndex, targetClip.clipIndex);
		if (!player) return;

		const clipId = this.context.clipRegistry.getClipIdForPlayer(player);
		if (!clipId) return;

		// Find the visual clip by ID
		const registeredClip = this.context.clipRegistry.findClipById(clipId);
		if (registeredClip && registeredClip.visual) {
			registeredClip.visual.setDuration(previewDuration);
		}
	}

	/**
	 * Handle errors during resize operation
	 */
	private handleResizeError(error: unknown): void {
		// Log detailed error for debugging
		console.error("Resize operation failed:", error);

		// Reset tool state
		this.resetState();

		// Animation loop will handle rendering

		// Could emit an event here for UI to show error message
		// this.context.edit.events.emit("error", { message: "Failed to resize clip" });
	}
}
