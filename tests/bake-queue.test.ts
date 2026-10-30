import { BakeQueue, nextBake } from "@canvas/players/bake-queue";

const at = (next: number, playhead: () => number = () => 0) => ({ nextFrameEnd: () => next, playhead });

const settle = () =>
	new Promise(resolve => {
		setTimeout(resolve, 0);
	});

afterEach(() => {
	Reflect.deleteProperty(globalThis, "document");
	jest.useRealTimers();
});

describe("nextBake", () => {
	it("takes the earliest next frame still ahead of the playhead, then frames it has passed", () => {
		const playhead = () => 30;
		const waiting = [at(54.4, playhead), at(24.4, playhead), at(30.1, playhead), at(40, playhead)];
		const order: number[] = [];
		while (waiting.length > 0) order.push(waiting.splice(nextBake(waiting), 1)[0].nextFrameEnd());

		expect(order).toEqual([30.1, 40, 54.4, 24.4]);
	});

	it("counts a frame that leaves the screen as the playhead reaches it as passed", () => {
		expect(nextBake([at(30, () => 30), at(31, () => 30)])).toBe(1);
	});

	it("keeps arrival order between bakes whose next frames coincide", () => {
		expect(nextBake([at(10), at(10)])).toBe(0);
	});
});

describe("BakeQueue", () => {
	it("bakes clips that arrive together from the playhead, whatever their arrival order", async () => {
		const queue = new BakeQueue();
		const ran: number[] = [];
		await Promise.all([54.4, 24.4, 0.1].map(next => queue.add(at(next), async () => ran.push(next))));

		expect(ran).toEqual([0.1, 24.4, 54.4]);
	});

	it("runs one bake at a time, between turns too", async () => {
		const queue = new BakeQueue();
		let running = 0;
		let most = 0;
		const bake = async (turn: () => Promise<void>) => {
			running += 1;
			most = Math.max(most, running);
			await settle();
			running -= 1;
			await turn();
			running += 1;
			most = Math.max(most, running);
			await settle();
			running -= 1;
		};
		await Promise.all([1, 11, 21].map(next => queue.add(at(next), bake)));

		expect(most).toBe(1);
	});

	it("alternates bakes whose frames overlap, turn by turn", async () => {
		const queue = new BakeQueue();
		const ran: string[] = [];
		const bake = (name: string) => {
			let next = 1;
			return queue.add({ nextFrameEnd: () => next, playhead: () => 0 }, async turn => {
				const step = async () => {
					ran.push(name);
					next += 1;
					await turn();
				};
				await step();
				await step();
				await step();
			});
		};
		await Promise.all([bake("A"), bake("B")]);

		expect(ran).toEqual(["A", "B", "A", "B", "A", "B"]);
	});

	it("re-sorts what's waiting when the playhead moves during a bake", async () => {
		const queue = new BakeQueue();
		let playhead = 0;
		const ran: string[] = [];
		let finishFirst = () => {};
		const first = queue.add(
			at(0.1, () => playhead),
			() => {
				ran.push("A");
				return new Promise<void>(resolve => {
					finishFirst = resolve;
				});
			}
		);
		await settle();
		const rest = [
			queue.add(
				at(10.1, () => playhead),
				async () => ran.push("B")
			),
			queue.add(
				at(25.1, () => playhead),
				async () => ran.push("C")
			)
		];
		playhead = 25;
		finishFirst();
		await Promise.all([first, ...rest]);

		expect(ran).toEqual(["A", "C", "B"]);
	});

	it("starts a bake while the page is hidden and holds its timers back", async () => {
		jest.useFakeTimers();
		Object.assign(globalThis, { document: { hidden: true } });

		await expect(new BakeQueue().add(at(0.1), async () => "baked")).resolves.toBe("baked");
	});

	it("moves on after a bake fails, and hands the failure to its caller", async () => {
		const queue = new BakeQueue();
		const failed = queue.add(at(0.1), async () => {
			throw new Error("bake failed");
		});
		const next = queue.add(at(10.1), async () => "baked");

		await expect(failed).rejects.toThrow("bake failed");
		await expect(next).resolves.toBe("baked");
	});
});
