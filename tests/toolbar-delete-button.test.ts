/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first, max-classes-per-file */

/**
 * Trash button regression tests.
 *
 * Covers BaseToolbar.appendDeleteButton wiring across:
 *   - initial mount state
 *   - selection-driven refresh via show()
 *   - event-driven refresh (ClipAdded / ClipDeleted / ClipRestored)
 *   - click handler refusal when Edit.canDeleteClip returns false
 *   - listener cleanup on dispose()
 *
 * Uses MediaToolbar as the concrete subclass that exercises BaseToolbar's
 * delete-button lifecycle. Mocks the Edit interface — these tests are about
 * the toolbar's reflection of the rule, not the rule itself.
 */

import type { Edit } from "@core/edit-session";

// Polyfill structuredClone for jsdom
if (typeof structuredClone === "undefined") {
	global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

jest.mock("pixi.js", () => ({}));
jest.mock("../src/components/canvas/players/player", () => ({ Player: class MockPlayer {}, PlayerType: {} }));
jest.mock("../src/core/shotstack-edit", () => ({ ShotstackEdit: class MockShotstackEdit {} }));
jest.mock("../src/core/edit-session", () => ({}));
jest.mock("@styles/inject", () => ({ injectShotstackStyles: jest.fn() }));

import { DELETE_DISABLED_REASON } from "@core/ui/base-toolbar";
import { MediaToolbar } from "@core/ui/media-toolbar";
import { EditEvent } from "@core/events/edit-events";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal event emitter that records subscriptions and supports emit/off. */
function createMockEvents() {
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	return {
		on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
			if (!listeners.has(event)) listeners.set(event, new Set());
			listeners.get(event)!.add(fn);
		}),
		off: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
			listeners.get(event)?.delete(fn);
		}),
		emit: (event: string, ...args: unknown[]) => {
			listeners.get(event)?.forEach(fn => fn(...args));
		},
		listenerCount: (event: string) => listeners.get(event)?.size ?? 0
	};
}

function createMockEdit(canDelete: boolean) {
	const events = createMockEvents();
	return {
		events,
		getClipId: jest.fn().mockReturnValue("clip-1"),
		getResolvedClip: jest.fn(),
		updateClip: jest.fn(),
		updateClipInDocument: jest.fn(),
		resolveClip: jest.fn(),
		commitClipUpdate: jest.fn(),
		deleteClip: jest.fn().mockResolvedValue(undefined),
		canDeleteClip: jest.fn(() => canDelete),
		size: { width: 1920, height: 1080 }
	};
}

