/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

/**
 * Text-to-Image Toolbar Regression Tests
 *
 * Covers the toolbar introduced in 3ebf6a3:
 * 1. Mount and DOM structure (prompt textarea, dimension selectors, visual controls)
 * 2. Prompt editing with debounce
 * 3. Dimension selection (width/height)
 * 4. Two-phase opacity/scale slider drag (live preview + single undo)
 * 5. State sync from clip data
 * 6. Dispose lifecycle cleanup
 */

/* eslint-disable max-classes-per-file */
import type { ResolvedClip } from "@schemas";
import { sec } from "@timing/types";
import type { Edit } from "@core/edit-session";

// Polyfill structuredClone for jsdom
if (typeof structuredClone === "undefined") {
	global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

// Mock pixi.js before any imports that use it
jest.mock("pixi.js", () => ({}));

// Mock player module (pulls in pixi.js)
jest.mock("../src/components/canvas/players/player", () => ({
	Player: class MockPlayer {},
	PlayerType: {}
}));

// Mock ShotstackEdit to prevent circular dependency / pixi import chain
jest.mock("../src/core/shotstack-edit", () => ({
	ShotstackEdit: class MockShotstackEdit {}
}));

// Mock edit-session (heavy module)
jest.mock("../src/core/edit-session", () => ({}));

jest.mock("@styles/inject", () => ({
	injectShotstackStyles: jest.fn()
}));

import { TextToImageToolbar } from "@core/ui/text-to-image-toolbar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockEditSession() {
	const mockDocument = {
		getClipBinding: jest.fn().mockReturnValue(undefined),
		setClipBinding: jest.fn(),
		removeClipBinding: jest.fn()
	};
	return {
		getClipId: jest.fn().mockReturnValue("clip-tti-1"),
		getResolvedClip: jest.fn(),
		getDocument: jest.fn().mockReturnValue(mockDocument),
		updateClip: jest.fn(),
		updateClipInDocument: jest.fn(),
		resolveClip: jest.fn(),
		commitClipUpdate: jest.fn(),
		size: { width: 1920, height: 1080 }
	};
}

function createTtiClip(overrides: Partial<ResolvedClip> = {}): ResolvedClip {
	return {
		id: "clip-tti-1",
		asset: {
			type: "text-to-image",
			prompt: "A cat sitting on a windowsill",
			width: 1024,
			height: 1024
		} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		start: sec(0),
		length: sec(5),
		fit: "crop",
		opacity: 1,
		scale: 1,
		...overrides
	} as ResolvedClip;
}

