/**
 * setNestedValue / getNestedValue Unit Tests
 *
 * Tests the utility functions that read/write dot-notation paths on objects.
 * The critical behaviour for merge fields is that setNestedValue auto-creates
 * missing intermediate objects (e.g. asset.border.width on a clip with no border).
 */

import { setNestedValue, getNestedValue } from "@core/shared/utils";

describe("setNestedValue", () => {
	it("sets a depth-1 property", () => {
		const obj = { opacity: 1 };
		setNestedValue(obj, "opacity", 0.5);
		expect(obj.opacity).toBe(0.5);
	});

	it("sets a depth-2 property on an existing intermediate", () => {
		const obj = { asset: { src: "old.jpg" } };
		setNestedValue(obj, "asset.src", "new.jpg");
		expect(obj.asset.src).toBe("new.jpg");
	});

	it("creates a missing intermediate at depth 3", () => {
		const obj: Record<string, unknown> = { asset: { type: "rich-text" } };
		setNestedValue(obj, "asset.border.width", 5);

		const asset = obj["asset"] as Record<string, unknown>;
		const border = asset["border"] as Record<string, unknown>;
		expect(border["width"]).toBe(5);
	});

	it("creates multiple missing intermediates", () => {
		const obj: Record<string, unknown> = { a: {} };
		setNestedValue(obj, "a.b.c.d", 1);

		const a = obj["a"] as Record<string, unknown>;
		const b = a["b"] as Record<string, unknown>;
		const c = b["c"] as Record<string, unknown>;
		expect(c["d"]).toBe(1);
	});

	it("preserves existing sibling properties on the intermediate", () => {
		const obj = { asset: { type: "rich-text", border: { color: "#000" } } };
		setNestedValue(obj, "asset.border.width", 5);
		expect((obj.asset.border as Record<string, unknown>)["width"]).toBe(5);
		expect(obj.asset.border.color).toBe("#000");
		expect(obj.asset.type).toBe("rich-text");
	});

	it("is a no-op when root is null", () => {
		expect(() => setNestedValue(null, "a.b", 1)).not.toThrow();
	});

	it("is a no-op when root is undefined", () => {
		expect(() => setNestedValue(undefined, "a.b", 1)).not.toThrow();
	});

	it("overwrites a primitive intermediate with an object (lodash.set behaviour)", () => {
		const obj: Record<string, unknown> = { a: 42 };
		setNestedValue(obj, "a.b.c", 1);

		// Primitive is replaced with an object to allow the nested write
		const a = obj["a"] as Record<string, unknown>;
		expect(typeof a).toBe("object");
		expect((a["b"] as Record<string, unknown>)["c"]).toBe(1);
	});

	it("overwrites a null intermediate with an object", () => {
		const obj: Record<string, unknown> = { a: { b: null } };
		setNestedValue(obj, "a.b.c", 1);

		const a = obj["a"] as Record<string, unknown>;
		const b = a["b"] as Record<string, unknown>;
		expect(b["c"]).toBe(1);
	});

	it("overwrites an undefined intermediate with an object", () => {
		const obj: Record<string, unknown> = { a: { b: undefined } };
		setNestedValue(obj, "a.b.c", 1);

		const a = obj["a"] as Record<string, unknown>;
		const b = a["b"] as Record<string, unknown>;
		expect(b["c"]).toBe(1);
	});
});

describe("getNestedValue", () => {
	it("reads a depth-1 property", () => {
		expect(getNestedValue({ opacity: 0.5 }, "opacity")).toBe(0.5);
	});

	it("reads a depth-2 property", () => {
		expect(getNestedValue({ asset: { src: "img.jpg" } }, "asset.src")).toBe("img.jpg");
	});

	it("returns undefined for a missing intermediate", () => {
		expect(getNestedValue({ asset: { type: "rich-text" } }, "asset.border.width")).toBeUndefined();
	});

	it("returns undefined for a completely missing path", () => {
		expect(getNestedValue({}, "a.b.c")).toBeUndefined();
	});

	it("returns undefined when root is null", () => {
		expect(getNestedValue(null, "a")).toBeUndefined();
	});
});
