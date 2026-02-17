/**
 * Reusable drag utility for toolbar positioning.
 */

/** Vertical 2×3 dot grid (portrait) – used on horizontal/top toolbars. */
const DRAG_HANDLE_SVG_VERTICAL = `<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
	<circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
	<circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
	<circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
</svg>`;

/** Horizontal 3×2 dot grid (landscape) – used on vertical/side toolbars. */
const DRAG_HANDLE_SVG_HORIZONTAL = `<svg width="12" height="8" viewBox="0 0 12 8" fill="currentColor">
	<circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/><circle cx="10" cy="2" r="1.2"/>
	<circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="10" cy="6" r="1.2"/>
</svg>`;

export type DragHandleOrientation = "vertical" | "horizontal";

/** Create a drag handle DOM element with the standard 6-dot icon. */
function createDragHandle(className = "ss-toolbar-drag-handle", orientation: DragHandleOrientation = "horizontal"): HTMLDivElement {
	const handle = document.createElement("div");
	handle.className = className;
	handle.innerHTML = orientation === "vertical" ? DRAG_HANDLE_SVG_VERTICAL : DRAG_HANDLE_SVG_HORIZONTAL;
	return handle;
}

export interface ToolbarDragOptions {
	container: HTMLElement;
	/** CSS class(es) for the drag handle. Default `"ss-toolbar-drag-handle"`. */
	handleClassName?: string;
	/**
	 * Dot-grid orientation of the drag handle icon.
	 * - `"horizontal"` – 3×2 landscape grid (default, for vertical/side toolbars).
	 * - `"vertical"`   – 2×3 portrait grid (for horizontal/top toolbars).
	 */
	handleOrientation?: DragHandleOrientation;
	onReset?: () => void;
	/** Minimum distance from viewport edge. Default 12. */
	boundsPadding?: number;
}

export interface ToolbarDragState {
	readonly hasUserPosition: boolean;
	readonly userX: number;
	readonly userY: number;
}

export interface ToolbarDragHandle {
	getState(): ToolbarDragState;
	dispose(): void;
}

export function makeToolbarDraggable(options: ToolbarDragOptions): ToolbarDragHandle {
	const { container, handleClassName, handleOrientation, boundsPadding = 12 } = options;

	const handle = createDragHandle(handleClassName, handleOrientation);
	container.insertBefore(handle, container.firstChild);

	let hasUserPosition = false;
	let userX = 0;
	let userY = 0;

	// Drag state
	let isPointerDown = false;
	let isDragging = false;
	let startPointerX = 0;
	let startPointerY = 0;
	let startLeft = 0;
	let startTop = 0;

	function clamp(x: number, y: number): { x: number; y: number } {
		const rect = container.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		return {
			x: Math.max(boundsPadding, Math.min(vw - rect.width - boundsPadding, x)),
			y: Math.max(boundsPadding, Math.min(vh - rect.height - boundsPadding, y))
		};
	}

	function onPointerMove(e: PointerEvent): void {
		if (!isPointerDown) return;

		// Begin drag on first move
		if (!isDragging) {
			isDragging = true;
			container.style.transform = "none";
			container.classList.add("ss-toolbar--dragging");
			document.body.classList.add("ss-dragging-toolbar");
		}

		const dx = e.clientX - startPointerX;
		const dy = e.clientY - startPointerY;
		const rawX = startLeft + dx;
		const rawY = startTop + dy;
		const clamped = clamp(rawX, rawY);

		container.style.left = `${clamped.x}px`;
		container.style.top = `${clamped.y}px`;

		userX = clamped.x;
		userY = clamped.y;
		hasUserPosition = true;
	}

	function onPointerUp(): void {
		if (!isPointerDown) return;
		isPointerDown = false;

		if (isDragging) {
			container.classList.remove("ss-toolbar--dragging");
			document.body.classList.remove("ss-dragging-toolbar");
		}
		isDragging = false;

		document.removeEventListener("pointermove", onPointerMove);
		document.removeEventListener("pointerup", onPointerUp);
	}

	function resetPosition(): void {
		hasUserPosition = false;
		userX = 0;
		userY = 0;

		options.onReset?.();
	}

	function onDblClick(e: MouseEvent): void {
		e.preventDefault();
		e.stopPropagation();
		resetPosition();
	}

	function onPointerDown(e: PointerEvent): void {
		// Only left mouse button / primary touch
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		isPointerDown = true;
		startPointerX = e.clientX;
		startPointerY = e.clientY;

		// Resolve current position from the rendered rect
		const rect = container.getBoundingClientRect();
		const parent = container.offsetParent as HTMLElement | null;
		const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };

		// For position:fixed containers, offsetParent is null, use viewport coords directly
		if (container.style.position === "fixed" || getComputedStyle(container).position === "fixed") {
			startLeft = rect.left;
			startTop = rect.top;
		} else {
			startLeft = rect.left - parentRect.left;
			startTop = rect.top - parentRect.top;
		}

		document.addEventListener("pointermove", onPointerMove);
		document.addEventListener("pointerup", onPointerUp);
	}

	// Attach listeners
	handle.addEventListener("pointerdown", onPointerDown);
	handle.addEventListener("dblclick", onDblClick);

	return {
		getState(): ToolbarDragState {
			return { hasUserPosition, userX, userY };
		},
		dispose(): void {
			handle.removeEventListener("pointerdown", onPointerDown);
			handle.removeEventListener("dblclick", onDblClick);
			handle.remove();
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
			document.body.classList.remove("ss-dragging-toolbar");
			container.classList.remove("ss-toolbar--dragging");
		}
	};
}
