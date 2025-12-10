export interface ToolbarButtonConfig {
	id: string;
	icon: string;
	tooltip: string;
	event: string;
	dividerBefore?: boolean;
}

export interface ToolbarButtonEventPayload {
	position: number;
	selectedClip: { trackIndex: number; clipIndex: number } | null;
}
