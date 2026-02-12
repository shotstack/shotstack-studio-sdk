# Shotstack Studio

[![npm version](https://img.shields.io/npm/v/@shotstack/shotstack-studio.svg)](https://www.npmjs.com/package/@shotstack/shotstack-studio)
[![License](https://img.shields.io/badge/license-PolyForm_Shield-blue.svg)](https://polyformproject.org/licenses/shield/1.0.0/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)

A JavaScript SDK for browser-based video editing with timeline, canvas preview, and export.

## Interactive Examples

Try Shotstack Studio in your preferred framework:

[![TypeScript](https://img.shields.io/badge/TypeScript-StackBlitz-blue?style=for-the-badge&logo=typescript)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/typescript)
[![React](https://img.shields.io/badge/React-StackBlitz-blue?style=for-the-badge&logo=react)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/react)
[![Vue](https://img.shields.io/badge/Vue-StackBlitz-blue?style=for-the-badge&logo=vue.js)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/vue)
[![Angular](https://img.shields.io/badge/Angular-StackBlitz-blue?style=for-the-badge&logo=angular)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/angular)
[![Next.js](https://img.shields.io/badge/Next.js-StackBlitz-blue?style=for-the-badge&logo=next.js)](https://stackblitz.com/fork/github/shotstack/shotstack-studio-sdk-demos/tree/master/nextjs)

## Features

- Template-driven editing with undo/redo command model
- Canvas preview rendering
- Visual timeline with drag, resize, selection, and snapping
- Extensible UI via `UIController` button API
- Browser export pipeline via `VideoExporter`

## Installation

```bash
npm install @shotstack/shotstack-studio
```

```bash
yarn add @shotstack/shotstack-studio
```

## Quick Start

```typescript
import { Edit, Canvas, Controls, Timeline, UIController } from "@shotstack/shotstack-studio";

// 1) Load a template
const response = await fetch("https://shotstack-assets.s3.amazonaws.com/templates/hello-world/hello.json");
const template = await response.json();

// 2) Create core components
const edit = new Edit(template);
const canvas = new Canvas(edit);
const ui = UIController.create(edit, canvas);

// 3) Load runtime
await canvas.load();
await edit.load();

// 4) Add one custom UI button
ui.registerButton({
  id: "text",
  icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3H13"/><path d="M8 3V13"/><path d="M5 13H11"/></svg>`,
  tooltip: "Add Text"
});

ui.on("button:text", ({ position }) => {
  edit.addTrack(0, {
    clips: [
      {
        asset: {
          type: "rich-text",
          text: "Title",
          font: { family: "Work Sans", size: 72, weight: 600, color: "#ffffff", opacity: 1 },
          align: { horizontal: "center", vertical: "middle" }
        },
        start: position,
        length: 5,
        width: 500,
        height: 200
      }
    ]
  });
});

// 5) Timeline + controls
const timelineContainer = document.querySelector("[data-shotstack-timeline]") as HTMLElement;
const timeline = new Timeline(edit, timelineContainer, {
  features: {
    toolbar: true,
    ruler: true,
    playhead: true,
    snap: true,
    badges: true,
    multiSelect: true
  }
});
await timeline.load();

const controls = new Controls(edit);
await controls.load();
```

Your HTML must include both containers:

```html
<div data-shotstack-studio></div>
<div data-shotstack-timeline></div>
```

## Main Components

### Edit

`Edit` is the runtime editing session and source of truth for document mutations.

```typescript
import { Edit } from "@shotstack/shotstack-studio";

const edit = new Edit(templateJson);
await edit.load();

await edit.loadEdit(nextTemplateJson);

// Playback (seconds)
edit.play();
edit.pause();
edit.seek(2);
edit.stop();

// Mutations
await edit.addTrack(0, { clips: [] });
await edit.addClip(0, {
  asset: { type: "image", src: "https://example.com/image.jpg" },
  start: 0,
  length: 5
});
await edit.updateClip(0, 0, { length: 6 });
await edit.deleteClip(0, 0);

// History
await edit.undo();
await edit.redo();

// Read state
const clip = edit.getClip(0, 0);
const track = edit.getTrack(0);
const snapshot = edit.getEdit();
const durationSeconds = edit.totalDuration;
```

#### Events

Listen using string event names:

```typescript
edit.events.on("clip:selected", data => {
  console.log("Selected clip", data.trackIndex, data.clipIndex);
});

edit.events.on("clip:updated", data => {
  console.log("Updated from", data.previous, "to", data.current);
});

edit.events.on("playback:play", () => {
  console.log("Playback started");
});
```

Available event names:

- Playback: `playback:play`, `playback:pause`
- Timeline: `timeline:updated`, `timeline:backgroundChanged`
- Clip lifecycle: `clip:added`, `clip:split`, `clip:selected`, `clip:updated`, `clip:deleted`, `clip:restored`, `clip:copied`, `clip:loadFailed`, `clip:unresolved`
- Selection: `selection:cleared`
- Edit state: `edit:changed`, `edit:undo`, `edit:redo`
- Track: `track:added`, `track:removed`
- Duration: `duration:changed`
- Output: `output:resized`, `output:resolutionChanged`, `output:aspectRatioChanged`, `output:fpsChanged`, `output:formatChanged`, `output:destinationsChanged`
- Merge fields: `mergefield:registered`, `mergefield:updated`, `mergefield:removed`, `mergefield:changed`, `mergefield:applied`
- Transcription: `transcription:progress`, `transcription:completed`, `transcription:failed`
- Luma masking: `luma:attached`, `luma:detached`

### Canvas

`Canvas` renders the current edit.

```typescript
import { Canvas } from "@shotstack/shotstack-studio";

const canvas = new Canvas(edit);
await canvas.load();

canvas.centerEdit();
canvas.zoomToFit();
canvas.setZoom(1.25);
canvas.resize();
canvas.dispose();
```

### UIController

`UIController` manages built-in UI wiring and extensible button events.

```typescript
import { UIController } from "@shotstack/shotstack-studio";

const ui = UIController.create(edit, canvas, { mergeFields: true });

ui.registerButton({
  id: "add-title",
  icon: `<svg viewBox="0 0 16 16">...</svg>`,
  tooltip: "Add Title"
});

const unsubscribe = ui.on("button:add-title", ({ position }) => {
  console.log("Button clicked at", position, "seconds");
});

ui.unregisterButton("add-title");
unsubscribe();
ui.dispose();
```

### Timeline

`Timeline` provides visual clip editing.

```typescript
import { Timeline } from "@shotstack/shotstack-studio";

const container = document.querySelector("[data-shotstack-timeline]") as HTMLElement;
const timeline = new Timeline(edit, container, {
  features: { toolbar: true, ruler: true, playhead: true, snap: true, badges: true, multiSelect: true }
});

await timeline.load();
timeline.zoomIn();
timeline.zoomOut();
timeline.dispose();
```

### Controls

`Controls` enables keyboard playback/edit shortcuts.

```typescript
import { Controls } from "@shotstack/shotstack-studio";

const controls = new Controls(edit);
await controls.load();
```

### VideoExporter

`VideoExporter` exports a timeline render from the browser runtime.

```typescript
import { VideoExporter } from "@shotstack/shotstack-studio";

const exporter = new VideoExporter(edit, canvas);
await exporter.export("my-video.mp4", 25);
```

## Merge Fields

Merge fields are template placeholders, typically in the form `{{ FIELD_NAME }}`.

```json
{
  "asset": {
    "type": "text",
    "text": "{{ TITLE }}"
  }
}
```

When merge-field-aware UI is required, enable it via `UIController` options:

```typescript
const ui = UIController.create(edit, canvas, { mergeFields: true });
```

You can also subscribe to merge field events when integrations update merge data:

```typescript
edit.events.on("mergefield:updated", ({ field }) => {
  console.log(field.name, field.defaultValue);
});
```

## Custom UI Buttons

Use `UIController` to register and handle custom button actions.

```typescript
ui.registerButton({
  id: "text",
  icon: `<svg viewBox="0 0 16 16">...</svg>`,
  tooltip: "Add Text",
  dividerBefore: true
});

ui.on("button:text", ({ position, selectedClip }) => {
  console.log("Current time (seconds):", position);
  console.log("Current selection:", selectedClip);
});

ui.unregisterButton("text");
```

## API Reference

For schema-level details and type definitions, see the [Shotstack API Reference](https://shotstack.io/docs/api/#tocs_edit).

## License

PolyForm Shield License 1.0.0
