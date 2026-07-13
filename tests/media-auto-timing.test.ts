import type { Player } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { TimingManager } from "@core/timing-manager";
import { resolveAutoLength, resolveEndLength, resolveTimingIntent } from "@core/timing/resolver";
import { sec } from "@core/timing/types";
import type { Asset, ResolvedEdit } from "@schemas";

describe("uniform auto-length timing", () => {
	it("uses the same fallback and minimum end policy in the context resolver", () => {
		expect(resolveTimingIntent({ start: sec(0), length: "auto" }, { previousClipEnd: sec(0), timelineEnd: sec(0), autoLength: null })).toEqual({
			start: 0,
			length: 3
		});
		expect(resolveTimingIntent({ start: sec(5), length: "end" }, { previousClipEnd: sec(0), timelineEnd: sec(5), autoLength: null })).toEqual({
			start: 5,
			length: resolveEndLength(sec(5), sec(5))
		});
		expect(resolveEndLength(sec(5), sec(5))).toBe(0);
	});

	it.each([
		["animated GIF image", { type: "image", src: "animation.gif", trim: 1 }, 2.4, 2.4],
		["static image", { type: "image", src: "image.png" }, null, 3],
		["video", { type: "video", src: "video.mp4", trim: 2 }, 8, 6],
		["audio", { type: "audio", src: "audio.mp3", trim: 0.5 }, 4.5, 4],
		["video luma", { type: "luma", src: "luma.mp4" }, 5, 5],
		["text", { type: "text", text: "Hello" }, null, 3]
	] as const)("applies the same resolver policy to %s", (_name, asset, intrinsicDuration, expected) => {
		expect(resolveAutoLength(asset as Asset, intrinsicDuration === null ? null : sec(intrinsicDuration))).toBe(expected);
	});

	it("uses the full fallback and ignores invalid trim values", () => {
		const asset = { type: "video", src: "video.mp4", trim: 2 } as Asset;
		expect(resolveAutoLength(asset, null)).toBe(3);
		expect(resolveAutoLength({ ...asset, trim: Number.NaN } as Asset, sec(8))).toBe(8);
		expect(resolveAutoLength({ ...asset, trim: -2 } as Asset, sec(8))).toBe(8);
	});

	it("returns zero for non-finite end inputs", () => {
		expect(resolveEndLength(sec(Number.NaN), sec(1))).toBe(0);
		expect(resolveEndLength(sec(10), sec(Number.POSITIVE_INFINITY))).toBe(0);
	});

	it("applies one pure resolver result to auto, dependent start, and end clips", async () => {
		const timings = [
			{ start: sec(0), length: sec(2.4) },
			{ start: sec(2.4), length: sec(1) },
			{ start: sec(0), length: sec(3.4) }
		];
		const reconfigure = jest.fn();
		const players = timings.map((initial, index) => {
			let timing = index === 0 ? { start: sec(0), length: sec(3) } : initial;
			return {
				getStart: () => timing.start,
				getLength: () => timing.length,
				getEnd: () => sec(timing.start + timing.length),
				getTimingIntent: () => ({ start: timing.start, length: timing.length }),
				setResolvedTiming: (next: typeof timing) => {
					timing = next;
				},
				reconfigureAfterRestore: reconfigure
			} as unknown as Player;
		});
		const resolved = {
			timeline: {
				tracks: [{ clips: [timings[0], timings[1]] }, { clips: [timings[2]] }]
			}
		} as unknown as ResolvedEdit;
		const edit = {
			getTracks: () => [[players[0], players[1]], [players[2]]],
			getResolvedEdit: () => resolved
		} as unknown as Edit;

		await new TimingManager(edit).resolveAllTiming();

		expect(players[0].getLength()).toBe(2.4);
		expect(players[1].getStart()).toBe(2.4);
		expect(players[2].getLength()).toBe(3.4);
		expect(reconfigure).toHaveBeenCalledTimes(1);
	});
});
