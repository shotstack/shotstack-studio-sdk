import { EffectPresetBuilder } from "@animations/effect-preset-builder";
import { sec } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

const EDIT = { width: 1920, height: 1080 };

const build = (effect: string, clipSize = EDIT, fit: ResolvedClip["fit"] = "crop") =>
	new EffectPresetBuilder({
		id: "clip-1",
		asset: { type: "image", src: "https://example.com/a.png" },
		start: sec(0),
		length: sec(5),
		fit,
		effect: effect as ResolvedClip["effect"]
	}).buildRelative(EDIT, clipSize);

/** The offsets a slide effect pans between, over the 5 s clip. */
const pan = (from: number, to: number) => [
	{ time: 0, value: from, interpolation: "linear" },
	{ time: 5, value: to, interpolation: "linear" }
];

describe("EffectPresetBuilder", () => {
	it.each([
		["slideLeft", 0.08],
		["slideLeftSlow", 0.03],
		["slideLeftFast", 0.12]
	])("pans %s by the render's %s of the frame, enlarged to cover it", (effect, distance) => {
		const { offsetXKeyframes, scaleKeyframes } = build(effect);

		expect(offsetXKeyframes).toEqual(pan(distance, -distance));
		expect(scaleKeyframes).toEqual([{ time: 0, value: 1 + 2 * distance, interpolation: "constant" }]);
	});

	it.each([
		["slideUp", -0.08, 0.08],
		["slideDown", 0.08, -0.08]
	])("pans %s the way its name says (offset y points up)", (effect, from, to) => {
		expect(build(effect).offsetYKeyframes).toEqual(pan(from, to));
	});

	it("enlarges narrow media by the same amount whatever its fit", () => {
		const { scaleKeyframes } = build("slideLeft", { width: 1080, height: 1920 }, "contain");

		expect(scaleKeyframes[0]).toMatchObject({ value: 1.16 });
	});

	it.each(["crop", "contain"] as const)("pans the overflow of media fitted to the frame's height (%s)", fit => {
		const { offsetXKeyframes, scaleKeyframes } = build("slideRight", { width: 4000, height: 1000 }, fit);

		expect(offsetXKeyframes).toEqual(pan(-0.625, 0.625));
		expect(scaleKeyframes).toEqual([]);
	});

	it.each([
		["zoomIn", 0, 0.3],
		["zoomInSlow", 0, 0.1],
		["zoomOutFast", 0.7, 0]
	])("zooms %s from the scale at the clip's start, adding %s then %s", (effect, from, to) => {
		const [first, last] = build(effect).scaleKeyframes;

		expect(first).toEqual({ time: 0, value: from, at: 0, interpolation: "linear" });
		expect(last).toMatchObject({ time: 5, at: 0, interpolation: "linear" });
		expect(last.value).toBeCloseTo(to);
	});
});
