export type PlaybackReadiness = "pending" | "ready" | null;

export interface PendingCaptures {
	pending: number;
	total: number;
	progress: number;
}

type ReportsReadiness = { getPlaybackReadiness(): PlaybackReadiness; getCaptureProgress(): number };

export function countPendingCaptures(players: Iterable<ReportsReadiness>): PendingCaptures {
	let pending = 0;
	let total = 0;
	let done = 0;
	for (const player of players) {
		const readiness = player.getPlaybackReadiness();
		if (readiness) total += 1;
		if (readiness === "pending") pending += 1;
		if (readiness) done += player.getCaptureProgress();
	}
	return { pending, total, progress: total > 0 ? done / total : 1 };
}
