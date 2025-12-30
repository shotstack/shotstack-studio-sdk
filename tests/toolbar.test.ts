/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Mock } from "jest-mock";

// Mock pixi.js before any imports that use it
jest.mock("pixi.js", () => ({
	Container: jest.fn().mockImplementation(() => ({
		children: [],
		parent: null,
		addChild: jest.fn(),
		removeChild: jest.fn(),
		destroy: jest.fn()
	})),
	Sprite: jest.fn(),
	Texture: jest.fn()
}));

// Mock player module
jest.mock("../src/components/canvas/players/player", () => ({
	PlayerType: {
		Video: "video",
		Image: "image",
		Audio: "audio",
		Text: "text",
		Html: "html",
		Shape: "shape",
		Caption: "caption",
		Luma: "luma",
		RichText: "rich-text"
	}
}));

// Mock IntersectionObserver (not provided by jsdom)
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn()
})) as unknown as typeof IntersectionObserver;

// Mock ResizeObserver (not provided by jsdom)
global.ResizeObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn()
})) as unknown as typeof ResizeObserver;

import { AssetToolbar } from "../src/core/ui/asset-toolbar";
import { CanvasToolbar } from "../src/core/ui/canvas-toolbar";
import { BUILT_IN_FONTS, FONT_SIZES } from "../src/core/ui/base-toolbar";
import type { ToolbarButtonConfig } from "../src/core/ui/ui-controller";

type MockPlayer = {
	clipConfiguration: Record<string, unknown>;
	getMergeFieldBinding: Mock<() => null>;
};

// ============================================================================
// Mock Helpers
// ============================================================================

function createMockEventEmitter() {
	const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
	return {
		on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(callback);
		}),
		off: jest.fn(),
		emit: jest.fn((event: string, ...args: unknown[]) => {
			if (listeners[event]) {
				listeners[event].forEach(cb => cb(...args));
			}
		}),
		trigger: (event: string, ...args: unknown[]) => {
			if (listeners[event]) {
				listeners[event].forEach(cb => cb(...args));
			}
		}
	};
}

function createMockUIController() {
	const buttonListeners: Array<() => void> = [];
	const buttonClickListeners: Record<
		string,
		Array<(payload: { position: number; selectedClip: { trackIndex: number; clipIndex: number } | null }) => void>
	> = {};
	let buttons: ToolbarButtonConfig[] = [];

	return {
		getButtons: jest.fn(() => buttons),
		setButtons: (newButtons: ToolbarButtonConfig[]) => {
			buttons = newButtons;
		},
		onButtonsChanged: jest.fn((handler: () => void) => {
			buttonListeners.push(handler);
			return () => {
				const idx = buttonListeners.indexOf(handler);
				if (idx >= 0) buttonListeners.splice(idx, 1);
			};
		}),
		emitButtonClick: jest.fn((buttonId: string) => {
			const listeners = buttonClickListeners[`button:${buttonId}`] || [];
			listeners.forEach(cb => cb({ position: 0, selectedClip: null }));
		}),
		triggerButtonsChanged: () => {
			buttonListeners.forEach(cb => cb());
		},
		on: jest.fn((event: string, handler: (payload: { position: number; selectedClip: { trackIndex: number; clipIndex: number } | null }) => void) => {
			if (!buttonClickListeners[event]) buttonClickListeners[event] = [];
			buttonClickListeners[event].push(handler);
			return () => {
				const idx = buttonClickListeners[event].indexOf(handler);
				if (idx >= 0) buttonClickListeners[event].splice(idx, 1);
			};
		})
	};
}

function createMockEdit(overrides: Record<string, unknown> = {}) {
	const events = createMockEventEmitter();
	return {
		getPlayerClip: jest.fn((): MockPlayer | null => null),
		getClip: jest.fn(() => null),
		getEdit: jest.fn(() => ({
			timeline: {
				fonts: [],
				tracks: []
			}
		})),
		getMergeFieldForProperty: jest.fn(() => null),
		updateClip: jest.fn(),
		getToolbarButtons: jest.fn((): ToolbarButtonConfig[] => []),
		getSelectedClipInfo: jest.fn((): { trackIndex: number; clipIndex: number } | null => null),
		mergeFields: {
			getAll: jest.fn(() => []),
			register: jest.fn(),
			deleteMergeFieldGlobally: jest.fn()
		},
		events,
		playbackTime: 0,
		isSrcMergeField: jest.fn(() => false),
		updateMergeFieldValueLive: jest.fn(),
		redrawMergeFieldClips: jest.fn(),
		setOutputSize: jest.fn(),
		setOutputFps: jest.fn(),
		getOutputFps: jest.fn(() => 25),
		setTimelineBackground: jest.fn(),
		getTimelineBackground: jest.fn(() => "#000000"),
		size: { width: 1920, height: 1080 },
		...overrides
	};
}

