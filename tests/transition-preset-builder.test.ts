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

const SMOOTH = { interpolation: "bezier", easing: "smooth" };

describe("TransitionPresetBuilder", () => {
	it.each([
		["slideLeftSlow", 1],
		["slideLeft", 0.5],
		["slideLeftFast", 0.25],
		["carouselUpSlow", 1],
		["carouselUpFast", 0.25],
		["fadeSlow", 2],
		["fadeFast", 0.5],
		["zoom", 0.4]
	])("runs %s for the render's %s seconds", (name, length) => {
		const { in: phase } = build({ in: name as never });
		const [keyframe] = [...phase.offsetXKeyframes, ...phase.offsetYKeyframes, ...phase.opacityKeyframes];

		expect(keyframe.length).toBe(length);
	});

	it("eases fades with the render's default curve", () => {
		const { in: fadeIn, out: fadeOut } = build({ in: "fade", out: "fade" });

		expect(fadeIn.opacityKeyframes).toEqual([{ from: 0, to: 1, start: 0, length: 1, ...SMOOTH }]);
		expect(fadeOut.opacityKeyframes).toEqual([{ from: 1, to: 0, start: 4, length: 1, ...SMOOTH }]);
	});

	it("moves slides linearly on the way in and along the default curve on the way out", () => {
		const { in: slideIn, out: slideOut } = build({ in: "slideLeft", out: "slideLeft" });

		expect(slideIn.offsetXKeyframes).toEqual([{ from: 0.025, to: 0, start: 0, length: 0.5, interpolation: "linear" }]);
		expect(slideOut.offsetXKeyframes).toEqual([{ from: 0, to: -0.025, start: 4.5, length: 0.5, ...SMOOTH }]);
		expect(slideIn.opacityKeyframes).toEqual([{ from: 0, to: 1, start: 0, length: 0.5, ...SMOOTH }]);
	});

	it.each([
		["slideUp", -0.025, 0.025],
		["slideDown", 0.025, -0.025],
		["carouselUp", -1.05, 1.1],
		["carouselDown", 1.05, -1.1]
	])("moves %s the way its name says (offset y points up)", (name, inFrom, outTo) => {
		const { in: phaseIn, out: phaseOut } = build({ in: name as never, out: name as never });

		expect(phaseIn.offsetYKeyframes[0]).toMatchObject({ from: inFrom, to: 0 });
		expect(phaseOut.offsetYKeyframes[0]).toMatchObject({ from: 0, to: outTo });
	});

	it("eases carousels out along the default curve", () => {
		expect(build({ out: "carouselLeft" }).out.offsetXKeyframes).toEqual([{ from: 0, to: -1, start: 4.5, length: 0.5, ...SMOOTH }]);
	});

	it("zooms in linearly, zooms out along the default curve and fades both ways on the default curve", () => {
		const { in: zoomIn, out: zoomOut } = build({ in: "zoom", out: "zoom" });

		expect(zoomIn.scaleKeyframes).toEqual([{ from: 10, to: 1, start: 0, length: 0.4, interpolation: "linear" }]);
		expect(zoomOut.scaleKeyframes).toEqual([{ from: 1, to: 10, start: 4.6, length: 0.4, ...SMOOTH }]);
		expect(zoomIn.opacityKeyframes[0]).toMatchObject(SMOOTH);
		expect(zoomOut.opacityKeyframes[0]).toMatchObject(SMOOTH);
	});

	it("blurs zooms by 5 pixels at the clip's edge", () => {
		const { in: zoomIn, out: zoomOut } = build({ in: "zoom", out: "zoom" });

		expect(zoomIn.blurKeyframes).toEqual([{ from: 5, to: 0, start: 0, length: 0.4, ...SMOOTH }]);
		expect(zoomOut.blurKeyframes).toEqual([{ from: 0, to: 5, start: 4.6, length: 0.4, ...SMOOTH }]);
	});

	it("eases reveals and wipes along the default curve", () => {
		const { in: reveal } = build({ in: "reveal" });
		const { in: wipe } = build({ in: "wipeLeft" });

		expect(reveal.maskXKeyframes[0]).toMatchObject(SMOOTH);
		expect(wipe.brightnessKeyframes[0]).toMatchObject(SMOOTH);
	});
});
