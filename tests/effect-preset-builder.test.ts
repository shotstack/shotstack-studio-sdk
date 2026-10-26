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

describe("EffectPresetBuilder", () => {
	it.each([
		["slideLeft", 0.08],
		["slideLeftSlow", 0.03],
		["slideLeftFast", 0.12]
	])("pans %s by the render's %s of the frame, enlarged to cover it", (effect, distance) => {
		const { offsetXKeyframes, scaleKeyframes } = build(effect);

		expect(offsetXKeyframes).toEqual([{ from: distance, to: -distance, start: 0, length: 5 }]);
		expect(scaleKeyframes[0]).toMatchObject({ from: 1 + 2 * distance, to: 1 + 2 * distance });
	});

	it.each([
		["slideUp", -0.08, 0.08],
		["slideDown", 0.08, -0.08]
	])("pans %s the way its name says (offset y points up)", (effect, from, to) => {
		expect(build(effect).offsetYKeyframes).toEqual([{ from, to, start: 0, length: 5 }]);
	});

	it("enlarges narrow media by the same amount whatever its fit", () => {
		const { scaleKeyframes } = build("slideLeft", { width: 1080, height: 1920 }, "contain");

		expect(scaleKeyframes[0]).toMatchObject({ from: 1.16, to: 1.16 });
	});

	it.each(["crop", "contain"] as const)("pans the overflow of media fitted to the frame's height (%s)", fit => {
		const { offsetXKeyframes, scaleKeyframes } = build("slideRight", { width: 4000, height: 1000 }, fit);

		expect(offsetXKeyframes).toEqual([{ from: -0.625, to: 0.625, start: 0, length: 5 }]);
		expect(scaleKeyframes).toEqual([]);
	});
});
