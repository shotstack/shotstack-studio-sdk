/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first, max-classes-per-file */

/**
 * Right-click context menu for timeline clips.
 *
 * Covers:
 *   - Right-click on a clip element opens the menu and suppresses the native one
 *   - Delete item is enabled when Edit.canDeleteClip returns true
 *   - Delete item is disabled (with explanatory title) when canDeleteClip returns false
 *   - Clicking enabled Delete invokes edit.deleteClip and closes the menu
 *   - Escape, outside click, scroll, and resize all close the menu
 *   - showAt() toggles the menu when called for the same clip twice
 *   - showAt() switches the menu when called for a different clip
 *   - dispose() removes listeners and any open menu
 */

import type { Edit } from "@core/edit-session";

if (typeof structuredClone === "undefined") {
	global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

jest.mock("pixi.js", () => ({}));
jest.mock("../src/components/canvas/players/player", () => ({ Player: class MockPlayer {}, PlayerType: {} }));
jest.mock("../src/core/shotstack-edit", () => ({ ShotstackEdit: class MockShotstackEdit {} }));
jest.mock("../src/core/edit-session", () => ({}));

import { DELETE_DISABLED_REASON } from "@core/ui/base-toolbar";
import { ClipContextMenu } from "@timeline/components/clip/clip-context-menu";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockEdit(canDelete = true) {
	return {
		canDeleteClip: jest.fn(() => canDelete),
		deleteClip: jest.fn().mockResolvedValue(undefined)
	};
}

function createClipEl(trackIndex: number, clipIndex: number): HTMLDivElement {
	const el = document.createElement("div");
	el.className = "ss-clip";
	el.dataset["trackIndex"] = String(trackIndex);
	el.dataset["clipIndex"] = String(clipIndex);
	// Give it a non-zero rect so menu positioning has something real to anchor to.
	Object.defineProperty(el, "getBoundingClientRect", {
		value: () => ({ left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, x: 0, y: 0, toJSON: () => ({}) })
	});
	return el;
}

function setup(canDelete = true) {
	const mockEdit = createMockEdit(canDelete);
	const tracksContainer = document.createElement("div");
	tracksContainer.className = "ss-tracks";
	document.body.appendChild(tracksContainer);

	const menu = new ClipContextMenu(mockEdit as unknown as Edit, tracksContainer);
	menu.mount();

	return {
		menu,
		mockEdit,
		tracksContainer,
		getMenuEl: () => document.querySelector<HTMLDivElement>(".ss-clip-context-menu"),
		getDeleteItem: () => document.querySelector<HTMLButtonElement>(".ss-clip-context-menu [data-action='delete']")
	};
}

function rightClick(target: HTMLElement, clientX = 50, clientY = 50): MouseEvent {
	const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 });
	target.dispatchEvent(event);
	return event;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("ClipContextMenu", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	describe("opening via right-click", () => {
		it("opens the menu when a clip element is right-clicked", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);

			expect(getMenuEl()).toBeTruthy();
		});

		it("suppresses the native browser menu by calling preventDefault", () => {
			const { tracksContainer } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			const event = rightClick(clip);

			expect(event.defaultPrevented).toBe(true);
		});

		it("does nothing when the right-click target is not a clip", () => {
			const { tracksContainer, getMenuEl } = setup();
			const nonClip = document.createElement("div");
			tracksContainer.appendChild(nonClip);

			const event = rightClick(nonClip);

			expect(getMenuEl()).toBeNull();
			expect(event.defaultPrevented).toBe(false);
		});

		it("ignores clip elements missing the trackIndex or clipIndex dataset", () => {
			const { tracksContainer, getMenuEl } = setup();
			const malformed = document.createElement("div");
			malformed.className = "ss-clip";
			// Intentionally no dataset
			tracksContainer.appendChild(malformed);

			rightClick(malformed);

			expect(getMenuEl()).toBeNull();
		});
	});

	describe("delete item state", () => {
		it("renders the Delete item enabled when canDeleteClip returns true", () => {
			const { tracksContainer, getDeleteItem, mockEdit } = setup(true);
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);

			const item = getDeleteItem()!;
			expect(item.disabled).toBe(false);
			expect(mockEdit.canDeleteClip).toHaveBeenCalledWith(0, 0);
		});

		it("renders the Delete item disabled with the shared tooltip when canDeleteClip returns false", () => {
			const { tracksContainer, getDeleteItem } = setup(false);
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);

			const item = getDeleteItem()!;
			expect(item.disabled).toBe(true);
			expect(item.title).toBe(DELETE_DISABLED_REASON);
		});

		it("includes a Delete label and a Del shortcut hint", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);

			const menuEl = getMenuEl()!;
			expect(menuEl.querySelector(".ss-clip-context-menu-label")?.textContent).toBe("Delete");
			expect(menuEl.querySelector(".ss-clip-context-menu-shortcut")?.textContent).toBe("Del");
		});
	});

	describe("clicking Delete", () => {
		it("calls edit.deleteClip with the right-clicked clip's indices and closes the menu", () => {
			const { tracksContainer, mockEdit, getDeleteItem, getMenuEl } = setup(true);
			const clip = createClipEl(3, 7);
			tracksContainer.appendChild(clip);

			rightClick(clip);
			getDeleteItem()!.click();

			expect(mockEdit.deleteClip).toHaveBeenCalledWith(3, 7);
			expect(getMenuEl()).toBeNull();
		});

		it("does not call deleteClip when the item is disabled", () => {
			const { tracksContainer, mockEdit, getDeleteItem } = setup(false);
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);
			// Browser blocks click on disabled buttons; the click event never reaches handlers.
			getDeleteItem()!.click();

			expect(mockEdit.deleteClip).not.toHaveBeenCalled();
		});
	});

	describe("dismissal", () => {
		it("closes on Escape", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);
			expect(getMenuEl()).toBeTruthy();

			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

			expect(getMenuEl()).toBeNull();
		});

		it("closes when a pointerdown lands outside the menu", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);
			expect(getMenuEl()).toBeTruthy();

			const outside = document.createElement("div");
			document.body.appendChild(outside);
			outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

			expect(getMenuEl()).toBeNull();
		});

		it("stays open when a pointerdown lands inside the menu", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);
			const menuEl = getMenuEl()!;

			menuEl.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

			expect(getMenuEl()).toBeTruthy();
		});

		it("closes on window resize", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);

			window.dispatchEvent(new Event("resize"));

			expect(getMenuEl()).toBeNull();
		});

		it("closes when the tracks container scrolls", () => {
			const { tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);

			tracksContainer.dispatchEvent(new Event("scroll", { bubbles: false }));

			expect(getMenuEl()).toBeNull();
		});
	});

	describe("showAt() programmatic API", () => {
		it("opens the menu for the given clip", () => {
			const { menu, getMenuEl, getDeleteItem, mockEdit } = setup();

			menu.showAt(100, 100, 2, 4);

			expect(getMenuEl()).toBeTruthy();
			expect(getDeleteItem()).toBeTruthy();
			// Verify the right indices were used
			getDeleteItem()!.click();
			expect(mockEdit.deleteClip).toHaveBeenCalledWith(2, 4);
		});

		it("toggles closed when called twice for the same clip", () => {
			const { menu, getMenuEl } = setup();

			menu.showAt(100, 100, 0, 0);
			expect(getMenuEl()).toBeTruthy();

			menu.showAt(100, 100, 0, 0);
			expect(getMenuEl()).toBeNull();
		});

		it("switches to the new clip when called for a different one", () => {
			const { menu, getMenuEl, getDeleteItem, mockEdit } = setup();

			menu.showAt(100, 100, 0, 0);
			expect(getMenuEl()).toBeTruthy();

			menu.showAt(200, 200, 1, 0);
			expect(getMenuEl()).toBeTruthy();

			getDeleteItem()!.click();
			expect(mockEdit.deleteClip).toHaveBeenLastCalledWith(1, 0);
		});
	});

	describe("dispose", () => {
		it("removes any open menu", () => {
			const { menu, tracksContainer, getMenuEl } = setup();
			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);

			rightClick(clip);
			expect(getMenuEl()).toBeTruthy();

			menu.dispose();

			expect(getMenuEl()).toBeNull();
		});

		it("stops listening for contextmenu after dispose", () => {
			const { menu, tracksContainer, getMenuEl } = setup();
			menu.dispose();

			const clip = createClipEl(0, 0);
			tracksContainer.appendChild(clip);
			rightClick(clip);

			expect(getMenuEl()).toBeNull();
		});
	});
});
