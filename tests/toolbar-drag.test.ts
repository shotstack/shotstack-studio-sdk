/**
 * @jest-environment jsdom
 */

/**
 * Regression tests for makeToolbarDraggable.
 *
 * Covers:
 * - Handle element insertion into the container
 * - Orientation variants (horizontal / vertical dot grid)
 * - Initial state (no user position)
 * - Drag lifecycle: pointerdown → pointermove → pointerup
 * - Viewport clamping (boundsPadding)
 * - CSS class toggling during drag
 * - Double-click reset + onReset callback
 * - dispose() cleanup (listeners removed, handle removed, classes cleaned)
 * - Right-click / non-primary button ignored
 */

import { makeToolbarDraggable, type ToolbarDragHandle } from "@core/ui/toolbar-drag";

// Polyfill PointerEvent for jsdom (not natively available)
if (typeof PointerEvent === "undefined") {
	(global as any).PointerEvent = class PointerEvent extends MouseEvent {
		readonly pointerId: number;

		readonly width: number;

		readonly height: number;

		readonly pressure: number;

		readonly tiltX: number;

		readonly tiltY: number;

		readonly pointerType: string;

		readonly isPrimary: boolean;

		constructor(type: string, params: PointerEventInit = {}) {
			super(type, params);
			this.pointerId = params.pointerId ?? 0;
			this.width = params.width ?? 1;
			this.height = params.height ?? 1;
			this.pressure = params.pressure ?? 0;
			this.tiltX = params.tiltX ?? 0;
			this.tiltY = params.tiltY ?? 0;
			this.pointerType = params.pointerType ?? "";
			this.isPrimary = params.isPrimary ?? false;
		}
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createContainer(): HTMLDivElement {
	const container = document.createElement("div");
	// Provide a concrete bounding rect for clamping calculations
	jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
		x: 100,
		y: 50,
		width: 200,
		height: 40,
		top: 50,
		right: 300,
		bottom: 90,
		left: 100,
		toJSON: () => ({})
	});
	document.body.appendChild(container);
	return container;
}

function pointerEvent(type: string, opts: Partial<PointerEvent> = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		button: opts.button ?? 0,
		clientX: opts.clientX ?? 0,
		clientY: opts.clientY ?? 0
	});
}

function mouseEvent(type: string): MouseEvent {
	return new MouseEvent(type, { bubbles: true });
}