function createMockClip(assetType: string, overrides: Record<string, unknown> = {}): MockPlayer {
	const baseAsset = {
		type: assetType,
		...overrides
	};

	let clipConfiguration: Record<string, unknown>;

	if (assetType === "rich-text" || assetType === "text") {
		clipConfiguration = {
			asset: {
				...baseAsset,
				text: "Test text",
				fontFamily: "Open Sans",
				fontSize: 48,
				fontWeight: 400,
				fontColor: "#ffffff",
				...overrides
			}
		};
	} else if (assetType === "video" || assetType === "image") {
		clipConfiguration = {
			asset: {
				...baseAsset,
				src: "https://example.com/media.mp4",
				fit: "crop",
				...overrides
			},
			opacity: 1,
			scale: 1
		};
	} else if (assetType === "audio") {
		clipConfiguration = {
			asset: {
				...baseAsset,
				src: "https://example.com/audio.mp3",
				...overrides
			},
			volume: 1
		};
	} else {
		clipConfiguration = { asset: baseAsset };
	}

	// Return a player-like object with clipConfiguration and getMergeFieldBinding
	return {
		clipConfiguration,
		getMergeFieldBinding: jest.fn(() => null)
	};
}

// Helper to create a DOM container for toolbar tests
function createTestContainer(): HTMLDivElement {
	const container = document.createElement("div");
	document.body.appendChild(container);
	return container;
}

function cleanupTestContainer(container: HTMLDivElement): void {
	container.remove();
}

// Helper to simulate click events
function simulateClick(element: Element | null): void {
	if (element) {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	}
}

// Helper to simulate input events
function simulateInput(element: HTMLInputElement | null, value: string | number): void {
	if (element) {
		// eslint-disable-next-line no-param-reassign -- Intentional DOM manipulation for testing
		element.value = String(value);
		element.dispatchEvent(new Event("input", { bubbles: true }));
	}
}

// Helper to simulate change events (for inputs that listen to 'change' instead of 'input')
function simulateChange(element: HTMLInputElement | null, value: string | number): void {
	if (element) {
		// eslint-disable-next-line no-param-reassign -- Intentional DOM manipulation for testing
		element.value = String(value);
		element.dispatchEvent(new Event("change", { bubbles: true }));
	}
}

// ============================================================================
// AssetToolbar Tests
// ============================================================================

