import { type Seconds, sec } from "@core/timing/types";

import type { ClipState } from "../timeline.types";
import { getTrackHeight } from "../timeline.types";

import { formatDragTime, secondsToPixels, timeToViewX } from "./interaction-calculations";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FeedbackElements {
	readonly container: HTMLElement;
	snapLine: HTMLElement | null;
	dropZone: HTMLElement | null;
	dragTimeTooltip: HTMLElement | null;
	lumaConnectionLine: HTMLElement | null;
	lumaTargetClipElement: HTMLElement | null;
}

export interface FeedbackConfig {
	readonly pixelsPerSecond: number;
	readonly scrollLeft: number;
	readonly tracksOffset: number;
}

export interface DragFeedbackInput {
	readonly clipTime: Seconds;
	readonly tooltipX: number;
	readonly tooltipY: number;
	readonly isSnapActive: boolean;
	readonly showDropZone: boolean;
	readonly dropZoneTrackY: number;
	readonly lumaTarget: {
		readonly clip: ClipState;
		readonly trackIndex: number;
		readonly trackYPosition: number;
		readonly trackHeight: number;
	} | null;
	readonly draggingClipElement: HTMLElement | null;
}

export interface ResizeFeedbackInput {
	readonly time: Seconds;
	readonly isSnapActive: boolean;
	readonly tooltipX: number;
	readonly tooltipY: number;
}

// ─── Element Factory ───────────────────────────────────────────────────────

export function getOrCreateElement(container: HTMLElement, existing: HTMLElement | null, className: string): HTMLElement {
	if (existing) return existing;
	const el = document.createElement("div");
	el.className = className;
	container.appendChild(el);
	return el;
}

// ─── Snap Line ─────────────────────────────────────────────────────────────

export function showSnapLine(elements: FeedbackElements, time: Seconds, config: FeedbackConfig): HTMLElement {
	const snapLine = getOrCreateElement(elements.container, elements.snapLine, "ss-snap-line");
	const x = timeToViewX(time, config.pixelsPerSecond) - config.scrollLeft;
	snapLine.style.left = `${x}px`;
	snapLine.style.display = "block";
	return snapLine;
}

export function hideSnapLine(element: HTMLElement | null): void {
	if (!element) return;
	element.style.display = "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
}

// ─── Drop Zone ─────────────────────────────────────────────────────────────

export function showDropZone(elements: FeedbackElements, trackY: number, tracksOffset: number): HTMLElement {
	const dropZone = getOrCreateElement(elements.container, elements.dropZone, "ss-drop-zone");
	dropZone.style.top = `${trackY - 2 + tracksOffset}px`;
	dropZone.style.display = "block";
	return dropZone;
}

export function hideDropZone(element: HTMLElement | null): void {
	if (!element) return;
	element.style.display = "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
}

// ─── Drag Time Tooltip ─────────────────────────────────────────────────────

export function showDragTimeTooltip(elements: FeedbackElements, time: Seconds, x: number, y: number): HTMLElement {
	const tooltip = getOrCreateElement(elements.container, elements.dragTimeTooltip, "ss-drag-time-tooltip");
	tooltip.textContent = formatDragTime(time);
	tooltip.style.left = `${x}px`;
	tooltip.style.top = `${y - 28}px`;
	tooltip.style.display = "block";
	return tooltip;
}

export function hideDragTimeTooltip(element: HTMLElement | null): void {
	if (!element) return;
	element.style.display = "none"; // eslint-disable-line no-param-reassign -- DOM manipulation
}

// ─── Luma Connection Line ──────────────────────────────────────────────────

export function showLumaConnectionLine(
	elements: FeedbackElements,
	targetClip: ClipState,
	trackYPosition: number,
	trackHeight: number,
	tracksOffset: number,
	pixelsPerSecond: number
): HTMLElement {
	const line = getOrCreateElement(elements.container, elements.lumaConnectionLine, "ss-luma-connection-line");
	const clipX = timeToViewX(sec(targetClip.config.start), pixelsPerSecond);
	line.style.left = `${clipX}px`;
	line.style.top = `${trackYPosition + tracksOffset}px`;
	line.style.height = `${trackHeight}px`;
	line.classList.add("active");
	return line;
}

export function hideLumaConnectionLine(line: HTMLElement | null): void {
	if (line) line.classList.remove("active");
}

