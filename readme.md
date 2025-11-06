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
- WYSIWYG text editing
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

// 2. Initialize the edit
const edit = new Edit(template.output.size, template.timeline.background);
await edit.load();

// 3. Create a canvas to display the edit
const canvas = new Canvas(template.output.size, edit);
await canvas.load(); // Renders to [data-shotstack-studio] element

// 4. Load the template
await edit.loadEdit(template);

// 5. Initialize the Timeline
const timeline = new Timeline(edit, { width: 1280, height: 300 });
await timeline.load(); // Renders to [data-shotstack-timeline] element

// 6. Add keyboard controls
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

// For schema validation only (e.g., in tests):
import { EditSchema, ClipSchema } from "@shotstack/shotstack-studio/schema";
// Create an edit with dimensions and background
const edit = new Edit({ width: 1280, height: 720 }, "#000000");
await edit.load();

// Load from template
await edit.loadEdit(templateJson);

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

// Get edit information
const clip = edit.getClip(0, 0);
const track = edit.getTrack(0);
const editJson = edit.getEdit();
const duration = edit.totalDuration; // in milliseconds
```

#### Events

The Edit class provides an event system to listen for specific actions:

```typescript
// Listen for clip selection events
edit.events.on("clip:selected", data => {
	console.log("Clip selected:", data.clip);
	console.log("Track index:", data.trackIndex);
	console.log("Clip index:", data.clipIndex);
});

// Listen for clip update events
edit.events.on("clip:updated", data => {
	console.log("Previous state:", data.previous); // { clip, trackIndex, clipIndex }
	console.log("Current state:", data.current); // { clip, trackIndex, clipIndex }
});
```

Available events:

- `clip:selected` - Emitted when a clip is initially selected, providing data about the clip, its track index, and clip index.
- `clip:updated` - Emitted when a clip's properties are modified, providing both previous and current states.

### Canvas

The Canvas class provides the visual rendering of the edit.

```typescript
// Create and load the canvas
const canvas = new Canvas(edit.size, edit);
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

const timeline = new Timeline(edit, { width: 1280, height: 300 });
await timeline.load();

// Timeline features:
// - Visual track and clip representation
// - Drag-and-drop clip manipulation
// - Clip resizing with edge detection
// - Playhead control for navigation
// - Snap-to-grid functionality
// - Zoom and scroll controls
```

### VideoExporter

The VideoExporter class exports the Edit to a MP4 video file encoded in h264 and AAC.

```typescript
const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4", 25); // filename, fps
```

## Theming

Shotstack Studio supports theming for visual components. Currently, theming is available for the Timeline component, with Canvas theming coming in a future releases.

### Built-in Themes

The library includes pre-designed themes that you can use immediately:

```typescript
import { Timeline } from "@shotstack/shotstack-studio";
import darkTheme from "@shotstack/shotstack-studio/themes/dark.json";
import minimalTheme from "@shotstack/shotstack-studio/themes/minimal.json";

// Apply a theme when creating the timeline
const timeline = new Timeline(edit, { width: 1280, height: 300 }, { theme: darkTheme });
```

### Custom Themes

Create your own theme by defining colors and dimensions for each component:

```typescript
const customTheme = {
	timeline: {
		// Main timeline colors
		background: "#1e1e1e",
		divider: "#1a1a1a",
		playhead: "#ff4444",
		snapGuide: "#888888",
		dropZone: "#00ff00",
		trackInsertion: "#00ff00",

		// Toolbar styling
		toolbar: {
			background: "#1a1a1a",
			surface: "#2a2a2a", // Button backgrounds
			hover: "#3a3a3a", // Button hover state
			active: "#007acc", // Button active state
			divider: "#3a3a3a", // Separator lines
			icon: "#888888", // Icon colors
			text: "#ffffff", // Text color
			height: 36 // Toolbar height in pixels
		},

		// Ruler styling
		ruler: {
			background: "#404040",
			text: "#ffffff", // Time labels
			markers: "#666666", // Time marker dots
			height: 40 // Ruler height in pixels
		},

		// Track styling
		tracks: {
			surface: "#2d2d2d", // Primary track color
			surfaceAlt: "#252525", // Alternating track color
			border: "#3a3a3a", // Track borders
			height: 60 // Track height in pixels
		},

		// Clip colors by asset type
		clips: {
			video: "#4a9eff",
			audio: "#00d4aa",
			image: "#f5a623",
			text: "#d0021b",
			shape: "#9013fe",
			html: "#50e3c2",
			luma: "#b8e986",
			default: "#8e8e93", // Unknown asset types
			selected: "#007acc", // Selection border
			radius: 4 // Corner radius in pixels
		}
	}
	// Canvas theming will be available in future releases
	// canvas: { ... }
};

