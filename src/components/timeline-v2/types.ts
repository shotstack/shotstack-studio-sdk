import { EditSchema } from "@schemas/edit";
import { z } from "zod";

export type EditType = z.infer<typeof EditSchema>;

export interface TimelineV2Options {
	width: number;
	height: number;
	pixelsPerSecond: number;
	trackHeight: number;
}

export interface ClipInfo {
	trackIndex: number;
	clipIndex: number;
	clipConfig: any;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DropPosition {
	track: number;
	time: number;
	x: number;
	y: number;
}

export interface TimelineV2Tool {
	readonly name: string;
	
	// Lifecycle methods for event listener management
	onActivate(): void;
	onDeactivate(): void;
	
	// Tools use PIXI's native event system - no coordinate-based hit testing
	// event.target.label contains "clip-trackIndex-clipIndex" or "track-trackIndex"
	// Use event.global coordinates for positioning
}