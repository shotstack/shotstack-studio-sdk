import { AssetGenerator, type AssetGeneratorDeps } from "@core/generation/asset-generator";

const PROMPT_ASSET = { type: "image", prompt: "a red apple" };

function makeDeps(overrides: Partial<AssetGeneratorDeps> = {}) {
	const started: string[] = [];
	const completed: string[] = [];
	const failed: { clipId: string; error: string }[] = [];
	const applied: { clipId: string; url: string }[] = [];

	const deps: AssetGeneratorDeps = {
		getClipAsset: () => ({ ...PROMPT_ASSET }),
		applyGeneratedSrc: async (clipId, url) => {
			applied.push({ clipId, url });
		},
		emitStarted: clipId => started.push(clipId),
		emitCompleted: clipId => completed.push(clipId),
		emitFailed: (clipId, error) => failed.push({ clipId, error }),
		...overrides
	};

	return { deps, started, completed, failed, applied };
}

describe("AssetGenerator", () => {
	it("writes the generated src back and reports completion", async () => {
		const { deps, started, completed, applied } = makeDeps();
		const generator = new AssetGenerator(deps);
		generator.register(async () => ({ url: "https://cdn/out.png" }));

		await generator.generate("clip-1");

		expect(applied).toEqual([{ clipId: "clip-1", url: "https://cdn/out.png" }]);
		expect(started).toEqual(["clip-1"]);
		expect(completed).toEqual(["clip-1"]);
		expect(generator.getState("clip-1")).toBeUndefined();
	});

	it("keeps the host's message on failure and writes nothing", async () => {
		const { deps, failed, applied } = makeDeps();
		const generator = new AssetGenerator(deps);
		generator.register(async () => {
			throw new Error("Not enough credits");
		});

		await generator.generate("clip-1");

		expect(applied).toEqual([]);
		expect(generator.getState("clip-1")).toEqual({ status: "failed", error: "Not enough credits" });
		expect(failed).toEqual([{ clipId: "clip-1", error: "Not enough credits" }]);
	});

	it("clears the failed state when retried", async () => {
		const { deps } = makeDeps();
		const generator = new AssetGenerator(deps);
		let attempt = 0;
		generator.register(async () => {
			attempt += 1;
			if (attempt === 1) throw new Error("boom");
			return { url: "https://cdn/out.png" };
		});

		await generator.generate("clip-1");
		expect(generator.getState("clip-1")?.status).toBe("failed");

		await generator.generate("clip-1");
		expect(generator.getState("clip-1")).toBeUndefined();
		expect(attempt).toBe(2);
	});

	it("ignores a second request while one is in flight for the same clip", async () => {
		const { deps } = makeDeps();
		const generator = new AssetGenerator(deps);
		let calls = 0;
		let release: (() => void) | undefined;
		generator.register(async () => {
			calls += 1;
			await new Promise<void>(resolve => {
				release = resolve;
			});
			return { url: "https://cdn/out.png" };
		});

		const first = generator.generate("clip-1");
		await generator.generate("clip-1");
		expect(calls).toBe(1);

		release?.();
		await first;
	});

	it("generates different clips concurrently", async () => {
		const { deps, completed } = makeDeps();
		const generator = new AssetGenerator(deps);
		generator.register(async ({ clipId }) => ({ url: `https://cdn/${clipId}.png` }));

		await Promise.all([generator.generate("clip-1"), generator.generate("clip-2")]);

		expect(completed.sort()).toEqual(["clip-1", "clip-2"]);
	});

	it("does nothing without a registered handler", async () => {
		const { deps, started } = makeDeps();
		const generator = new AssetGenerator(deps);

		await generator.generate("clip-1");

		expect(started).toEqual([]);
		expect(generator.getState("clip-1")).toBeUndefined();
	});

	it("refuses a clip whose asset is not generatable", async () => {
		const { deps, started } = makeDeps({ getClipAsset: () => ({ type: "image", src: "https://cdn/a.png" }) });
		const generator = new AssetGenerator(deps);
		generator.register(async () => ({ url: "https://cdn/out.png" }));

		await generator.generate("clip-1");

		expect(started).toEqual([]);
	});

	it("accepts a realised asset so it can be regenerated", async () => {
		const { deps, applied } = makeDeps({
			getClipAsset: () => ({ type: "image", prompt: "a red apple", src: "https://cdn/old.png" })
		});
		const generator = new AssetGenerator(deps);
		generator.register(async () => ({ url: "https://cdn/new.png" }));

		await generator.generate("clip-1");

		expect(applied).toEqual([{ clipId: "clip-1", url: "https://cdn/new.png" }]);
	});

	it("leaves no failed state when aborted mid-flight", async () => {
		const { deps, failed, applied } = makeDeps();
		const generator = new AssetGenerator(deps);
		generator.register(
			({ signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(new Error("aborted")));
				})
		);

		const pending = generator.generate("clip-1");
		generator.abort("clip-1");
		await pending;

		expect(generator.getState("clip-1")).toBeUndefined();
		expect(failed).toEqual([]);
		expect(applied).toEqual([]);
	});

	it("passes a snapshot rather than the live asset", async () => {
		const live = { type: "image", prompt: "a red apple" };
		const { deps } = makeDeps({ getClipAsset: () => live });
		const generator = new AssetGenerator(deps);
		let received: Record<string, unknown> | undefined;
		generator.register(async ({ asset }) => {
			received = asset;
			return { url: "https://cdn/out.png" };
		});

		await generator.generate("clip-1");

		expect(received).toEqual(live);
		expect(received).not.toBe(live);
	});
});