const timeline = new Timeline(edit, { width: 1280, height: 300 }, { theme: customTheme });
```

### Theme Structure

Themes are organized by component, making it intuitive to customize specific parts of the interface:

- **Timeline**: Controls the appearance of the timeline interface

  - `toolbar`: Playback controls and buttons
  - `ruler`: Time markers and labels
  - `tracks`: Track backgrounds and borders
  - `clips`: Asset-specific colors and selection states
  - Global timeline properties (background, playhead, etc.)

- **Canvas** (coming soon): Will control the appearance of the video preview area

## Template Format

Templates use a JSON format with the following structure:

```typescript
{
  timeline: {
    background: "#000000",
    fonts: [
      { src: "https://example.com/font.ttf" }
    ],
    tracks: [
      {
        clips: [
          {
            asset: {
              type: "image", // image, video, text, shape, audio
              src: "https://example.com/image.jpg",
              // Other asset properties depend on type
            },
            start: 0,        // Start time in seconds
            length: 5,       // Duration in seconds
            transition: {    // Optional transitions
              in: "fade",
              out: "fade"
            },
            position: "center", // Positioning
            scale: 1,           // Scale factor
			offset: {
				x: 0.1,         // X-axis offset relative to position
				y: 0            // Y-axis offset relative to position
			}
          }
        ]
      }
    ]
  },
  output: {
    format: "mp4",
    size: {
      width: 1280,
      height: 720
    }
  }
}
```

## License

PolyForm Shield License 1.0.0

## API Reference

### Edit

The `Edit` class represents a video editing project with its timeline, clips, and properties.

```typescript
import { Edit } from "@shotstack/shotstack-studio";
import { EditSchema } from "@shotstack/shotstack-studio";
```

#### Constructor

```typescript
constructor(size: Size, backgroundColor: string = "#ffffff")
```

Creates a new Edit instance with the specified dimensions and background color.

#### Properties

- `assetLoader` - Asset loader instance for managing media assets
- `events` - Event emitter for handling events
- `playbackTime` - Current playback position in milliseconds
- `totalDuration` - Total duration of the edit in milliseconds

#### Methods

- `async load()` - Initialize and prepare the edit for rendering
- `async loadEdit(edit: EditType)` - Load an edit from a JSON template
- `play()` - Start playback
- `pause()` - Pause playback
- `seek(target: number)` - Seek to a specific time in milliseconds
- `stop()` - Stop playback and return to beginning
- `addClip(trackIdx: number, clip: ClipType)` - Add a clip to a specific track
- `deleteClip(trackIdx: number, clipIdx: number)` - Delete a clip
- `getClip(trackIdx: number, clipIdx: number)` - Get a clip by track and index
- `addTrack(trackIdx: number, track: TrackType)` - Add a new track
- `getTrack(trackIdx: number)` - Get a track by index
- `deleteTrack(trackIdx: number)` - Delete a track
- `getEdit()` - Get the full edit configuration as a JSON object
- `undo()` - Undo the last editing operation
- `redo()` - Redo the last undone operation

#### Events

- `clip:selected` - Triggered when a clip is selected
- `clip:updated` - Triggered when a clip is modified
- `edit:undo` - Triggered when an undo operation is performed
- `edit:redo` - Triggered when a redo operation is performed

### Canvas

The `Canvas` class provides the visual rendering of the edit.

```typescript
import { Canvas } from "@shotstack/shotstack-studio";
import type { Size } from "@shotstack/shotstack-studio";
```

#### Constructor

```typescript
constructor(size: Size, edit: Edit)
```

Creates a new canvas with specified dimensions for rendering the edit.

#### Methods

- `async load()` - Initialize the canvas and add it to the DOM
- `centerEdit()` - Center the edit in the canvas
- `zoomToFit()` - Zoom to fit the entire edit
- `setZoom(zoom: number)` - Set zoom level
- `dispose()` - Clean up resources and remove the canvas from the DOM

### Controls

The `Controls` class adds keyboard controls for playback.

```typescript
import { Controls } from "@shotstack/shotstack-studio";
```

#### Constructor

```typescript
constructor(edit: Edit)
```

Creates a new controls instance for the provided Edit.

#### Methods

- `async load()` - Set up event listeners for keyboard controls

### Timeline

The `Timeline` class provides a visual timeline interface for video editing.

```typescript
import { Timeline } from "@shotstack/shotstack-studio";
```

#### Constructor

```typescript
constructor(edit: Edit, size: { width: number, height: number }, themeOptions?: TimelineThemeOptions)
```

Creates a new timeline interface for the provided Edit.

#### Methods

- `async load()` - Initialize the timeline and add it to the DOM
- `setTheme(themeOptions: TimelineThemeOptions)` - Change the timeline theme
- `setOptions(options: Partial<TimelineOptions>)` - Update timeline options
- `dispose()` - Clean up resources and remove from DOM

### VideoExporter

The `VideoExporter` class handles exporting the edit to MP4.

```typescript
import { VideoExporter } from "@shotstack/shotstack-studio";
```

#### Constructor

```typescript
constructor(edit: Edit, canvas: Canvas)
```

Creates a new exporter for the provided Edit and Canvas.

#### Methods

- `async export(filename: string = "shotstack-export.mp4", fps: number = 25)` - Export the edit to an MP4 video file
