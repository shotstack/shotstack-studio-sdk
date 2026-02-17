/**
 * @jest-environment jsdom
 */

/**
 * MergeFieldLabel Component Tests
 *
 * Tests the interactive label component that supports merge field binding
 * via a { } icon and dropdown. Covers:
 * 1. Rendering — label text, icon button, dropdown hidden by default
 * 2. Dropdown toggle — icon click opens/closes dropdown
 * 3. Outside click closes dropdown
 * 4. "Create & Select" fires onBind with namePrefix
 * 5. setFields populates dropdown items
 * 6. Compatible field click fires onBind with field name
 * 7. Incompatible fields shown as disabled, no click handler
 * 8. setState(true, name) adds bound class + badge
 * 9. setState(false) removes bound state
 * 10. Clear button appears when bound, fires onClear
 * 11. Clear button absent when unbound
 * 12. dispose cleans up callbacks
 */

import { MergeFieldLabel } from "@core/ui/primitives/MergeFieldLabel";
import type { MergeField } from "@core/merge/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mountLabel(config = { label: "Opacity", propertyPath: "opacity", namePrefix: "OPACITY" }): {
	label: MergeFieldLabel;
	parent: HTMLDivElement;
} {
	const label = new MergeFieldLabel(config);
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	label.mount(parent);
	return { label, parent };
}

function createField(name: string, defaultValue: string): MergeField {
	return { name, defaultValue };
}

function getDropdown(parent: HTMLDivElement): HTMLElement {
	return parent.querySelector(".ss-merge-label__dropdown") as HTMLElement;
}

function getIconBtn(parent: HTMLDivElement): HTMLButtonElement {
	return parent.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
}

