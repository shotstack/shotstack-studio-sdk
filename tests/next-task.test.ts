import { nextFrame, nextTask } from "@core/shared/utils";

// A hidden page holds timers back for a second or more; fake timers that never advance stand in for that.
const showPage = (hidden: boolean) => Object.assign(globalThis, { document: { hidden } });

afterEach(() => {
	Reflect.deleteProperty(globalThis, "document");
	jest.useRealTimers();
});

describe("nextTask", () => {
	it("resolves while the page is hidden and holds its timers back", async () => {
		jest.useFakeTimers();
		showPage(true);

		await expect(nextTask()).resolves.toBeUndefined();
	});

	it("waits for a timer while the page is visible", async () => {
		jest.useFakeTimers();
		showPage(false);
		let done = false;
		nextTask().then(() => {
			done = true;
		});

		await Promise.resolve();
		expect(done).toBe(false);
		await jest.runOnlyPendingTimersAsync();
		expect(done).toBe(true);
	});
});

describe("nextFrame", () => {
	it("resolves while the page is hidden and paints nothing", async () => {
		jest.useFakeTimers();
		showPage(true);

		await expect(nextFrame()).resolves.toBeUndefined();
	});
});
