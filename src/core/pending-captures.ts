export type PlaybackReadiness = "pending" | "ready" | null;

export interface PendingCaptures {
	pending: number;
	total: number;
}

export function countPendingCaptures(players: Iterable<{ getPlaybackReadiness(): PlaybackReadiness }>): PendingCaptures {
	let pending = 0;
	let total = 0;
	for (const player of players) {
		const readiness = player.getPlaybackReadiness();
		if (readiness) total += 1;
		if (readiness === "pending") pending += 1;
	}
	return { pending, total };
}
