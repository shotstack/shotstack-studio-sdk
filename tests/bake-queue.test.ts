import { BakeQueue, nextBake } from "@canvas/players/bake-queue";

const at = (start: number, end: number, playhead: () => number = () => 0) => ({ start: () => start, end: () => end, playhead });

const settle = () =>
	new Promise(resolve => {
		setTimeout(resolve, 0);
	});

describe("nextBake", () => {
	it("takes the clip under the playhead, then those ahead in start order, then those it has passed", () => {
		const playhead = () => 30;
		const waiting = [at(54.4, 80.37, playhead), at(0, 24.4, playhead), at(24.4, 54.4, playhead), at(40, 45, playhead)];
		const order: number[] = [];
		while (waiting.length > 0) order.push(waiting.splice(nextBake(waiting), 1)[0].start());

		expect(order).toEqual([24.4, 40, 54.4, 0]);
	});

	it("keeps arrival order between clips that start together", () => {
		expect(nextBake([at(10, 20), at(10, 15)])).toBe(0);
	});
});

describe("BakeQueue", () => {
	it("bakes clips that arrive together from the playhead, whatever their arrival order", async () => {
		const queue = new BakeQueue();
		const ran: number[] = [];
		await Promise.all([54.4, 24.4, 0].map(start => queue.add(at(start, start + 20), async () => ran.push(start))));

		expect(ran).toEqual([0, 24.4, 54.4]);
	});

	it("runs one bake at a time", async () => {
		const queue = new BakeQueue();
		let running = 0;
		let most = 0;
		const bake = async () => {
			running += 1;
			most = Math.max(most, running);
			await settle();
			running -= 1;
		};
		await Promise.all([0, 10, 20].map(start => queue.add(at(start, start + 10), bake)));

		expect(most).toBe(1);
	});

	it("re-sorts what's waiting when the playhead moves during a bake", async () => {
		const queue = new BakeQueue();
		let playhead = 0;
		const ran: string[] = [];
		let finishFirst = () => {};
		const first = queue.add(
			at(0, 10, () => playhead),
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
				at(10, 20, () => playhead),
				async () => ran.push("B")
			),
			queue.add(
				at(20, 30, () => playhead),
				async () => ran.push("C")
			)
		];
		playhead = 25;
		finishFirst();
		await Promise.all([first, ...rest]);

		expect(ran).toEqual(["A", "C", "B"]);
	});

	it("moves on after a bake fails, and hands the failure to its caller", async () => {
		const queue = new BakeQueue();
		const failed = queue.add(at(0, 10), async () => {
			throw new Error("bake failed");
		});
		const next = queue.add(at(10, 20), async () => "baked");

		await expect(failed).rejects.toThrow("bake failed");
		await expect(next).resolves.toBe("baked");
	});
});
