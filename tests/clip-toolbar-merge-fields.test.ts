/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first, max-classes-per-file */

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
jest.mock("../src/components/canvas/players/player", () => {
	class MockPlayer {
		clipConfiguration = {};

		getMergeFieldBinding = jest.fn(() => null);
	}
	return { Player: MockPlayer, PlayerType: {} };
});

// Mock ShotstackEdit as a class so instanceof checks work
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockGetMergeFieldForProperty = jest.fn((_clipId: string, _path: string): string | null => null);
jest.mock("../src/core/shotstack-edit", () => ({
	ShotstackEdit: class MockShotstackEdit {
		getMergeFieldForProperty = mockGetMergeFieldForProperty;
	}
}));

jest.mock("../src/core/edit-session", () => ({}));

// Mock IntersectionObserver / ResizeObserver (not provided by jsdom)
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn()
})) as unknown as typeof IntersectionObserver;
global.ResizeObserver = jest.fn().mockImplementation(() => ({
	observe: jest.fn(),
	unobserve: jest.fn(),
	disconnect: jest.fn()
})) as unknown as typeof ResizeObserver;

import { TimingControl } from "../src/core/ui/composites/TimingControl";
import { ClipToolbar } from "../src/core/ui/clip-toolbar";
import { ShotstackEdit } from "../src/core/shotstack-edit";
import { EditEvent } from "../src/core/events/edit-events";

// ============================================================================
// Helpers
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

function createTestContainer(): HTMLDivElement {
	const container = document.createElement("div");
	document.body.appendChild(container);
	return container;
}

function cleanupTestContainer(container: HTMLDivElement): void {
	container.remove();
}

// ============================================================================
// TimingControl merge field bound state
// ============================================================================

describe("TimingControl merge field bound state", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = createTestContainer();
	});

	afterEach(() => {
		cleanupTestContainer(container);
	});

	it("sets data-merge-bound attribute when bound", () => {
		const control = new TimingControl("length");
		control.mount(container);

		control.setMergeFieldBound("LENGTH");

		const el = container.querySelector(".ss-timing-control");
		expect(el?.hasAttribute("data-merge-bound")).toBe(true);

		control.dispose();
	});

	it("removes data-merge-bound attribute when cleared", () => {
		const control = new TimingControl("start");
		control.mount(container);

		control.setMergeFieldBound("START_TIME");
		control.setMergeFieldBound(null);

		const el = container.querySelector(".ss-timing-control");
		expect(el?.hasAttribute("data-merge-bound")).toBe(false);

		control.dispose();
	});

	it("does not change mode icon when bound (MergeFieldLabel handles icon)", () => {
		const control = new TimingControl("length");
		control.mount(container);

		const svg = container.querySelector(".ss-timing-mode svg");
		const originalIcon = svg?.innerHTML;

		control.setMergeFieldBound("DURATION");

		// Mode icon should remain unchanged — MergeFieldLabel handles its own icon
		expect(svg?.innerHTML).toBe(originalIcon);

		control.dispose();
	});

	it("exposes merge mount point via getMergeMountPoint()", () => {
		const control = new TimingControl("start");
		control.mount(container);

		const mountPoint = control.getMergeMountPoint();
		expect(mountPoint).toBeInstanceOf(HTMLElement);
		expect(mountPoint?.classList.contains("ss-timing-merge-mount")).toBe(true);

		control.dispose();
	});

	it("updates tooltip to show field name when bound", () => {
		const control = new TimingControl("length");
		control.mount(container);

		control.setMergeFieldBound("CLIP_LENGTH");

		const tooltip = container.querySelector(".ss-timing-tooltip");
		expect(tooltip?.textContent).toBe("Merge field: {{ CLIP_LENGTH }}");

		control.dispose();
	});

	it("restores tooltip to mode tooltip when unbound", () => {
		const control = new TimingControl("start");
		control.mount(container);

		const tooltip = container.querySelector(".ss-timing-tooltip");
		const originalTooltip = tooltip?.textContent;

		control.setMergeFieldBound("START_TIME");
		control.setMergeFieldBound(null);

		expect(tooltip?.textContent).toBe(originalTooltip);

		control.dispose();
	});

	it("reports bound state via isMergeFieldBound()", () => {
		const control = new TimingControl("length");
		control.mount(container);

		expect(control.isMergeFieldBound()).toBe(false);

		control.setMergeFieldBound("LEN");
		expect(control.isMergeFieldBound()).toBe(true);

		control.setMergeFieldBound(null);
		expect(control.isMergeFieldBound()).toBe(false);

		control.dispose();
	});

	it("does not emit on mode click when bound", () => {
		const control = new TimingControl("length");
		control.mount(container);
		const handler = jest.fn();
		control.onChange(handler);

		control.setMergeFieldBound("LEN");

		// Click mode button
		const modeBtn = container.querySelector(".ss-timing-mode");
		modeBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		// Should not have cycled mode (no emission)
		expect(handler).not.toHaveBeenCalled();

		control.dispose();
	});
});