function clickIcon(parent: HTMLDivElement): void {
	getIconBtn(parent).dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MergeFieldLabel", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	// ─── Rendering ────────────────────────────────────────────────────────

	it("renders label text and merge icon button", () => {
		const { parent } = mountLabel();

		const textEl = parent.querySelector(".ss-merge-label__text");
		expect(textEl).toBeTruthy();
		expect(textEl!.textContent).toBe("Opacity");

		const iconBtn = getIconBtn(parent);
		expect(iconBtn).toBeTruthy();
		expect(iconBtn.title).toBe("Merge field");
	});

	it("dropdown is hidden by default", () => {
		const { parent } = mountLabel();

		const dropdown = getDropdown(parent);
		expect(dropdown.style.display).toBe("none");
	});

	// ─── Dropdown Toggle ──────────────────────────────────────────────────

	it("clicking icon opens dropdown", () => {
		const { parent } = mountLabel();

		clickIcon(parent);

		const dropdown = getDropdown(parent);
		expect(dropdown.style.display).not.toBe("none");
	});

	it("clicking icon again closes dropdown", () => {
		const { parent } = mountLabel();

		clickIcon(parent); // open
		clickIcon(parent); // close

		const dropdown = getDropdown(parent);
		expect(dropdown.style.display).toBe("none");
	});

	it("clicking outside closes dropdown", () => {
		const { parent } = mountLabel();

		clickIcon(parent); // open
		expect(getDropdown(parent).style.display).not.toBe("none");

		// Click outside (jsdom doesn't have PointerEvent, use Event with type "pointerdown")
		document.dispatchEvent(new Event("pointerdown", { bubbles: true }));

		expect(getDropdown(parent).style.display).toBe("none");
	});

	// ─── Create & Select ──────────────────────────────────────────────────

	it("clicking 'Create & Select' fires onBind with namePrefix", () => {
		const { label, parent } = mountLabel();
		const bindSpy = jest.fn();
		label.onBind(bindSpy);

		clickIcon(parent); // open dropdown

		const createBtn = parent.querySelector(".ss-merge-label__create") as HTMLButtonElement;
		createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(bindSpy).toHaveBeenCalledWith("OPACITY");
		// Dropdown should close after create
		expect(getDropdown(parent).style.display).toBe("none");
	});

	// ─── Field List ───────────────────────────────────────────────────────

	it("setFields populates dropdown with field items", () => {
		const { label, parent } = mountLabel();
		const fields = [createField("FADE", "0.5"), createField("ZOOM", "1.2")];
		label.setFields(fields, new Set(["FADE", "ZOOM"]));

		clickIcon(parent); // open to trigger renderList

		const fieldButtons = parent.querySelectorAll(".ss-merge-label__field");
		expect(fieldButtons.length).toBe(2);

		const nameEls = parent.querySelectorAll(".ss-merge-label__field-name");
		expect(nameEls[0].textContent).toContain("FADE");
		expect(nameEls[1].textContent).toContain("ZOOM");

		const valueEls = parent.querySelectorAll(".ss-merge-label__field-value");
		expect(valueEls[0].textContent).toBe("0.5");
		expect(valueEls[1].textContent).toBe("1.2");
	});

	it("clicking a compatible field fires onBind with field name", () => {
		const { label, parent } = mountLabel();
		const bindSpy = jest.fn();
		label.onBind(bindSpy);

		label.setFields([createField("FADE", "0.5")], new Set(["FADE"]));

		clickIcon(parent);

		const fieldBtn = parent.querySelector(".ss-merge-label__field") as HTMLButtonElement;
		fieldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(bindSpy).toHaveBeenCalledWith("FADE");
		// Dropdown should close
		expect(getDropdown(parent).style.display).toBe("none");
	});

	it("incompatible fields are shown disabled with no click handler", () => {
		const { label, parent } = mountLabel();
		const bindSpy = jest.fn();
		label.onBind(bindSpy);

		label.setFields([createField("TITLE", "Hello")], new Set()); // empty compatible set

		clickIcon(parent);

		const fieldBtn = parent.querySelector(".ss-merge-label__field") as HTMLButtonElement;
		expect(fieldBtn.classList.contains("ss-merge-label__field--disabled")).toBe(true);
		expect(fieldBtn.title).toBe("Incompatible value type");

		// Clicking should NOT fire onBind
		fieldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(bindSpy).not.toHaveBeenCalled();
	});

	it("active field has active class when bound to it", () => {
		const { label, parent } = mountLabel();

		label.setState(true, "FADE");
		label.setFields([createField("FADE", "0.5")], new Set(["FADE"]));

		clickIcon(parent);

		const fieldBtn = parent.querySelector(".ss-merge-label__field") as HTMLButtonElement;
		expect(fieldBtn.classList.contains("ss-merge-label__field--active")).toBe(true);
	});

	// ─── Bound State ──────────────────────────────────────────────────────

	it("setState(true, fieldName) adds bound class and badge", () => {
		const { label, parent } = mountLabel();

		label.setState(true, "FADE");

		const mergeLabel = parent.querySelector(".ss-merge-label") as HTMLElement;
		expect(mergeLabel.classList.contains("ss-merge-label--bound")).toBe(true);

		const badge = parent.querySelector(".ss-merge-label__bound-name");
		expect(badge).toBeTruthy();
		expect(badge!.textContent).toContain("{{ FADE }}");
	});

	it("setState(false) removes bound class and badge", () => {
		const { label, parent } = mountLabel();

		// First set bound
		label.setState(true, "FADE");
		expect(parent.querySelector(".ss-merge-label--bound")).toBeTruthy();

		// Then unset
		label.setState(false);

		const mergeLabel = parent.querySelector(".ss-merge-label") as HTMLElement;
		expect(mergeLabel.classList.contains("ss-merge-label--bound")).toBe(false);
		expect(parent.querySelector(".ss-merge-label__bound-name")).toBeNull();
	});

	it("setState replaces previous badge when changing bound field", () => {
		const { label, parent } = mountLabel();

		label.setState(true, "FADE");
		label.setState(true, "ZOOM");

		const badges = parent.querySelectorAll(".ss-merge-label__bound-name");
		expect(badges.length).toBe(1);
		expect(badges[0].textContent).toContain("{{ ZOOM }}");
	});

	// ─── Clear Button ─────────────────────────────────────────────────────

	it("clear button appears when bound and fires onClear", () => {
		const { label, parent } = mountLabel();
		const clearSpy = jest.fn();
		label.onClear(clearSpy);

		label.setState(true, "FADE");
		label.setFields([createField("FADE", "0.5")], new Set(["FADE"]));

		clickIcon(parent);

		const clearBtn = parent.querySelector(".ss-merge-label__clear") as HTMLButtonElement;
		expect(clearBtn).toBeTruthy();
		expect(clearBtn.textContent).toBe("Clear");

		clearBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(clearSpy).toHaveBeenCalledTimes(1);
		// Dropdown should close
		expect(getDropdown(parent).style.display).toBe("none");
	});

	it("clear button is absent when not bound", () => {
		const { label, parent } = mountLabel();

		label.setState(false);
		label.setFields([createField("FADE", "0.5")], new Set(["FADE"]));

		clickIcon(parent);

		expect(parent.querySelector(".ss-merge-label__clear")).toBeNull();
	});

	// ─── Public API ───────────────────────────────────────────────────────

	it("getPropertyPath returns configured property path", () => {
		const { label } = mountLabel({ label: "Scale", propertyPath: "scale", namePrefix: "SCALE" });
		expect(label.getPropertyPath()).toBe("scale");
	});

	it("getNamePrefix returns configured name prefix", () => {
		const { label } = mountLabel({ label: "Scale", propertyPath: "scale", namePrefix: "MEDIA_SCALE" });
		expect(label.getNamePrefix()).toBe("MEDIA_SCALE");
	});

	it("isBound reflects current state", () => {
		const { label } = mountLabel();

		expect(label.isBound()).toBe(false);

		label.setState(true, "FADE");
		expect(label.isBound()).toBe(true);

		label.setState(false);
		expect(label.isBound()).toBe(false);
	});

	// ─── Dispose ──────────────────────────────────────────────────────────

	it("dispose clears callbacks and removes DOM", () => {
		const { label } = mountLabel();
		label.onBind(jest.fn());
		label.onClear(jest.fn());

		label.dispose();

		// Container should be removed
		expect(label.getContainer()).toBeNull();
		expect(label.isMounted()).toBe(false);
	});
});
