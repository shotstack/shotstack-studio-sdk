# Shotstack Studio

[![npm version](https://img.shields.io/npm/v/@shotstack/shotstack-studio.svg)](https://www.npmjs.com/package/@shotstack/shotstack-studio)
[![License](https://img.shields.io/badge/license-PolyForm_Shield-blue.svg)](https://polyformproject.org/licenses/shield/1.0.0/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

A JavaScript library for creating and editing videos in the browser.

## Interactive Examples

Try Shotstack Studio in your preferred framework:

[![TypeScript](https://img.shields.io/badge/TypeScript-StackBlitz-blue?style=for-the-badge&logo=typescript)](https://stackblitz.com/edit/studio-sdk-typescript?file=src%2Fmain.ts)
[![React](https://img.shields.io/badge/React-StackBlitz-blue?style=for-the-badge&logo=react)](https://stackblitz.com/edit/studio-sdk-typescript?file=src%2Fmain.ts)
[![Vue](https://img.shields.io/badge/Vue-StackBlitz-blue?style=for-the-badge&logo=vue.js)](https://stackblitz.com/edit/shotstack-studio-vue?file=src%2FApp.vue)
[![Angular](https://img.shields.io/badge/Angular-StackBlitz-blue?style=for-the-badge&logo=angular)](https://stackblitz.com/edit/shotstack-studio-angular?file=src%2Fmain.ts)
[![Next.js](https://img.shields.io/badge/Next.js-StackBlitz-blue?style=for-the-badge&logo=next.js)](https://stackblitz.com/edit/shotstack-studio-nextjs?file=app%2Fpage.tsx)

## Installation

```bash
npm install @shotstack/shotstack-studio
```

```bash
yarn add @shotstack/shotstack-studio
```

### FFmpeg (peer dependency)

Install FFmpeg to use the browser based `VideoExporter` class. This is kept separate to prevent WASM / Web Worker clashes in frameworks like Next.js.

```bash
npm install @ffmpeg/ffmpeg
```

You can skip this if you're using the [Shotstack Edit API](https://shotstack.io/docs/guide/getting-started/hello-world-using-curl/) for rendering videos.

## Quick Start

```typescript
import { Edit, Canvas, Controls } from "@shotstack/shotstack-studio";

// 1. Retrieve an edit from a template
const templateUrl = "https://shotstack-assets.s3.amazonaws.com/templates/hello-world/hello.json";
const response = await fetch(templateUrl);
const template = await response.json();

// 2. Initialize the edit with dimensions and background color
const edit = new Edit(template.output.size, template.timeline.background);
await edit.load();

// 3. Create a canvas to display the edit
const canvas = new Canvas(template.output.size, edit);
await canvas.load(); // Renders to [data-shotstack-studio] element

// 4. Load the template
await edit.loadEdit(template);

// 5. Add keyboard controls
const controls = new Controls(edit);
await controls.load();
```

Your HTML should include a container with the `data-shotstack-studio` attribute:

```html
<div data-shotstack-studio></div>
```

## Features

- Create video compositions with multiple tracks and clips
- Use in conjunction with the [Shotstack Edit API](https://shotstack.io/docs/guide/getting-started/hello-world-using-curl/) to render video
- Export to video using browser-based FFmpeg

## Main Components

### Edit

The Edit class represents a video project with its timeline, clips, and properties.

```typescript
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
```

### VideoExporter

The VideoExporter class exports the edit to a video file.

```typescript
const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4", 25); // filename, fps
```

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

#### Events

- `clip:selected` - Triggered when a clip is selected
- `clip:updated` - Triggered when a clip is modified

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

### VideoExporter

The `VideoExporter` class handles exporting the edit to mp4.

```typescript
import { VideoExporter } from "@shotstack/shotstack-studio";
```

#### Constructor

```typescript
constructor(edit: Edit, canvas: Canvas)
```

Creates a new exporter for the provided Edit and Canvas.

#### Methods

- `async export(filename: string = "shotstack-export.mp4", fps: number = 25)` - Export the edit to a video file
