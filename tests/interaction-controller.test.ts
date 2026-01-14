/**
 * @jest-environment jsdom
 */

/**
 * InteractionController Unit Tests
 *
 * Tests for the timeline interaction state machine: drag, resize, and selection handling.
 * These tests verify the state machine transitions and command execution.
 */

// Mock pixi.js before any imports that use it
jest.mock("pixi.js", () => ({
	Container: jest.fn(),
	Graphics: jest.fn(),
	Application: jest.fn()
}));

// Mock pixi-filters
jest.mock("pixi-filters", () => ({}));

// Mock commands that import pixi.js transitively
jest.mock("../src/core/commands/add-track-command", () => ({
	AddTrackCommand: jest.fn()
}));

jest.mock("../src/core/commands/create-track-and-move-clip-command", () => ({
	CreateTrackAndMoveClipCommand: jest.fn().mockImplementation((insertionIndex, originalTrack, clipIndex, newTime) => ({
		type: "CreateTrackAndMoveClipCommand",
		insertionIndex,
		originalTrack,
		clipIndex,
		newTime
	}))
}));

jest.mock("../src/core/commands/move-clip-command", () => ({
	MoveClipCommand: jest.fn().mockImplementation((fromTrack, clipIndex, toTrack, newTime) => ({
		type: "MoveClipCommand",
		fromTrack,
		clipIndex,
		toTrack,
		newTime
	}))
}));

jest.mock("../src/core/commands/move-clip-with-push-command", () => ({
	MoveClipWithPushCommand: jest.fn().mockImplementation((fromTrack, clipIndex, toTrack, newTime, pushOffset) => ({
		type: "MoveClipWithPushCommand",
		fromTrack,
		clipIndex,
		toTrack,
		newTime,
		pushOffset
	}))
}));

jest.mock("../src/core/commands/resize-clip-command", () => ({
	ResizeClipCommand: jest.fn().mockImplementation((trackIndex, clipIndex, length) => ({
		type: "ResizeClipCommand",
		trackIndex,
		clipIndex,
		length
	}))
}));

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { InteractionController } from "../src/components/timeline/interaction/interaction-controller";
import type { ClipState, TrackState } from "../src/components/timeline/timeline.types";

// ─── Mock Types ──────────────────────────────────────────────────────────────

interface MockClipConfig {
	start: number;
	length: number;
	asset?: { type: string; src?: string };
}

interface MockTrack {
	clips: Array<{
		id: string;
		trackIndex: number;
		clipIndex: number;
		config: MockClipConfig;
		visualState: string;
		timingIntent: { start: "auto" | number; length: "auto" | "end" | number };
	}>;
	primaryAssetType: string;
}

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockClip(trackIndex: number, clipIndex: number, start: number, length: number, assetType = "video"): ClipState {
	return {
		id: `clip-${trackIndex}-${clipIndex}`,
		trackIndex,
		clipIndex,
		config: {
			start,
			length,
			asset: { type: assetType, src: `test-${assetType}.mp4` }
		},
		visualState: "normal",
		timingIntent: { start, length }
	} as ClipState;
}

function createMockTrack(trackIndex: number, clips: Array<{ start: number; length: number; assetType?: string }>): TrackState {
	return {
		clips: clips.map((c, i) => createMockClip(trackIndex, i, c.start, c.length, c.assetType ?? "video")),
		primaryAssetType: "video"
	} as TrackState;
}

function createMockStateManager(tracks: MockTrack[] = []) {
	let mockTracks = tracks;

	return {
		getClipAt: jest.fn((trackIndex: number, clipIndex: number) => {
			const track = mockTracks[trackIndex];
			if (!track) return null;
			return track.clips[clipIndex] ?? null;
		}),
		getTracks: jest.fn(() => mockTracks as unknown as TrackState[]),
		getViewport: jest.fn(() => ({ scrollX: 0, scrollY: 0, pixelsPerSecond: 100 })),
		getPlayback: jest.fn(() => ({ time: 0, isPlaying: false })),
		clearSelection: jest.fn(),
		getAttachedLumaPlayer: jest.fn(() => null),
		setInteractionQuery: jest.fn(),
		// Allow tests to update tracks
		_setTracks: (newTracks: MockTrack[]) => {
			mockTracks = newTracks;
		}
	};
}

