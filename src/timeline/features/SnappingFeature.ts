import * as PIXI from "pixi.js";

import { TimelineFeature } from "../core/TimelineFeature";
import { ITimelineRenderer } from "../interfaces";
import { StateChanges } from "../types";

/**
 * Snapping feature for aligning clips to grid, playhead, and other clips
 */
export class SnappingFeature extends TimelineFeature {
	public readonly name = "snapping";
	
	private snapLines: PIXI.Graphics | null = null;
	private activeSnapPoints: number[] = [];
	
	public onEnable(): void {
		// Initialize snapping when enabled
		const config = this.getFeatureConfig();
		if (!config) {
			// Set default config if not exists
			this.updateFeatureConfig({
				enabled: true,
				gridSize: 0.033333, // 1/30 second
				snapToClips: true,
				snapToPlayhead: true,
				magnetStrength: 10
			});
		}
	}
	
	public onDisable(): void {
		// Clean up snap lines
		this.clearSnapLines();
		this.activeSnapPoints = [];
	}
	
	public renderOverlay(renderer: ITimelineRenderer): void {
		// Get or create snap lines graphics
		if (!this.snapLines) {
			this.snapLines = new PIXI.Graphics();
			const overlayLayer = renderer.getLayer("overlay");
			overlayLayer.addChild(this.snapLines);
		}
		
		// Clear and redraw snap lines
		this.snapLines.clear();
		
		// Draw vertical snap lines
		const state = this.getState();
		this.activeSnapPoints.forEach(time => {
			const x = this.timeToPixels(time, state.viewport);
			
			this.snapLines.lineStyle(1, 0x00ff00, 0.5);
			this.snapLines.moveTo(x, 0);
			this.snapLines.lineTo(x, state.viewport.height);
		});
	}
	
	public onToolChanged(newTool: string, __previousTool: string | null): void {
		// Clear snap lines when changing tools
		if (newTool !== "move" && newTool !== "trim") {
			this.clearSnapLines();
		}
	}
	
	public onStateChanged(changes: StateChanges): void {
		// React to state changes
		if (changes.features) {
			const config = this.getFeatureConfig();
			if (config && !config.enabled && this.isEnabled) {
				// Feature was disabled via state
				this.isEnabled = false;
				this.onDisable();
			}
		}
	}
	
	// Public API for tools to use
	public findSnapPoint(time: number, excludeClipId?: string): number | null {
		const config = this.getFeatureConfig();
		if (!config || !config.enabled) return null;
		
		const snapPoints = this.gatherSnapPoints(excludeClipId);
		const magnetStrength = config.magnetStrength / this.getState().viewport.zoom;
		
		// Find closest snap point within magnet range
		let closestPoint: number | null = null;
		let closestDistance = Infinity;
		
		for (const point of snapPoints) {
			const distance = Math.abs(time - point);
			if (distance < magnetStrength && distance < closestDistance) {
				closestPoint = point;
				closestDistance = distance;
			}
		}
		
		// Update active snap points for rendering
		if (closestPoint !== null) {
			this.activeSnapPoints = [closestPoint];
		} else {
			this.activeSnapPoints = [];
		}
		
		return closestPoint;
	}
	
	private gatherSnapPoints(__excludeClipId?: string): number[] {
		const config = this.getFeatureConfig();
		const points: number[] = [];
		const state = this.getState();
		
		// Grid snap points
		if (config.gridSize > 0) {
			const start = Math.floor(state.viewport.scrollX / state.viewport.zoom / config.gridSize) * config.gridSize;
			const end = (state.viewport.scrollX + state.viewport.width) / state.viewport.zoom;
			
			for (let t = start; t <= end; t += config.gridSize) {
				points.push(t);
			}
		}
		
		// Playhead snap point
		if (config.snapToPlayhead) {
			points.push(state.playback.currentTime);
		}
		
		// Clip edges snap points
		if (config.snapToClips) {
			// TODO: Add clip edge detection when clips are implemented
			// This would iterate through all clips and add their start/end times
		}
		
		return points;
	}
	
	private clearSnapLines(): void {
		if (this.snapLines) {
			this.snapLines.clear();
		}
		this.activeSnapPoints = [];
	}
	
	private timeToPixels(time: number, viewport: { scrollX: number; zoom: number }): number {
		return time * viewport.zoom - viewport.scrollX;
	}
	
	public dispose(): void {
		if (this.snapLines) {
			this.snapLines.destroy();
			this.snapLines = null;
		}
		super.dispose();
	}
}