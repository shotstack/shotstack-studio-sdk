/**
 * @jest-environment jsdom
 */

/**
 * SpacingPanel Regression Tests
 *
 * Covers changes from:
 * - 956eaae: Replace throttle with two-phase drag pattern for command batching
 *
 * Tests:
 * 1. Mount and DOM structure (letter spacing + line height sliders)
 * 2. Config options (showLetterSpacing: false)
 * 3. State management: setState, setLineHeight, getState
 * 4. onChange callback with SpacingState
 * 5. Two-phase drag lifecycle: onDragStart, onDragEnd, isDragging
 * 6. Duplicate pointerdown guard (wasInactive check)
 * 7. Dispose clears drag state
 */

import { SpacingPanel } from "../src/core/ui/composites/SpacingPanel";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mountPanel(config = {}): { panel: SpacingPanel; container: HTMLDivElement } {
	const panel = new SpacingPanel(config);
	const container = document.createElement("div");
	document.body.appendChild(container);
	panel.mount(container);
	return { panel, container };
}

function getLetterSpacingSlider(container: HTMLElement): HTMLInputElement | null {
	return container.querySelector("[data-letter-spacing-slider]");
}

function getLineHeightSlider(container: HTMLElement): HTMLInputElement {
	return container.querySelector("[data-line-height-slider]") as HTMLInputElement;
}

function getLetterSpacingValue(container: HTMLElement): HTMLSpanElement | null {
	return container.querySelector("[data-letter-spacing-value]");
}

function getLineHeightValue(container: HTMLElement): HTMLSpanElement {
	return container.querySelector("[data-line-height-value]") as HTMLSpanElement;
}

