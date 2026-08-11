import { hasKeyframedVisualProperty, isKeyframedValue } from "@core/shared/clip-utils";
import type { Clip } from "@schemas";

const tween = [{ from: 0, to: 1, start: 0, length: 1, interpolation: "linear" as const }];

function clip(overrides: Partial<Clip> = {}): Clip {
	return { asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 5, ...overrides } as Clip;
}

describe("isKeyframedValue", () => {
	it("accepts plain numbers as editable, including zero", () => {
		expect(isKeyframedValue(0)).toBe(false);
		expect(isKeyframedValue(0.5)).toBe(false);
		expect(isKeyframedValue(undefined)).toBe(false);
	});

	it("rejects keyframes and unresolved merge placeholders", () => {
		expect(isKeyframedValue(tween)).toBe(true);
		expect(isKeyframedValue("{{ MEDIA_OPACITY }}")).toBe(true);
	});
});

describe("hasKeyframedVisualProperty", () => {
	it("is false for a clip whose visual properties are all fixed or absent", () => {
		expect(hasKeyframedVisualProperty(clip())).toBe(false);
		expect(hasKeyframedVisualProperty(clip({ opacity: 0, scale: 1 }))).toBe(false);
	});

	it.each([
		["opacity", { opacity: tween }],
		["scale", { scale: tween }],
		["offset.x", { offset: { x: tween } }],
		["offset.y", { offset: { y: tween } }],
		["rotation", { transform: { rotate: { angle: tween } } }],
		["skew.x", { transform: { skew: { x: tween } } }],
		["skew.y", { transform: { skew: { y: tween } } }]
	])("is true when %s is keyframed", (_name, overrides) => {
		expect(hasKeyframedVisualProperty(clip(overrides as Partial<Clip>))).toBe(true);
	});

	it("ignores volume, which is asset-level and takes no part in preset composition", () => {
		expect(hasKeyframedVisualProperty(clip({ asset: { type: "video", src: "https://example.com/a.mp4", volume: tween } } as Partial<Clip>))).toBe(
			false
		);
	});
});