// ============================================================================
// ClipToolbar merge field integration
// ============================================================================

describe("ClipToolbar merge field integration", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = createTestContainer();
		mockGetMergeFieldForProperty.mockReset();
	});

	afterEach(() => {
		cleanupTestContainer(container);
	});

	function createMockShotstackEdit(overrides: Record<string, unknown> = {}) {
		const events = createMockEventEmitter();
		const edit = Object.assign(Object.create(ShotstackEdit.prototype), {
			events,
			getInternalEvents: jest.fn(() => events),
			getClipId: jest.fn(() => "test-clip-id"),
			getDocumentClip: jest.fn(() => ({ start: 0, length: 5 })),
			getResolvedClipById: jest.fn(() => ({ start: 0, length: 5 })),
			updateClipTiming: jest.fn(),
			getMergeFieldForProperty: mockGetMergeFieldForProperty,
			mergeFields: {
				getAll: jest.fn(() => []),
				get: jest.fn(() => null),
				generateUniqueName: jest.fn((prefix: string) => prefix)
			},
			isValueCompatibleWithClipProperty: jest.fn(() => true),
			applyMergeField: jest.fn(() => Promise.resolve()),
			removeMergeField: jest.fn(() => Promise.resolve()),
			...overrides
		});
		return edit;
	}

	it("marks start control as merge-bound when start has a merge field", () => {
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "start") return "START_TIME";
			return null;
		});

		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const startSection = container.querySelector("[data-start-mount]");
		const startControl = startSection?.querySelector(".ss-timing-control");
		expect(startControl?.hasAttribute("data-merge-bound")).toBe(true);

		const lengthSection = container.querySelector("[data-length-mount]");
		const lengthControl = lengthSection?.querySelector(".ss-timing-control");
		expect(lengthControl?.hasAttribute("data-merge-bound")).toBe(false);

		toolbar.dispose();
	});

	it("marks length control as merge-bound when length has a merge field", () => {
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "length") return "CLIP_LENGTH";
			return null;
		});

		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const startSection = container.querySelector("[data-start-mount]");
		const startControl = startSection?.querySelector(".ss-timing-control");
		expect(startControl?.hasAttribute("data-merge-bound")).toBe(false);

		const lengthSection = container.querySelector("[data-length-mount]");
		const lengthControl = lengthSection?.querySelector(".ss-timing-control");
		expect(lengthControl?.hasAttribute("data-merge-bound")).toBe(true);

		toolbar.dispose();
	});

	it("marks both controls as merge-bound when both have merge fields", () => {
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "start") return "START_TIME";
			if (path === "length") return "CLIP_LENGTH";
			return null;
		});

		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const startControl = container.querySelector("[data-start-mount] .ss-timing-control");
		const lengthControl = container.querySelector("[data-length-mount] .ss-timing-control");
		expect(startControl?.hasAttribute("data-merge-bound")).toBe(true);
		expect(lengthControl?.hasAttribute("data-merge-bound")).toBe(true);

		toolbar.dispose();
	});

	it("displays resolved merge field value instead of raw placeholder", () => {
		// Document clip has placeholder strings, resolved clip has actual values
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "start") return "START_TIME";
			if (path === "length") return "CLIP_LENGTH";
			return null;
		});

		const edit = createMockShotstackEdit({
			// Document clip has placeholder strings (not valid timing values)
			getDocumentClip: jest.fn(() => ({ start: "{{START_TIME}}", length: "{{CLIP_LENGTH}}" })),
			// Resolved clip has the merge field default values applied (10s, 20s)
			getResolvedClipById: jest.fn(() => ({ start: 10, length: 20 }))
		});

		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const startValue = container.querySelector("[data-start-mount] .ss-timing-value") as HTMLInputElement;
		const lengthValue = container.querySelector("[data-length-mount] .ss-timing-value") as HTMLInputElement;

		// Should display the resolved values (10s, 20s), not "0.0s" or garbage
		expect(startValue?.value).toBe("10.0s");
		expect(lengthValue?.value).toBe("20.0s");

		toolbar.dispose();
	});

	it("mounts MergeFieldLabel into each timing control merge mount point", () => {
		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);

		// Both merge mount points should contain a MergeFieldLabel component
		const startMergeMount = container.querySelector("[data-start-mount] .ss-timing-merge-mount");
		const lengthMergeMount = container.querySelector("[data-length-mount] .ss-timing-merge-mount");

		expect(startMergeMount?.querySelector(".ss-merge-label")).toBeTruthy();
		expect(lengthMergeMount?.querySelector(".ss-merge-label")).toBeTruthy();

		toolbar.dispose();
	});

	it("MergeFieldLabel icon button is present in each timing control", () => {
		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);

		const startIcon = container.querySelector("[data-start-mount] .ss-merge-label__icon");
		const lengthIcon = container.querySelector("[data-length-mount] .ss-merge-label__icon");

		expect(startIcon).toBeTruthy();
		expect(lengthIcon).toBeTruthy();

		toolbar.dispose();
	});

	it("clears merge-bound state when no merge fields exist", () => {
		// Initially bound
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "start") return "START_TIME";
			return null;
		});

		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const startControl = container.querySelector("[data-start-mount] .ss-timing-control");
		expect(startControl?.hasAttribute("data-merge-bound")).toBe(true);

		// Clear binding
		mockGetMergeFieldForProperty.mockReturnValue(null);

		// Trigger syncState via MergeFieldChanged event
		edit.events.emit(EditEvent.MergeFieldChanged, {});

		expect(startControl?.hasAttribute("data-merge-bound")).toBe(false);

		toolbar.dispose();
	});

	it("subscribes to MergeFieldChanged event", () => {
		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);

		expect(edit.events.on).toHaveBeenCalledWith(EditEvent.MergeFieldChanged, expect.any(Function));

		toolbar.dispose();
	});

	it("unsubscribes from MergeFieldChanged on dispose", () => {
		const edit = createMockShotstackEdit();
		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);

		toolbar.dispose();

		expect(edit.events.off).toHaveBeenCalledWith(EditEvent.MergeFieldChanged, expect.any(Function));
	});

	// ────────────────────────────────────────────────────────────────────────
	// wireBindCallback / wireClearCallback regression tests
	// ────────────────────────────────────────────────────────────────────────

	it("bind via Create & Select generates unique name and calls applyMergeField with resolved value", async () => {
		const edit = createMockShotstackEdit({
			getResolvedClipById: jest.fn(() => ({ start: 7.5, length: 3 }))
		});
		(edit.mergeFields.get as jest.Mock).mockReturnValue(null); // no existing field
		(edit.mergeFields.generateUniqueName as jest.Mock).mockReturnValue("START_1");

		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		// Open the start merge field dropdown
		const startIcon = container.querySelector("[data-start-mount] .ss-merge-label__icon") as HTMLElement;
		startIcon.click();

		// Click "Create & Select"
		const createBtn = container.querySelector("[data-start-mount] .ss-merge-label__create") as HTMLElement;
		createBtn.click();

		// Wait for the async applyMergeField promise
		await Promise.resolve();

		expect(edit.mergeFields.generateUniqueName).toHaveBeenCalledWith("START");
		expect(edit.applyMergeField).toHaveBeenCalledWith("test-clip-id", "start", "START_1", "7.5");

		toolbar.dispose();
	});

	it("bind via existing field calls applyMergeField with existing field name and value", async () => {
		const existingField = { name: "MY_START", defaultValue: "5" };
		const edit = createMockShotstackEdit();
		(edit.mergeFields.get as jest.Mock).mockImplementation((...args: unknown[]) => (args[0] === "MY_START" ? existingField : null));
		(edit.mergeFields.getAll as jest.Mock).mockReturnValue([existingField]);

		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		// Open the start merge field dropdown
		const startIcon = container.querySelector("[data-start-mount] .ss-merge-label__icon") as HTMLElement;
		startIcon.click();

		// The field list should contain the existing field — click it
		const fieldBtn = container.querySelector("[data-start-mount] .ss-merge-label__field") as HTMLElement;
		expect(fieldBtn).toBeTruthy();
		fieldBtn.click();

		await Promise.resolve();

		expect(edit.applyMergeField).toHaveBeenCalledWith("test-clip-id", "start", "MY_START", "5");

		toolbar.dispose();
	});

	it("bind rejects incompatible existing field without calling applyMergeField", async () => {
		const incompatibleField = { name: "BAD_FIELD", defaultValue: "not-a-number" };
		const edit = createMockShotstackEdit();
		(edit.mergeFields.get as jest.Mock).mockImplementation((...args: unknown[]) => (args[0] === "BAD_FIELD" ? incompatibleField : null));
		(edit.mergeFields.getAll as jest.Mock).mockReturnValue([incompatibleField]);
		// Mark as incompatible
		(edit.isValueCompatibleWithClipProperty as jest.Mock).mockReturnValue(false);

		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		// Open the start merge field dropdown
		const startIcon = container.querySelector("[data-start-mount] .ss-merge-label__icon") as HTMLElement;
		startIcon.click();

		// The field should be rendered but disabled (no click handler attached)
		const fieldBtn = container.querySelector("[data-start-mount] .ss-merge-label__field") as HTMLElement;
		expect(fieldBtn?.classList.contains("ss-merge-label__field--disabled")).toBe(true);
		fieldBtn.click();

		await Promise.resolve();

		expect(edit.applyMergeField).not.toHaveBeenCalled();

		toolbar.dispose();
	});

	it("clear callback calls removeMergeField with field default value as restore value", async () => {
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "length") return "CLIP_LENGTH";
			return null;
		});

		const boundField = { name: "CLIP_LENGTH", defaultValue: "12" };
		const edit = createMockShotstackEdit({
			getDocumentClip: jest.fn(() => ({ start: 0, length: "{{CLIP_LENGTH}}" })),
			getResolvedClipById: jest.fn(() => ({ start: 0, length: 12 }))
		});
		(edit.mergeFields.get as jest.Mock).mockImplementation((...args: unknown[]) => (args[0] === "CLIP_LENGTH" ? boundField : null));
		(edit.mergeFields.getAll as jest.Mock).mockReturnValue([boundField]);

		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		// Open the length merge field dropdown
		const lengthIcon = container.querySelector("[data-length-mount] .ss-merge-label__icon") as HTMLElement;
		lengthIcon.click();

		// The "Clear" button should be present because the label is in bound state
		const clearBtn = container.querySelector("[data-length-mount] .ss-merge-label__clear") as HTMLElement;
		expect(clearBtn).toBeTruthy();
		clearBtn.click();

		await Promise.resolve();

		expect(edit.removeMergeField).toHaveBeenCalledWith("test-clip-id", "length", "12");

		toolbar.dispose();
	});

	it("mixed bound/unbound: bound property reads resolved clip, unbound reads document clip", () => {
		// Only start is bound, length is not
		mockGetMergeFieldForProperty.mockImplementation((_clipId: string, path: string) => {
			if (path === "start") return "MY_START";
			return null;
		});

		const edit = createMockShotstackEdit({
			// Document has placeholder for start, normal value for length
			getDocumentClip: jest.fn(() => ({ start: "{{MY_START}}", length: 8 })),
			// Resolved has merge field default applied for start
			getResolvedClipById: jest.fn(() => ({ start: 15, length: 8 }))
		});

		const toolbar = new ClipToolbar(edit as never);
		toolbar.mount(container);
		toolbar.show(0, 0);

		const startValue = container.querySelector("[data-start-mount] .ss-timing-value") as HTMLInputElement;
		const lengthValue = container.querySelector("[data-length-mount] .ss-timing-value") as HTMLInputElement;

		// Start should read from resolved clip (15s)
		expect(startValue?.value).toBe("15.0s");
		// Length should read from document clip (8s)
		expect(lengthValue?.value).toBe("8.0s");

		toolbar.dispose();
	});
});
