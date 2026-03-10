import type { Player } from "@canvas/players/player";
import type { MergeField } from "@core/merge/types";
import type { Clip, Destination, Edit as EditConfig, Output, ResolvedEdit } from "@schemas";

// ─────────────────────────────────────────────────────────────
// Event Emission Patterns
// ─────────────────────────────────────────────────────────────
//
// Events are emitted from 4 different contexts, each with its own pattern:
//
// 1. EditSession (direct emit):
//    this.internalEvents.emit(EditEvent.TimelineUpdated, { current });
//    → EditSession owns the EventEmitter, so it emits directly.
//
// 2. EditSession (emitEditChanged wrapper):
//    this.emitEditChanged("command-name");
//    → Special wrapper for EditChanged only. Has batching (skips if
//      isBatchingEvents is true) and auto-adds timestamp.
//
// 3. Commands (context delegation):
//    context.emitEvent(EditEvent.ClipUpdated, { previous, current });
//    → Commands receive a CommandContext to stay decoupled from Edit.
//      This enables testing commands in isolation.
//
// 4. Managers (delegate through edit):
//    this.edit.getInternalEvents().emit(EditEvent.OutputResized, { width, height });
//    → Managers hold a reference to Edit and delegate via getInternalEvents().
//
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Shared Payload Types
// ─────────────────────────────────────────────────────────────

export type ClipLocation = {
	trackIndex: number;
	clipIndex: number;
};

/**
 * Reference to a clip from the document (source of truth).
 * Contains original timing values like "auto", "end", and alias references.
 * Used in public SDK events so consumers see the document state.
 */
export type ClipReference = ClipLocation & {
	clip: Clip;
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
	ClipSelected: "clip:selected",
	ClipUpdated: "clip:updated",
	ClipDeleted: "clip:deleted",
	ClipRestored: "clip:restored",
	ClipCopied: "clip:copied",
	ClipLoadFailed: "clip:loadFailed",
	ClipUnresolved: "clip:unresolved",

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
	OutputResolutionChanged: "output:resolutionChanged",
	OutputAspectRatioChanged: "output:aspectRatioChanged",
	OutputFpsChanged: "output:fpsChanged",
	OutputFormatChanged: "output:formatChanged",
	OutputDestinationsChanged: "output:destinationsChanged",

	// Merge fields
	MergeFieldChanged: "mergefield:changed",

	// Timeline UI
	TimelineResized: "timeline:resized"
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

	// Resolution - document to resolved edit transformation
	Resolved: "resolved",

	// Edit → Canvas visual sync
	PlayerAddedToTrack: "player:addedToTrack",
	PlayerMovedBetweenTracks: "player:movedBetweenTracks",
	PlayerRemovedFromTrack: "player:removedFromTrack",
	PlayerLoaded: "player:loaded",
	TrackContainerRemoved: "track:containerRemoved",
	ViewportSizeChanged: "viewport:sizeChanged",
	ViewportNeedsZoomToFit: "viewport:needsZoomToFit"
} as const;

// ─────────────────────────────────────────────────────────────
// Event Payload Maps
// ─────────────────────────────────────────────────────────────

export type EditEventMap = {
	// Playback
	[EditEvent.PlaybackPlay]: void;
	[EditEvent.PlaybackPause]: void;

	// Timeline
	/** Contains the document (source of truth) with original timing values like "auto", "end" */
	[EditEvent.TimelineUpdated]: { current: EditConfig };
	[EditEvent.TimelineBackgroundChanged]: { color: string };

	// Clip lifecycle
	[EditEvent.ClipAdded]: ClipLocation;
	[EditEvent.ClipSelected]: ClipReference;
	[EditEvent.ClipUpdated]: { previous: ClipReference; current: ClipReference };
	[EditEvent.ClipDeleted]: ClipLocation;
	[EditEvent.ClipRestored]: ClipLocation;
	[EditEvent.ClipCopied]: ClipLocation;
	[EditEvent.ClipLoadFailed]: ClipLocation & { error: string; assetType: string };
	[EditEvent.ClipUnresolved]: ClipLocation & { assetType: string; clipId: string };

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
	[EditEvent.OutputResolutionChanged]: { resolution: Output["resolution"] };
	[EditEvent.OutputAspectRatioChanged]: { aspectRatio: Output["aspectRatio"] };
	[EditEvent.OutputFpsChanged]: { fps: number };
	[EditEvent.OutputFormatChanged]: { format: Output["format"] };
	[EditEvent.OutputDestinationsChanged]: { destinations: Destination[] };

	// Merge fields
	[EditEvent.MergeFieldChanged]: { fields: MergeField[] };

	// Timeline UI
	[EditEvent.TimelineResized]: { height: number };
};

// Internal event payloads - not part of public API
export type InternalEventMap = {
	// Canvas interaction
	[InternalEvent.CanvasClipClicked]: { player: Player };
	[InternalEvent.CanvasBackgroundClicked]: void;

	// Font
	[InternalEvent.FontCapabilitiesChanged]: { supportsBold: boolean };

	// Resolution
	[InternalEvent.Resolved]: { edit: ResolvedEdit };

	// Edit → Canvas visual sync
	[InternalEvent.PlayerAddedToTrack]: { player: Player; trackIndex: number };
	[InternalEvent.PlayerMovedBetweenTracks]: {
		player: Player;
		fromTrackIndex: number;
		toTrackIndex: number;
	};
	[InternalEvent.PlayerRemovedFromTrack]: { player: Player; trackIndex: number };
	[InternalEvent.PlayerLoaded]: { player: Player; trackIndex: number; clipIndex: number };
	[InternalEvent.TrackContainerRemoved]: { trackIndex: number };
	[InternalEvent.ViewportSizeChanged]: {
		width: number;
		height: number;
		backgroundColor: string;
	};
	[InternalEvent.ViewportNeedsZoomToFit]: void;
};
