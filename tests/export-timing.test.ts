/**
 * Regression tests for export timing math.
 *
 * The export module historically treated the canvas players' second-based
 * timings as milliseconds, dividing by 1000 in three places. That froze
 * exported video on its first frame and truncated audio to ~0.1% of its
 * length. These tests pin the units to seconds so the regression cannot recur.
 */

import { buildVolumeAutomation } from "../src/core/export/export-timing";

describe("buildVolumeAutomation", () => {
	it("defaults to constant unit gain", () => {
		expect(buildVolumeAutomation(undefined, undefined, 4)).toEqual([{ time: 0, value: 1 }]);
	});

	it("holds a constant scalar volume", () => {
		expect(buildVolumeAutomation(0.5, "none", 4)).toEqual([{ time: 0, value: 0.5 }]);
	});

	it("ramps a fadeIn from 0 to base over min(2, length/2)s, then holds", () => {
		expect(buildVolumeAutomation(1, "fadeIn", 10)).toEqual([
			{ time: 0, value: 0 },
			{ time: 2, value: 1 },
			{ time: 10, value: 1 }
		]);
	});

	it("uses length/2 as the fade when the clip is short", () => {
		expect(buildVolumeAutomation(1, "fadeIn", 3)).toEqual([
			{ time: 0, value: 0 },
			{ time: 1.5, value: 1 },
			{ time: 3, value: 1 }
		]);
	});

	it("ramps a fadeOut to 0 at the tail and respects base volume", () => {
		expect(buildVolumeAutomation(0.8, "fadeOut", 10)).toEqual([
			{ time: 0, value: 0.8 },
			{ time: 8, value: 0.8 },
			{ time: 10, value: 0 }
		]);
	});

	it("ramps in and out for fadeInFadeOut", () => {
		expect(buildVolumeAutomation(1, "fadeInFadeOut", 10)).toEqual([
			{ time: 0, value: 0 },
			{ time: 2, value: 1 },
			{ time: 8, value: 1 },
			{ time: 10, value: 0 }
		]);
	});

	it("honours an explicit volume tween array over any fade effect", () => {
		expect(buildVolumeAutomation([{ from: 0, to: 1, start: 0, length: 1 }], "fadeOut", 5)).toEqual([
			{ time: 0, value: 0 },
			{ time: 1, value: 1 }
		]);
	});
});