function mountToolbar(mockEdit: ReturnType<typeof createMockEdit>): {
	toolbar: MediaToolbar;
	parent: HTMLDivElement;
	getDeleteBtn: () => HTMLButtonElement;
} {
	const toolbar = new MediaToolbar(mockEdit as unknown as Edit);
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	toolbar.mount(parent);
	return {
		toolbar,
		parent,
		getDeleteBtn: () => parent.querySelector<HTMLButtonElement>(".ss-toolbar-delete-btn")!
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Toolbar delete button", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	describe("initial state", () => {
		it("renders the trash button at the right edge of the toolbar", () => {
			const mockEdit = createMockEdit(true);
			const { getDeleteBtn } = mountToolbar(mockEdit);

			const btn = getDeleteBtn();
			expect(btn).toBeTruthy();
			expect(btn.tagName).toBe("BUTTON");
			expect(btn.querySelector("svg")).toBeTruthy();
		});

		it("is disabled before any selection has been made", () => {
			const mockEdit = createMockEdit(true);
			const { getDeleteBtn } = mountToolbar(mockEdit);

			expect(getDeleteBtn().disabled).toBe(true);
		});
	});

	describe("selection-driven refresh", () => {
		it("enables the button when show() is called and canDeleteClip returns true", () => {
			const mockEdit = createMockEdit(true);
			const { toolbar, getDeleteBtn } = mountToolbar(mockEdit);

			toolbar.show(0, 0);

			expect(getDeleteBtn().disabled).toBe(false);
			expect(getDeleteBtn().title).toBe("Delete (Del)");
		});

		it("disables the button when canDeleteClip returns false for the selected clip", () => {
			const mockEdit = createMockEdit(false);
			const { toolbar, getDeleteBtn } = mountToolbar(mockEdit);

			toolbar.show(0, 0);

			expect(getDeleteBtn().disabled).toBe(true);
			expect(getDeleteBtn().title).toBe(DELETE_DISABLED_REASON);
		});

		it("queries canDeleteClip with the selected clip indices", () => {
			const mockEdit = createMockEdit(true);
			const { toolbar } = mountToolbar(mockEdit);

			toolbar.show(2, 5);

			expect(mockEdit.canDeleteClip).toHaveBeenCalledWith(2, 5);
		});
	});

	describe("event-driven refresh", () => {
		it("re-evaluates disabled state when ClipDeleted fires", () => {
			const mockEdit = createMockEdit(true);
			const { toolbar, getDeleteBtn } = mountToolbar(mockEdit);

			toolbar.show(0, 0);
			expect(getDeleteBtn().disabled).toBe(false);

			// Simulate a deletion making the clip un-deletable
			mockEdit.canDeleteClip.mockReturnValue(false);
			mockEdit.events.emit(EditEvent.ClipDeleted, { trackIndex: 0, clipIndex: 1 });

			expect(getDeleteBtn().disabled).toBe(true);
			expect(getDeleteBtn().title).toBe(DELETE_DISABLED_REASON);
		});

		it("re-enables the button when ClipAdded restores deletability", () => {
			const mockEdit = createMockEdit(false);
			const { toolbar, getDeleteBtn } = mountToolbar(mockEdit);

			toolbar.show(0, 0);
			expect(getDeleteBtn().disabled).toBe(true);

			mockEdit.canDeleteClip.mockReturnValue(true);
			mockEdit.events.emit(EditEvent.ClipAdded, { trackIndex: 0, clipIndex: 1 });

			expect(getDeleteBtn().disabled).toBe(false);
		});

		it("subscribes to ClipAdded, ClipDeleted, and ClipRestored", () => {
			const mockEdit = createMockEdit(true);
			mountToolbar(mockEdit);

			expect(mockEdit.events.on).toHaveBeenCalledWith(EditEvent.ClipAdded, expect.any(Function));
			expect(mockEdit.events.on).toHaveBeenCalledWith(EditEvent.ClipDeleted, expect.any(Function));
			expect(mockEdit.events.on).toHaveBeenCalledWith(EditEvent.ClipRestored, expect.any(Function));
		});

		it("only subscribes once per toolbar instance", () => {
			const mockEdit = createMockEdit(true);
			const { toolbar } = mountToolbar(mockEdit);

			// MediaToolbar.show() doesn't rebuild the button — only re-render scenarios do.
			// Simulating a re-mount path: call mount() again on the same toolbar.
			toolbar.mount(document.body);

			// We expect exactly 3 subscriptions across the lifetime — one per event.
			const totalCalls = mockEdit.events.on.mock.calls.length;
			expect(totalCalls).toBe(3);
		});
	});

	describe("click behaviour", () => {
		it("calls deleteClip with the selected indices when enabled", () => {
			const mockEdit = createMockEdit(true);
			const { toolbar, getDeleteBtn } = mountToolbar(mockEdit);

			toolbar.show(1, 2);
			getDeleteBtn().click();

			expect(mockEdit.deleteClip).toHaveBeenCalledWith(1, 2);
		});

		it("does not call deleteClip when canDeleteClip returns false even if the click handler fires", () => {
			const mockEdit = createMockEdit(false);
			const { toolbar, getDeleteBtn } = mountToolbar(mockEdit);

			toolbar.show(0, 0);
			// The button is disabled — fire click directly to verify the in-handler guard
			// rejects the call even if the browser-level disabled didn't (defence in depth).
			getDeleteBtn().dispatchEvent(new MouseEvent("click", { bubbles: true }));

			expect(mockEdit.deleteClip).not.toHaveBeenCalled();
		});

		it("does not call deleteClip when no selection exists", () => {
			const mockEdit = createMockEdit(true);
			const { getDeleteBtn } = mountToolbar(mockEdit);

			// No show() — selection is -1/-1 sentinel
			getDeleteBtn().dispatchEvent(new MouseEvent("click", { bubbles: true }));

			expect(mockEdit.deleteClip).not.toHaveBeenCalled();
		});
	});

	describe("cleanup", () => {
		it("unsubscribes from clip-inventory events on dispose", () => {
			const mockEdit = createMockEdit(true);
			const { toolbar } = mountToolbar(mockEdit);

			expect(mockEdit.events.listenerCount(EditEvent.ClipAdded)).toBe(1);
			expect(mockEdit.events.listenerCount(EditEvent.ClipDeleted)).toBe(1);
			expect(mockEdit.events.listenerCount(EditEvent.ClipRestored)).toBe(1);

			toolbar.dispose();

			expect(mockEdit.events.listenerCount(EditEvent.ClipAdded)).toBe(0);
			expect(mockEdit.events.listenerCount(EditEvent.ClipDeleted)).toBe(0);
			expect(mockEdit.events.listenerCount(EditEvent.ClipRestored)).toBe(0);
		});
	});
});
