/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first */

/**
 * Media Toolbar Regression Tests
 *
 * Focused on the two-phase slider drag wiring introduced in 300e893.
 * Verifies that:
 * 1. Opacity/scale/volume sliders use live preview (updateClipInDocument) during drag
 * 2. A single undo entry (commitClipUpdate) is created on drag end
 * 3. Non-drag value changes (e.g. text input commits) go through applyClipUpdate/updateClip
 * 4. Section visibility toggles correctly for different asset types
 * 5. Dispose cleans up drag sessions and composite components
 */

/* eslint-disable max-classes-per-file */
import type { ResolvedClip, ImageAsset, VideoAsset, AudioAsset } from "@schemas";
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

import { MediaToolbar } from "@core/ui/media-toolbar";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockEditSession() {
	return {
		getClipId: jest.fn().mockReturnValue("clip-1"),
		getResolvedClip: jest.fn(),
		updateClip: jest.fn(),
		updateClipInDocument: jest.fn(),
		resolveClip: jest.fn(),
		commitClipUpdate: jest.fn(),
		size: { width: 1920, height: 1080 }
	};
}

/**
 * Create a mock edit session with getInternalEvents() support for merge field tests.
 * The returned object tracks event subscriptions so we can emit events in tests.
 */
function createMergeFieldMockEditSession() {
	const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
	const unsubFns: Array<jest.Mock> = [];

	const internalEvents = {
		on: jest.fn((event: string, callback: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(callback);
			const unsub = jest.fn(() => {
				const idx = listeners[event]?.indexOf(callback);
				if (idx !== undefined && idx >= 0) listeners[event].splice(idx, 1);
			});
			unsubFns.push(unsub);
			return unsub;
		}),
		emit: (event: string, ...args: unknown[]) => {
			listeners[event]?.forEach(cb => cb(...args));
		}
	};

	return {
		mockEdit: {
			getClipId: jest.fn().mockReturnValue("clip-1"),
			getResolvedClip: jest.fn(),
			getResolvedClipById: jest.fn(),
			updateClip: jest.fn(),
			updateClipInDocument: jest.fn(),
			resolveClip: jest.fn(),
			commitClipUpdate: jest.fn(),
			getInternalEvents: jest.fn(() => internalEvents),
			getMergeFieldForProperty: jest.fn((): string | null => null),
			removeMergeField: jest.fn().mockResolvedValue(undefined),
			isValueCompatibleWithClipProperty: jest.fn(() => true),
			mergeFields: {
				getAll: jest.fn(() => []),
				get: jest.fn()
			},
			size: { width: 1920, height: 1080 }
		},
		internalEvents,
		unsubFns
	};
}

function createImageClip(overrides: Partial<ResolvedClip> = {}): ResolvedClip {
	return {
		id: "clip-1",
		asset: {
			type: "image",
			src: "https://example.com/image.jpg"
		} as ImageAsset,
		start: sec(0),
		length: sec(5),
		fit: "crop",
		opacity: 1,
		scale: 1,
		...overrides
	} as ResolvedClip;
}

function createVideoClip(overrides: Partial<ResolvedClip> = {}): ResolvedClip {
	return {
		id: "clip-1",
		asset: {
			type: "video",
			src: "https://example.com/video.mp4",
			volume: 1
		} as VideoAsset,
		start: sec(0),
		length: sec(10),
		fit: "crop",
		opacity: 1,
		scale: 1,
		...overrides
	} as ResolvedClip;
}

function createAudioClip(): ResolvedClip {
	return {
		id: "clip-1",
		asset: {
			type: "audio",
			src: "https://example.com/audio.mp3",
			volume: 1
		} as AudioAsset,
		start: sec(0),
		length: sec(10)
	} as ResolvedClip;
}

