# Shotstack Studio

[![npm version](https://img.shields.io/npm/v/@shotstack/shotstack-studio.svg)](https://www.npmjs.com/package/@shotstack/shotstack-studio)
[![License](https://img.shields.io/badge/license-PolyForm_Shield-blue.svg)](https://polyformproject.org/licenses/shield/1.0.0/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

A JavaScript library for creating and editing videos in the browser.

## Interactive Examples

Try Shotstack Studio in your preferred framework:

[![TypeScript](https://img.shields.io/badge/TypeScript-StackBlitz-blue?style=for-the-badge&logo=typescript)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/typescript)
[![React](https://img.shields.io/badge/React-StackBlitz-blue?style=for-the-badge&logo=react)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/react)
[![Vue](https://img.shields.io/badge/Vue-StackBlitz-blue?style=for-the-badge&logo=vue.js)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/vue)
[![Angular](https://img.shields.io/badge/Angular-StackBlitz-blue?style=for-the-badge&logo=angular)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/angular)
[![Next.js](https://img.shields.io/badge/Next.js-StackBlitz-blue?style=for-the-badge&logo=next.js)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/nextjs)

## Features

- Create video compositions with multiple tracks and clips
- Visual timeline interface
- Multi-track, drag-and-drop clip manipulation with snap-to-grid
- Use in conjunction with the [Shotstack Edit API](https://shotstack.io/docs/guide/getting-started/hello-world-using-curl/) to render video
- Export to video via the browser

## Installation

```bash
npm install @shotstack/shotstack-studio
```

```bash
yarn add @shotstack/shotstack-studio
```

## Quick Start

```typescript
import { Edit, Canvas, Controls, Timeline } from "@shotstack/shotstack-studio";

// 1. Load a template
const response = await fetch("https://shotstack-assets.s3.amazonaws.com/templates/hello-world/hello.json");
const template = await response.json();

// 2. Create Edit from template and load it
const edit = new Edit(template);
await edit.load();

// 3. Create a canvas to display the edit
const canvas = new Canvas(edit);
await canvas.load(); // Renders to [data-shotstack-studio] element

// 4. Initialize the Timeline
const container = document.querySelector("[data-shotstack-timeline]");
const timeline = new Timeline(edit, container, {
  features: { toolbar: true, ruler: true, playhead: true, snap: true }
});
await timeline.load();

// 5. Add keyboard controls
const controls = new Controls(edit);
await controls.load();
```

Your HTML should include containers for both the canvas and timeline:

```html
<div data-shotstack-studio></div>
<div data-shotstack-timeline></div>
```

## Main Components

### Edit

The Edit class represents a video project with its timeline, clips, and properties.

```typescript
import { Edit } from "@shotstack/shotstack-studio";

// Create an edit from a template
const edit = new Edit(templateJson);
await edit.load();

// Or reload a different template later
await edit.loadEdit(newTemplate);

// Playback controls
edit.play();
edit.pause();
edit.seek(2000); // Seek to 2 seconds (in milliseconds)
edit.stop(); // Stop and return to beginning

// Editing functions
edit.addClip(0, {
  asset: {
    type: "image",
    src: "https://example.com/image.jpg"
  },
  start: 0,
  length: 5
});

edit.addTrack(1, { clips: [] });
edit.deleteClip(0, 0);
edit.deleteTrack(1);

// Undo/Redo
edit.undo();
edit.redo();
edit.canUndo(); // Check if undo is available (useful for UI)
edit.canRedo(); // Check if redo is available

// Get edit information
const clip = edit.getClip(0, 0);
const track = edit.getTrack(0);
const editJson = edit.getEdit();
const duration = edit.totalDuration; // in milliseconds
```

#### Events

The Edit class provides a typed event system to listen for specific actions:

```typescript
import { Edit, EditEvent } from "@shotstack/shotstack-studio";

// Listen for clip selection events
edit.events.on(EditEvent.ClipSelected, data => {
  console.log("Clip selected:", data.clip);
  console.log("Track index:", data.trackIndex);
  console.log("Clip index:", data.clipIndex);
});

// Listen for clip update events
edit.events.on(EditEvent.ClipUpdated, data => {
  console.log("Previous state:", data.previous);
  console.log("Current state:", data.current);
});

// Listen for playback events
edit.events.on(EditEvent.PlaybackPlay, () => console.log("Playing"));
edit.events.on(EditEvent.PlaybackPause, () => console.log("Paused"));
```

Available events:

**Playback:** `PlaybackPlay`, `PlaybackPause`

**Clips:** `ClipAdded`, `ClipDeleted`, `ClipSelected`, `ClipUpdated`, `ClipCopied`, `ClipSplit`, `ClipRestored`

**Selection:** `SelectionCleared`

**Edit State:** `EditChanged`, `EditUndo`, `EditRedo`

**Tracks:** `TrackAdded`, `TrackRemoved`

**Duration:** `DurationChanged`

**Output:** `OutputResized`, `OutputFpsChanged`, `OutputFormatChanged`

**Merge Fields:** `MergeFieldRegistered`, `MergeFieldUpdated`, `MergeFieldRemoved`, `MergeFieldChanged`

**Transcription:** `TranscriptionProgress`, `TranscriptionCompleted`, `TranscriptionFailed`

### Canvas

The Canvas class provides the visual rendering of the edit.

```typescript
// Create and load the canvas
const canvas = new Canvas(edit);
await canvas.load();

// Zoom and positioning
canvas.centerEdit();
canvas.zoomToFit();
canvas.setZoom(1.5); // 1.0 is 100%, 0.5 is 50%, etc.
canvas.dispose(); // Clean up resources when done
```

### Controls

The Controls class adds keyboard controls for playback.

```typescript
const controls = new Controls(edit);
await controls.load();

// Available keyboard controls:
// Space - Play/Pause
// J - Stop
// K - Pause
// L - Play
// Left Arrow - Seek backward
// Right Arrow - Seek forward
// Shift + Arrow - Seek larger amount
// Comma - Step backward one frame
// Period - Step forward one frame
// Cmd/Ctrl + Z - Undo
// Cmd/Ctrl + Shift + Z - Redo
// Cmd/Ctrl + E - Export/download video
```

### Timeline

The Timeline class provides a visual timeline interface for editing.

```typescript
import { Timeline } from "@shotstack/shotstack-studio";

const container = document.querySelector("[data-shotstack-timeline]");
const timeline = new Timeline(edit, container, {
  features: {
    toolbar: true, // Playback controls and editing buttons
    ruler: true, // Time ruler with markers
    playhead: true, // Draggable playhead
    snap: true, // Snap clips to grid and other clips
    badges: true // Asset type badges on clips
  }
});
await timeline.load();
```

### VideoExporter

The VideoExporter class exports the Edit to a MP4 video file encoded in h264 and AAC.

```typescript
const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4", 25); // filename, fps
```

## Merge Fields

Merge fields allow dynamic content substitution using `{{ FIELD_NAME }}` syntax in your templates.

```typescript
import { Edit, EditEvent } from "@shotstack/shotstack-studio";

// Set a merge field value
edit.setMergeField("TITLE", "My Video Title");
edit.setMergeField("SUBTITLE", "A great subtitle");

// Get all registered merge fields
const fields = edit.getMergeFields();

// Listen for merge field changes
edit.events.on(EditEvent.MergeFieldUpdated, ({ field }) => {
  console.log(`Field ${field.name} updated to:`, field.value);
});
```

In templates, use placeholders that will be replaced with merge field values:

```json
{
  "asset": {
    "type": "text",
    "text": "{{ TITLE }}"
  }
}
```

## Custom Toolbar Buttons

Register custom toolbar buttons to extend the canvas toolbar with your own actions:

```typescript
// Register a custom button
edit.registerToolbarButton({
  id: "add-text",
  icon: `<svg viewBox="0 0 16 16">...</svg>`,
  tooltip: "Add Text",
  event: "text:requested",
  dividerBefore: true // Optional: add a divider before this button
});

// Handle the custom event
edit.events.on("text:requested", ({ position }) => {
  // position is the current playhead position in milliseconds
  edit.addClip(0, {
    asset: { type: "text", text: "New Text" },
    start: position / 1000,
    length: 5
  });
});
```

## API Reference

For complete schema and type definitions, see the [Shotstack API Reference](https://shotstack.io/docs/api/#tocs_edit).

## License

PolyForm Shield License 1.0.0
