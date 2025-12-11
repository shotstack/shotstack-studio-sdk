/** Main timeline styles - dark theme only, no CSS variables for theming */
export const TIMELINE_STYLES = `
/* Main container */
.ss-html-timeline {
	--ss-timeline-pixels-per-second: 50;
	position: relative;
	display: flex;
	flex-direction: column;
	background: #18181b;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	font-size: 12px;
	color: #fafafa;
	overflow: hidden;
	user-select: none;
	-webkit-user-select: none;
}

/* Toolbar */
.ss-timeline-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 40px;
	padding: 0 12px;
	background: #18181b;
	border-bottom: 1px solid #27272a;
	flex-shrink: 0;
}

.ss-toolbar-section {
	display: flex;
	align-items: center;
	gap: 8px;
}

.ss-toolbar-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: #a1a1aa;
	cursor: pointer;
	transition: background 0.1s ease, color 0.1s ease;
}

.ss-toolbar-btn:hover {
	background: #3f3f46;
	color: #fafafa;
}

.ss-toolbar-btn:active,
.ss-toolbar-btn.active {
	background: #52525b;
}

.ss-toolbar-btn svg {
	width: 16px;
	height: 16px;
}

.ss-time-display {
	font-variant-numeric: tabular-nums;
	font-size: 11px;
	color: #a1a1aa;
	min-width: 120px;
	text-align: center;
}

.ss-zoom-slider {
	width: 80px;
	height: 4px;
	-webkit-appearance: none;
	appearance: none;
	background: #27272a;
	border-radius: 2px;
	cursor: pointer;
}

.ss-zoom-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	width: 12px;
	height: 12px;
	background: #fafafa;
	border-radius: 50%;
	cursor: grab;
}

/* Ruler */
.ss-timeline-ruler {
	position: relative;
	height: 32px;
	background: #18181b;
	border-bottom: 1px solid #27272a;
	overflow: hidden;
	flex-shrink: 0;
}

.ss-ruler-content {
	position: relative;
	height: 100%;
}

.ss-ruler-marker {
	position: absolute;
	bottom: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	transform: translateX(-50%);
}

.ss-ruler-marker-line {
	width: 1px;
	height: 8px;
	background: #3f3f46;
}

.ss-ruler-marker-label {
	font-size: 10px;
	color: #71717a;
	white-space: nowrap;
	margin-bottom: 2px;
}

.ss-ruler-marker.minor .ss-ruler-marker-line {
	height: 4px;
}

.ss-ruler-marker.minor .ss-ruler-marker-label {
	display: none;
}

/* Tracks container */
.ss-timeline-tracks {
	position: relative;
	flex: 1;
	overflow: auto;
	outline: none;
}

.ss-tracks-content {
	position: relative;
	min-height: 100%;
}

/* Track */
.ss-track {
	position: relative;
	height: 64px;
	border-bottom: 1px solid #3f3f46;
}

.ss-track:nth-child(odd) {
	background: #1f1f23;
}

.ss-track:nth-child(even) {
	background: #27272a;
}

.ss-track.drop-target {
	background: rgba(59, 130, 246, 0.15);
}

/* Clip */
.ss-clip {
	position: absolute;
	top: 4px;
	height: calc(64px - 8px);
	left: calc(var(--clip-start, 0) * var(--ss-timeline-pixels-per-second) * 1px);
	width: calc(var(--clip-length, 1) * var(--ss-timeline-pixels-per-second) * 1px);
	min-width: 20px;
	background: var(--clip-color, #71717a);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 4px;
	cursor: grab;
	overflow: hidden;
	transition: box-shadow 0.1s ease, opacity 0.1s ease;
}

.ss-clip:hover {
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.ss-clip.selected {
	outline: 2px solid #3b82f6;
	outline-offset: -1px;
	box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.ss-clip.dragging {
	opacity: 0.5;
	cursor: grabbing;
}

.ss-clip.resizing {
	cursor: ew-resize;
}

/* Clip asset type colors */
.ss-clip[data-asset-type="video"] { --clip-color: #8b5cf6; }
.ss-clip[data-asset-type="audio"] { --clip-color: #10b981; }
.ss-clip[data-asset-type="image"] { --clip-color: #3b82f6; }
.ss-clip[data-asset-type="text"] { --clip-color: #f59e0b; }
.ss-clip[data-asset-type="rich-text"] { --clip-color: #f59e0b; }
.ss-clip[data-asset-type="shape"] { --clip-color: #ec4899; }
.ss-clip[data-asset-type="html"] { --clip-color: #06b6d4; }
.ss-clip[data-asset-type="luma"] { --clip-color: #6366f1; }
.ss-clip[data-asset-type="caption"] { --clip-color: #14b8a6; }

/* Clip content */
.ss-clip-content {
	display: flex;
	align-items: center;
	padding: 0 8px;
	height: 100%;
	gap: 4px;
}

.ss-clip-label {
	font-size: 11px;
	font-weight: 500;
	color: white;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Timing badge */
.ss-clip-badge {
	position: absolute;
	top: 4px;
	right: 4px;
	width: 16px;
	height: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.4);
	border-radius: 3px;
	font-size: 10px;
	color: white;
	opacity: 0.7;
	transition: opacity 0.1s ease;
}

.ss-clip:hover .ss-clip-badge {
	opacity: 1;
}

.ss-clip-badge[data-intent="fixed"] {
	display: none;
}

/* Resize handle */
.ss-clip-resize-handle {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 12px;
	cursor: ew-resize;
	z-index: 10;
}

.ss-clip-resize-handle.left {
	left: 0;
	border-radius: 4px 0 0 4px;
}

.ss-clip-resize-handle.right {
	right: 0;
	border-radius: 0 4px 4px 0;
}

.ss-clip-resize-handle:hover {
	background: rgba(255, 255, 255, 0.1);
}

/* Playhead */
.ss-playhead {
	position: absolute;
	top: 0;
	bottom: 0;
	left: calc(var(--playhead-time, 0) * var(--ss-timeline-pixels-per-second) * 1px);
	width: 2px;
	pointer-events: none;
	z-index: 50;
}

.ss-playhead-line {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 2px;
	background: #ef4444;
}

.ss-playhead-handle {
	position: absolute;
	top: -4px;
	left: 50%;
	transform: translateX(-50%);
	width: 12px;
	height: 12px;
	background: #ef4444;
	border-radius: 2px 2px 50% 50%;
	cursor: grab;
	pointer-events: auto;
}

.ss-playhead-handle:hover {
	transform: translateX(-50%) scale(1.1);
}

.ss-playhead-handle:active {
	cursor: grabbing;
}

/* Feedback layer */
.ss-feedback-layer {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	pointer-events: none;
	z-index: 100;
}

/* Snap line */
.ss-snap-line {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 2px;
	background: #22c55e;
	box-shadow: 0 0 4px #22c55e;
}

/* Drop zone indicator */
.ss-drop-zone {
	position: absolute;
	left: 0;
	right: 0;
	height: 4px;
	background: #3b82f6;
	box-shadow: 0 0 8px #3b82f6;
	animation: ss-pulse 0.8s ease-in-out infinite;
}

@keyframes ss-pulse {
	0%, 100% { opacity: 0.6; }
	50% { opacity: 1; }
}

/* Drag ghost */
.ss-drag-ghost {
	position: absolute;
	pointer-events: none;
	opacity: 0.8;
	box-shadow: 0 10px 15px rgba(0, 0, 0, 0.3);
	z-index: 200;
}

/* Selection box */
.ss-selection-box {
	position: absolute;
	border: 1px solid #3b82f6;
	background: rgba(59, 130, 246, 0.15);
	pointer-events: none;
	z-index: 150;
}

/* Empty state */
.ss-timeline-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 1;
	color: #a1a1aa;
	font-size: 13px;
}
`;

/** Get all timeline styles as a single string */
export function getTimelineStyles(): string {
	return TIMELINE_STYLES;
}