function mountToolbar(mockEdit: ReturnType<typeof createMockEditSession>): {
	toolbar: MediaToolbar;
	parent: HTMLDivElement;
} {
	const toolbar = new MediaToolbar(mockEdit as unknown as Edit);
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	toolbar.mount(parent);
	return { toolbar, parent };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("MediaToolbar", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	describe("mount and DOM structure", () => {
		it("mounts to the parent element", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			const toolbar = parent.querySelector(".ss-media-toolbar");
			expect(toolbar).toBeTruthy();
		});

		it("creates opacity and scale slider mount points", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			expect(parent.querySelector("[data-opacity-slider-mount]")).toBeTruthy();
			expect(parent.querySelector("[data-scale-slider-mount]")).toBeTruthy();
		});

		it("creates volume slider for video/audio", () => {
			const mockEdit = createMockEditSession();
			const { parent } = mountToolbar(mockEdit);

			expect(parent.querySelector("[data-volume-slider]")).toBeTruthy();
		});
	});

	describe("two-phase opacity slider drag", () => {
		it("uses live preview (updateClipInDocument) during opacity drag", () => {
			const mockEdit = createMockEditSession();
			const clip = createImageClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			// Access the opacity slider's internal range input
			const { opacitySlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			expect(opacitySlider).toBeTruthy();

			// Simulate drag start (pointerdown on the slider's range input)
			const rangeInput = (opacitySlider.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;
			expect(rangeInput).toBeTruthy();

			rangeInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Simulate live drag (input event)
			rangeInput.value = "75";
			rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

			// During drag: should use updateClipInDocument for live preview
			expect(mockEdit.updateClipInDocument).toHaveBeenCalledWith("clip-1", { opacity: 0.75 });
			expect(mockEdit.resolveClip).toHaveBeenCalledWith("clip-1");

			// Should NOT create a command during drag
			expect(mockEdit.commitClipUpdate).not.toHaveBeenCalled();
			expect(mockEdit.updateClip).not.toHaveBeenCalled();

			toolbar.dispose();
		});

		it("commits single undo entry on opacity drag end", () => {
			const mockEdit = createMockEditSession();
			const clip = createImageClip({ opacity: 1 });
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const { opacitySlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (opacitySlider.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;

			// Start drag
			rangeInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Multiple intermediate values during drag
			["90", "80", "70", "60", "50"].forEach(val => {
				rangeInput.value = val;
				rangeInput.dispatchEvent(new Event("input", { bubbles: true }));
			});

			// End drag (change event fires on release)
			rangeInput.dispatchEvent(new Event("change", { bubbles: true }));

			// Should have exactly ONE commit call
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);
			// Should have had multiple live updates
			expect(mockEdit.updateClipInDocument).toHaveBeenCalledTimes(5);

			toolbar.dispose();
		});
	});

	describe("two-phase scale slider drag", () => {
		it("uses live preview during scale drag", () => {
			const mockEdit = createMockEditSession();
			const clip = createImageClip();
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

			expect(mockEdit.updateClipInDocument).toHaveBeenCalledWith("clip-1", { scale: 1.5 });
			expect(mockEdit.resolveClip).toHaveBeenCalledWith("clip-1");
			expect(mockEdit.commitClipUpdate).not.toHaveBeenCalled();

			// Release
			rangeInput.dispatchEvent(new Event("change", { bubbles: true }));
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);

			toolbar.dispose();
		});
	});

	describe("two-phase volume slider drag", () => {
		it("uses live preview during volume drag", () => {
			const mockEdit = createMockEditSession();
			const clip = createVideoClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			// Volume slider is a raw <input type="range">, not a SliderControl
			const { volumeSlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			expect(volumeSlider).toBeTruthy();

			// Start drag
			volumeSlider.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			// Slide to 50%
			volumeSlider.value = "50";
			volumeSlider.dispatchEvent(new Event("input", { bubbles: true }));

			// During drag: should use updateClipInDocument for live preview
			expect(mockEdit.updateClipInDocument).toHaveBeenCalledWith(
				"clip-1",
				expect.objectContaining({
					asset: expect.objectContaining({ volume: 0.5 })
				})
			);
			expect(mockEdit.resolveClip).toHaveBeenCalledWith("clip-1");
			expect(mockEdit.commitClipUpdate).not.toHaveBeenCalled();

			// Release
			volumeSlider.dispatchEvent(new Event("change", { bubbles: true }));
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);

			toolbar.dispose();
		});

		it("uses command path for volume text input commit (non-drag)", () => {
			const mockEdit = createMockEditSession();
			const clip = createVideoClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			// Find the volume display input
			const volumeDisplayInput = parent.querySelector("[data-volume-display]") as HTMLInputElement;
			expect(volumeDisplayInput).toBeTruthy();

			// Type a value and blur (text input commit bypasses drag path)
			volumeDisplayInput.value = "75%";
			volumeDisplayInput.dispatchEvent(new Event("blur", { bubbles: true }));

			// Should go through updateClip (command path), not updateClipInDocument
			expect(mockEdit.updateClip).toHaveBeenCalled();
			expect(mockEdit.commitClipUpdate).not.toHaveBeenCalled();

			toolbar.dispose();
		});
	});

	describe("section visibility by asset type", () => {
		it("shows visual section for image assets", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createImageClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const visual = parent.querySelector("[data-visual-section]") as HTMLElement;
			expect(visual.classList.contains("hidden")).toBe(false);

			toolbar.dispose();
		});

		it("hides visual section for audio assets", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createAudioClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const visual = parent.querySelector("[data-visual-section]") as HTMLElement;
			expect(visual.classList.contains("hidden")).toBe(true);

			toolbar.dispose();
		});

		it("shows volume section for video assets", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createVideoClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const volume = parent.querySelector("[data-volume-section]") as HTMLElement;
			expect(volume.classList.contains("hidden")).toBe(false);

			toolbar.dispose();
		});

		it("hides volume section for image assets", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createImageClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const volume = parent.querySelector("[data-volume-section]") as HTMLElement;
			expect(volume.classList.contains("hidden")).toBe(true);

			toolbar.dispose();
		});

		it("shows visual section for text-to-image AI assets", () => {
			const mockEdit = createMockEditSession();
			const aiClip = createImageClip({
				asset: { type: "text-to-image", prompt: "A cat" } as any
			});
			mockEdit.getResolvedClip.mockReturnValue(aiClip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const visual = parent.querySelector("[data-visual-section]") as HTMLElement;
			expect(visual.classList.contains("hidden")).toBe(false);

			toolbar.dispose();
		});
	});

	describe("dispose cleanup", () => {
		it("clears drag sessions on dispose", () => {
			const mockEdit = createMockEditSession();
			const clip = createImageClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			// Start a drag session
			const { opacitySlider: opSlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (opSlider.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;
			rangeInput.dispatchEvent(new Event("pointerdown", { bubbles: true }));

			expect((toolbar as any).dragManager.isDragging("opacity")).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any

			// Dispose should clear all sessions
			toolbar.dispose();

			// After dispose, we can't easily check the dragManager since it's nulled,
			// but we can verify no errors are thrown (cleanup was successful)
		});

		it("disposes composite components", () => {
			const mockEdit = createMockEditSession();
			const { toolbar } = mountToolbar(mockEdit);

			toolbar.dispose();

			const disposed = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			expect(disposed.opacitySlider).toBeNull();
			expect(disposed.scaleSlider).toBeNull();
			expect(disposed.transitionPanel).toBeNull();
			expect(disposed.effectPanel).toBeNull();
		});
	});

	describe("non-drag opacity/scale changes (text input path)", () => {
		it("uses command path when opacity changes outside of drag", () => {
			const mockEdit = createMockEditSession();
			const clip = createImageClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const { opacitySlider: opSlider2 } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			const rangeInput = (opSlider2.container as HTMLElement)?.querySelector("input[type='range']") as HTMLInputElement;

			// Fire input without prior pointerdown — simulates keyboard/text input
			rangeInput.value = "50";
			rangeInput.dispatchEvent(new Event("input", { bubbles: true }));

			// Without an active drag session, should fall through to applyClipUpdate
			expect(mockEdit.updateClip).toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();

			toolbar.dispose();
		});
	});

	describe("MergeFieldChanged event listener", () => {
		function mountMergeFieldToolbar() {
			const { mockEdit, internalEvents, unsubFns } = createMergeFieldMockEditSession();
			const clip = createImageClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const toolbar = new MediaToolbar(mockEdit as unknown as Edit, { mergeFields: true });
			const parent = document.createElement("div");
			document.body.appendChild(parent);
			toolbar.mount(parent);
			return { toolbar, mockEdit, internalEvents, parent, unsubFns };
		}

		it("subscribes to MergeFieldChanged event on mount with mergeFields enabled", () => {
			const { toolbar, mockEdit } = mountMergeFieldToolbar();

			expect(mockEdit.getInternalEvents).toHaveBeenCalled();
			const internalEvents = mockEdit.getInternalEvents();
			expect(internalEvents.on).toHaveBeenCalledWith("mergefield:changed", expect.any(Function));

			toolbar.dispose();
		});

		it("calls mergeFieldManager.sync() when MergeFieldChanged fires and toolbar is visible", () => {
			const { toolbar, internalEvents } = mountMergeFieldToolbar();
			toolbar.show(0, 0);

			const manager = (toolbar as any).mergeFieldManager; // eslint-disable-line @typescript-eslint/no-explicit-any
			if (manager) {
				const syncSpy = jest.spyOn(manager, "sync");
				internalEvents.emit("mergefield:changed", {});
				expect(syncSpy).toHaveBeenCalled();
				syncSpy.mockRestore();
			}

			toolbar.dispose();
		});

		it("does NOT call sync() when toolbar container is display:none", () => {
			const { toolbar, internalEvents } = mountMergeFieldToolbar();
			toolbar.show(0, 0);

			// Hide the container
			const container = (toolbar as any).container as HTMLElement; // eslint-disable-line @typescript-eslint/no-explicit-any
			container.style.display = "none";

			const manager = (toolbar as any).mergeFieldManager; // eslint-disable-line @typescript-eslint/no-explicit-any
			if (manager) {
				const syncSpy = jest.spyOn(manager, "sync");
				internalEvents.emit("mergefield:changed", {});
				expect(syncSpy).not.toHaveBeenCalled();
				syncSpy.mockRestore();
			}

			toolbar.dispose();
		});

		it("unsubscribes from MergeFieldChanged on dispose", () => {
			const { toolbar, unsubFns } = mountMergeFieldToolbar();

			// There should be at least one unsub function (for the MergeFieldChanged listener)
			expect(unsubFns.length).toBeGreaterThan(0);

			toolbar.dispose();

			// All unsub functions should have been called
			unsubFns.forEach(unsub => {
				expect(unsub).toHaveBeenCalled();
			});
		});
	});

	describe("Dynamic source toggle-off restores default URL", () => {
		it("passes merge field defaultValue to removeMergeField, not empty string", () => {
			const defaultUrl = "https://shotstack-assets.s3.amazonaws.com/footage/night-sky.mp4";
			const { mockEdit } = createMergeFieldMockEditSession();

			// Template loads with a merge field already bound to asset.src
			mockEdit.getMergeFieldForProperty.mockReturnValue("MEDIA_1");
			mockEdit.mergeFields.get.mockReturnValue({ name: "MEDIA_1", defaultValue: defaultUrl });

			const clip = createImageClip({ asset: { type: "image", src: "{{MEDIA_1}}" } as ImageAsset });
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const toolbar = new MediaToolbar(mockEdit as unknown as Edit, { mergeFields: true });
			const parent = document.createElement("div");
			document.body.appendChild(parent);
			toolbar.mount(parent);

			// show() triggers updateDynamicSourceUI() which should capture originalSrc from defaultValue
			toolbar.show(0, 0);

			// Toggle OFF dynamic source
			const toggle = parent.querySelector<HTMLInputElement>("[data-dynamic-toggle]")!;
			expect(toggle.checked).toBe(true); // sanity: was checked by updateDynamicSourceUI
			toggle.checked = false;
			toggle.dispatchEvent(new Event("change"));

			// removeMergeField should receive the default URL, not ""
			expect(mockEdit.removeMergeField).toHaveBeenCalledWith("clip-1", "asset.src", defaultUrl);

			toolbar.dispose();
			document.body.removeChild(parent);
		});
	});
});
