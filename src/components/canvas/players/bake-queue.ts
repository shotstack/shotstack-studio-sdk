/** Where a waiting bake's clip sits on the timeline. Read at each pick, so seeks and edits count. */
export interface BakeSlot {
	start(): number;
	end(): number;
	playhead(): number;
}

/** The clip under the playhead goes first, then those ahead in start order, then those already passed. */
function rank(slot: BakeSlot): [number, number] {
	const playhead = slot.playhead();
	const start = slot.start();
	if (start <= playhead && playhead < slot.end()) return [0, start];
	return [start > playhead ? 1 : 2, start];
}

export function nextBake(waiting: readonly BakeSlot[]): number {
	let best = 0;
	let bestRank = rank(waiting[0]);
	for (let i = 1; i < waiting.length; i += 1) {
		const candidate = rank(waiting[i]);
		// Strictly better only, so clips that tie keep their arrival order.
		if (candidate[0] < bestRank[0] || (candidate[0] === bestRank[0] && candidate[1] < bestRank[1])) {
			best = i;
			bestRank = candidate;
		}
	}
	return best;
}

/**
 * Runs bakes one at a time. Each pick waits a task, so clips that join together are all
 * waiting when it is made, and it reads the playhead then.
 */
export class BakeQueue {
	private readonly waiting: { slot: BakeSlot; run: () => void }[] = [];
	private running = false;
	private scheduled = false;

	public add<T>(slot: BakeSlot, bake: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const run = (): void => {
				bake()
					.then(resolve, reject)
					.finally(() => {
						this.running = false;
						this.schedule();
					});
			};
			this.waiting.push({ slot, run });
			this.schedule();
		});
	}

	private schedule(): void {
		if (this.running || this.scheduled || this.waiting.length === 0) return;
		this.scheduled = true;
		setTimeout(() => {
			this.scheduled = false;
			if (this.running || this.waiting.length === 0) return;
			const [next] = this.waiting.splice(nextBake(this.waiting.map(({ slot }) => slot)), 1);
			this.running = true;
			next.run();
		}, 0);
	}
}
