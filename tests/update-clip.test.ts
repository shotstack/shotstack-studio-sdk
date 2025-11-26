import { describe, it, expect } from "@jest/globals";
import { deepMerge } from "../src/core/shared/utils";

describe("deepMerge", () => {
	it("should merge simple objects", () => {
		const target = { a: 1 };
		const source = { b: 2 };
		const result = deepMerge(target, source);
		expect(result).toEqual({ a: 1, b: 2 });
	});

	it("should merge nested objects", () => {
		const target = { a: { x: 1 } };
		const source = { a: { y: 2 } };
		const result = deepMerge(target, source);
		expect(result).toEqual({ a: { x: 1, y: 2 } });
	});

	it("should overwrite primitive values", () => {
		const target = { a: 1 };
		const source = { a: 2 };
		const result = deepMerge(target, source);
		expect(result).toEqual({ a: 2 });
	});

	it("should replace arrays instead of merging them", () => {
		const target = { a: [1, 2] };
		const source = { a: [3, 4] };
		const result = deepMerge(target, source);
		expect(result).toEqual({ a: [3, 4] });
	});

	it("should handle null values", () => {
		const target = { a: 1 };
		const source = { a: null };
		const result = deepMerge(target, source as any);
		expect(result).toEqual({ a: null });
	});

	it("should clone source objects to prevent shared references", () => {
		const target = { a: { x: 1 } };
		const source = { b: { y: 2 } };
		const result = deepMerge(target, source);

		// Modify the result
		result.b.y = 999;

		// Source should remain unchanged
		expect(source.b.y).toBe(2);
	});

	it("should prevent prototype pollution via __proto__", () => {
		const target = {};
		const maliciousSource = JSON.parse('{"__proto__": {"polluted": true}}');
		const result = deepMerge(target, maliciousSource);

		// Check that prototype was not polluted
		expect((result as any).polluted).toBeUndefined();
		expect((Object.prototype as any).polluted).toBeUndefined();
	});

	it("should prevent prototype pollution via constructor", () => {
		const target = {};
		const maliciousSource = { constructor: { prototype: { polluted: true } } };
		const result = deepMerge(target, maliciousSource as any);

		// Check that constructor was not merged
		expect((result as any).constructor).toBe(Object);
	});

	it("should have correct TypeScript return type (T & U)", () => {
		const target = { a: 1 };
		const source = { b: 2 };
		const result = deepMerge(target, source);

		// TypeScript should recognize both properties
		expect(result.a).toBe(1);
		expect(result.b).toBe(2);
	});
});

// Since we cannot easily mock the entire Edit class and its Pixi dependencies in this environment without significant setup,
// we will verify the logic that updateClip uses: structuredClone + deepMerge + Object.assign.
describe("updateClip Logic", () => {
	it("should correctly update clip configuration using the same logic as updateClip", () => {
		const initialConfig = {
			asset: { type: "video", src: "video.mp4" },
			start: 0,
			length: 5,
			offset: { x: 0, y: 0 },
			transform: { rotate: { angle: 0 } },
			scale: 1
		};

		const updates = {
			offset: { x: 0.5 },
			transform: { rotate: { angle: 90 } },
			scale: 2
		};

		const currentConfig = structuredClone(initialConfig);

		// Logic from updateClip
		// Deep merge the updates into the current configuration
		const mergedConfig = deepMerge(currentConfig, updates);

		expect(mergedConfig.offset).toEqual({ x: 0.5, y: 0 });
		expect(mergedConfig.transform).toEqual({ rotate: { angle: 90 } });
		expect(mergedConfig.scale).toBe(2);
		expect(mergedConfig.asset).toEqual(initialConfig.asset);
	});

	it("should handle missing initial nested properties by using defaults", () => {
		const initialConfig = {
			asset: { type: "video", src: "video.mp4" },
			start: 0,
			length: 5
			// offset and transform are undefined
		};

		const updates = {
			offset: { x: 0.5 },
			transform: { rotate: { angle: 45 } }
		};

		const currentConfig = structuredClone(initialConfig) as any;

		// Logic from updateClip
		const mergedConfig = deepMerge(currentConfig, updates);

		expect(mergedConfig.offset).toEqual({ x: 0.5 });
		expect(mergedConfig.transform).toEqual({ rotate: { angle: 45 } });
	});

	it("should handle deeply nested properties generically", () => {
		const initialConfig = {
			asset: { type: "video", src: "video.mp4" },
			start: 0,
			length: 5,
			someDeepProp: {
				level1: {
					level2: {
						val: 1,
						keep: 2
					}
				}
			}
		};

		const updates = {
			someDeepProp: {
				level1: {
					level2: {
						val: 3
					}
				}
			}
		};

		const currentConfig = structuredClone(initialConfig);
		const mergedConfig = deepMerge(currentConfig, updates);

		expect(mergedConfig.someDeepProp.level1.level2.val).toBe(3);
		expect(mergedConfig.someDeepProp.level1.level2.keep).toBe(2);
	});
});