function simulateInput(slider: HTMLInputElement, value: number): void {
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, String(value));
	slider.dispatchEvent(new Event("input", { bubbles: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SpacingPanel", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	// ── Mount & DOM Structure ────────────────────────────────────────────────

	describe("mount and DOM structure", () => {
		it("renders letter spacing and line height sliders", () => {
			const { panel, container } = mountPanel();

			expect(getLetterSpacingSlider(container)).toBeTruthy();
			expect(getLineHeightSlider(container)).toBeTruthy();

			panel.dispose();
		});

		it("renders value displays for both sliders", () => {
			const { panel, container } = mountPanel();

			expect(getLetterSpacingValue(container)).toBeTruthy();
			expect(getLineHeightValue(container)).toBeTruthy();

			panel.dispose();
		});

		it("hides letter spacing when showLetterSpacing is false", () => {
			const { panel, container } = mountPanel({ showLetterSpacing: false });

			expect(getLetterSpacingSlider(container)).toBeNull();
			expect(getLetterSpacingValue(container)).toBeNull();
			// Line height should still be present
			expect(getLineHeightSlider(container)).toBeTruthy();

			panel.dispose();
		});
	});

	// ── State Management ─────────────────────────────────────────────────────

	describe("state management", () => {
		it("getState() returns default values", () => {
			const { panel } = mountPanel();

			const state = panel.getState();
			expect(state.letterSpacing).toBe(0);
			expect(state.lineHeight).toBe(1.2);

			panel.dispose();
		});

		it("setState() syncs slider values and displays", () => {
			const { panel, container } = mountPanel();

			panel.setState(5, 0, 2.0);

			expect(getLetterSpacingSlider(container)!.value).toBe("5");
			expect(getLetterSpacingValue(container)!.textContent).toBe("5");
			expect(getLineHeightSlider(container).value).toBe("20"); // 2.0 * 10
			expect(getLineHeightValue(container).textContent).toBe("2.0");

			const state = panel.getState();
			expect(state.letterSpacing).toBe(5);
			expect(state.lineHeight).toBe(2.0);

			panel.dispose();
		});

		it("setLineHeight() syncs only line height", () => {
			const { panel, container } = mountPanel();

			panel.setState(10, 0, 1.2);
			panel.setLineHeight(1.8);

			// Letter spacing unchanged
			expect(panel.getState().letterSpacing).toBe(10);
			// Line height updated
			expect(panel.getState().lineHeight).toBe(1.8);
			expect(getLineHeightSlider(container).value).toBe("18"); // 1.8 * 10
			expect(getLineHeightValue(container).textContent).toBe("1.8");

			panel.dispose();
		});
	});

	// ── onChange Callback ─────────────────────────────────────────────────────

	describe("onChange callback", () => {
		it("fires with SpacingState on letter spacing input", () => {
			const { panel, container } = mountPanel();
			const callback = jest.fn();
			panel.onChange(callback);

			simulateInput(getLetterSpacingSlider(container)!, 15);

			expect(callback).toHaveBeenCalledWith(expect.objectContaining({ letterSpacing: 15 }));

			panel.dispose();
		});

		it("fires with SpacingState on line height input", () => {
			const { panel, container } = mountPanel();
			const callback = jest.fn();
			panel.onChange(callback);

			// Line height slider value 18 → lineHeight 1.8
			simulateInput(getLineHeightSlider(container), 18);

			expect(callback).toHaveBeenCalledWith(expect.objectContaining({ lineHeight: 1.8 }));

			panel.dispose();
		});

		it("updates display on letter spacing input", () => {
			const { panel, container } = mountPanel();

			simulateInput(getLetterSpacingSlider(container)!, 25);

			expect(getLetterSpacingValue(container)!.textContent).toBe("25");

			panel.dispose();
		});

		it("updates display on line height input", () => {
			const { panel, container } = mountPanel();

			simulateInput(getLineHeightSlider(container), 15);

			expect(getLineHeightValue(container).textContent).toBe("1.5");

			panel.dispose();
		});
	});

	// ── Two-Phase Drag Lifecycle ─────────────────────────────────────────────

	describe("two-phase drag lifecycle", () => {
		it("fires onDragStart on pointerdown of letter spacing slider", () => {
			const { panel, container } = mountPanel();
			const dragStart = jest.fn();
			panel.onDragStart(dragStart);

			getLetterSpacingSlider(container)!.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			expect(dragStart).toHaveBeenCalledTimes(1);
			expect(panel.isDragging()).toBe(true);

			panel.dispose();
		});

		it("fires onDragStart on pointerdown of line height slider", () => {
			const { panel, container } = mountPanel();
			const dragStart = jest.fn();
			panel.onDragStart(dragStart);

			getLineHeightSlider(container).dispatchEvent(new Event("pointerdown", { bubbles: true }));

			expect(dragStart).toHaveBeenCalledTimes(1);
			expect(panel.isDragging()).toBe(true);

			panel.dispose();
		});

		it("fires onDragEnd on change event of letter spacing slider", () => {
			const { panel, container } = mountPanel();
			const dragEnd = jest.fn();
			panel.onDragEnd(dragEnd);

			const slider = getLetterSpacingSlider(container)!;
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			slider.dispatchEvent(new Event("change", { bubbles: true }));

			expect(dragEnd).toHaveBeenCalledTimes(1);
			expect(panel.isDragging()).toBe(false);

			panel.dispose();
		});

		it("fires onDragEnd on change event of line height slider", () => {
			const { panel, container } = mountPanel();
			const dragEnd = jest.fn();
			panel.onDragEnd(dragEnd);

			const slider = getLineHeightSlider(container);
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			slider.dispatchEvent(new Event("change", { bubbles: true }));

			expect(dragEnd).toHaveBeenCalledTimes(1);
			expect(panel.isDragging()).toBe(false);

			panel.dispose();
		});

		it("does not fire duplicate onDragStart when already dragging (wasInactive guard)", () => {
			const { panel, container } = mountPanel();
			const dragStart = jest.fn();
			panel.onDragStart(dragStart);

			const letterSlider = getLetterSpacingSlider(container)!;
			const lineSlider = getLineHeightSlider(container);

			// First pointerdown activates
			letterSlider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			expect(dragStart).toHaveBeenCalledTimes(1);

			// Second pointerdown on DIFFERENT slider — already active, should NOT fire again
			lineSlider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			expect(dragStart).toHaveBeenCalledTimes(1);

			panel.dispose();
		});

		it("does not fire onDragEnd when not dragging", () => {
			const { panel, container } = mountPanel();
			const dragEnd = jest.fn();
			panel.onDragEnd(dragEnd);

			// Fire change without prior pointerdown
			getLetterSpacingSlider(container)!.dispatchEvent(new Event("change", { bubbles: true }));

			expect(dragEnd).not.toHaveBeenCalled();

			panel.dispose();
		});

		it("isDragging() returns false when no drag is active", () => {
			const { panel } = mountPanel();
			expect(panel.isDragging()).toBe(false);
			panel.dispose();
		});

		it("complete drag cycle: start → multiple inputs → end", () => {
			const { panel, container } = mountPanel();
			const dragStart = jest.fn();
			const dragEnd = jest.fn();
			const onChange = jest.fn();
			panel.onDragStart(dragStart);
			panel.onDragEnd(dragEnd);
			panel.onChange(onChange);

			const slider = getLetterSpacingSlider(container)!;

			// Start drag
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			expect(dragStart).toHaveBeenCalledTimes(1);

			// Multiple live inputs during drag
			simulateInput(slider, 5);
			simulateInput(slider, 10);
			simulateInput(slider, 15);
			expect(onChange).toHaveBeenCalledTimes(3);

			// End drag
			slider.dispatchEvent(new Event("change", { bubbles: true }));
			expect(dragEnd).toHaveBeenCalledTimes(1);

			// Exactly one start and one end
			expect(dragStart).toHaveBeenCalledTimes(1);
			expect(dragEnd).toHaveBeenCalledTimes(1);

			panel.dispose();
		});
	});

	// ── Dispose ──────────────────────────────────────────────────────────────

	describe("dispose", () => {
		it("clears drag state on dispose", () => {
			const { panel, container } = mountPanel();

			// Start a drag
			getLetterSpacingSlider(container)!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			expect(panel.isDragging()).toBe(true);

			panel.dispose();

			expect(panel.isDragging()).toBe(false);
		});
	});
});
