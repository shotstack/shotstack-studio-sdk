// Input theme uses hex strings for developer convenience
export interface TimelineThemeInput {
	timeline: {
		background: string;
		divider: string;
		toolbar: {
			background: string;
			surface: string;
			hover: string;
			active: string;
			divider: string;
			icon: string;
			text: string;
			height?: number;
		};
		ruler: {
			background: string;
			text: string;
			markers: string;
			height?: number;
		};
		tracks: {
			surface: string;
			surfaceAlt: string;
			border: string;
			height?: number;
		};
		clips: {
			video: string;
			audio: string;
			image: string;
			text: string;
			shape: string;
			html: string;
			luma: string;
			default: string;
			selected: string;
			radius?: number;
		};
		playhead: string;
		snapGuide: string;
		dropZone: string;
		trackInsertion: string;
	};
}

// Internal theme uses PIXI number format
export interface TimelineTheme {
	timeline: {
		background: number;
		divider: number;
		toolbar: {
			background: number;
			surface: number;
			hover: number;
			active: number;
			divider: number;
			icon: number;
			text: number;
			height: number;
		};
		ruler: {
			background: number;
			text: number;
			markers: number;
			height: number;
		};
		tracks: {
			surface: number;
			surfaceAlt: number;
			border: number;
			height: number;
		};
		clips: {
			video: number;
			audio: number;
			image: number;
			text: number;
			shape: number;
			html: number;
			luma: number;
			default: number;
			selected: number;
			radius: number;
		};
		playhead: number;
		snapGuide: number;
		dropZone: number;
		trackInsertion: number;
	};
}

export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface TimelineThemeOptions {
	theme?: TimelineThemeInput | DeepPartial<TimelineThemeInput>; // Theme data (using hex strings)
}