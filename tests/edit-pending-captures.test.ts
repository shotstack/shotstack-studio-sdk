import { countPendingCaptures } from "@core/pending-captures";

type Readiness = "pending" | "ready" | null;

const stub = (readiness: Readiness) => ({ getPlaybackReadiness: () => readiness });

it("sums html5 clips that are pending or ready", () => {
	expect(countPendingCaptures([stub("pending"), stub("ready"), stub(null), stub("pending")])).toEqual({ pending: 2, total: 3 });
});

it("reports nothing for an edit without html5 clips", () => {
	expect(countPendingCaptures([stub(null), stub(null)])).toEqual({ pending: 0, total: 0 });
	expect(countPendingCaptures([])).toEqual({ pending: 0, total: 0 });
});