function mountToolbar(mockEdit: ReturnType<typeof createMockEditSession>): {
	toolbar: TextToImageToolbar;
	parent: HTMLDivElement;
} {
	const toolbar = new TextToImageToolbar(mockEdit as unknown as Edit);
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	toolbar.mount(parent);
	return { toolbar, parent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TextToImageToolbar", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		jest.restoreAllMocks();
	});

	describe("mount and DOM structure", () => {
		it("mounts to the parent element", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			expect(parent.querySelector(".ss-tti-toolbar")).toBeTruthy();
		});

		it("creates prompt section with textarea", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			expect(parent.querySelector("[data-prompt-textarea]")).toBeTruthy();
			expect(parent.querySelector('[data-action="prompt"]')).toBeTruthy();
		});

		it("creates dimension selectors", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			expect(parent.querySelector('[data-action="width"]')).toBeTruthy();
			expect(parent.querySelector('[data-action="height"]')).toBeTruthy();
			expect(parent.querySelector("[data-width-label]")).toBeTruthy();
			expect(parent.querySelector("[data-height-label]")).toBeTruthy();
		});

		it("creates visual controls (fit, opacity, scale, transition, effect)", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			expect(parent.querySelector('[data-action="fit"]')).toBeTruthy();
			expect(parent.querySelector('[data-action="opacity"]')).toBeTruthy();
			expect(parent.querySelector('[data-action="scale"]')).toBeTruthy();
			expect(parent.querySelector('[data-action="transition"]')).toBeTruthy();
			expect(parent.querySelector('[data-action="effect"]')).toBeTruthy();
		});

		it("mounts opacity and scale sliders into mount points", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			// SliderControl creates range inputs inside mount points
			const opacityMount = parent.querySelector("[data-opacity-slider-mount]");
			const scaleMount = parent.querySelector("[data-scale-slider-mount]");

			expect(opacityMount?.querySelector("input[type='range']")).toBeTruthy();
			expect(scaleMount?.querySelector("input[type='range']")).toBeTruthy();
		});

		it("creates all dimension options", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			const widthOptions = parent.querySelectorAll("[data-dim-width]");
			const heightOptions = parent.querySelectorAll("[data-dim-height]");

			expect(widthOptions.length).toBe(5); // 256, 512, 768, 1024, 1280
			expect(heightOptions.length).toBe(5);
		});
	});

	describe("state sync from clip", () => {
		it("syncs prompt text from clip asset", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const textarea = parent.querySelector("[data-prompt-textarea]") as HTMLTextAreaElement;
			expect(textarea.value).toBe("A cat sitting on a windowsill");

			toolbar.dispose();
		});

		it("syncs dimension values from clip asset", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip({
				asset: { type: "text-to-image", prompt: "test", width: 512, height: 768 } as any
			});
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect(parent.querySelector("[data-width-label]")?.textContent).toBe("512");
			expect(parent.querySelector("[data-height-label]")?.textContent).toBe("768");

			toolbar.dispose();
		});

		it("syncs fit value from clip", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip({ fit: "contain" });
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect(parent.querySelector("[data-fit-label]")?.textContent).toBe("Contain");

			toolbar.dispose();
		});

		it("syncs opacity value from clip", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip({ opacity: 0.5 });
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect(parent.querySelector("[data-opacity-value]")?.textContent).toBe("50%");

			toolbar.dispose();
		});

		it("syncs scale value from clip", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip({ scale: 1.5 });
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect(parent.querySelector("[data-scale-value]")?.textContent).toBe("150%");

			toolbar.dispose();
		});

		it("falls back to edit size when asset has no dimensions", () => {
			const mockEdit = createMockEditSession();
			mockEdit.size.width = 1280;
			mockEdit.size.height = 720;
			const clip = createTtiClip({
				asset: { type: "text-to-image", prompt: "test" } as any
			});
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect(parent.querySelector("[data-width-label]")?.textContent).toBe("1280");
			expect(parent.querySelector("[data-height-label]")?.textContent).toBe("720");

			toolbar.dispose();
		});
	});

	describe("dimension selection", () => {
		it("updates width when clicking a width option", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const option512 = parent.querySelector('[data-dim-width="512"]') as HTMLElement;
			option512.click();

			// Should update the asset via updateClip
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({ width: 512 })
				})
			);

			toolbar.dispose();
		});

		it("updates height when clicking a height option", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const option768 = parent.querySelector('[data-dim-height="768"]') as HTMLElement;
			option768.click();

			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({ height: 768 })
				})
			);

			toolbar.dispose();
		});
	});

	describe("prompt editing", () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("debounces prompt changes", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const textarea = parent.querySelector("[data-prompt-textarea]") as HTMLTextAreaElement;

			// Type quickly
			textarea.value = "A dog";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
			textarea.value = "A dog in";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
			textarea.value = "A dog in a park";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));

			// Should not have called updateClip yet (debounced)
			expect(mockEdit.updateClip).not.toHaveBeenCalled();

			// Fast-forward past debounce (150ms)
			jest.advanceTimersByTime(200);

			// Now the final value should be applied
			expect(mockEdit.updateClip).toHaveBeenCalledTimes(1);
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({ prompt: "A dog in a park" })
				})
			);

			toolbar.dispose();
		});

		it("updates the prompt button text after debounce", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const textarea = parent.querySelector("[data-prompt-textarea]") as HTMLTextAreaElement;
			textarea.value = "New prompt text here";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));

			jest.advanceTimersByTime(200);

			const promptText = parent.querySelector("[data-prompt-text]");
			expect(promptText?.textContent).toBe("New prompt text here");

			toolbar.dispose();
		});

		it("truncates long prompt text in button", () => {
			const mockEdit = createMockEditSession();
			const longPrompt = "A very long prompt that exceeds the maximum display length for the button text";
			const clip = createTtiClip({
				asset: { type: "text-to-image", prompt: longPrompt, width: 1024, height: 1024 } as any
			});
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const promptText = parent.querySelector("[data-prompt-text]");
			// truncatePrompt with maxLength=20 should truncate
			expect(promptText?.textContent?.length).toBeLessThanOrEqual(20);
			expect(promptText?.textContent).toContain("...");

			toolbar.dispose();
		});
	});

	describe("two-phase opacity slider drag", () => {
		it("uses live preview during opacity drag", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const { opacitySlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (opacitySlider.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;

			// Start drag
			rangeInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Slide to 80%
			rangeInput.value = "80";
			rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

			expect(mockEdit.updateClipInDocument).toHaveBeenCalledWith("clip-tti-1", { opacity: 0.8 });
			expect(mockEdit.resolveClip).toHaveBeenCalledWith("clip-tti-1");
			expect(mockEdit.commitClipUpdate).not.toHaveBeenCalled();

			// Release
			rangeInput.dispatchEvent(new Event("change", { bubbles: true }));
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);

			toolbar.dispose();
		});

		it("falls through to command path without drag session", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const { opacitySlider: opSlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (opSlider.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;

			// Input without pointerdown
			rangeInput.value = "60";
			rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

			// Without drag session, should use command path
			expect(mockEdit.updateClip).toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();

			toolbar.dispose();
		});
	});

	describe("two-phase scale slider drag", () => {
		it("uses live preview during scale drag", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const { scaleSlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (scaleSlider.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;

			// Start drag
			rangeInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Slide to 150%
			rangeInput.value = "150";
			rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

			expect(mockEdit.updateClipInDocument).toHaveBeenCalledWith("clip-tti-1", { scale: 1.5 });
			expect(mockEdit.resolveClip).toHaveBeenCalledWith("clip-tti-1");

			// Release
			rangeInput.dispatchEvent(new Event("change", { bubbles: true }));
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);

			toolbar.dispose();
		});
	});

	describe("fit selection", () => {
		it("applies fit change via updateClip", () => {
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const containOption = parent.querySelector('[data-fit="contain"]') as HTMLElement;
			containOption.click();

			expect(mockEdit.updateClip).toHaveBeenCalledWith(0, 0, { fit: "contain" });

			toolbar.dispose();
		});
	});

	describe("popup management", () => {
		it("opens prompt popup when prompt button is clicked", () => {
			const mockEdit = createMockEditSession();
			const { toolbar, parent } = mountToolbar(mockEdit);

			const promptBtn = parent.querySelector('[data-action="prompt"]') as HTMLElement;
			promptBtn.click();

			const promptPopup = parent.querySelector('[data-popup="prompt"]') as HTMLElement;
			expect(promptPopup.classList.contains("visible")).toBe(true);

			toolbar.dispose();
		});

		it("closes other popups when opening a new one", () => {
			const mockEdit = createMockEditSession();
			const { toolbar, parent } = mountToolbar(mockEdit);

			// Open prompt popup
			const promptBtn = parent.querySelector('[data-action="prompt"]') as HTMLElement;
			promptBtn.click();

			// Open fit popup
			const fitBtn = parent.querySelector('[data-action="fit"]') as HTMLElement;
			fitBtn.click();

			const promptPopup = parent.querySelector('[data-popup="prompt"]') as HTMLElement;
			const fitPopup = parent.querySelector('[data-popup="fit"]') as HTMLElement;

			expect(promptPopup.classList.contains("visible")).toBe(false);
			expect(fitPopup.classList.contains("visible")).toBe(true);

			toolbar.dispose();
		});
	});

	describe("dispose lifecycle", () => {
		it("clears drag sessions and timers on dispose", () => {
			jest.useFakeTimers();
			const mockEdit = createMockEditSession();
			const clip = createTtiClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			// Start a prompt debounce
			const textarea = parent.querySelector("[data-prompt-textarea]") as HTMLTextAreaElement;
			textarea.value = "pending prompt";
			textarea.dispatchEvent(new Event("input", { bubbles: true }));

			// Start a drag session
			const { opacitySlider: opSlider2 } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (opSlider2.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;
			rangeInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Dispose mid-drag, mid-debounce
			toolbar.dispose();

			// Advance timers — debounce callback should NOT fire after dispose
			jest.advanceTimersByTime(500);
			expect(mockEdit.updateClip).not.toHaveBeenCalled();

			jest.useRealTimers();
		});

		it("nulls out composite components on dispose", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = mountToolbar(mockEdit);

			toolbar.dispose();

			const disposed = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			expect(disposed.opacitySlider).toBeNull();
			expect(disposed.scaleSlider).toBeNull();
			expect(disposed.transitionPanel).toBeNull();
			expect(disposed.effectPanel).toBeNull();
			expect(disposed.promptTextarea).toBeNull();
		});
	});
});
