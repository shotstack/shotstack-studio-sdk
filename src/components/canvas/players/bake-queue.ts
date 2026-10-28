/** Where a waiting bake stands on the timeline. Read at each pick, so seeks, edits and progress count. */
export interface BakeSlot {
	/** Timeline time at which the next frame this bake draws leaves the screen. */
	nextFrameEnd(): number;
	playhead(): number;
}

/** Frames playback still needs go first, earliest first, then frames it has already passed. */
function rank(slot: BakeSlot): [number, number] {
	const nextFrameEnd = slot.nextFrameEnd();
	return [nextFrameEnd <= slot.playhead() ? 1 : 0, nextFrameEnd];
}

export function nextBake(waiting: readonly BakeSlot[]): number {
	let best = 0;
	let bestRank = rank(waiting[0]);
	for (let i = 1; i < waiting.length; i += 1) {
		const candidate = rank(waiting[i]);
		// Strictly better only, so bakes that tie keep their arrival order.
		if (candidate[0] < bestRank[0] || (candidate[0] === bestRank[0] && candidate[1] < bestRank[1])) {
			best = i;
			bestRank = candidate;
		}
	}
	return best;
}

/**
 * Runs bakes one at a time. A bake hands its turn back by awaiting `turn` and rejoins the end of the
 * waiting list, so bakes whose frames overlap alternate. Each pick waits a task, so clips that join
 * together are all waiting when it is made, and it reads the playhead then.
 */
export class BakeQueue {
	private readonly waiting: { slot: BakeSlot; run: () => void }[] = [];
	private running = false;
	private scheduled = false;

	public add<T>(slot: BakeSlot, bake: (turn: () => Promise<void>) => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const turn = (): Promise<void> =>
				new Promise<void>(resume => {
					this.waiting.push({ slot, run: resume });
					this.running = false;
					this.schedule();
				});
			const run = (): void => {
				bake(turn)
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
