import { TransitionPresetBuilder } from "@animations/transition-preset-builder";
import { sec } from "@core/timing/types";
import type { ResolvedClip } from "@schemas";

const build = (transition: ResolvedClip["transition"]) =>
	new TransitionPresetBuilder({
		id: "clip-1",
		asset: { type: "image", src: "https://example.com/a.png" },
		start: sec(0),
		length: sec(5),
		transition
	}).buildRelative();

/** A preset point; `at` makes `value` relative to the curve there. */
const point = (time: number, value: number, interpolation: "bezier" | "linear", at?: number) => ({ time, value, interpolation, at });

describe("TransitionPresetBuilder", () => {
	it.each([
		["slideLeftSlow", 1],
		["slideLeft", 0.5],
		["slideLeftFast", 0.25],
		["carouselUpSlow", 1],
		["carouselUpFast", 0.25],
		["fadeSlow", 2],
		["fadeFast", 0.5],
		["zoom", 0.4],
		["shuffleTopRight", 1],
		["shuffleTopRightSlow", 2],
		["shuffleTopRightFast", 0.5]
	])("runs %s for the render's %s seconds", (name, length) => {
		const { in: phase } = build({ in: name as never });
		const [edge, inner] = [...phase.offsetXKeyframes, ...phase.offsetYKeyframes, ...phase.opacityKeyframes, ...phase.rotationKeyframes];

		expect(inner.time - edge.time).toBe(length);
	});

	it.each([
		["shuffleBottomLeft", 17, -1.6, 0.5],
		["shuffleBottomRight", -17, 2.6, 0.5],
		["shuffleTopLeft", -17, -1.6, 0.5],
		["shuffleTopRight", 17, 2.6, 0.5],
		["shuffleLeftBottom", -25, 0.5, 3.6],
		["shuffleLeftTop", 25, 0.5, -2.6],
		["shuffleRightBottom", 25, 0.5, 3.6],
		["shuffleRightTop", -25, 0.5, -2.6]
	])("swings %s by %s degrees about the render's origin", (name, angle, x, y) => {
		const { in: phaseIn, out: phaseOut } = build({ in: name as never, out: name as never });

		expect(phaseIn.rotationKeyframes).toEqual([point(0, angle, "bezier", 1), point(1, 0, "bezier", 1)]);
		expect(phaseOut.rotationKeyframes).toEqual([point(4, 0, "bezier", 4), point(5, angle, "bezier", 4)]);
		expect(phaseIn.originXKeyframes).toEqual([point(0, x, "bezier")]);
		expect(phaseIn.originYKeyframes).toEqual([point(0, y, "bezier")]);
		expect(phaseOut.originXKeyframes).toEqual([point(4, x, "bezier")]);
		expect(phaseOut.originYKeyframes).toEqual([point(4, y, "bezier")]);
	});

	it("grows shuffles by half at the clip's edge without fading them", () => {
		const { in: phaseIn, out: phaseOut } = build({ in: "shuffleLeftTop", out: "shuffleLeftTop" });

		expect(phaseIn.scaleKeyframes).toEqual([point(0, 0.5, "bezier", 0), point(1, 0, "bezier", 1)]);
		expect(phaseOut.scaleKeyframes).toEqual([point(4, 0, "bezier", 4), point(5, 0.5, "bezier", 5)]);
		expect([...phaseIn.opacityKeyframes, ...phaseOut.opacityKeyframes]).toEqual([]);
	});

	it("fades from nothing to the opacity where the fade meets the clip, along the render's default curve", () => {
		const { in: fadeIn, out: fadeOut } = build({ in: "fade", out: "fade" });

		expect(fadeIn.opacityKeyframes).toEqual([point(0, 0, "bezier"), point(1, 0, "bezier", 1)]);
		expect(fadeOut.opacityKeyframes).toEqual([point(4, 0, "bezier", 4), point(5, 0, "bezier")]);
	});

	it("moves slides linearly on the way in and along the default curve on the way out", () => {
		const { in: slideIn, out: slideOut } = build({ in: "slideLeft", out: "slideLeft" });

		expect(slideIn.offsetXKeyframes).toEqual([point(0, 0.025, "bezier", 0), point(0.5, 0, "linear", 0.5)]);
		expect(slideOut.offsetXKeyframes).toEqual([point(4.5, 0, "linear", 4.5), point(5, -0.025, "bezier", 5)]);
		expect(slideIn.opacityKeyframes).toEqual([point(0, 0, "bezier"), point(0.5, 0, "bezier", 0.5)]);
	});

	it.each([
		["slideUp", -0.025, 0.025],
		["slideDown", 0.025, -0.025],
		["carouselUp", -1.05, 1.1],
		["carouselDown", 1.05, -1.1]
	])("moves %s the way its name says (offset y points up)", (name, inEdge, outEdge) => {
		const { in: phaseIn, out: phaseOut } = build({ in: name as never, out: name as never });

		expect(phaseIn.offsetYKeyframes[0]).toMatchObject({ time: 0, value: inEdge });
		expect(phaseOut.offsetYKeyframes[1]).toMatchObject({ time: 5, value: outEdge });
	});

	it("eases carousels out along the default curve", () => {
		expect(build({ out: "carouselLeft" }).out.offsetXKeyframes).toEqual([point(4.5, 0, "linear", 4.5), point(5, -1, "bezier", 5)]);
	});

	it("zooms by adding the render's distance to the scale, linearly in and along the default curve out", () => {
		const { in: zoomIn, out: zoomOut } = build({ in: "zoom", out: "zoom" });

		expect(zoomIn.scaleKeyframes).toEqual([point(0, 9, "bezier", 0), point(0.4, 0, "linear", 0.4)]);
		expect(zoomOut.scaleKeyframes).toEqual([point(4.6, 0, "linear", 4.6), point(5, 9, "bezier", 5)]);
		expect(zoomIn.opacityKeyframes.map(({ interpolation }) => interpolation)).toEqual(["bezier", "bezier"]);
	});

	it("blurs zooms by 5 pixels at the clip's edge", () => {
		const { in: zoomIn, out: zoomOut } = build({ in: "zoom", out: "zoom" });

		expect(zoomIn.blurKeyframes).toEqual([point(0, 5, "bezier"), point(0.4, 0, "bezier", 0.4)]);
		expect(zoomOut.blurKeyframes).toEqual([point(4.6, 0, "bezier", 4.6), point(5, 5, "bezier")]);
	});

	it("eases reveals and wipes along the default curve", () => {
		expect(build({ in: "reveal" }).in.maskXKeyframes).toEqual([point(0, 0, "bezier"), point(1, 0, "bezier", 1)]);
		expect(build({ in: "wipeLeft" }).in.brightnessKeyframes).toEqual([point(0, 1, "bezier"), point(1, 0, "bezier", 1)]);
	});
});
