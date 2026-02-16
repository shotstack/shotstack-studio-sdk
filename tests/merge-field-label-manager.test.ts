/**
 * @jest-environment jsdom
 */
/* eslint-disable import/first, max-classes-per-file */

/**
 * MergeFieldLabelManager Tests
 *
 * Tests the manager that scans toolbar containers for [data-merge-path] annotated
 * elements, replaces them with MergeFieldLabel components, and keeps state in sync
 * with document merge field bindings. Covers:
 * 1. init() scans and replaces annotated elements
 * 2. init() is no-op when container is null
 * 3. sync() updates label states from document bindings
 * 4. sync() computes compatible fields
 * 5. Bind callback calls applyMergeField (new field)
 * 6. Bind callback calls applyMergeField (existing compatible field)
 * 7. Bind callback rejects incompatible existing field
 * 8. Clear callback calls removeMergeField
 * 9. dispose() cleans up all labels
 * 10. setControlDisabled disables sibling inputs when bound
 */

// Mock pixi.js before any imports that use it
jest.mock("pixi.js", () => ({}));

jest.mock("../src/components/canvas/players/player", () => ({
	Player: class MockPlayer {},
	PlayerType: {}
}));

jest.mock("../src/core/shotstack-edit", () => ({
	ShotstackEdit: class MockShotstackEdit {}
}));

jest.mock("../src/core/edit-session", () => ({}));

import { MergeFieldLabelManager } from "@core/ui/merge-field-label-manager";
import type { MergeFieldLabelHost } from "@core/ui/merge-field-label-manager";
import type { MergeField } from "@core/merge/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createField(name: string, defaultValue: string): MergeField {
	return { name, defaultValue };
}

/**
 * Build a container with [data-merge-path] annotated labels inside toolbar section structure.
 */
function buildContainer(...labels: Array<{ path: string; prefix: string; text: string }>): HTMLDivElement {
	const container = document.createElement("div");
	labels.forEach(({ path, prefix, text }) => {
		const section = document.createElement("div");
		section.className = "ss-toolbar-popup-section";

		const label = document.createElement("span");
		label.dataset["mergePath"] = path;
		label.dataset["mergePrefix"] = prefix;
		label.className = "ss-toolbar-popup-header";
		label.textContent = text;
		section.appendChild(label);

		const row = document.createElement("div");
		row.className = "ss-toolbar-popup-row";
		const input = document.createElement("input");
		input.type = "range";
		row.appendChild(input);
		section.appendChild(row);

		container.appendChild(section);
	});
	return container;
}

function createMockHost(container: HTMLDivElement | null, overrides: Partial<MergeFieldLabelHost> = {}): MergeFieldLabelHost {
	// Plain object (no ShotstackEdit prototype) — simulates cross-bundle scenario where
	// instanceof fails but duck typing via "mergeFields" in edit succeeds.
	const mockEdit = {
		getResolvedClipById: jest.fn(() => ({ opacity: 1, scale: 1, asset: { type: "image", src: "https://example.com/img.jpg" } })),
		getMergeFieldForProperty: jest.fn(() => null),
		isValueCompatibleWithClipProperty: jest.fn(() => true),
		applyMergeField: jest.fn(() => Promise.resolve()),
		removeMergeField: jest.fn(() => Promise.resolve()),
		mergeFields: {
			getAll: jest.fn(() => []),
			get: jest.fn(),
			generateUniqueName: jest.fn((prefix: string) => prefix)
		}
	};

	return {
		container,
		edit: mockEdit,
		getSelectedClipId: jest.fn(() => "clip-1"),
		syncState: jest.fn(),
		...overrides
	};
}