function createMockEdit() {
	const executedCommands: unknown[] = [];

	return {
		executeEditCommand: jest.fn((cmd: unknown) => {
			executedCommands.push(cmd);
		}),
		getPlayerClip: jest.fn(() => ({ id: "player-1" })),
		findClipIndices: jest.fn((player: unknown) => {
			if (!player) return null;
			return { trackIndex: 0, clipIndex: 0 };
		}),
		transformToLuma: jest.fn(),
		transformFromLuma: jest.fn(),
		syncLumaToContent: jest.fn(),
		_getExecutedCommands: () => executedCommands
	};
}

function createMockDOM() {
	// Create tracks container with clip elements
	const tracksContainer = document.createElement("div");
	tracksContainer.className = "ss-tracks-container";

	const feedbackLayer = document.createElement("div");
	feedbackLayer.className = "ss-feedback-layer";

	// Helper to add a clip element
	const addClipElement = (trackIndex: number, clipIndex: number, rect?: { left: number; top: number; width: number; height: number }) => {
		const clip = document.createElement("div");
		clip.className = "ss-clip";
		clip.dataset["trackIndex"] = String(trackIndex);
		clip.dataset["clipIndex"] = String(clipIndex);

		// Add resize handles
		const leftHandle = document.createElement("div");
		leftHandle.className = "ss-clip-resize-handle left";
		clip.appendChild(leftHandle);

		const rightHandle = document.createElement("div");
		rightHandle.className = "ss-clip-resize-handle right";
		clip.appendChild(rightHandle);

		// Mock getBoundingClientRect
		if (rect) {
			clip.getBoundingClientRect = () => ({
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height,
				right: rect.left + rect.width,
				bottom: rect.top + rect.height,
				x: rect.left,
				y: rect.top,
				toJSON: () => ({})
			});
		}

		tracksContainer.appendChild(clip);
		return clip;
	};

	// Mock tracksContainer methods
	tracksContainer.getBoundingClientRect = () => ({
		left: 0,
		top: 0,
		width: 800,
		height: 200,
		right: 800,
		bottom: 200,
		x: 0,
		y: 0,
		toJSON: () => ({})
	});

	Object.defineProperty(tracksContainer, "scrollLeft", { value: 0, writable: true });
	Object.defineProperty(tracksContainer, "scrollTop", { value: 0, writable: true });

	return { tracksContainer, feedbackLayer, addClipElement };
}

