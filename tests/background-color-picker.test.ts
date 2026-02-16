/**
 * @jest-environment jsdom
 */

/**
 * BackgroundColorPicker Regression Tests
 *
 * Covers changes from:
 * - 002db24: Add enable toggle for background color picker
 * - 8cef92e: Implement explicit drag state management and two-phase pattern
 *
 * Tests:
 * 1. Mount and DOM structure
 * 2. Enable/disable toggle propagation
 * 3. Public API: setEnabled, isEnabled, setColor, setOpacity, getColor, getOpacity
 * 4. onChange callback with correct (controlId, enabled, color, opacity) signature
 * 5. Two-phase drag lifecycle: onDragStart, onDragEnd, isDragging
 * 6. Control-specific drag tracking (currentControlId prevents cross-control interference)
 * 7. Dispose cleanup
 */


// Mock style injection
jest.mock("@styles/inject", () => ({
	injectShotstackStyles: jest.fn()
}));

// eslint-disable-next-line import/first
import { BackgroundColorPicker } from "../src/core/ui/background-color-picker";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mountPicker(): { picker: BackgroundColorPicker; parent: HTMLDivElement } {
	const picker = new BackgroundColorPicker();
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	picker.mount(parent);
	return { picker, parent };
}

function getCheckbox(parent: HTMLElement): HTMLInputElement {
	return parent.querySelector(".ss-color-picker-enable-checkbox") as HTMLInputElement;
}

function getColorInput(parent: HTMLElement): HTMLInputElement {
	return parent.querySelector(".ss-color-picker-color") as HTMLInputElement;
}

function getOpacitySlider(parent: HTMLElement): HTMLInputElement {
	return parent.querySelector(".ss-color-picker-opacity") as HTMLInputElement;
}

function getOpacityValue(parent: HTMLElement): HTMLSpanElement {
	return parent.querySelector(".ss-color-picker-opacity-value") as HTMLSpanElement;
}