describe("AssetToolbar", () => {
	let toolbar: AssetToolbar;
	let mockUI: ReturnType<typeof createMockUIController>;
	let container: HTMLDivElement;

	beforeEach(() => {
		mockUI = createMockUIController();
		toolbar = new AssetToolbar(mockUI as never);
		container = createTestContainer();
	});

	afterEach(() => {
		toolbar.dispose();
		cleanupTestContainer(container);
	});

	describe("mounting", () => {
		it("creates container with ss-asset-toolbar class", () => {
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-asset-toolbar");
			expect(toolbarEl).not.toBeNull();
		});

		it("hides toolbar when no buttons registered", () => {
			mockUI.setButtons([]);
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-asset-toolbar") as HTMLElement;
			expect(toolbarEl?.style.display).toBe("none");
		});

		it("shows toolbar when buttons exist", () => {
			mockUI.setButtons([{ id: "test", icon: "<svg></svg>", tooltip: "Test" }]);
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-asset-toolbar") as HTMLElement;
			expect(toolbarEl?.style.display).toBe("flex");
		});

		it("renders buttons from getButtons()", () => {
			mockUI.setButtons([
				{ id: "btn1", icon: "<svg>1</svg>", tooltip: "Button 1" },
				{ id: "btn2", icon: "<svg>2</svg>", tooltip: "Button 2" }
			]);
			toolbar.mount(container);

			const buttons = container.querySelectorAll(".ss-asset-toolbar-btn");
			expect(buttons.length).toBe(2);
		});
	});

	describe("button rendering", () => {
		it("renders button with correct id and tooltip", () => {
			mockUI.setButtons([{ id: "my-btn", icon: "<svg></svg>", tooltip: "My Button" }]);
			toolbar.mount(container);

			const btn = container.querySelector('[data-button-id="my-btn"]');
			expect(btn).not.toBeNull();
			expect(btn?.getAttribute("data-tooltip")).toBe("My Button");
		});

		it("renders divider before button when dividerBefore is true", () => {
			mockUI.setButtons([
				{ id: "btn1", icon: "<svg></svg>", tooltip: "Btn1" },
				{ id: "btn2", icon: "<svg></svg>", tooltip: "Btn2", dividerBefore: true }
			]);
			toolbar.mount(container);

			const dividers = container.querySelectorAll(".ss-asset-toolbar-divider");
			expect(dividers.length).toBe(1);
		});
	});

	describe("event emission", () => {
		it("clicking button calls emitButtonClick with button id", () => {
			mockUI.setButtons([{ id: "test", icon: "<svg></svg>", tooltip: "Test" }]);
			toolbar.mount(container);

			const btn = container.querySelector('[data-button-id="test"]');
			simulateClick(btn);

			expect(mockUI.emitButtonClick).toHaveBeenCalledWith("test");
		});
	});

	describe("dynamic updates", () => {
		it("re-renders when onButtonsChanged callback fires", () => {
			mockUI.setButtons([]);
			toolbar.mount(container);

			expect(container.querySelectorAll(".ss-asset-toolbar-btn").length).toBe(0);

			// Update buttons and trigger callback
			mockUI.setButtons([{ id: "new", icon: "<svg></svg>", tooltip: "New" }]);
			mockUI.triggerButtonsChanged();

			expect(container.querySelectorAll(".ss-asset-toolbar-btn").length).toBe(1);
		});
	});

	describe("positioning", () => {
		it("setPosition() updates container left and top offsets", () => {
			toolbar.mount(container);
			toolbar.setPosition(200, 300);

			const toolbarEl = container.querySelector(".ss-asset-toolbar") as HTMLElement;
			expect(toolbarEl?.style.left).toBe("200px");
			expect(toolbarEl?.style.top).toBe("300px");
		});
	});

	describe("cleanup", () => {
		it("dispose() removes container from DOM", () => {
			toolbar.mount(container);

			expect(container.querySelector(".ss-asset-toolbar")).not.toBeNull();

			toolbar.dispose();

			expect(container.querySelector(".ss-asset-toolbar")).toBeNull();
		});
	});
});

// ============================================================================
// CanvasToolbar Tests
// ============================================================================