function getEdit(host: MergeFieldLabelHost) {
	return host.edit as unknown as {
		getResolvedClipById: jest.Mock;
		getMergeFieldForProperty: jest.Mock;
		isValueCompatibleWithClipProperty: jest.Mock;
		applyMergeField: jest.Mock;
		removeMergeField: jest.Mock;
		mergeFields: {
			getAll: jest.Mock;
			get: jest.Mock;
			generateUniqueName: jest.Mock;
		};
	};
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MergeFieldLabelManager", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	// ─── init() ───────────────────────────────────────────────────────────

	it("scans [data-merge-path] elements and creates MergeFieldLabel components", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" }, { path: "scale", prefix: "SCALE", text: "Scale" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const manager = new MergeFieldLabelManager(host);

		manager.init();

		expect(manager.hasLabels).toBe(true);

		// Original annotated spans should be replaced
		expect(container.querySelectorAll("[data-merge-path]").length).toBe(0);

		// Should have merge label components
		expect(container.querySelectorAll(".ss-merge-label").length).toBe(2);
	});

	it("is no-op when container is null", () => {
		const host = createMockHost(null);
		const manager = new MergeFieldLabelManager(host);

		manager.init();

		expect(manager.hasLabels).toBe(false);
	});

	it("preserves original CSS class on the mount point", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const manager = new MergeFieldLabelManager(host);

		manager.init();

		// The mount point should have the original class
		const mountPoint = container.querySelector(".ss-toolbar-popup-header");
		expect(mountPoint).toBeTruthy();
	});

	// ─── sync() ───────────────────────────────────────────────────────────

	it("updates label states from document bindings (bound)", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.getMergeFieldForProperty.mockReturnValue("FADE");
		edit.mergeFields.getAll.mockReturnValue([createField("FADE", "0.5")]);

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		// Label should be in bound state
		const boundLabel = container.querySelector(".ss-merge-label--bound");
		expect(boundLabel).toBeTruthy();

		const badge = container.querySelector(".ss-merge-label__bound-name");
		expect(badge).toBeTruthy();
		expect(badge!.textContent).toContain("{{ FADE }}");
	});

	it("updates label states from document bindings (unbound)", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.getMergeFieldForProperty.mockReturnValue(null);
		edit.mergeFields.getAll.mockReturnValue([]);

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		expect(container.querySelector(".ss-merge-label--bound")).toBeNull();
	});

	it("computes compatible fields and passes to label", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const fields = [createField("FADE", "0.5"), createField("TITLE", "Hello")];
		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.mergeFields.getAll.mockReturnValue(fields);
		// FADE is compatible, TITLE is not
		edit.isValueCompatibleWithClipProperty.mockImplementation((_clipId: string, _path: string, value: string) => !Number.isNaN(Number(value)));

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		// Open dropdown to see rendered list
		const iconBtn = container.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
		iconBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const fieldBtns = container.querySelectorAll(".ss-merge-label__field");
		expect(fieldBtns.length).toBe(2);

		// FADE should be compatible (no disabled class)
		expect(fieldBtns[0].classList.contains("ss-merge-label__field--disabled")).toBe(false);
		// TITLE should be incompatible (disabled class)
		expect(fieldBtns[1].classList.contains("ss-merge-label__field--disabled")).toBe(true);
	});

	it("bails out of sync when clipId is null", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		(host.getSelectedClipId as jest.Mock).mockReturnValue(null);

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		// Should not crash and should not show bound state
		expect(container.querySelector(".ss-merge-label--bound")).toBeNull();
	});

	// ─── wireBindCallback ─────────────────────────────────────────────────

	it("bind callback creates new field via applyMergeField", async () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.mergeFields.get.mockReturnValue(undefined); // new field
		edit.mergeFields.generateUniqueName.mockReturnValue("OPACITY");

		const manager = new MergeFieldLabelManager(host);
		manager.init();

		// Open dropdown and click "Create & Select"
		const iconBtn = container.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
		iconBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const createBtn = container.querySelector(".ss-merge-label__create") as HTMLButtonElement;
		createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		await Promise.resolve(); // allow async

		expect(edit.applyMergeField).toHaveBeenCalledWith("clip-1", "opacity", "OPACITY", "1");
	});

	it("bind callback uses existing field value for compatible field", async () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const existingField = createField("FADE", "0.5");
		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.mergeFields.getAll.mockReturnValue([existingField]);
		edit.mergeFields.get.mockReturnValue(existingField);
		edit.isValueCompatibleWithClipProperty.mockReturnValue(true);

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		// Open dropdown and click the existing field
		const iconBtn = container.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
		iconBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const fieldBtn = container.querySelector(".ss-merge-label__field") as HTMLButtonElement;
		fieldBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		await Promise.resolve();

		expect(edit.applyMergeField).toHaveBeenCalledWith("clip-1", "opacity", "FADE", "0.5");
	});

	it("bind callback rejects incompatible existing field", async () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const incompatibleField = createField("TITLE", "Hello");
		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.mergeFields.get.mockReturnValue(incompatibleField);
		edit.isValueCompatibleWithClipProperty.mockReturnValue(false);

		const manager = new MergeFieldLabelManager(host);
		manager.init();

		// Simulate a bind attempt with the incompatible field name
		// (This can happen if a test or code path bypasses the dropdown filtering)
		// We'll directly trigger via the create button using the field name as prefix
		// Actually, the incompatible field won't have a click handler in the dropdown,
		// but wireBindCallback still guards against it.
		// Let's test by triggering onBind directly through the "Create & Select" path
		// where the nameOrPrefix matches an existing field.
		// First make the mock return the incompatible field for "TITLE"
		edit.mergeFields.get.mockImplementation((name: string) => (name === "TITLE" ? incompatibleField : undefined));

		// Mount a label with namePrefix "TITLE" to simulate the bind path
		const container2 = buildContainer({ path: "opacity", prefix: "TITLE", text: "Opacity" });
		document.body.appendChild(container2);
		const host2 = createMockHost(container2, {
			edit: host.edit
		});
		(host2.getSelectedClipId as jest.Mock).mockReturnValue("clip-1");
		const manager2 = new MergeFieldLabelManager(host2);
		manager2.init();

		// Open dropdown and click Create & Select (namePrefix = "TITLE")
		const iconBtn = container2.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
		iconBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const createBtn = container2.querySelector(".ss-merge-label__create") as HTMLButtonElement;
		createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		await Promise.resolve();

		// applyMergeField should NOT have been called because the field is incompatible
		expect(edit.applyMergeField).not.toHaveBeenCalled();
	});

	// ─── wireClearCallback ────────────────────────────────────────────────

	it("clear callback calls removeMergeField with restore value", async () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);
		const boundField = createField("FADE", "0.5");
		edit.getMergeFieldForProperty.mockReturnValue("FADE");
		edit.mergeFields.getAll.mockReturnValue([boundField]);
		edit.mergeFields.get.mockReturnValue(boundField);

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		// Open dropdown and click Clear
		const iconBtn = container.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
		iconBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const clearBtn = container.querySelector(".ss-merge-label__clear") as HTMLButtonElement;
		expect(clearBtn).toBeTruthy();
		clearBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		await Promise.resolve();

		expect(edit.removeMergeField).toHaveBeenCalledWith("clip-1", "opacity", "0.5");
	});

	// ─── setControlDisabled ───────────────────────────────────────────────

	it("disables sibling inputs when field is bound", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.getMergeFieldForProperty.mockReturnValue("FADE");
		edit.mergeFields.getAll.mockReturnValue([createField("FADE", "0.5")]);

		const manager = new MergeFieldLabelManager(host);
		manager.init();
		manager.sync();

		// The input in the same section should be disabled
		const input = container.querySelector("input") as HTMLInputElement;
		expect(input.disabled).toBe(true);
	});

	it("re-enables sibling inputs when field is unbound", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);

		const manager = new MergeFieldLabelManager(host);
		manager.init();

		// First sync as bound
		edit.getMergeFieldForProperty.mockReturnValue("FADE");
		edit.mergeFields.getAll.mockReturnValue([createField("FADE", "0.5")]);
		manager.sync();

		const input = container.querySelector("input") as HTMLInputElement;
		expect(input.disabled).toBe(true);

		// Then sync as unbound
		edit.getMergeFieldForProperty.mockReturnValue(null);
		manager.sync();

		expect(input.disabled).toBe(false);
	});

	// ─── dispose() ────────────────────────────────────────────────────────

	it("disposes all labels and resets state", () => {
		const container = buildContainer({ path: "opacity", prefix: "OPACITY", text: "Opacity" }, { path: "scale", prefix: "SCALE", text: "Scale" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const manager = new MergeFieldLabelManager(host);
		manager.init();

		expect(manager.hasLabels).toBe(true);

		manager.dispose();

		expect(manager.hasLabels).toBe(false);
	});

	// ─── propertyDefaults ─────────────────────────────────────────────────

	it("uses propertyDefaults when clip has no current value for property", async () => {
		const container = buildContainer({ path: "asset.volume", prefix: "VOLUME", text: "Volume" });
		document.body.appendChild(container);

		const host = createMockHost(container);
		const edit = getEdit(host);
		edit.getResolvedClipById.mockReturnValue({ opacity: 1, asset: { type: "image", src: "test.jpg" } }); // no volume
		edit.mergeFields.get.mockReturnValue(undefined); // new field
		edit.mergeFields.generateUniqueName.mockReturnValue("VOLUME");

		const defaults = { "asset.volume": "1" };
		const manager = new MergeFieldLabelManager(host, defaults);
		manager.init();

		// Open dropdown and click "Create & Select"
		const iconBtn = container.querySelector(".ss-merge-label__icon") as HTMLButtonElement;
		iconBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		const createBtn = container.querySelector(".ss-merge-label__create") as HTMLButtonElement;
		createBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		await Promise.resolve();

		// Should use the default value "1" from propertyDefaults
		expect(edit.applyMergeField).toHaveBeenCalledWith("clip-1", "asset.volume", "VOLUME", "1");
	});
});
