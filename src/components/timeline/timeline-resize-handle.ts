/**
 * Resizable timeline divider — a horizontal drag handle at the top edge
 * of the timeline that lets users resize the timeline container vertically.
 */

export interface TimelineResizeOptions {
	container: HTMLElement;
	onResize: () => void;
	onResizeEnd?: (height: number) => void;
}

export interface TimelineResizeHandle {
	element: HTMLElement;
	destroy: () => void;
}

const MIN_HEIGHT = 150;
const MAX_HEIGHT_RATIO = 0.7;

export function createTimelineResizeHandle(options: TimelineResizeOptions): TimelineResizeHandle {
	const { container, onResize, onResizeEnd } = options;

	const divider = document.createElement("div");
	divider.className = "ss-timeline-divider";

	let startY = 0;
	let startContainerHeight = 0;

	function clampHeight(h: number): number {
		const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
		return Math.max(MIN_HEIGHT, Math.min(maxHeight, h));
	}

	function onPointerMove(e: PointerEvent): void {
		const deltaY = startY - e.clientY;
		const newHeight = clampHeight(startContainerHeight + deltaY);
		container.style.height = `${newHeight}px`;
		onResize();
	}

	function onPointerUp(): void {
		divider.classList.remove("ss-timeline-divider--active");
		document.body.classList.remove("ss-resizing-timeline");
		document.removeEventListener("pointermove", onPointerMove);
		document.removeEventListener("pointerup", onPointerUp);
		onResizeEnd?.(container.getBoundingClientRect().height);
	}

	function onPointerDown(e: PointerEvent): void {
		if (e.button !== 0) return;
		e.preventDefault();

		startY = e.clientY;
		startContainerHeight = container.getBoundingClientRect().height;

		divider.classList.add("ss-timeline-divider--active");
		document.body.classList.add("ss-resizing-timeline");

		document.addEventListener("pointermove", onPointerMove);
		document.addEventListener("pointerup", onPointerUp);
	}

	function onDblClick(e: MouseEvent): void {
		e.preventDefault();
		container.style.height = "";
		onResize();
		onResizeEnd?.(container.getBoundingClientRect().height);
	}

	divider.addEventListener("pointerdown", onPointerDown);
	divider.addEventListener("dblclick", onDblClick);

	return {
		element: divider,
		destroy(): void {
			divider.removeEventListener("pointerdown", onPointerDown);
			divider.removeEventListener("dblclick", onDblClick);
			document.removeEventListener("pointermove", onPointerMove);
			document.removeEventListener("pointerup", onPointerUp);
			document.body.classList.remove("ss-resizing-timeline");
			divider.remove();
		}
	};
}
