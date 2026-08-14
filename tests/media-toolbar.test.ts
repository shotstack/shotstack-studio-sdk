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
		getDocumentClip: jest.fn(),
		getDocument: jest.fn(),
		hasAssetGenerator: jest.fn().mockReturnValue(false),
		getClipGenerationState: jest.fn(),
		generateClipAsset: jest.fn().mockResolvedValue(undefined),
		updateClip: jest.fn(),
		updateClipInDocument: jest.fn(),
		resolveClip: jest.fn(),
		commitClipUpdate: jest.fn(),
		deleteClip: jest.fn(),
		canDeleteClip: jest.fn(() => true),
		playbackTime: 0,
		isPlaying: false,
		pause: jest.fn(),
		getOutputFps: jest.fn(() => 30),
		seek: jest.fn(),
		events: { on: jest.fn(), off: jest.fn() },
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
			getDocumentClip: jest.fn(),
			getDocument: jest.fn(),
			hasAssetGenerator: jest.fn().mockReturnValue(false),
			getClipGenerationState: jest.fn(),
			generateClipAsset: jest.fn().mockResolvedValue(undefined),
			updateClip: jest.fn(),
			updateClipInDocument: jest.fn(),
			resolveClip: jest.fn(),
			commitClipUpdate: jest.fn(),
			deleteClip: jest.fn(),
			canDeleteClip: jest.fn(() => true),
			playbackTime: 0,
			isPlaying: false,
			pause: jest.fn(),
			getOutputFps: jest.fn(() => 30),
			seek: jest.fn(),
			events: { on: jest.fn(), off: jest.fn() },
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

	describe("opacity keyframes", () => {
		const opacityTweens = [
			{ from: 0.2, to: 0.2, start: 0, length: 1, interpolation: "constant" as const },
			{ from: 0.2, to: 0.8, start: 1, length: 2, interpolation: "linear" as const },
			{ from: 0.8, to: 0.8, start: 3, length: 2, interpolation: "constant" as const }
		];

		it("exposes accessible three-state controls and keeps the first key session-only", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			expect(keyframe.dataset["state"]).toBe("static");
			expect(keyframe.getAttribute("aria-label")).toBe("Add opacity keyframe");
			keyframe.click();

			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(keyframe.dataset["state"]).toBe("keyframe");
			expect(keyframe.getAttribute("aria-pressed")).toBe("true");
			toolbar.dispose();
		});

		it("serialises the existing Tween array shape when a second key is added", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			keyframe.click();
			mockEdit.playbackTime = 3;
			keyframe.click();

			expect(mockEdit.updateClip).toHaveBeenCalledWith(0, 0, {
				opacity: [
					{ from: 1, to: 1, start: 0, length: 1, interpolation: "constant" },
					{ from: 1, to: 1, start: 1, length: 2, interpolation: "linear" },
					{ from: 1, to: 1, start: 3, length: 2, interpolation: "constant" }
				]
			});
			toolbar.dispose();
		});

		it("clears a pending first key when the edit is reloaded", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			keyframe.click();
			expect(keyframe.dataset["state"]).toBe("keyframe");

			const editChangedListener = mockEdit.events.on.mock.calls.find(([event]) => event === "edit:changed")?.[1];
			editChangedListener?.({ source: "loadEdit:granular", timestamp: Date.now() });

			expect(keyframe.dataset["state"]).toBe("static");
			toolbar.dispose();
		});

		it("auto-keys an animated slider drag and commits one undo entry", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 2;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const range = parent.querySelector("[data-opacity-slider-mount] input[type='range']") as HTMLInputElement;
			expect(range.value).toBe("50");

			range.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			range.value = "40";
			range.dispatchEvent(new Event("input", { bubbles: true }));
			range.dispatchEvent(new Event("change", { bubbles: true }));

			const update = mockEdit.updateClipInDocument.mock.calls[0][1];
			expect(update.opacity).toEqual(expect.arrayContaining([{ from: 0.2, to: 0.4, start: 1, length: 1, interpolation: "linear" }]));
			expect(mockEdit.commitClipUpdate).toHaveBeenCalledTimes(1);
			toolbar.dispose();
		});

		it("keeps document timing intent in opacity drag history", () => {
			const mockEdit = createMockEditSession();
			const clip = createImageClip({ start: sec(2), length: sec(5) });
			const documentClip = { ...clip, start: "auto", length: "end" };
			mockEdit.playbackTime = 3;
			mockEdit.getResolvedClip.mockReturnValue(clip);
			mockEdit.getDocumentClip.mockImplementation(() => documentClip);
			mockEdit.updateClipInDocument.mockImplementation((_clipId, updates) => Object.assign(documentClip, updates));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const range = parent.querySelector("[data-opacity-slider-mount] input[type='range']") as HTMLInputElement;
			range.dispatchEvent(new Event("pointerdown", { bubbles: true }));
			range.value = "50";
			range.dispatchEvent(new Event("input", { bubbles: true }));
			range.dispatchEvent(new Event("change", { bubbles: true }));

			const [, initialState, finalState] = mockEdit.commitClipUpdate.mock.calls[0];
			expect(initialState).toEqual(expect.objectContaining({ start: "auto", length: "end", opacity: 1 }));
			expect(finalState).toEqual(expect.objectContaining({ start: "auto", length: "end", opacity: 0.5 }));
			toolbar.dispose();
		});

		it("keeps unsupported Tween arrays read-only while showing their evaluated value", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 2.5;
			const opacity = [{ from: 0, to: 1, start: 0, length: 5, interpolation: "bezier" as const, easing: "ease" as const }];
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const range = parent.querySelector("[data-opacity-slider-mount] input[type='range']") as HTMLInputElement;
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			expect(range.disabled).toBe(true);
			expect(keyframe.disabled).toBe(true);
			expect(Number(range.value)).toBeGreaterThan(50);

			range.value = "25";
			range.dispatchEvent(new Event("input", { bubbles: true }));
			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();
			expect(opacity).toEqual([{ from: 0, to: 1, start: 0, length: 5, interpolation: "bezier", easing: "ease" }]);
			toolbar.dispose();
		});

		it("keeps Tween arrays with nested merge values read-only", () => {
			const mockEdit = createMockEditSession();
			const opacity = [{ from: 0.2, to: 0.8, start: 0, length: 5, interpolation: "linear" as const }];
			const clip = createImageClip({ opacity });
			mockEdit.getResolvedClip.mockReturnValue(clip);
			mockEdit.getDocumentClip.mockReturnValue({
				...clip,
				opacity: [{ from: "{{ ALPHA }}", to: 0.8, start: 0, length: 5, interpolation: "linear" }]
			});

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect((parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement).disabled).toBe(true);
			expect((parent.querySelector("[data-opacity-slider-mount] input[type='range']") as HTMLInputElement).disabled).toBe(true);
			toolbar.dispose();
		});

		it("does not write when the opacity input is blurred unchanged or cancelled", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 2;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const input = parent.querySelector("[data-opacity-slider-mount] input[type='text']") as HTMLInputElement;
			input.focus();
			input.blur();
			input.focus();
			input.value = "25%";
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();
			toolbar.dispose();
		});

		it("pauses playback before editing an opacity animation", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 2;
			mockEdit.isPlaying = true;
			mockEdit.pause.mockImplementation(() => {
				mockEdit.isPlaying = false;
			});
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			(parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement).click();

			expect(mockEdit.pause).toHaveBeenCalledTimes(1);
			toolbar.dispose();
		});

		it("preserves a trimmed-out key when removing its only visible partner", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			const opacity = [
				{ from: 0.25, to: 0.25, start: 0, length: 1, interpolation: "constant" as const },
				{ from: 0.25, to: 0.75, start: 1, length: 7, interpolation: "linear" as const }
			];
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			expect(keyframe.disabled).toBe(true);
			expect(keyframe.title).toContain("Extend the clip");
			keyframe.click();

			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(opacity).toHaveLength(2);
			toolbar.dispose();
		});

		it("collapses a two-key animation to a static value", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			(parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement).click();

			expect(mockEdit.updateClip).toHaveBeenCalledWith(0, 0, { opacity: 0.8 });
			toolbar.dispose();
		});

		it("navigates to adjacent opacity keys", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 2;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			(parent.querySelector("[data-opacity-keyframe-previous]") as HTMLButtonElement).click();
			(parent.querySelector("[data-opacity-keyframe-next]") as HTMLButtonElement).click();

			expect(mockEdit.seek).toHaveBeenNthCalledWith(1, 1);
			expect(mockEdit.seek).toHaveBeenNthCalledWith(2, 3);
			toolbar.dispose();
		});

		it("announces the animated-between-keys state", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 2;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			expect(keyframe.getAttribute("aria-pressed")).toBe("mixed");
			expect(keyframe.getAttribute("aria-label")).toContain("opacity is animated");
			toolbar.dispose();
		});

		it("leaves effects and transitions available after arming the first key", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: 0.5 }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			(parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement).click();

			// Arming writes nothing to the document, so there is nothing to undo and
			// nothing that should gate the preset controls.
			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect((parent.querySelector('[data-action="effect"]') as HTMLButtonElement).disabled).toBe(false);
			expect((parent.querySelector('[data-action="transition"]') as HTMLButtonElement).disabled).toBe(false);
			toolbar.dispose();
		});

		it("discards an armed key when the selection or the edit changes", () => {
			const mockEdit = createMockEditSession();
			mockEdit.playbackTime = 1;
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: 0.5 }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			keyframe.click();
			expect(keyframe.dataset["state"]).toBe("keyframe");

			toolbar.show(0, 0);
			expect(keyframe.dataset["state"]).toBe("static");

			keyframe.click();
			expect(keyframe.dataset["state"]).toBe("keyframe");
			const editChanged = mockEdit.events.on.mock.calls.find(([name]) => name === "edit:changed")?.[1];
			editChanged({ source: "loadEdit" });
			expect(keyframe.dataset["state"]).toBe("static");
			toolbar.dispose();
		});

		it("blocks effects and transitions while opacity is animated", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ opacity: opacityTweens }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			expect((parent.querySelector('[data-action="effect"]') as HTMLButtonElement).disabled).toBe(true);
			expect((parent.querySelector('[data-action="transition"]') as HTMLButtonElement).disabled).toBe(true);
			toolbar.dispose();
		});

		it("blocks keyframe activation while a preset is present", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ effect: "zoomIn" }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			expect(keyframe.disabled).toBe(true);
			expect(keyframe.title).toContain("effect or transition");
			toolbar.dispose();
		});

		it("blocks keyframe activation while opacity is merge-field bound", () => {
			const { mockEdit } = createMergeFieldMockEditSession();
			const clip = createImageClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);
			mockEdit.getResolvedClipById.mockReturnValue(clip);
			mockEdit.getMergeFieldForProperty.mockReturnValue("OPACITY");

			const toolbar = new MediaToolbar(mockEdit as unknown as Edit, { mergeFields: true });
			const parent = document.createElement("div");
			document.body.appendChild(parent);
			toolbar.mount(parent);
			toolbar.show(0, 0);

			expect((parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement).disabled).toBe(true);
			toolbar.dispose();
		});

		it("cancels a pending first key when opacity becomes merge-field bound", () => {
			const { mockEdit, internalEvents } = createMergeFieldMockEditSession();
			const clip = createImageClip();
			mockEdit.getResolvedClip.mockReturnValue(clip);
			mockEdit.getResolvedClipById.mockReturnValue(clip);

			const toolbar = new MediaToolbar(mockEdit as unknown as Edit, { mergeFields: true });
			const parent = document.createElement("div");
			document.body.appendChild(parent);
			toolbar.mount(parent);
			toolbar.show(0, 0);
			const keyframe = parent.querySelector("[data-opacity-keyframe]") as HTMLButtonElement;
			keyframe.click();
			expect(keyframe.dataset["state"]).toBe("keyframe");

			mockEdit.getMergeFieldForProperty.mockReturnValue("OPACITY");
			internalEvents.emit("mergefield:changed");

			expect(keyframe.dataset["state"]).toBe("static");
			expect(keyframe.disabled).toBe(true);
			toolbar.dispose();
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
		it("keeps imported scale Tween arrays read-only", () => {
			const mockEdit = createMockEditSession();
			const scale = [{ from: 1, to: 2, start: 0, length: 5, interpolation: "linear" as const }];
			mockEdit.getResolvedClip.mockReturnValue(createImageClip({ scale }));

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const range = parent.querySelector("[data-scale-slider-mount] input[type='range']") as HTMLInputElement;
			expect(range.disabled).toBe(true);
			range.value = "150";
			range.dispatchEvent(new Event("input", { bubbles: true }));

			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();
			expect(scale).toHaveLength(1);
			toolbar.dispose();
		});

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
		it("keeps imported volume Tween arrays read-only", () => {
			const mockEdit = createMockEditSession();
			const clip = createVideoClip();
			const volume = [{ from: 0, to: 1, start: 0, length: 10, interpolation: "linear" as const }];
			(clip.asset as unknown as { volume: typeof volume }).volume = volume;
			mockEdit.getResolvedClip.mockReturnValue(clip);

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);
			const range = parent.querySelector("[data-volume-slider]") as HTMLInputElement;
			expect(range.disabled).toBe(true);
			range.value = "50";
			range.dispatchEvent(new Event("input", { bubbles: true }));

			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();
			expect(volume).toHaveLength(1);
			toolbar.dispose();
		});

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

	describe("speed control", () => {
		function mountWithVideoClip(assetOverrides: Record<string, unknown> = {}, docLength: number | string = 10) {
			const mockEdit = createMockEditSession();
			const clip = createVideoClip();
			Object.assign(clip.asset, assetOverrides);
			mockEdit.getResolvedClip.mockReturnValue(clip);
			mockEdit.getDocumentClip.mockReturnValue({ ...clip, length: docLength });

			const mounted = mountToolbar(mockEdit);
			mounted.toolbar.show(0, 0);
			return { mockEdit, ...mounted };
		}

		it("rescales length by oldSpeed/newSpeed when a preset is clicked", () => {
			const { mockEdit, toolbar, parent } = mountWithVideoClip();

			(parent.querySelector('[data-speed-preset="2"]') as HTMLButtonElement).click();

			// 10s at 1× → 5s at 2×, same source window
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					length: 5,
					asset: expect.objectContaining({ speed: 2 })
				})
			);
			toolbar.dispose();
		});

		it("rescales trim with length so the source start frame is unchanged", () => {
			const { mockEdit, toolbar, parent } = mountWithVideoClip({ trim: 2 });

			(parent.querySelector('[data-speed-preset="2"]') as HTMLButtonElement).click();

			// Renders scale trim by speed: trim 2 at 1× and trim 1 at 2× both start at source 2s
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					length: 5,
					asset: expect.objectContaining({ speed: 2, trim: 1 })
				})
			);
			toolbar.dispose();
		});

		it("preserves auto/end length intent strings (no numeric rewrite)", () => {
			const { mockEdit, toolbar, parent } = mountWithVideoClip({}, "auto");

			(parent.querySelector('[data-speed-preset="2"]') as HTMLButtonElement).click();

			const updates = mockEdit.updateClip.mock.calls[0][2];
			expect(updates).not.toHaveProperty("length");
			toolbar.dispose();
		});

		it("strips speed from the asset when set back to exactly 1×", () => {
			const { mockEdit, toolbar, parent } = mountWithVideoClip({ speed: 2 }, 5);

			(parent.querySelector('[data-speed-preset="1"]') as HTMLButtonElement).click();

			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					length: 10,
					asset: expect.objectContaining({ speed: undefined })
				})
			);
			toolbar.dispose();
		});

		it("slider drag updates the readout only, committing once on release", () => {
			const { mockEdit, toolbar } = mountWithVideoClip();

			const { speedSlider } = toolbar as any; // eslint-disable-line @typescript-eslint/no-explicit-any
			expect(speedSlider).toBeTruthy();

			// Slide to the max position (10×) - no document writes while dragging
			speedSlider.value = "600";
			speedSlider.dispatchEvent(new Event("input", { bubbles: true }));
			expect(mockEdit.updateClip).not.toHaveBeenCalled();
			expect(mockEdit.updateClipInDocument).not.toHaveBeenCalled();

			// Release commits a single update through the command path (emits ClipUpdated)
			speedSlider.dispatchEvent(new Event("change", { bubbles: true }));
			expect(mockEdit.updateClip).toHaveBeenCalledTimes(1);
			expect(mockEdit.updateClip).toHaveBeenCalledWith(
				0,
				0,
				expect.objectContaining({
					length: 1,
					asset: expect.objectContaining({ speed: 10 })
				})
			);
			toolbar.dispose();
		});

		it("hides the speed section for image assets", () => {
			const mockEdit = createMockEditSession();
			mockEdit.getResolvedClip.mockReturnValue(createImageClip());

			const { toolbar, parent } = mountToolbar(mockEdit);
			toolbar.show(0, 0);

			const speedSection = parent.querySelector("[data-speed-section]") as HTMLElement;
			expect(speedSection.classList.contains("hidden")).toBe(true);
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