describe("CanvasToolbar", () => {
	let toolbar: CanvasToolbar;
	let mockEdit: ReturnType<typeof createMockEdit>;
	let container: HTMLDivElement;

	beforeEach(() => {
		mockEdit = createMockEdit();
		toolbar = new CanvasToolbar(mockEdit as never);
		container = createTestContainer();
	});

	afterEach(() => {
		toolbar.dispose();
		cleanupTestContainer(container);
	});

	describe("mounting", () => {
		it("creates container with ss-canvas-toolbar class", () => {
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-canvas-toolbar");
			expect(toolbarEl).not.toBeNull();
		});
	});

	describe("resolution", () => {
		it("setResolution() updates display", () => {
			toolbar.mount(container);
			toolbar.setResolution(1280, 720);

			// Resolution should be internally tracked
			const customWidth = container.querySelector("[data-custom-width]") as HTMLInputElement;
			const customHeight = container.querySelector("[data-custom-height]") as HTMLInputElement;

			expect(customWidth?.value).toBe("1280");
			expect(customHeight?.value).toBe("720");
		});

		it("clicking preset calls onResolutionChange callback", () => {
			const callback = jest.fn();
			toolbar.onResolutionChange(callback);
			toolbar.mount(container);

			// Open resolution popup first
			const resBtn = container.querySelector('[data-action="resolution"]');
			simulateClick(resBtn);

			// Click a preset
			const preset = container.querySelector('[data-width="1280"][data-height="720"]');
			simulateClick(preset);

			expect(callback).toHaveBeenCalledWith(1280, 720);
		});

		it("custom width/height inputs update resolution", () => {
			const callback = jest.fn();
			toolbar.onResolutionChange(callback);
			toolbar.mount(container);

			const widthInput = container.querySelector("[data-custom-width]") as HTMLInputElement;
			const heightInput = container.querySelector("[data-custom-height]") as HTMLInputElement;

			// Canvas toolbar uses 'change' event for custom inputs
			simulateChange(widthInput, 800);
			simulateChange(heightInput, 600);

			expect(callback).toHaveBeenCalled();
		});

		it("resolution presets show checkmark for current selection", () => {
			toolbar.mount(container);
			toolbar.setResolution(1920, 1080);

			// Open popup
			const resBtn = container.querySelector('[data-action="resolution"]');
			simulateClick(resBtn);

			// CanvasToolbar uses 'active' class for selected state
			const selectedItem = container.querySelector('[data-width="1920"][data-height="1080"]');
			expect(selectedItem?.classList.contains("active")).toBe(true);
		});
	});

	describe("FPS", () => {
		it("setFps() updates display", () => {
			toolbar.mount(container);
			toolbar.setFps(30);

			// FPS label is inside the button
			const fpsLabel = container.querySelector("[data-fps-label]");
			expect(fpsLabel?.textContent).toContain("30");
		});

		it("clicking FPS option calls onFpsChange callback", () => {
			const callback = jest.fn();
			toolbar.onFpsChange(callback);
			toolbar.mount(container);

			// Open FPS popup
			const fpsBtn = container.querySelector('[data-action="fps"]');
			simulateClick(fpsBtn);

			// Click FPS option
			const fpsOption = container.querySelector('[data-fps="30"]');
			simulateClick(fpsOption);

			expect(callback).toHaveBeenCalledWith(30);
		});
	});

	describe("background", () => {
		it("setBackground() updates color dot", () => {
			toolbar.mount(container);
			toolbar.setBackground("#ff0000");

			// Correct selector is data-bg-preview
			// Browser converts hex to rgb format, so check for red color presence
			const colorDot = container.querySelector("[data-bg-preview]") as HTMLElement;
			expect(colorDot?.style.background).toMatch(/rgb\(255,?\s*0,?\s*0\)|#ff0000/i);
		});

		it("clicking color swatch calls onBackgroundChange callback", () => {
			const callback = jest.fn();
			toolbar.onBackgroundChange(callback);
			toolbar.mount(container);

			// Open background popup
			const bgBtn = container.querySelector('[data-action="background"]');
			simulateClick(bgBtn);

			// Click a swatch
			const swatch = container.querySelector('[data-swatch-color="#FFFFFF"]');
			simulateClick(swatch);

			expect(callback).toHaveBeenCalledWith("#FFFFFF");
		});
	});

	describe("callbacks", () => {
		it("onResolutionChange() registers callback", () => {
			const callback = jest.fn();
			toolbar.onResolutionChange(callback);
			toolbar.mount(container);

			// Open resolution popup first to sync inputs with current values
			const resBtn = container.querySelector('[data-action="resolution"]');
			simulateClick(resBtn);

			// Both width and height must be valid for callback to fire
			const widthInput = container.querySelector("[data-custom-width]") as HTMLInputElement;
			const heightInput = container.querySelector("[data-custom-height]") as HTMLInputElement;
			simulateChange(widthInput, 1000);
			simulateChange(heightInput, 800);

			expect(callback).toHaveBeenCalled();
		});

		it("onFpsChange() registers callback", () => {
			const callback = jest.fn();
			toolbar.onFpsChange(callback);
			toolbar.mount(container);

			// Open popup and click option
			const fpsBtn = container.querySelector('[data-action="fps"]');
			simulateClick(fpsBtn);

			const option = container.querySelector('[data-fps="24"]');
			simulateClick(option);

			expect(callback).toHaveBeenCalledWith(24);
		});

		it("onBackgroundChange() registers callback", () => {
			const callback = jest.fn();
			toolbar.onBackgroundChange(callback);
			toolbar.mount(container);

			// Open popup and click swatch
			const bgBtn = container.querySelector('[data-action="background"]');
			simulateClick(bgBtn);

			const swatch = container.querySelector('[data-swatch-color="#000000"]');
			simulateClick(swatch);

			expect(callback).toHaveBeenCalledWith("#000000");
		});
	});

	describe("popup behavior", () => {
		it("clicking resolution button toggles popup", () => {
			toolbar.mount(container);

			const btn = container.querySelector('[data-action="resolution"]');
			const popup = container.querySelector('[data-popup="resolution"]');

			expect(popup?.classList.contains("visible")).toBe(false);

			simulateClick(btn);
			expect(popup?.classList.contains("visible")).toBe(true);

			simulateClick(btn);
			expect(popup?.classList.contains("visible")).toBe(false);
		});

		it("clicking background button toggles popup", () => {
			toolbar.mount(container);

			const btn = container.querySelector('[data-action="background"]');
			const popup = container.querySelector('[data-popup="background"]');

			expect(popup?.classList.contains("visible")).toBe(false);

			simulateClick(btn);
			expect(popup?.classList.contains("visible")).toBe(true);
		});

		it("clicking fps button toggles popup", () => {
			toolbar.mount(container);

			const btn = container.querySelector('[data-action="fps"]');
			const popup = container.querySelector('[data-popup="fps"]');

			expect(popup?.classList.contains("visible")).toBe(false);

			simulateClick(btn);
			expect(popup?.classList.contains("visible")).toBe(true);
		});

		it("clicking variables button toggles popup", () => {
			toolbar.mount(container);

			const btn = container.querySelector('[data-action="variables"]');
			const popup = container.querySelector('[data-popup="variables"]');

			if (btn && popup) {
				expect(popup.classList.contains("visible")).toBe(false);

				simulateClick(btn);
				expect(popup.classList.contains("visible")).toBe(true);
			}
		});
	});

	describe("positioning", () => {
		it("setPosition() updates container left and top offsets", () => {
			toolbar.mount(container);
			toolbar.setPosition(1920, 540);

			const toolbarEl = container.querySelector(".ss-canvas-toolbar") as HTMLElement;
			expect(toolbarEl?.style.left).toBe("1920px");
			expect(toolbarEl?.style.top).toBe("540px");
		});
	});

	describe("cleanup", () => {
		it("dispose() removes container from DOM", () => {
			toolbar.mount(container);

			expect(container.querySelector(".ss-canvas-toolbar")).not.toBeNull();

			toolbar.dispose();

			expect(container.querySelector(".ss-canvas-toolbar")).toBeNull();
		});
	});
});

// ============================================================================
// BaseToolbar Constants Tests
// ============================================================================

describe("BaseToolbar Constants", () => {
	describe("FONT_SIZES", () => {
		it("contains expected preset sizes", () => {
			expect(FONT_SIZES).toContain(12);
			expect(FONT_SIZES).toContain(24);
			expect(FONT_SIZES).toContain(48);
			expect(FONT_SIZES).toContain(72);
		});

		it("is sorted in ascending order", () => {
			const sorted = [...FONT_SIZES].sort((a, b) => a - b);
			expect(FONT_SIZES).toEqual(sorted);
		});

		it("has 19 preset sizes", () => {
			expect(FONT_SIZES.length).toBe(19);
		});
	});

	describe("BUILT_IN_FONTS", () => {
		it("contains expected fonts", () => {
			expect(BUILT_IN_FONTS).toContain("Open Sans");
			expect(BUILT_IN_FONTS).toContain("Roboto");
			expect(BUILT_IN_FONTS).toContain("Montserrat");
		});

		it("has 10 built-in fonts", () => {
			expect(BUILT_IN_FONTS.length).toBe(10);
		});
	});
});

// ============================================================================
// MediaToolbar Tests (via dynamic import to handle pixi mocks)
// ============================================================================

describe("MediaToolbar", () => {
	let toolbar: InstanceType<typeof import("../src/core/ui/media-toolbar").MediaToolbar>;
	let mockEdit: ReturnType<typeof createMockEdit>;
	let container: HTMLDivElement;

	beforeEach(async () => {
		mockEdit = createMockEdit();
		const { MediaToolbar } = await import("../src/core/ui/media-toolbar");
		toolbar = new MediaToolbar(mockEdit as never);
		container = createTestContainer();
	});

	afterEach(() => {
		toolbar.dispose();
		cleanupTestContainer(container);
	});

	describe("mounting", () => {
		it("creates container with ss-media-toolbar class", () => {
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-media-toolbar");
			expect(toolbarEl).not.toBeNull();
		});
	});

	describe("asset type visibility", () => {
		it("show() with image clip hides volume section", () => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("image"));
			toolbar.mount(container);
			toolbar.show(0, 0);

			const volumeSection = container.querySelector("[data-volume-section]") as HTMLElement;
			// MediaToolbar uses CSS class 'hidden' to toggle visibility, not style.display
			expect(volumeSection?.classList.contains("hidden")).toBe(true);
		});

		it("show() with video clip shows both visual and volume sections", () => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("video"));
			toolbar.mount(container);
			toolbar.show(0, 0);

			const visualSection = container.querySelector("[data-visual-section]") as HTMLElement;
			const volumeSection = container.querySelector("[data-volume-section]") as HTMLElement;

			// Visual should be visible
			expect(visualSection?.style.display).not.toBe("none");
			// Volume should also be visible for video
			expect(volumeSection?.classList.contains("hidden")).toBe(false);
		});

		it("show() with audio clip hides visual section", () => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("audio"));
			toolbar.mount(container);
			toolbar.show(0, 0);

			const visualSection = container.querySelector("[data-visual-section]") as HTMLElement;
			// MediaToolbar uses CSS class 'hidden' to toggle visibility, not style.display
			expect(visualSection?.classList.contains("hidden")).toBe(true);
		});
	});

	describe("fit options", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("video"));
		});

		it("clicking fit option calls updateClip with fit value", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open fit popup
			const fitBtn = container.querySelector('[data-action="fit"]');
			simulateClick(fitBtn);

			// Click a fit option
			const coverOption = container.querySelector('[data-fit="cover"]');
			simulateClick(coverOption);

			// MediaToolbar.applyClipUpdate passes fit at top level, not nested in asset
			expect(mockEdit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ fit: "cover" }));
		});

		it("fit label displays current selection", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const fitLabel = container.querySelector("[data-fit-label]");
			expect(fitLabel?.textContent).toBeTruthy();
		});
	});

	describe("opacity", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("video"));
		});

		it("opacity slider calls updateClip", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open opacity popup
			const opacityBtn = container.querySelector('[data-action="opacity"]');
			simulateClick(opacityBtn);

			const slider = container.querySelector("[data-opacity-slider]") as HTMLInputElement;
			if (slider) {
				simulateInput(slider, 50);

				// Opacity is at clip level, not nested in asset
				expect(mockEdit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ opacity: 0.5 }));
			}
		});
	});

	describe("scale", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("video"));
		});

		it("scale slider calls updateClip", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open scale popup
			const scaleBtn = container.querySelector('[data-action="scale"]');
			simulateClick(scaleBtn);

			const slider = container.querySelector("[data-scale-slider]") as HTMLInputElement;
			if (slider) {
				simulateInput(slider, 150);

				// Scale is at clip level, not nested in asset
				expect(mockEdit.updateClip).toHaveBeenCalledWith(0, 0, expect.objectContaining({ scale: 1.5 }));
			}
		});
	});

	describe("volume", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("video"));
		});

		it("volume slider calls updateClip", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open volume popup
			const volumeBtn = container.querySelector('[data-action="volume"]');
			simulateClick(volumeBtn);

			const slider = container.querySelector("[data-volume-slider]") as HTMLInputElement;
			if (slider) {
				simulateInput(slider, 75);

				// Volume is nested in asset object
				expect(mockEdit.updateClip).toHaveBeenCalledWith(
					0,
					0,
					expect.objectContaining({
						asset: expect.objectContaining({ volume: 0.75 })
					})
				);
			}
		});
	});

	describe("cleanup", () => {
		it("dispose() removes container from DOM", () => {
			toolbar.mount(container);

			expect(container.querySelector(".ss-media-toolbar")).not.toBeNull();

			toolbar.dispose();

			expect(container.querySelector(".ss-media-toolbar")).toBeNull();
		});
	});

	describe("composite panels (regression)", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("video"));
		});

		it("TransitionPanel renders content inside existing popup without wrapper class conflict", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open transition popup
			const transitionBtn = container.querySelector('[data-action="transition"]');
			simulateClick(transitionBtn);

			// The popup should contain transition tabs (rendered by TransitionPanel)
			const transitionTabs = container.querySelector(".ss-transition-tabs");
			expect(transitionTabs).not.toBeNull();

			// The TransitionPanel's container should NOT have ss-toolbar-popup class
			// (that was the bug - it conflicted with ss-media-toolbar-popup)
			const panelMount = container.querySelector("[data-transition-panel-mount]");
			const panelContainer = panelMount?.firstElementChild;
			expect(panelContainer?.className).not.toContain("ss-toolbar-popup");
		});

		it("EffectPanel renders content inside existing popup without wrapper class conflict", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open effect popup
			const effectBtn = container.querySelector('[data-action="effect"]');
			simulateClick(effectBtn);

			// The popup should contain effect types (rendered by EffectPanel)
			const effectTypes = container.querySelector(".ss-effect-types");
			expect(effectTypes).not.toBeNull();

			// The EffectPanel's container should NOT have ss-toolbar-popup class
			const panelMount = container.querySelector("[data-effect-panel-mount]");
			const panelContainer = panelMount?.firstElementChild;
			expect(panelContainer?.className).not.toContain("ss-toolbar-popup");
		});
	});
});

