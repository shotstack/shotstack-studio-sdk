import { ClipSchema } from "@core/schemas/clip";
import { EditSchema } from "@schemas/edit";
import { z } from "zod";

export type EditType = z.infer<typeof EditSchema>;
export type ClipConfig = z.infer<typeof ClipSchema>;

export interface TimelineOptions {
	width?: number;
	height?: number;
	pixelsPerSecond?: number;
	trackHeight?: number;
	backgroundColor?: number;
	antialias?: boolean;
	resolution?: number;
}

export interface ClipInfo {
	trackIndex: number;
	clipIndex: number;
	clipConfig: ClipConfig;
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
