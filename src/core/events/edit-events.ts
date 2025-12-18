import type { Player } from "@canvas/players/player";
import type { MergeField } from "@core/merge/types";
import type { ToolbarButtonConfig } from "@core/ui/toolbar-button.types";
import type { ResolvedClip } from "@schemas/clip";
import type { ResolvedEdit } from "@schemas/edit";

// ─────────────────────────────────────────────────────────────
// Shared Payload Types
// ─────────────────────────────────────────────────────────────

export type ClipLocation = {
	trackIndex: number;
	clipIndex: number;
};

export type ClipReference = ClipLocation & {
	clip: ResolvedClip;
};

// ─────────────────────────────────────────────────────────────
// Event Names
// ─────────────────────────────────────────────────────────────

export const EditEvent = {
	// Playback
	PlaybackPlay: "playback:play",
	PlaybackPause: "playback:pause",
	PlaybackStop: "playback:stop",

	// Timeline structure
	TimelineUpdated: "timeline:updated",
	TimelineBackgroundChanged: "timeline:background:changed",

	// Clip lifecycle
	ClipSelected: "clip:selected",
	ClipUpdated: "clip:updated",
	ClipDeleted: "clip:deleted",
	ClipRestored: "clip:restored",
	ClipCopied: "clip:copied",

	// Selection
	SelectionCleared: "selection:cleared",

	// Edit state
	EditChanged: "edit:changed",
	EditUndo: "edit:undo",
	EditRedo: "edit:redo",

	// Track
	TrackAdded: "track:added",
	TrackRemoved: "track:removed",
	TrackCreatedUndone: "track:created:undone",

	// Duration
	DurationChanged: "duration:changed",

	// Output configuration
	OutputSizeChanged: "output:size:changed",
	OutputFpsChanged: "output:fps:changed",
	OutputFormatChanged: "output:format:changed",
	OutputDestinationsChanged: "output:destinations:changed",

	// Merge fields
	MergeFieldRegistered: "mergefield:registered",
	MergeFieldUpdated: "mergefield:updated",
	MergeFieldRemoved: "mergefield:removed",
	MergeFieldChanged: "mergefield:changed",
	MergeFieldApplied: "mergefield:applied",

	// Transcription (captions)
	TranscriptionProgress: "transcription:progress",
	TranscriptionComplete: "transcription:complete",
	TranscriptionError: "transcription:error",

	// Font
	FontCapabilitiesChanged: "font:capabilities:changed",

	// Toolbar
	ToolbarButtonsChanged: "toolbar:buttons:changed",

	// Canvas interaction
	CanvasClipClicked: "canvas:clip:clicked",
	CanvasBackgroundClicked: "canvas:background:clicked",

	// Timeline interaction (internal)
	TimelineClipClicked: "timeline:clip:clicked",
	TimelineBackgroundClicked: "timeline:background:clicked",
} as const;

export type EditEventName = (typeof EditEvent)[keyof typeof EditEvent];

// ─────────────────────────────────────────────────────────────
// Event Payload Map
// ─────────────────────────────────────────────────────────────

export type EditEventMap = {
	// Playback
	[EditEvent.PlaybackPlay]: void;
	[EditEvent.PlaybackPause]: void;
	[EditEvent.PlaybackStop]: void;

	// Timeline
	[EditEvent.TimelineUpdated]: { current: ResolvedEdit };
	[EditEvent.TimelineBackgroundChanged]: { color: string };

	// Clip lifecycle
	[EditEvent.ClipSelected]: ClipReference;
	[EditEvent.ClipUpdated]: { previous: ClipReference; current: ClipReference };
	[EditEvent.ClipDeleted]: ClipLocation;
	[EditEvent.ClipRestored]: ClipLocation;
	[EditEvent.ClipCopied]: ClipLocation;

	// Selection
	[EditEvent.SelectionCleared]: void;

	// Edit state
	[EditEvent.EditChanged]: { source: string; timestamp: number };
	[EditEvent.EditUndo]: { command: string };
	[EditEvent.EditRedo]: { command: string };

	// Track
	[EditEvent.TrackAdded]: { trackIndex: number; totalTracks: number };
	[EditEvent.TrackRemoved]: { trackIndex: number };
	[EditEvent.TrackCreatedUndone]: { trackIndex: number };

	// Duration
	[EditEvent.DurationChanged]: { duration: number };

	// Output
	[EditEvent.OutputSizeChanged]: { width: number; height: number };
	[EditEvent.OutputFpsChanged]: { fps: number };
	[EditEvent.OutputFormatChanged]: { format: string };
	[EditEvent.OutputDestinationsChanged]: { destinations: unknown[] };

	// Merge fields
	[EditEvent.MergeFieldRegistered]: { field: MergeField };
	[EditEvent.MergeFieldUpdated]: { field: MergeField };
	[EditEvent.MergeFieldRemoved]: ClipLocation & { propertyPath: string; fieldName: string | null };
	[EditEvent.MergeFieldChanged]: { fields: MergeField[] };
	[EditEvent.MergeFieldApplied]: ClipLocation & { propertyPath: string; fieldName: string };

	// Transcription
	[EditEvent.TranscriptionProgress]: { clipAlias: string; message?: string };
	[EditEvent.TranscriptionComplete]: { clipAlias: string; cueCount: number };
	[EditEvent.TranscriptionError]: { clipAlias: string; error: string };

	// Font
	[EditEvent.FontCapabilitiesChanged]: { supportsBold: boolean };

	// Toolbar
	[EditEvent.ToolbarButtonsChanged]: { buttons: ToolbarButtonConfig[] };

	// Canvas
	[EditEvent.CanvasClipClicked]: { player: Player };
	[EditEvent.CanvasBackgroundClicked]: void;

	// Timeline (internal)
	[EditEvent.TimelineClipClicked]: { player: Player; trackIndex: number; clipIndex: number };
	[EditEvent.TimelineBackgroundClicked]: void;
};