// ============================================================================
// RichTextToolbar Tests
// ============================================================================

describe("RichTextToolbar", () => {
	let toolbar: InstanceType<typeof import("../src/core/ui/rich-text-toolbar").RichTextToolbar>;
	let mockEdit: ReturnType<typeof createMockEdit>;
	let container: HTMLDivElement;

	beforeEach(async () => {
		mockEdit = createMockEdit();
		const { RichTextToolbar } = await import("../src/core/ui/rich-text-toolbar");
		toolbar = new RichTextToolbar(mockEdit as never);
		container = createTestContainer();
	});

	afterEach(() => {
		toolbar.dispose();
		cleanupTestContainer(container);
	});

	describe("mounting", () => {
		it("creates container with ss-toolbar class", () => {
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-toolbar");
			expect(toolbarEl).not.toBeNull();
		});
	});

	describe("text editing", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("rich-text"));
		});

		it("text area exists after mount", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const textArea = container.querySelector("[data-text-edit-area]");
			expect(textArea).not.toBeNull();
		});
	});

	describe("font selection", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("rich-text"));
		});

		it("font popup displays fonts after toggle", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Toggle font popup
			const fontBtn = container.querySelector('[data-action="font-toggle"]');
			simulateClick(fontBtn);

			const fontPopup = container.querySelector("[data-font-popup]");
			expect(fontPopup?.classList.contains("visible")).toBe(true);
		});
	});

	describe("font size", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("rich-text", { fontSize: 48 }));
		});

		it("size input displays current size", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const sizeInput = container.querySelector("[data-size-input]") as HTMLInputElement;
			expect(sizeInput?.value).toBe("48");
		});

		it("size-up button increments to next preset", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const sizeUpBtn = container.querySelector('[data-action="size-up"]');
			simulateClick(sizeUpBtn);

			// RichTextToolbar uses nested font object structure
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({
						font: expect.objectContaining({ size: expect.any(Number) })
					})
				})
			);
		});

		it("size-down button decrements to previous preset", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const sizeDownBtn = container.querySelector('[data-action="size-down"]');
			simulateClick(sizeDownBtn);

			// RichTextToolbar uses nested font object structure
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({
						font: expect.objectContaining({ size: expect.any(Number) })
					})
				})
			);
		});
	});

	describe("bold toggle", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("rich-text", { fontWeight: 400 }));
		});

		it("clicking bold toggles fontWeight", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const boldBtn = container.querySelector('[data-action="bold"]');
			simulateClick(boldBtn);

			// RichTextToolbar uses nested font object structure
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({
						font: expect.objectContaining({ weight: expect.any(String) })
					})
				})
			);
		});
	});

	describe("visibility", () => {
		it("show() makes toolbar visible", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const toolbarEl = container.querySelector(".ss-toolbar");
			expect(toolbarEl?.classList.contains("visible")).toBe(true);
		});

		it("hide() hides toolbar", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);
			toolbar.hide();

			const toolbarEl = container.querySelector(".ss-toolbar");
			expect(toolbarEl?.classList.contains("visible")).toBe(false);
		});
	});

	describe("cleanup", () => {
		it("dispose() removes container from DOM", () => {
			toolbar.mount(container);

			expect(container.querySelector(".ss-toolbar")).not.toBeNull();

			toolbar.dispose();

			expect(container.querySelector(".ss-toolbar")).toBeNull();
		});
	});
});