// ─── Luma Target Highlight ─────────────────────────────────────────────────

export interface LumaHighlightResult {
	readonly targetClipElement: HTMLElement | null;
	readonly connectionLine: HTMLElement | null;
}

export function updateLumaTargetHighlight(
	tracksContainer: HTMLElement,
	elements: FeedbackElements,
	draggingClipElement: HTMLElement | null,
	targetClip: ClipState | null,
	trackIndex: number,
	trackYPosition: number,
	trackHeight: number,
	tracksOffset: number,
	pixelsPerSecond: number
): LumaHighlightResult {
	// Clear previous highlight
	if (elements.lumaTargetClipElement) {
		elements.lumaTargetClipElement.classList.remove("ss-clip-luma-target");
	}

	// Hide connection line and clear dragging clip indicator if no target
	if (!targetClip) {
		hideLumaConnectionLine(elements.lumaConnectionLine);
		if (draggingClipElement) {
			draggingClipElement.classList.remove("ss-clip-luma-has-target");
		}
		return { targetClipElement: null, connectionLine: elements.lumaConnectionLine };
	}

	// Find and highlight new target
	const clipElement = tracksContainer.querySelector(
		`[data-track-index="${trackIndex}"][data-clip-index="${targetClip.clipIndex}"]`
	) as HTMLElement | null;

	if (clipElement) {
		clipElement.classList.add("ss-clip-luma-target");

		// Add indicator to dragging clip (shows mask icon via ::after)
		if (draggingClipElement) {
			draggingClipElement.classList.add("ss-clip-luma-has-target");
		}

		// Show connection line from ghost to target
		const connectionLine = showLumaConnectionLine(elements, targetClip, trackYPosition, trackHeight, tracksOffset, pixelsPerSecond);

		return { targetClipElement: clipElement, connectionLine };
	}

	return { targetClipElement: null, connectionLine: elements.lumaConnectionLine };
}

export function clearLumaFeedback(elements: FeedbackElements, draggingClipElement: HTMLElement | null): void {
	if (elements.lumaTargetClipElement) {
		elements.lumaTargetClipElement.classList.remove("ss-clip-luma-target");
	}
	if (draggingClipElement) {
		draggingClipElement.classList.remove("ss-clip-luma-has-target");
	}
	hideLumaConnectionLine(elements.lumaConnectionLine);
}

// ─── Ghost Creation ────────────────────────────────────────────────────────

export function createDragGhost(clipLength: Seconds, clipAssetType: string, trackAssetType: string, pixelsPerSecond: number): HTMLElement {
	const ghost = document.createElement("div");
	ghost.className = "ss-drag-ghost ss-clip";
	ghost.dataset["assetType"] = clipAssetType;

	const width = secondsToPixels(clipLength, pixelsPerSecond);
	const trackHeight = getTrackHeight(trackAssetType);

	ghost.style.width = `${width}px`;
	ghost.style.height = `${trackHeight - 8}px`;
	ghost.style.position = "absolute";
	ghost.style.pointerEvents = "none";
	ghost.style.opacity = "0.8";

	return ghost;
}

// ─── Position Calculation ──────────────────────────────────────────────────

export function getTracksOffsetInFeedbackLayer(feedbackLayer: HTMLElement, tracksContainer: HTMLElement): number {
	const feedbackParent = feedbackLayer.parentElement;
	if (!feedbackParent) return 0;

	const parentRect = feedbackParent.getBoundingClientRect();
	const tracksRect = tracksContainer.getBoundingClientRect();
	return tracksRect.top - parentRect.top;
}

// ─── Aggregate Render Functions ────────────────────────────────────────────

