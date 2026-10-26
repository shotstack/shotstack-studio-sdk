import { countPendingCaptures, type PlaybackReadiness } from "@core/pending-captures";

const stub = (readiness: PlaybackReadiness, progress = readiness === "pending" ? 0 : 1) => ({
	getPlaybackReadiness: () => readiness,
	getCaptureProgress: () => progress
});

it("sums html5 clips that are pending or ready, with their bake progress", () => {
	expect(countPendingCaptures([stub("pending", 0.5), stub("ready"), stub(null), stub("pending", 0)])).toEqual({
		pending: 2,
		total: 3,
		progress: 0.5
	});
});

it("reports nothing for an edit without html5 clips", () => {
	expect(countPendingCaptures([stub(null), stub(null)])).toEqual({ pending: 0, total: 0, progress: 1 });
	expect(countPendingCaptures([])).toEqual({ pending: 0, total: 0, progress: 1 });
});