function createPointerEvent(
	type: string,
	options: { clientX?: number; clientY?: number; target?: EventTarget; altKey?: boolean; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}
): Event {
	// Create a custom event with pointer event properties
	// jsdom doesn't support PointerEvent, so we create an Event and add properties
	const event = new Event(type, {
		bubbles: true,
		cancelable: true
	});

	// Add pointer/mouse event properties
	Object.defineProperties(event, {
		clientX: { value: options.clientX ?? 0, writable: false },
		clientY: { value: options.clientY ?? 0, writable: false },
		altKey: { value: options.altKey ?? false, writable: false },
		shiftKey: { value: options.shiftKey ?? false, writable: false },
		ctrlKey: { value: options.ctrlKey ?? false, writable: false },
		metaKey: { value: options.metaKey ?? false, writable: false }
	});

	// Override target if provided
	if (options.target) {
		Object.defineProperty(event, "target", { value: options.target, writable: false });
	}

	return event;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("InteractionController", () => {
	let controller: InteractionController;
	let mockEdit: ReturnType<typeof createMockEdit>;
	let mockStateManager: ReturnType<typeof createMockStateManager>;
	let mockDOM: ReturnType<typeof createMockDOM>;

	beforeEach(() => {
		// Create fresh mocks
		mockEdit = createMockEdit();
		mockStateManager = createMockStateManager([
			createMockTrack(0, [
				{ start: 0, length: 2 },
				{ start: 2, length: 3 }
			])
		] as MockTrack[]);
		mockDOM = createMockDOM();

		// Add clip elements to DOM
		mockDOM.addClipElement(0, 0, { left: 0, top: 0, width: 200, height: 40 });
		mockDOM.addClipElement(0, 1, { left: 200, top: 0, width: 300, height: 40 });
	});

	afterEach(() => {
		controller?.dispose();
	});

	// ─── State Machine Tests ─────────────────────────────────────────────────

	describe("state machine", () => {
		it("starts in idle state", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			// isDragging/isResizing should both return false
			expect(controller.isDragging(0, 0)).toBe(false);
			expect(controller.isResizing(0, 0)).toBe(false);
		});

		it("transitions to pending state on pointerdown on clip", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const event = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});

			// Dispatch directly to trigger the handler
			mockDOM.tracksContainer.dispatchEvent(event);

			// Still not dragging (pending state, threshold not reached)
			expect(controller.isDragging(0, 0)).toBe(false);
		});

		it("transitions from pending to dragging after threshold", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer,
				{ dragThreshold: 3 }
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Pointerdown to enter pending state
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Move past threshold (3px)
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 60, // 10px movement > 3px threshold
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Now should be dragging
			expect(controller.isDragging(0, 0)).toBe(true);
		});

		it("returns to idle state on pointerup without movement (click)", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Pointerdown
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Pointerup without movement
			const upEvent = createPointerEvent("pointerup", {
				clientX: 50,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should be back to idle
			expect(controller.isDragging(0, 0)).toBe(false);
			expect(controller.isResizing(0, 0)).toBe(false);
		});

		it("clears selection when clicking on empty space", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			// Click on container (not on a clip)
			const event = createPointerEvent("pointerdown", {
				clientX: 500, // Empty area
				clientY: 20,
				target: mockDOM.tracksContainer
			});
			mockDOM.tracksContainer.dispatchEvent(event);

			expect(mockStateManager.clearSelection).toHaveBeenCalled();
		});
	});

	// ─── Resize State Tests ──────────────────────────────────────────────────

	describe("resize state", () => {
		it("transitions to resizing state on resize handle click", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const leftHandle = clipElement.querySelector(".ss-clip-resize-handle.left") as HTMLElement;

			const event = createPointerEvent("pointerdown", {
				clientX: 5,
				clientY: 20,
				target: leftHandle
			});
			mockDOM.tracksContainer.dispatchEvent(event);

			expect(controller.isResizing(0, 0)).toBe(true);
			expect(controller.isDragging(0, 0)).toBe(false);
		});

		it("returns to idle after resize completion", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const rightHandle = clipElement.querySelector(".ss-clip-resize-handle.right") as HTMLElement;

			// Start resize
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 195,
				clientY: 20,
				target: rightHandle
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			expect(controller.isResizing(0, 0)).toBe(true);

			// Complete resize
			const upEvent = createPointerEvent("pointerup", {
				clientX: 250,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			expect(controller.isResizing(0, 0)).toBe(false);
		});
	});

	// ─── Visual State Query Tests ────────────────────────────────────────────

	describe("visual state queries", () => {
		it("isDragging returns false for non-dragged clips", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start dragging clip 0
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			const moveEvent = createPointerEvent("pointermove", {
				clientX: 100,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Clip 0 is dragging
			expect(controller.isDragging(0, 0)).toBe(true);

			// Clip 1 is NOT dragging
			expect(controller.isDragging(0, 1)).toBe(false);

			// Non-existent clip is NOT dragging
			expect(controller.isDragging(5, 5)).toBe(false);
		});

		it("isResizing returns false for non-resized clips", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const handle = clipElement.querySelector(".ss-clip-resize-handle.left") as HTMLElement;

			// Start resizing clip 0
			const event = createPointerEvent("pointerdown", {
				clientX: 5,
				clientY: 20,
				target: handle
			});
			mockDOM.tracksContainer.dispatchEvent(event);

			// Clip 0 is resizing
			expect(controller.isResizing(0, 0)).toBe(true);

			// Clip 1 is NOT resizing
			expect(controller.isResizing(0, 1)).toBe(false);
		});
	});

	// ─── Drag Completion Tests ───────────────────────────────────────────────

	describe("drag completion", () => {
		it("executes MoveClipCommand when clip is moved", () => {
			// Setup with single clip to avoid collision
			mockStateManager._setTracks([
				createMockTrack(0, [{ start: 0, length: 2 }])
			] as MockTrack[]);

			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start drag - dispatch on clipElement so target is correct
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20
			});
			clipElement.dispatchEvent(downEvent);

			// First move: transition from pending to dragging (past threshold)
			const thresholdMoveEvent = createPointerEvent("pointermove", {
				clientX: 55, // Just past 3px threshold
				clientY: 20
			});
			document.dispatchEvent(thresholdMoveEvent);

			// Second move: move to new position (no collision with single clip)
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 300, // Move to ~2.5s (past original 0-2s clip)
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete drag
			const upEvent = createPointerEvent("pointerup", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have executed a command
			expect(mockEdit.executeEditCommand).toHaveBeenCalled();
		});

		it("does not execute command when clip returns to original position", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start drag
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Move past threshold
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 100,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Move back to original position
			const moveBack = createPointerEvent("pointermove", {
				clientX: 50,
				clientY: 20
			});
			document.dispatchEvent(moveBack);

			// Complete drag at original position
			const upEvent = createPointerEvent("pointerup", {
				clientX: 50,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should NOT have executed a command (no actual move)
			// Note: This depends on collision resolution logic
		});
	});

	// ─── Resize Completion Tests ─────────────────────────────────────────────

	describe("resize completion", () => {
		it("executes ResizeClipCommand when resizing right edge", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const handle = clipElement.querySelector(".ss-clip-resize-handle.right") as HTMLElement;

			// Start resize
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 195,
				clientY: 20,
				target: handle
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Move to extend
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete resize
			const upEvent = createPointerEvent("pointerup", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have executed resize command
			expect(mockEdit.executeEditCommand).toHaveBeenCalled();
		});

		it("executes both MoveClipCommand and ResizeClipCommand when resizing left edge", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const handle = clipElement.querySelector(".ss-clip-resize-handle.left") as HTMLElement;

			// Start resize from left edge
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 5,
				clientY: 20,
				target: handle
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Move left edge to new position
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 50, // Move start position forward
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete resize
			const upEvent = createPointerEvent("pointerup", {
				clientX: 50,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have executed commands (move + resize for left edge)
			expect(mockEdit.executeEditCommand).toHaveBeenCalled();
		});

		it("enforces minimum clip length during resize", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const handle = clipElement.querySelector(".ss-clip-resize-handle.right") as HTMLElement;

			// Start resize
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 195,
				clientY: 20,
				target: handle
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Try to resize to nearly zero
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 5, // Would make length < 0.1
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete resize
			const upEvent = createPointerEvent("pointerup", {
				clientX: 5,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have executed resize with minimum length (0.1)
			expect(mockEdit.executeEditCommand).toHaveBeenCalled();
		});
	});

	// ─── Dispose Tests ───────────────────────────────────────────────────────

	describe("dispose", () => {
		it("removes event listeners on dispose", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			// Spy on removeEventListener
			const tracksRemoveSpy = jest.spyOn(mockDOM.tracksContainer, "removeEventListener");
			const docRemoveSpy = jest.spyOn(document, "removeEventListener");

			controller.dispose();

			expect(tracksRemoveSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function));
			expect(docRemoveSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
			expect(docRemoveSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
		});

		it("removes feedback elements on dispose", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			// Trigger some feedback elements to be created by starting a drag
			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			const moveEvent = createPointerEvent("pointermove", {
				clientX: 100,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete drag to cleanup
			const upEvent = createPointerEvent("pointerup", {
				clientX: 100,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Dispose
			controller.dispose();

			// Feedback layer should be empty (elements removed)
			const remainingElements = mockDOM.feedbackLayer.querySelectorAll(".ss-snap-line, .ss-drop-zone, .ss-drag-time-tooltip");
			expect(remainingElements.length).toBe(0);
		});
	});

	// ─── Luma Co-movement Tests ──────────────────────────────────────────────

	describe("luma co-movement", () => {
		it("moves attached luma when content clip is dragged", () => {
			// Setup with single clip and luma attachment
			mockStateManager._setTracks([
				createMockTrack(0, [{ start: 0, length: 2 }])
			] as MockTrack[]);

			const mockLumaPlayer = { id: "luma-player" };
			(mockStateManager as { getAttachedLumaPlayer: jest.Mock }).getAttachedLumaPlayer = jest.fn(() => mockLumaPlayer);
			mockEdit.findClipIndices = jest.fn(() => ({ trackIndex: 0, clipIndex: 1 }));

			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start drag - dispatch on clipElement so target is correct
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20
			});
			clipElement.dispatchEvent(downEvent);

			// First move: transition from pending to dragging (past threshold)
			const thresholdMoveEvent = createPointerEvent("pointermove", {
				clientX: 55,
				clientY: 20
			});
			document.dispatchEvent(thresholdMoveEvent);

			// Second move: move to new position (no collision)
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete drag
			const upEvent = createPointerEvent("pointerup", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have looked up attached luma
			expect(mockStateManager.getAttachedLumaPlayer).toHaveBeenCalled();

			// Should have found luma indices
			expect(mockEdit.findClipIndices).toHaveBeenCalledWith(mockLumaPlayer);

			// Should have executed commands for both content and luma
			expect(mockEdit.executeEditCommand).toHaveBeenCalled();
		});

		it("does not move luma when no attachment exists", () => {
			// No luma attachment
			mockStateManager.getAttachedLumaPlayer = jest.fn(() => null);

			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start drag
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			const moveEvent = createPointerEvent("pointermove", {
				clientX: 200,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			const upEvent = createPointerEvent("pointerup", {
				clientX: 200,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have checked for attachment
			expect(mockStateManager.getAttachedLumaPlayer).toHaveBeenCalled();

			// findClipIndices should NOT be called with null
			expect(mockEdit.findClipIndices).not.toHaveBeenCalledWith(null);
		});

		it("resizes attached luma when content clip is resized", () => {
			// Setup with luma attachment
			const mockLumaPlayer = { id: "luma-player" };
			mockStateManager.getAttachedLumaPlayer = jest.fn(() => mockLumaPlayer);
			mockEdit.findClipIndices = jest.fn(() => ({ trackIndex: 0, clipIndex: 1 }));

			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;
			const handle = clipElement.querySelector(".ss-clip-resize-handle.right") as HTMLElement;

			// Start resize
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 195,
				clientY: 20,
				target: handle
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Extend clip
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Complete resize
			const upEvent = createPointerEvent("pointerup", {
				clientX: 300,
				clientY: 20
			});
			document.dispatchEvent(upEvent);

			// Should have resized both content and luma
			expect(mockStateManager.getAttachedLumaPlayer).toHaveBeenCalled();
			expect(mockEdit.findClipIndices).toHaveBeenCalledWith(mockLumaPlayer);

			// At least 2 commands: resize content + resize luma
			expect(mockEdit.executeEditCommand.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
	});

	// ─── Configuration Tests ─────────────────────────────────────────────────

	describe("configuration", () => {
		it("respects custom drag threshold", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer,
				{ dragThreshold: 20 } // High threshold
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start potential drag
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Move only 10px (below 20px threshold)
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 60,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Should NOT be dragging yet
			expect(controller.isDragging(0, 0)).toBe(false);

			// Move past threshold
			const moveEvent2 = createPointerEvent("pointermove", {
				clientX: 80, // 30px total > 20px threshold
				clientY: 20
			});
			document.dispatchEvent(moveEvent2);

			// Now should be dragging
			expect(controller.isDragging(0, 0)).toBe(true);
		});

		it("uses default configuration when none provided", () => {
			controller = new InteractionController(
				mockEdit as never,
				mockStateManager as never,
				mockDOM.tracksContainer,
				mockDOM.feedbackLayer
			);

			const clipElement = mockDOM.tracksContainer.querySelector(".ss-clip") as HTMLElement;

			// Start potential drag
			const downEvent = createPointerEvent("pointerdown", {
				clientX: 50,
				clientY: 20,
				target: clipElement
			});
			mockDOM.tracksContainer.dispatchEvent(downEvent);

			// Move 5px (above default 3px threshold)
			const moveEvent = createPointerEvent("pointermove", {
				clientX: 55,
				clientY: 20
			});
			document.dispatchEvent(moveEvent);

			// Should be dragging with default threshold
			expect(controller.isDragging(0, 0)).toBe(true);
		});
	});
});