// Set viewport size for clamping tests
function setViewport(width: number, height: number): void {
	Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
	Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("makeToolbarDraggable", () => {
	let container: HTMLDivElement;
	let handle: ToolbarDragHandle;

	beforeEach(() => {
		setViewport(1024, 768);
		container = createContainer();
	});

	afterEach(() => {
		handle?.dispose();
		container?.remove();
		document.body.classList.remove("ss-dragging-toolbar");
	});

	// ── Handle Insertion ─────────────────────────────────────────────────────

	it("inserts a drag handle as the first child of the container", () => {
		// Add an existing child to verify insertion order
		const existingChild = document.createElement("span");
		container.appendChild(existingChild);

		handle = makeToolbarDraggable({ container });

		const dragHandle = container.firstElementChild;
		expect(dragHandle).toBeTruthy();
		expect(dragHandle!.className).toContain("ss-toolbar-drag-handle");
		expect(container.children[1]).toBe(existingChild);
	});

	it("uses default horizontal orientation", () => {
		handle = makeToolbarDraggable({ container });
		const svg = container.firstElementChild!.querySelector("svg");
		// Horizontal grid: width="12" height="8"
		expect(svg?.getAttribute("width")).toBe("12");
		expect(svg?.getAttribute("height")).toBe("8");
	});

	it("uses vertical orientation when specified", () => {
		handle = makeToolbarDraggable({ container, handleOrientation: "vertical" });
		const svg = container.firstElementChild!.querySelector("svg");
		// Vertical grid: width="8" height="12"
		expect(svg?.getAttribute("width")).toBe("8");
		expect(svg?.getAttribute("height")).toBe("12");
	});

	it("applies custom handle class name", () => {
		handle = makeToolbarDraggable({ container, handleClassName: "my-custom-handle" });
		expect(container.firstElementChild!.className).toBe("my-custom-handle");
	});

	// ── Initial State ────────────────────────────────────────────────────────

	it("starts with no user position", () => {
		handle = makeToolbarDraggable({ container });
		const state = handle.getState();
		expect(state.hasUserPosition).toBe(false);
		expect(state.userX).toBe(0);
		expect(state.userY).toBe(0);
	});

	// ── Drag Lifecycle ───────────────────────────────────────────────────────

	it("tracks position after drag", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		// Start drag
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));

		// Move pointer
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 200, clientY: 100 }));

		// Release
		document.dispatchEvent(pointerEvent("pointerup"));

		const state = handle.getState();
		expect(state.hasUserPosition).toBe(true);
		// Position should reflect movement (delta applied to start position)
		expect(state.userX).toBeGreaterThan(0);
		expect(state.userY).toBeGreaterThan(0);
	});

	it("adds dragging CSS classes during drag", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 110, clientY: 60 }));

		expect(container.classList.contains("ss-toolbar--dragging")).toBe(true);
		expect(document.body.classList.contains("ss-dragging-toolbar")).toBe(true);

		document.dispatchEvent(pointerEvent("pointerup"));

		expect(container.classList.contains("ss-toolbar--dragging")).toBe(false);
		expect(document.body.classList.contains("ss-dragging-toolbar")).toBe(false);
	});

	it("clears transform style on first move", () => {
		container.style.transform = "translateX(-50%)";
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 110, clientY: 60 }));

		expect(container.style.transform).toBe("none");

		document.dispatchEvent(pointerEvent("pointerup"));
	});

	it("sets left and top styles during drag", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 150, clientY: 80 }));

		expect(container.style.left).toBeTruthy();
		expect(container.style.top).toBeTruthy();

		document.dispatchEvent(pointerEvent("pointerup"));
	});

	// ── Viewport Clamping ────────────────────────────────────────────────────

	it("clamps position to viewport bounds with default padding", () => {
		setViewport(400, 300);
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		// Try to drag way past the right/bottom edge
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 1000, clientY: 1000 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		const state = handle.getState();
		// Default padding is 12, container width 200, viewport 400
		// Max X = 400 - 200 - 12 = 188
		expect(state.userX).toBeLessThanOrEqual(400 - 200 - 12);
		// Max Y = 300 - 40 - 12 = 248
		expect(state.userY).toBeLessThanOrEqual(300 - 40 - 12);
	});

	it("clamps position to minimum (padding) on the left/top", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		// Try to drag way past the left/top edge
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: -1000, clientY: -1000 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		const state = handle.getState();
		expect(state.userX).toBe(12); // default padding
		expect(state.userY).toBe(12);
	});

	it("respects custom boundsPadding", () => {
		handle = makeToolbarDraggable({ container, boundsPadding: 50 });
		const dragEl = container.firstElementChild!;

		// Drag to extreme negative
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: -1000, clientY: -1000 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		const state = handle.getState();
		expect(state.userX).toBe(50);
		expect(state.userY).toBe(50);
	});

	// ── Double-Click Reset ───────────────────────────────────────────────────

	it("resets position on double-click", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		// Drag to a position
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 200, clientY: 100 }));
		document.dispatchEvent(pointerEvent("pointerup"));
		expect(handle.getState().hasUserPosition).toBe(true);

		// Double-click to reset
		dragEl.dispatchEvent(mouseEvent("dblclick"));

		const state = handle.getState();
		expect(state.hasUserPosition).toBe(false);
		expect(state.userX).toBe(0);
		expect(state.userY).toBe(0);
	});

	it("calls onReset callback on double-click", () => {
		const onReset = jest.fn();
		handle = makeToolbarDraggable({ container, onReset });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(mouseEvent("dblclick"));
		expect(onReset).toHaveBeenCalledTimes(1);
	});

	// ── Non-Primary Button Ignored ───────────────────────────────────────────

	it("ignores right-click (button !== 0)", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(pointerEvent("pointerdown", { button: 2, clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 200, clientY: 100 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		expect(handle.getState().hasUserPosition).toBe(false);
	});

	// ── Dispose ──────────────────────────────────────────────────────────────

	it("removes the drag handle element on dispose", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;
		expect(dragEl).toBeTruthy();

		handle.dispose();
		// Handle should have been removed — only children that were there before remain
		expect(container.querySelector(".ss-toolbar-drag-handle")).toBeNull();
	});

	it("cleans up CSS classes on dispose during active drag", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		// Start a drag and leave it mid-drag
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 110, clientY: 60 }));

		expect(container.classList.contains("ss-toolbar--dragging")).toBe(true);
		expect(document.body.classList.contains("ss-dragging-toolbar")).toBe(true);

		handle.dispose();

		expect(container.classList.contains("ss-toolbar--dragging")).toBe(false);
		expect(document.body.classList.contains("ss-dragging-toolbar")).toBe(false);
	});

	it("does not respond to pointer events after dispose", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!.cloneNode(true) as HTMLElement;
		// We need to keep a reference since dispose removes the element
		container.appendChild(dragEl);

		handle.dispose();

		// Try to start a drag on what was the handle
		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointermove", { clientX: 200, clientY: 100 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		expect(handle.getState().hasUserPosition).toBe(false);
	});

	// ── Pointer-up Without Move ──────────────────────────────────────────────

	it("does not mark user position on pointerdown without move", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		// A click without movement should not establish a user position
		expect(handle.getState().hasUserPosition).toBe(false);
	});

	it("does not add dragging classes on pointerdown without move", () => {
		handle = makeToolbarDraggable({ container });
		const dragEl = container.firstElementChild!;

		dragEl.dispatchEvent(pointerEvent("pointerdown", { clientX: 100, clientY: 50 }));
		expect(container.classList.contains("ss-toolbar--dragging")).toBe(false);
		expect(document.body.classList.contains("ss-dragging-toolbar")).toBe(false);

		document.dispatchEvent(pointerEvent("pointerup"));
	});
});
