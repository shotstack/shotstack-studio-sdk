import * as PIXI from "pixi.js";

import { TimelineInterface, DropZone, AlignmentInfo } from "./types";

export class VisualFeedbackManager {
	private timeline: TimelineInterface;
	private graphics: Map<string, PIXI.Graphics> = new Map();
	
	constructor(timeline: TimelineInterface) {
		this.timeline = timeline;
	}
	
	public showDropZone(dropZone: DropZone): void {
		this.hideDropZone(); // Clear existing
		
		const graphics = new PIXI.Graphics();
		const layout = this.timeline.getLayout();
		const width = this.timeline.getExtendedTimelineWidth();
		const y = dropZone.position * layout.trackHeight;
		
		const theme = this.timeline.getTheme();
		const color = theme.colors.interaction.trackInsertion;
		
		// Draw highlighted line with thickness
		graphics.setStrokeStyle({ width: 4, color, alpha: 0.8 });
		graphics.moveTo(0, y);
		graphics.lineTo(width, y);
		graphics.stroke();
		
		// Add subtle glow effect
		graphics.setStrokeStyle({ width: 8, color, alpha: 0.3 });
		graphics.moveTo(0, y);
		graphics.lineTo(width, y);
		graphics.stroke();
		
		this.timeline.getContainer().addChild(graphics);
		this.graphics.set('dropZone', graphics);
	}
	
	public hideDropZone(): void {
		this.hideGraphics('dropZone');
	}
	
	public showSnapGuidelines(alignments: AlignmentInfo[]): void {
		this.hideSnapGuidelines(); // Clear existing
		
		const graphics = new PIXI.Graphics();
		const layout = this.timeline.getLayout();
		const theme = this.timeline.getTheme();
		
		alignments.forEach(({ time, tracks, isPlayhead }) => {
			const x = layout.getXAtTime(time);
			const minTrack = Math.min(...tracks);
			const maxTrack = Math.max(...tracks);
			
			const startY = minTrack * layout.trackHeight;
			const endY = (maxTrack + 1) * layout.trackHeight;
			
			const color = isPlayhead 
				? theme.colors.interaction.playhead 
				: theme.colors.interaction.snapGuide;
			
			// Glow effect
			graphics.setStrokeStyle({ width: 3, color, alpha: 0.3 });
			graphics.moveTo(x, startY);
			graphics.lineTo(x, endY);
			graphics.stroke();
			
			// Core line
			graphics.setStrokeStyle({ width: 1, color, alpha: 0.8 });
			graphics.moveTo(x, startY);
			graphics.lineTo(x, endY);
			graphics.stroke();
		});
		
		this.timeline.getContainer().addChild(graphics);
		this.graphics.set('snapGuidelines', graphics);
	}
	
	public hideSnapGuidelines(): void {
		this.hideGraphics('snapGuidelines');
	}
	
	public hideAll(): void {
		this.graphics.forEach((_, key) => this.hideGraphics(key));
	}
	
	private hideGraphics(key: string): void {
		const graphics = this.graphics.get(key);
		if (graphics) {
			graphics.clear();
			if (graphics.parent) {
				graphics.parent.removeChild(graphics);
			}
			graphics.destroy();
			this.graphics.delete(key);
		}
	}
	
	public dispose(): void {
		this.hideAll();
		this.graphics.clear();
	}
}