// ============================================================================
// TextToolbar Tests
// ============================================================================

describe("TextToolbar", () => {
	let toolbar: InstanceType<typeof import("../src/core/ui/text-toolbar").TextToolbar>;
	let mockEdit: ReturnType<typeof createMockEdit>;
	let container: HTMLDivElement;

	beforeEach(async () => {
		mockEdit = createMockEdit();
		const { TextToolbar } = await import("../src/core/ui/text-toolbar");
		toolbar = new TextToolbar(mockEdit as never);
		container = createTestContainer();
	});

	afterEach(() => {
		toolbar.dispose();
		cleanupTestContainer(container);
	});

	describe("mounting", () => {
		it("creates container with ss-toolbar class", () => {
			toolbar.mount(container);

			const toolbarEl = container.querySelector(".ss-toolbar");
			expect(toolbarEl).not.toBeNull();
		});
	});

	describe("text editing", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("text"));
		});

		it("text area exists after mount", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const textArea = container.querySelector("[data-text-edit-area]");
			expect(textArea).not.toBeNull();
		});
	});

	describe("font selection", () => {
		beforeEach(() => {
			mockEdit.getPlayerClip.mockReturnValue(createMockClip("text"));
		});

		it("clicking font updates fontFamily in clip", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			// Open font popup
			const fontBtn = container.querySelector('[data-action="font-toggle"]');
			simulateClick(fontBtn);

			// Click a font option
			const fontOption = container.querySelector('[data-font="Montserrat"]');
			simulateClick(fontOption);

			// TextToolbar uses nested font object structure for font family
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					asset: expect.objectContaining({
						font: expect.objectContaining({ family: "Montserrat" })
					})
				})
			);
		});
	});

	describe("visibility", () => {
		it("show() makes toolbar visible", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);

			const toolbarEl = container.querySelector(".ss-toolbar");
			expect(toolbarEl?.classList.contains("visible")).toBe(true);
		});

		it("hide() hides toolbar", () => {
			toolbar.mount(container);
			toolbar.show(0, 0);
			toolbar.hide();

			const toolbarEl = container.querySelector(".ss-toolbar");
			expect(toolbarEl?.classList.contains("visible")).toBe(false);
		});
	});

	describe("cleanup", () => {
		it("dispose() removes container from DOM", () => {
			toolbar.mount(container);

			expect(container.querySelector(".ss-toolbar")).not.toBeNull();

			toolbar.dispose();

			expect(container.querySelector(".ss-toolbar")).toBeNull();
		});
	});
});