export function renderDragFeedback(
	tracksContainer: HTMLElement,
	elements: FeedbackElements,
	input: DragFeedbackInput,
	config: FeedbackConfig
): FeedbackElements {
	// Snap line
	let { snapLine } = elements;
	if (input.isSnapActive) {
		snapLine = showSnapLine(elements, input.clipTime, config);
	} else {
		hideSnapLine(elements.snapLine);
	}

	// Drop zone
	let { dropZone } = elements;
	if (input.showDropZone) {
		dropZone = showDropZone(elements, input.dropZoneTrackY, config.tracksOffset);
	} else {
		hideDropZone(elements.dropZone);
	}

	// Time tooltip
	const dragTimeTooltip = showDragTimeTooltip(elements, input.clipTime, input.tooltipX, input.tooltipY);

	// Luma feedback
	let { lumaTargetClipElement, lumaConnectionLine } = elements;

	if (input.lumaTarget) {
		const lumaResult = updateLumaTargetHighlight(
			tracksContainer,
			elements,
			input.draggingClipElement,
			input.lumaTarget.clip,
			input.lumaTarget.trackIndex,
			input.lumaTarget.trackYPosition,
			input.lumaTarget.trackHeight,
			config.tracksOffset,
			config.pixelsPerSecond
		);
		lumaTargetClipElement = lumaResult.targetClipElement;
		lumaConnectionLine = lumaResult.connectionLine;
	} else {
		clearLumaFeedback(elements, input.draggingClipElement);
		lumaTargetClipElement = null;
	}

	return {
		container: elements.container,
		snapLine,
		dropZone,
		dragTimeTooltip,
		lumaConnectionLine,
		lumaTargetClipElement
	};
}

export function renderResizeFeedback(elements: FeedbackElements, input: ResizeFeedbackInput, config: FeedbackConfig): FeedbackElements {
	// Snap line
	let { snapLine } = elements;
	if (input.isSnapActive) {
		snapLine = showSnapLine(elements, input.time, config);
	} else {
		hideSnapLine(elements.snapLine);
	}

	// Time tooltip
	const dragTimeTooltip = showDragTimeTooltip(elements, input.time, input.tooltipX, input.tooltipY);

	return {
		...elements,
		snapLine,
		dragTimeTooltip
	};
}

export function clearAllFeedback(elements: FeedbackElements, draggingClipElement: HTMLElement | null = null): FeedbackElements {
	hideSnapLine(elements.snapLine);
	hideDropZone(elements.dropZone);
	hideDragTimeTooltip(elements.dragTimeTooltip);
	clearLumaFeedback(elements, draggingClipElement);

	return {
		container: elements.container,
		snapLine: elements.snapLine, // Keep pooled elements
		dropZone: elements.dropZone,
		dragTimeTooltip: elements.dragTimeTooltip,
		lumaConnectionLine: elements.lumaConnectionLine,
		lumaTargetClipElement: null
	};
}

export function createFeedbackElements(container: HTMLElement): FeedbackElements {
	return {
		container,
		snapLine: null,
		dropZone: null,
		dragTimeTooltip: null,
		lumaConnectionLine: null,
		lumaTargetClipElement: null
	};
}

export function disposeFeedbackElements(elements: FeedbackElements): void {
	if (elements.snapLine) {
		elements.snapLine.remove();
	}
	if (elements.dropZone) {
		elements.dropZone.remove();
	}
	if (elements.dragTimeTooltip) {
		elements.dragTimeTooltip.remove();
	}
	if (elements.lumaConnectionLine) {
		elements.lumaConnectionLine.remove();
	}
	if (elements.lumaTargetClipElement) {
		elements.lumaTargetClipElement.classList.remove("ss-clip-luma-target");
	}
}

// ─── Clip Element Style Restoration ────────────────────────────────────────

export interface ClipOriginalStyles {
	readonly position: string;
	readonly left: string;
	readonly top: string;
	readonly zIndex: string;
	readonly pointerEvents: string;
}

export function restoreClipElementStyles(clipElement: HTMLElement, originalStyles: ClipOriginalStyles): void {
	clipElement.style.position = originalStyles.position; // eslint-disable-line no-param-reassign -- DOM manipulation
	clipElement.style.left = originalStyles.left; // eslint-disable-line no-param-reassign -- DOM manipulation
	clipElement.style.top = originalStyles.top; // eslint-disable-line no-param-reassign -- DOM manipulation
	clipElement.style.zIndex = originalStyles.zIndex; // eslint-disable-line no-param-reassign -- DOM manipulation
	clipElement.style.pointerEvents = originalStyles.pointerEvents; // eslint-disable-line no-param-reassign -- DOM manipulation
	clipElement.style.width = ""; // eslint-disable-line no-param-reassign -- DOM manipulation
	clipElement.style.height = ""; // eslint-disable-line no-param-reassign -- DOM manipulation
}
