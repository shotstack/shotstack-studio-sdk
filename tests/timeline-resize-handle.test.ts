/**
 * @jest-environment jsdom
 */

import { createTimelineResizeHandle } from "../src/components/timeline/timeline-resize-handle";

// Polyfill PointerEvent for jsdom (not natively available)
if (typeof PointerEvent === "undefined") {
	(global as any).PointerEvent = class PointerEvent extends MouseEvent {
		readonly pointerId: number;

		readonly pointerType: string;

		constructor(type: string, params: PointerEventInit = {}) {
			super(type, params);
			this.pointerId = params.pointerId ?? 0;
			this.pointerType = params.pointerType ?? "";
		}
	};
}

function pointerEvent(type: string, opts: Partial<PointerEvent> = {}): PointerEvent {
	return new PointerEvent(type, { bubbles: true, button: 0, clientY: 0, ...opts });
}

describe("createTimelineResizeHandle – onResizeEnd", () => {
	let container: HTMLElement;
	let onResize: jest.Mock;
	let onResizeEnd: jest.Mock;

	beforeEach(() => {
		container = document.createElement("div");
		container.getBoundingClientRect = () => ({ height: 300 } as DOMRect);
		onResize = jest.fn();
		onResizeEnd = jest.fn();
	});

	it("calls onResizeEnd with container height on pointerup", () => {
		const handle = createTimelineResizeHandle({ container, onResize, onResizeEnd });

		handle.element.dispatchEvent(pointerEvent("pointerdown", { clientY: 400 }));
		document.dispatchEvent(pointerEvent("pointerup"));

		expect(onResizeEnd).toHaveBeenCalledWith(300);
	});

	it("calls onResizeEnd with container height on dblclick", () => {
		const handle = createTimelineResizeHandle({ container, onResize, onResizeEnd });

		handle.element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

		expect(onResizeEnd).toHaveBeenCalledWith(300);
	});

	it("works without onResizeEnd (optional)", () => {
		const handle = createTimelineResizeHandle({ container, onResize });

		handle.element.dispatchEvent(pointerEvent("pointerdown", { clientY: 400 }));
		expect(() => document.dispatchEvent(pointerEvent("pointerup"))).not.toThrow();
	});
});
