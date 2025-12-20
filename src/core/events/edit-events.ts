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
// Public Events (External API)
// ─────────────────────────────────────────────────────────────

export const EditEvent = {
	// Playback
	PlaybackPlay: "playback:play",
	PlaybackPause: "playback:pause",

	// Timeline structure
	TimelineUpdated: "timeline:updated",
	TimelineBackgroundChanged: "timeline:backgroundChanged",

	// Clip lifecycle
	ClipAdded: "clip:added",
	ClipSplit: "clip:split",
	ClipSelected: "clip:selected",
	ClipUpdated: "clip:updated",
	ClipDeleted: "clip:deleted",
	ClipRestored: "clip:restored",
	ClipCopied: "clip:copied",
	ClipLoadFailed: "clip:loadFailed",

	// Selection
	SelectionCleared: "selection:cleared",

	// Edit state
	EditChanged: "edit:changed",
	EditUndo: "edit:undo",
	EditRedo: "edit:redo",

	// Track
	TrackAdded: "track:added",
	TrackRemoved: "track:removed",

	// Duration
	DurationChanged: "duration:changed",

	// Output configuration
	OutputResized: "output:resized",
	OutputFpsChanged: "output:fpsChanged",
	OutputFormatChanged: "output:formatChanged",
	OutputDestinationsChanged: "output:destinationsChanged",

	// Merge fields
	MergeFieldRegistered: "mergefield:registered",
	MergeFieldUpdated: "mergefield:updated",
	MergeFieldRemoved: "mergefield:removed",
	MergeFieldChanged: "mergefield:changed",
	MergeFieldApplied: "mergefield:applied",

	// Transcription (captions)
	TranscriptionProgress: "transcription:progress",
	TranscriptionCompleted: "transcription:completed",
	TranscriptionFailed: "transcription:failed"
} as const;

export type EditEventName = (typeof EditEvent)[keyof typeof EditEvent];

// ─────────────────────────────────────────────────────────────
// Internal Events (SDK Plumbing - Not Exported)
// ─────────────────────────────────────────────────────────────

// Internal SDK component communication - not part of public API
export const InternalEvent = {
	// Canvas → Edit communication
	CanvasClipClicked: "canvas:clipClicked",
	CanvasBackgroundClicked: "canvas:backgroundClicked",

	// Font capability detection
	FontCapabilitiesChanged: "font:capabilitiesChanged",

	// Toolbar updates
	ToolbarButtonsChanged: "toolbar:buttonsChanged"
} as const;

export type InternalEventName = (typeof InternalEvent)[keyof typeof InternalEvent];

// ─────────────────────────────────────────────────────────────
// Event Payload Maps
// ─────────────────────────────────────────────────────────────

export type EditEventMap = {
	// Playback
	[EditEvent.PlaybackPlay]: void;
	[EditEvent.PlaybackPause]: void;

	// Timeline
	[EditEvent.TimelineUpdated]: { current: ResolvedEdit };
	[EditEvent.TimelineBackgroundChanged]: { color: string };

	// Clip lifecycle
	[EditEvent.ClipAdded]: ClipLocation;
	[EditEvent.ClipSplit]: { trackIndex: number; originalClipIndex: number; newClipIndex: number };
	[EditEvent.ClipSelected]: ClipReference;
	[EditEvent.ClipUpdated]: { previous: ClipReference; current: ClipReference };
	[EditEvent.ClipDeleted]: ClipLocation;
	[EditEvent.ClipRestored]: ClipLocation;
	[EditEvent.ClipCopied]: ClipLocation;
	[EditEvent.ClipLoadFailed]: ClipLocation & { error: string; assetType: string };

	// Selection
	[EditEvent.SelectionCleared]: void;

	// Edit state
	[EditEvent.EditChanged]: { source: string; timestamp: number };
	[EditEvent.EditUndo]: { command: string };
	[EditEvent.EditRedo]: { command: string };

	// Track
	[EditEvent.TrackAdded]: { trackIndex: number; totalTracks: number };
	[EditEvent.TrackRemoved]: { trackIndex: number };

	// Duration
	[EditEvent.DurationChanged]: { duration: number };

	// Output
	[EditEvent.OutputResized]: { width: number; height: number };
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
	[EditEvent.TranscriptionCompleted]: { clipAlias: string; cueCount: number };
	[EditEvent.TranscriptionFailed]: { clipAlias: string; error: string };
};

// Internal event payloads - not part of public API
export type InternalEventMap = {
	// Canvas interaction
	"canvas:clipClicked": { player: Player };
	"canvas:backgroundClicked": void;

	// Font
	"font:capabilitiesChanged": { supportsBold: boolean };

	// Toolbar
	"toolbar:buttonsChanged": { buttons: ToolbarButtonConfig[] };
};