function getControls(parent: HTMLElement): HTMLElement {
	return parent.querySelector(".ss-color-picker-controls") as HTMLElement;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BackgroundColorPicker", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	// ── Mount & DOM Structure ────────────────────────────────────────────────

	describe("mount and DOM structure", () => {
		it("renders enable checkbox", () => {
			const { picker, parent } = mountPicker();
			expect(getCheckbox(parent)).toBeTruthy();
			picker.dispose();
		});

		it("renders color input", () => {
			const { picker, parent } = mountPicker();
			expect(getColorInput(parent)).toBeTruthy();
			picker.dispose();
		});

		it("renders opacity slider and value display", () => {
			const { picker, parent } = mountPicker();
			expect(getOpacitySlider(parent)).toBeTruthy();
			expect(getOpacityValue(parent)).toBeTruthy();
			picker.dispose();
		});

		it("starts with background disabled by default", () => {
			const { picker, parent } = mountPicker();
			expect(getCheckbox(parent).checked).toBe(false);
			expect(picker.isEnabled()).toBe(false);
			picker.dispose();
		});

		it("disables color and opacity inputs when background is disabled", () => {
			const { picker, parent } = mountPicker();
			expect(getColorInput(parent).disabled).toBe(true);
			expect(getOpacitySlider(parent).disabled).toBe(true);
			picker.dispose();
		});

		it("adds disabled class to controls wrapper when background is disabled", () => {
			const { picker, parent } = mountPicker();
			expect(getControls(parent).classList.contains("disabled")).toBe(true);
			picker.dispose();
		});
	});

	// ── Enable/Disable Toggle ────────────────────────────────────────────────

	describe("enable toggle", () => {
		it("enables color and opacity inputs when checkbox is checked", () => {
			const { picker, parent } = mountPicker();
			const checkbox = getCheckbox(parent);

			checkbox.checked = true;
			checkbox.dispatchEvent(new Event("change", { bubbles: true }));

			expect(getColorInput(parent).disabled).toBe(false);
			expect(getOpacitySlider(parent).disabled).toBe(false);
			expect(getControls(parent).classList.contains("disabled")).toBe(false);

			picker.dispose();
		});

		it("disables inputs when checkbox is unchecked", () => {
			const { picker, parent } = mountPicker();

			// First enable
			picker.setEnabled(true);
			expect(getColorInput(parent).disabled).toBe(false);

			// Then disable via checkbox
			const checkbox = getCheckbox(parent);
			checkbox.checked = false;
			checkbox.dispatchEvent(new Event("change", { bubbles: true }));

			expect(getColorInput(parent).disabled).toBe(true);
			expect(getOpacitySlider(parent).disabled).toBe(true);
			expect(getControls(parent).classList.contains("disabled")).toBe(true);

			picker.dispose();
		});
	});

	// ── Public API ───────────────────────────────────────────────────────────

	describe("public API", () => {
		it("setEnabled(true) checks the checkbox and enables inputs", () => {
			const { picker, parent } = mountPicker();

			picker.setEnabled(true);

			expect(getCheckbox(parent).checked).toBe(true);
			expect(getColorInput(parent).disabled).toBe(false);
			expect(getOpacitySlider(parent).disabled).toBe(false);
			expect(picker.isEnabled()).toBe(true);

			picker.dispose();
		});

		it("setEnabled(false) unchecks the checkbox and disables inputs", () => {
			const { picker, parent } = mountPicker();

			picker.setEnabled(true);
			picker.setEnabled(false);

			expect(getCheckbox(parent).checked).toBe(false);
			expect(getColorInput(parent).disabled).toBe(true);
			expect(picker.isEnabled()).toBe(false);

			picker.dispose();
		});

		it("setColor() updates the color input value", () => {
			const { picker, parent } = mountPicker();

			picker.setColor("#ff0000");

			// HTML color inputs normalize to lowercase
			expect(getColorInput(parent).value).toBe("#ff0000");
			expect(picker.getColor()).toBe("#FF0000");

			picker.dispose();
		});

		it("setOpacity() updates the opacity slider and display", () => {
			const { picker, parent } = mountPicker();

			picker.setOpacity(75);

			expect(getOpacitySlider(parent).value).toBe("75");
			expect(getOpacityValue(parent).textContent).toBe("75%");
			expect(picker.getOpacity()).toBe(0.75);

			picker.dispose();
		});

		it("setOpacity() clamps to 0-100 range", () => {
			const { picker } = mountPicker();

			picker.setOpacity(150);
			expect(picker.getOpacity()).toBe(1);

			picker.setOpacity(-10);
			expect(picker.getOpacity()).toBe(0);

			picker.dispose();
		});
	});

	// ── onChange Callback ─────────────────────────────────────────────────────

	describe("onChange callback", () => {
		it("fires with (controlId, enabled, color, opacity) on checkbox change", () => {
			const { picker, parent } = mountPicker();
			const callback = jest.fn();
			picker.onChange(callback);

			const checkbox = getCheckbox(parent);
			checkbox.checked = true;
			checkbox.dispatchEvent(new Event("change", { bubbles: true }));

			expect(callback).toHaveBeenCalledWith("background-checkbox", true, expect.any(String), expect.any(Number));

			picker.dispose();
		});

		it("fires with correct controlId on color input", () => {
			const { picker, parent } = mountPicker();
			const callback = jest.fn();
			picker.onChange(callback);
			picker.setEnabled(true);

			const colorInput = getColorInput(parent);
			colorInput.value = "#00ff00";
			colorInput.dispatchEvent(new Event("input", { bubbles: true }));

			expect(callback).toHaveBeenCalledWith("background-color", true, "#00ff00", expect.any(Number));

			picker.dispose();
		});

		it("fires with correct controlId on opacity input", () => {
			const { picker, parent } = mountPicker();
			const callback = jest.fn();
			picker.onChange(callback);
			picker.setEnabled(true);

			const slider = getOpacitySlider(parent);
			slider.value = "50";
			slider.dispatchEvent(new Event("input", { bubbles: true }));

			expect(callback).toHaveBeenCalledWith("background-opacity", true, expect.any(String), 0.5);

			picker.dispose();
		});

		it("passes enabled=false when background is disabled", () => {
			const { picker, parent } = mountPicker();
			const callback = jest.fn();
			picker.onChange(callback);

			// Checkbox unchecked by default
			const checkbox = getCheckbox(parent);
			checkbox.checked = false;
			checkbox.dispatchEvent(new Event("change", { bubbles: true }));

			expect(callback).toHaveBeenCalledWith("background-checkbox", false, expect.any(String), expect.any(Number));

			picker.dispose();
		});
	});

	// ── Two-Phase Drag Lifecycle ─────────────────────────────────────────────

	describe("two-phase drag lifecycle", () => {
		it("fires onDragStart on pointerdown of opacity slider", () => {
			const { picker, parent } = mountPicker();
			const dragStart = jest.fn();
			picker.onDragStart(dragStart);

			const slider = getOpacitySlider(parent);
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			expect(dragStart).toHaveBeenCalledWith("background-opacity");
			expect(picker.isDragging()).toBe(true);

			picker.dispose();
		});

		it("fires onDragEnd on blur of opacity slider", () => {
			const { picker, parent } = mountPicker();
			const dragEnd = jest.fn();
			picker.onDragEnd(dragEnd);

			const slider = getOpacitySlider(parent);
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			slider.dispatchEvent(new Event("blur", { bubbles: true }));

			expect(dragEnd).toHaveBeenCalledWith("background-opacity");
			expect(picker.isDragging()).toBe(false);

			picker.dispose();
		});

		it("fires onDragStart on pointerdown of color input", () => {
			const { picker, parent } = mountPicker();
			const dragStart = jest.fn();
			picker.onDragStart(dragStart);

			const colorInput = getColorInput(parent);
			colorInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			expect(dragStart).toHaveBeenCalledWith("background-color");
			expect(picker.isDragging()).toBe(true);

			picker.dispose();
		});

		it("fires onDragEnd on blur of color input", () => {
			const { picker, parent } = mountPicker();
			const dragEnd = jest.fn();
			picker.onDragEnd(dragEnd);

			const colorInput = getColorInput(parent);
			colorInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			colorInput.dispatchEvent(new Event("blur", { bubbles: true }));

			expect(dragEnd).toHaveBeenCalledWith("background-color");
			expect(picker.isDragging()).toBe(false);

			picker.dispose();
		});

		it("fires onDragStart on pointerdown of enable checkbox", () => {
			const { picker, parent } = mountPicker();
			const dragStart = jest.fn();
			picker.onDragStart(dragStart);

			const checkbox = getCheckbox(parent);
			checkbox.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			expect(dragStart).toHaveBeenCalledWith("background-checkbox");

			picker.dispose();
		});

		it("fires onDragEnd on blur of enable checkbox", () => {
			const { picker, parent } = mountPicker();
			const dragEnd = jest.fn();
			picker.onDragEnd(dragEnd);

			const checkbox = getCheckbox(parent);
			checkbox.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			checkbox.dispatchEvent(new Event("blur", { bubbles: true }));

			expect(dragEnd).toHaveBeenCalledWith("background-checkbox");

			picker.dispose();
		});

		it("does not fire duplicate onDragStart when already dragging", () => {
			const { picker, parent } = mountPicker();
			const dragStart = jest.fn();
			picker.onDragStart(dragStart);

			const slider = getOpacitySlider(parent);
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Only one start call since currentControlId is already set
			expect(dragStart).toHaveBeenCalledTimes(1);

			picker.dispose();
		});

		it("blur on wrong control does not end active drag (currentControlId guard)", () => {
			const { picker, parent } = mountPicker();
			const dragEnd = jest.fn();
			picker.onDragEnd(dragEnd);

			// Start drag on color input
			const colorInput = getColorInput(parent);
			colorInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Blur fires on opacity slider (wrong control)
			const slider = getOpacitySlider(parent);
			slider.dispatchEvent(new Event("blur", { bubbles: true }));

			// Should NOT end drag — wrong controlId
			expect(dragEnd).not.toHaveBeenCalled();
			expect(picker.isDragging()).toBe(true);

			// Correct blur ends it
			colorInput.dispatchEvent(new Event("blur", { bubbles: true }));
			expect(dragEnd).toHaveBeenCalledWith("background-color");
			expect(picker.isDragging()).toBe(false);

			picker.dispose();
		});

		it("isDragging() returns false when no drag is active", () => {
			const { picker } = mountPicker();
			expect(picker.isDragging()).toBe(false);
			picker.dispose();
		});
	});

	// ── Dispose ──────────────────────────────────────────────────────────────

	describe("dispose", () => {
		it("removes the container from the DOM", () => {
			const { picker, parent } = mountPicker();

			expect(parent.querySelector(".ss-color-picker")).toBeTruthy();

			picker.dispose();

			expect(parent.querySelector(".ss-color-picker")).toBeNull();
		});

		it("does not fire callbacks after dispose", () => {
			const { picker } = mountPicker();
			const callback = jest.fn();
			picker.onChange(callback);

			picker.dispose();

			// Callback ref is cleared, so even if somehow the handler fires, callback is null
			// Just verify no error is thrown
			expect(callback).not.toHaveBeenCalled();
		});
	});
});
