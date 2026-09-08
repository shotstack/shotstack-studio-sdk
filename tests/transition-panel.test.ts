/**
 * @jest-environment jsdom
 */
import { TransitionPanel } from "../src/core/ui/composites/TransitionPanel";

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

describe("TransitionPanel", () => {
	let panel: TransitionPanel;
	let container: HTMLDivElement;

	beforeEach(() => {
		panel = new TransitionPanel();
		container = createTestContainer();
		panel.mount(container);
	});

	afterEach(() => {
		panel.dispose();
		cleanupTestContainer(container);
	});

	describe("zoom transition speed", () => {
		it("does not emit zoomSlow or zoomFast when the speed stepper is used", () => {
			simulateClick(container.querySelector('[data-effect="zoom"]'));
			expect(panel.getClipValue()?.in).toBe("zoom");

			const increaseBtn = container.querySelector("[data-speed-increase]") as HTMLButtonElement;
			const decreaseBtn = container.querySelector("[data-speed-decrease]") as HTMLButtonElement;
			expect(increaseBtn.disabled).toBe(true);
			expect(decreaseBtn.disabled).toBe(true);

			simulateClick(increaseBtn);
			simulateClick(decreaseBtn);

			expect(panel.getClipValue()?.in).toBe("zoom");
		});

		it("still allows Slow/Fast variants for fade", () => {
			simulateClick(container.querySelector('[data-effect="fade"]'));
			expect(panel.getClipValue()?.in).toBe("fade");

			const increaseBtn = container.querySelector("[data-speed-increase]") as HTMLButtonElement;
			expect(increaseBtn.disabled).toBe(false);

			simulateClick(increaseBtn);
			expect(panel.getClipValue()?.in).toBe("fadeSlow");
		});

		it("strips invalid Slow/Fast suffixes when rebuilding zoom from clip state", () => {
			panel.setFromClip({ in: "zoomSlow" });
			expect(panel.getClipValue()?.in).toBe("zoom");
		});
	});
});
