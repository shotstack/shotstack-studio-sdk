import {
	decodeOpacityPoints,
	encodeOpacityPoints,
	evaluateOpacity,
	findOpacityPoint,
	removeOpacityPoint,
	snapOpacityTime,
	upsertOpacityPoint
} from "../src/core/animations/opacity-keyframes";
import type { Tween } from "../src/core/schemas";

const UNSUPPORTED_TWEENS: Tween[][] = [
	[{ from: 0, to: 1, start: 0, length: 1, interpolation: "bezier", easing: "ease" }],
	[{ from: 0, to: 1, start: 0, length: 1, interpolation: "linear", easing: "ease" }],
	[
		{ from: 0, to: 0.5, start: 0, length: 1, interpolation: "linear" },
		{ from: 0.5, to: 1, start: 2, length: 1, interpolation: "linear" }
	],
	[
		{ from: 0, to: 0.5, start: 0, length: 2, interpolation: "linear" },
		{ from: 0.5, to: 1, start: 1, length: 1, interpolation: "linear" }
	],
	[
		{ from: 0, to: 0.5, start: 0, length: 1, interpolation: "linear" },
		{ from: 0.6, to: 1, start: 1, length: 1, interpolation: "linear" }
	],
	[{ from: "{{ FROM }}", to: 1, start: 0, length: 1, interpolation: "linear" }]
];

describe("opacity keyframe editing", () => {
	it("round-trips Studio points through boundary holds", () => {
		const points = [
			{ time: 1, value: 0.25 },
			{ time: 2.5, value: 0.75 }
		];
		const tweens = encodeOpacityPoints(points, 4);

		expect(tweens).toEqual([
			{ from: 0.25, to: 0.25, start: 0, length: 1, interpolation: "constant" },
			{ from: 0.25, to: 0.75, start: 1, length: 1.5, interpolation: "linear" },
			{ from: 0.75, to: 0.75, start: 2.5, length: 1.5, interpolation: "constant" }
		]);
		expect(decodeOpacityPoints(tweens!, 4)).toEqual(points);
	});

	it("keeps equal-valued linear points while hiding constant padding", () => {
		const points = [
			{ time: 1, value: 0.5 },
			{ time: 2, value: 0.5 }
		];

		expect(decodeOpacityPoints(encodeOpacityPoints(points, 3)!, 3)).toEqual(points);
	});

	it.each(UNSUPPORTED_TWEENS.map(tweens => [tweens]))("leaves unsupported Tween arrays read-only", tweens => {
		const original = structuredClone(tweens);

		const clipLength = Math.max(...tweens.map(tween => Number(tween.start) + Number(tween.length)));
		expect(decodeOpacityPoints(tweens, clipLength)).toBeNull();
		expect(tweens).toEqual(original);
	});

	it("retains points beyond a shortened clip", () => {
		const points = [
			{ time: 1, value: 0.25 },
			{ time: 8, value: 0.75 }
		];

		expect(decodeOpacityPoints(encodeOpacityPoints(points, 5)!, 5)).toEqual(points);
	});

	it("keeps a Studio Tween chain editable after extending the clip", () => {
		const points = [
			{ time: 1, value: 0.25 },
			{ time: 3, value: 0.75 }
		];
		const tweens = encodeOpacityPoints(points, 5)!;

		expect(decodeOpacityPoints(tweens, 8)).toEqual(points);
	});

	it("snaps, replaces, removes and navigates with frame tolerance", () => {
		const fps = 30;
		const first = upsertOpacityPoint([], 1.01, 0.25, 5, fps);
		const replaced = upsertOpacityPoint(first, 1.015, 0.5, 5, fps);
		const withNext = upsertOpacityPoint(replaced, 2.01, 0.75, 5, fps);

		expect(first).toEqual([{ time: 1, value: 0.25 }]);
		expect(replaced).toEqual([{ time: 1, value: 0.5 }]);
		expect(snapOpacityTime(5, 5, fps)).toBe(5);
		expect(findOpacityPoint(withNext, 1, fps, 1)?.time).toBe(2);
		expect(findOpacityPoint(withNext, 2, fps, -1)?.time).toBe(1);
		expect(removeOpacityPoint(withNext, 2.01, fps)).toEqual([{ time: 1, value: 0.5 }]);
	});

	it("navigates adjacent imported points after the output frame rate changes", () => {
		const points = [
			{ time: 1, value: 0.25 },
			{ time: 1 + 1 / 60, value: 0.75 }
		];

		expect(findOpacityPoint(points, 1, 30, 1)).toBe(points[1]);
		expect(findOpacityPoint(points, 1 + 1 / 60, 30, -1)).toBe(points[0]);
	});

	it("uses the existing evaluator for supported and advanced opacity", () => {
		expect(evaluateOpacity([{ from: 0, to: 1, start: 0, length: 2, interpolation: "linear" }], 1, 2)).toBe(0.5);
		expect(evaluateOpacity([{ from: 0, to: 1, start: 0, length: 2, interpolation: "bezier", easing: "ease" }], 1, 2)).toBeCloseTo(0.8024);
	});
});
