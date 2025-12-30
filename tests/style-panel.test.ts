/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { StylePanel } from "../src/core/ui/composites/StylePanel";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestContainer(): HTMLDivElement {
	const container = document.createElement("div");
	document.body.appendChild(container);
	return container;
}

function cleanupTestContainer(container: HTMLDivElement): void {
	container.remove();
}

function simulateClick(element: Element | null): void {
	if (element) {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	}
}

function simulateInput(element: HTMLInputElement | null, value: string | number): void {
	if (element) {
		element.value = String(value);
		element.dispatchEvent(new Event("input", { bubbles: true }));
	}
}

function simulateChange(element: HTMLInputElement | null, value: boolean): void {
	if (element) {
		element.checked = value;
		element.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

// ============================================================================
// StylePanel Tests
// ============================================================================

describe("StylePanel", () => {
	let panel: StylePanel;
	let container: HTMLDivElement;

	beforeEach(() => {
		panel = new StylePanel();
		container = createTestContainer();
	});

	afterEach(() => {
		panel.dispose();
		cleanupTestContainer(container);
	});

	describe("tab switching", () => {
		it("should render all 4 tabs: Fill, Border, Padding, Shadow", () => {
			panel.mount(container);

			const tabs = container.querySelectorAll("[data-style-tab]");
			expect(tabs.length).toBe(4);

			const tabNames = Array.from(tabs).map(t => t.textContent?.trim());
			expect(tabNames).toEqual(["Fill", "Border", "Padding", "Shadow"]);
		});

		it("should show Fill tab content by default", () => {
			panel.mount(container);

			const fillPanel = container.querySelector('[data-tab-content="fill"]') as HTMLElement;
			const borderPanel = container.querySelector('[data-tab-content="border"]') as HTMLElement;

			expect(fillPanel?.style.display).not.toBe("none");
			expect(borderPanel?.style.display).toBe("none");
		});

		it("should switch to Border tab on click", () => {
			panel.mount(container);

			const borderTab = container.querySelector('[data-style-tab="border"]');
			simulateClick(borderTab);

			const fillPanel = container.querySelector('[data-tab-content="fill"]') as HTMLElement;
			const borderPanel = container.querySelector('[data-tab-content="border"]') as HTMLElement;

			expect(fillPanel?.style.display).toBe("none");
			expect(borderPanel?.style.display).toBe("block");
		});

		it("should update active tab button styling", () => {
			panel.mount(container);

			const fillTab = container.querySelector('[data-style-tab="fill"]');
			const borderTab = container.querySelector('[data-style-tab="border"]');

			expect(fillTab?.classList.contains("active")).toBe(true);
			expect(borderTab?.classList.contains("active")).toBe(false);

			simulateClick(borderTab);

			expect(fillTab?.classList.contains("active")).toBe(false);
			expect(borderTab?.classList.contains("active")).toBe(true);
		});
	});

	describe("border controls", () => {
		it("should render width, color, opacity, radius sliders", () => {
			panel.mount(container);

			expect(container.querySelector("[data-border-width-slider]")).not.toBeNull();
			expect(container.querySelector("[data-border-color]")).not.toBeNull();
			expect(container.querySelector("[data-border-opacity-slider]")).not.toBeNull();
			expect(container.querySelector("[data-border-radius-slider]")).not.toBeNull();
		});

		it("should emit border change on width slider input", () => {
			panel.mount(container);

			const callback = jest.fn();
			panel.onBorderChange(callback);

			const slider = container.querySelector("[data-border-width-slider]") as HTMLInputElement;
			simulateInput(slider, 5);

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ width: 5 })
			);
		});

		it("should update display value when slider moves", () => {
			panel.mount(container);

			const slider = container.querySelector("[data-border-width-slider]") as HTMLInputElement;
			const display = container.querySelector("[data-border-width-value]");

			simulateInput(slider, 10);

			expect(display?.textContent).toBe("10");
		});

		it("should sync state from setBorderState()", () => {
			panel.mount(container);

			panel.setBorderState({ width: 8, color: "#ff0000", opacity: 75, radius: 12 });

			const widthSlider = container.querySelector("[data-border-width-slider]") as HTMLInputElement;
			const colorInput = container.querySelector("[data-border-color]") as HTMLInputElement;
			const opacitySlider = container.querySelector("[data-border-opacity-slider]") as HTMLInputElement;
			const radiusSlider = container.querySelector("[data-border-radius-slider]") as HTMLInputElement;

			expect(widthSlider?.value).toBe("8");
			expect(colorInput?.value).toBe("#ff0000");
			expect(opacitySlider?.value).toBe("75");
			expect(radiusSlider?.value).toBe("12");
		});
	});

	describe("padding controls", () => {
		it("should render top, right, bottom, left sliders", () => {
			panel.mount(container);

			expect(container.querySelector("[data-padding-top-slider]")).not.toBeNull();
			expect(container.querySelector("[data-padding-right-slider]")).not.toBeNull();
			expect(container.querySelector("[data-padding-bottom-slider]")).not.toBeNull();
			expect(container.querySelector("[data-padding-left-slider]")).not.toBeNull();
		});

		it("should emit padding change on any slider input", () => {
			panel.mount(container);

			const callback = jest.fn();
			panel.onPaddingChange(callback);

			const slider = container.querySelector("[data-padding-top-slider]") as HTMLInputElement;
			simulateInput(slider, 20);

			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ top: 20 })
			);
		});

		it("should sync state from setPaddingState()", () => {
			panel.mount(container);

			panel.setPaddingState({ top: 10, right: 20, bottom: 30, left: 40 });

			const topSlider = container.querySelector("[data-padding-top-slider]") as HTMLInputElement;
			const rightSlider = container.querySelector("[data-padding-right-slider]") as HTMLInputElement;
			const bottomSlider = container.querySelector("[data-padding-bottom-slider]") as HTMLInputElement;
			const leftSlider = container.querySelector("[data-padding-left-slider]") as HTMLInputElement;

			expect(topSlider?.value).toBe("10");
			expect(rightSlider?.value).toBe("20");
			expect(bottomSlider?.value).toBe("30");
			expect(leftSlider?.value).toBe("40");
		});
	});

	describe("shadow controls", () => {
		it("should render enable toggle, offsetX, offsetY, color, opacity", () => {
			panel.mount(container);

			expect(container.querySelector("[data-shadow-toggle]")).not.toBeNull();
			expect(container.querySelector("[data-shadow-offset-x]")).not.toBeNull();
			expect(container.querySelector("[data-shadow-offset-y]")).not.toBeNull();
			expect(container.querySelector("[data-shadow-color]")).not.toBeNull();
			expect(container.querySelector("[data-shadow-opacity]")).not.toBeNull();
		});

		it("should NOT render blur slider (removed from UI)", () => {
			panel.mount(container);

			const blurSlider = container.querySelector("[data-shadow-blur]");
			expect(blurSlider).toBeNull();
		});

		it("should auto-enable shadow when slider is adjusted", () => {
			panel.mount(container);

			const callback = jest.fn();
			panel.onShadowChange(callback);

			// Shadow starts disabled
			const toggle = container.querySelector("[data-shadow-toggle]") as HTMLInputElement;
			expect(toggle?.checked).toBe(false);

			// Adjust offset slider (without enabling toggle first)
			const offsetXSlider = container.querySelector("[data-shadow-offset-x]") as HTMLInputElement;
			simulateInput(offsetXSlider, 5);

			// Toggle should now be checked
			expect(toggle?.checked).toBe(true);

			// Callback should receive enabled: true
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ enabled: true, offsetX: 5 })
			);
		});

		it("should apply default offsets when toggle enabled with zeroed values", () => {
			panel.mount(container);

			const callback = jest.fn();
			panel.onShadowChange(callback);

			// Enable shadow via toggle (starts with zeroed offsets)
			const toggle = container.querySelector("[data-shadow-toggle]") as HTMLInputElement;
			simulateChange(toggle, true);

			// Defaults should be applied: offsetX: 2, offsetY: 2
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({
					enabled: true,
					offsetX: 2,
					offsetY: 2
				})
			);
		});

		it("should emit shadow change with blur fixed at 4", () => {
			panel.mount(container);

			const callback = jest.fn();
			panel.onShadowChange(callback);

			// Enable shadow
			const toggle = container.querySelector("[data-shadow-toggle]") as HTMLInputElement;
			simulateChange(toggle, true);

			// Verify blur is always 4 (required for canvas to render shadow)
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ blur: 4 })
			);
		});

		it("should sync state from setShadowState()", () => {
			panel.mount(container);

			// Set shadow state (blur parameter is accepted but internally fixed)
			panel.setShadowState({ enabled: true, offsetX: 5, offsetY: 10, blur: 8, color: "#333333", opacity: 75 });

			const toggle = container.querySelector("[data-shadow-toggle]") as HTMLInputElement;
			const offsetXSlider = container.querySelector("[data-shadow-offset-x]") as HTMLInputElement;
			const offsetYSlider = container.querySelector("[data-shadow-offset-y]") as HTMLInputElement;
			const colorInput = container.querySelector("[data-shadow-color]") as HTMLInputElement;
			const opacitySlider = container.querySelector("[data-shadow-opacity]") as HTMLInputElement;

			expect(toggle?.checked).toBe(true);
			expect(offsetXSlider?.value).toBe("5");
			expect(offsetYSlider?.value).toBe("10");
			expect(colorInput?.value).toBe("#333333");
			expect(opacitySlider?.value).toBe("75");
		});

		it("should preserve blur at 4 even when setShadowState receives 0", () => {
			panel.mount(container);

			const callback = jest.fn();
			panel.onShadowChange(callback);

			// Sync with blur: 0 (which would break shadow rendering)
			panel.setShadowState({ enabled: false, offsetX: 0, offsetY: 0, blur: 0, color: "#000000", opacity: 50 });

			// Enable shadow - should use default blur: 4
			const toggle = container.querySelector("[data-shadow-toggle]") as HTMLInputElement;
			simulateChange(toggle, true);

			// Blur should be 4, not 0
			expect(callback).toHaveBeenCalledWith(
				expect.objectContaining({ blur: 4 })
			);
		});
	});

	describe("getState()", () => {
		it("should return current state", () => {
			panel.mount(container);

			panel.setBorderState({ width: 5, color: "#ff0000", opacity: 80, radius: 10 });
			panel.setPaddingState({ top: 10, right: 20, bottom: 30, left: 40 });
			panel.setShadowState({ enabled: true, offsetX: 3, offsetY: 6, blur: 4, color: "#000000", opacity: 60 });

			const state = panel.getState();

			expect(state.border).toEqual({
				width: 5,
				color: "#ff0000",
				opacity: 80,
				radius: 10
			});

			expect(state.padding).toEqual({
				top: 10,
				right: 20,
				bottom: 30,
				left: 40
			});

			expect(state.shadow).toEqual(
				expect.objectContaining({
					enabled: true,
					offsetX: 3,
					offsetY: 6,
					color: "#000000",
					opacity: 60
				})
			);
		});
	});
});