// ============================================================================
// Mode Toggle Regression Tests
// ============================================================================

describe("Mode Toggle (Regression)", () => {
	/**
	 * REGRESSION TEST: Mode toggle buttons must be findable via document.querySelectorAll
	 *
	 * Bug: Click handlers in ui-controller.ts queried this.container but toolbars
	 * were mounted to canvasContainer, causing buttons to not be found.
	 * Fix: Changed query to use document.querySelectorAll instead of this.container
	 */
	describe("button discoverability for click handling", () => {
		it("mode toggle buttons are discoverable via document.querySelectorAll after mount", async () => {
			const mockEdit = createMockEdit();
			const { MediaToolbar } = await import("../src/core/ui/media-toolbar");
			const toolbar = new MediaToolbar(mockEdit as never);
			const container = createTestContainer();

			toolbar.mount(container);

			// This simulates what ui-controller.ts does to find buttons
			const buttons = document.querySelectorAll(".ss-toolbar-mode-btn");
			expect(buttons.length).toBeGreaterThan(0);

			toolbar.dispose();
			cleanupTestContainer(container);
		});

		it("mode toggle buttons have data-mode attribute for click handling", async () => {
			const mockEdit = createMockEdit();
			const { MediaToolbar } = await import("../src/core/ui/media-toolbar");
			const toolbar = new MediaToolbar(mockEdit as never);
			const container = createTestContainer();

			toolbar.mount(container);

			const buttons = container.querySelectorAll(".ss-toolbar-mode-btn");
			buttons.forEach(btn => {
				const mode = (btn as HTMLElement).dataset["mode"];
				expect(mode === "asset" || mode === "clip").toBe(true);
			});

			toolbar.dispose();
			cleanupTestContainer(container);
		});
	});
});
