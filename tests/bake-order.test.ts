import { passSegments } from "@canvas/players/bake-order";

it("splits a pass at the playhead, ahead first", () => {
	const all = Array.from({ length: 10 }, (_, i) => i);

	expect(passSegments(all, 4)).toEqual([
		[4, 5, 6, 7, 8, 9],
		[0, 1, 2, 3]
	]);
	expect(passSegments(all, 0)).toEqual([all]);
	expect(passSegments(all, 10)).toEqual([all]);
});
