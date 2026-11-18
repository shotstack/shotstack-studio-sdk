import { DuckLevelService } from "@core/audio/duck-levels";
import { InternalEvent, type InternalEventMap } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedEdit } from "@schemas";
import { duckLevel, momentaryToBlock } from "@shotstack/shotstack-canvas/duck";

const VOICE = "https://example.com/voice.mp3";
const VOICE_2 = "https://example.com/voice-2.mp3";
const MUSIC = "https://example.com/music.mp3";

type Blocks = Float64Array | null;

// One block per 0.1 s hop, `lufs(end)` loud, where `end` is when the block ends.
const blocksOf = (lufs: (end: number) => number): Float64Array => Float64Array.from({ length: 200 }, (_, k) => momentaryToBlock(lufs((k + 1) * 0.1)));

// The music is louder for its first 6 seconds, so each dip's level depends on where its voice falls.
const FILES: Record<string, Float64Array> = {
	[VOICE]: blocksOf(() => -20),
	[VOICE_2]: blocksOf(() => -26),
	[MUSIC]: blocksOf(end => (end <= 6 ? -14 : -20))
};

const voice = (alias: string, src: string | undefined, start: number, volume?: number) => ({
	id: alias,
	alias,
	start,
	length: 3,
	asset: { type: "audio", ...(src === undefined ? {} : { src }), ...(volume === undefined ? {} : { volume }) }
});

const music = (id: string, duck: Record<string, unknown>, start = 0) => ({ id, start, length: 20, asset: { type: "audio", src: MUSIC, duck } });

const edit = (...tracks: unknown[][]): ResolvedEdit =>
	({
		timeline: { tracks: tracks.map(clips => ({ clips })) },
		output: { format: "mp4", size: { width: 1280, height: 720 } }
	}) as unknown as ResolvedEdit;

const flush = (): Promise<void> =>
	new Promise(resolve => {
		setImmediate(resolve);
	});

function setup(decode: (src: string) => Promise<Blocks> = async src => FILES[src] ?? null) {
	const events = new EventEmitter<InternalEventMap>();
	const changed = jest.fn();
	events.on(InternalEvent.DuckLevelsChanged, changed);
	const decoder = jest.fn(decode);
	return { service: new DuckLevelService(events, decoder), decoder, changed, events };
}

/** A decoder whose files land only when a test says so. */
function heldDecoder() {
	const held = new Map<string, (blocks: Blocks) => void>();
	const decode = (src: string) =>
		new Promise<Blocks>(resolve => {
			held.set(src, resolve);
		});
	const land = (src: string, blocks: Blocks = FILES[src]) => held.get(src)?.(blocks);
	return { decode, land };
}

describe("DuckLevelService", () => {
	it("decodes each file once", async () => {
		const { service, decoder } = setup();
		const resolved = edit(
			[voice("voice", VOICE, 2), voice("voice2", VOICE_2, 12)],
			[music("intro", { under: "alias://voice" }), music("outro", { under: "alias://voice2" }, 10)]
		);

		service.refresh(resolved);
		service.refresh(resolved);
		await service.whenSettled();
		service.refresh(resolved);
		await service.whenSettled();

		expect(decoder.mock.calls.map(([src]) => src).sort()).toEqual([MUSIC, VOICE, VOICE_2].sort());
	});

	it("sets each dip to duckLevel of the speech and bed loudness under it", async () => {
		const { service } = setup();

		service.refresh(
			edit([voice("voice", VOICE, 2), voice("voice2", VOICE_2, 8, 0.5)], [music("music", { under: ["alias://voice", "alias://voice2"] })])
		);
		await service.whenSettled();

		expect(service.levelsFor("music")).toEqual(
			new Map([
				["alias://voice", duckLevel(-20, 1, -14)],
				["alias://voice2", duckLevel(-26, 0.5, -20)]
			])
		);
	});

	it("emits DuckLevelsChanged once per batch that lands", async () => {
		const { decode, land } = heldDecoder();
		const { service, changed } = setup(decode);
		const one = edit([voice("voice", VOICE, 2)], [music("music", { under: "alias://voice" })]);
		const two = edit([voice("voice", VOICE, 2), voice("voice2", VOICE_2, 8)], [music("music", { under: ["alias://voice", "alias://voice2"] })]);

		service.refresh(one);
		land(VOICE);
		await flush();
		expect(changed).not.toHaveBeenCalled();

		land(MUSIC);
		await service.whenSettled();
		expect(changed).toHaveBeenCalledTimes(1);

		service.refresh(two);
		land(VOICE_2);
		await service.whenSettled();
		expect(changed).toHaveBeenCalledTimes(2);

		service.refresh(two);
		await service.whenSettled();
		expect(changed).toHaveBeenCalledTimes(2);
	});

	it("gives no entry to a dip with an explicit duck.volume", async () => {
		const { service, decoder } = setup();

		service.refresh(edit([voice("voice", VOICE, 2)], [music("music", { under: "alias://voice", volume: 0.2 })]));
		await service.whenSettled();

		expect(service.levelsFor("music")?.has("alias://voice") ?? false).toBe(false);
		expect(decoder).not.toHaveBeenCalled();
	});

	it("gives no entry when a file can't be decoded", async () => {
		const { service, changed } = setup(async src => (src === VOICE ? null : FILES[src]));

		service.refresh(edit([voice("voice", VOICE, 2)], [music("music", { under: "alias://voice" })]));
		await service.whenSettled();

		expect(service.levelsFor("music")?.has("alias://voice") ?? false).toBe(false);
		expect(changed).not.toHaveBeenCalled();
	});

	it("no level until the source resolves", async () => {
		const { service, decoder } = setup();
		const under = { under: ["alias://voice", "alias://voice2"] };

		service.refresh(edit([voice("voice", undefined, 2), voice("voice2", "{{ VOICE }}", 8)], [music("music", under)]));
		await service.whenSettled();
		expect(decoder).not.toHaveBeenCalled();
		expect(service.levelsFor("music")?.size ?? 0).toBe(0);

		service.refresh(edit([voice("voice", undefined, 2), voice("voice2", VOICE_2, 8)], [music("music", under)]));
		await service.whenSettled();
		expect(decoder.mock.calls.map(([src]) => src).sort()).toEqual([MUSIC, VOICE_2].sort());
		expect([...(service.levelsFor("music")?.keys() ?? [])]).toEqual(["alias://voice2"]);
	});

	it("treats a merge field as unresolved where URL.canParse is missing", async () => {
		const canParse = Object.getOwnPropertyDescriptor(URL, "canParse");
		Reflect.deleteProperty(URL, "canParse");
		try {
			const { service, decoder } = setup();

			service.refresh(
				edit([voice("voice", "{{ VOICE }}", 2), voice("voice2", VOICE_2, 8)], [music("music", { under: ["alias://voice", "alias://voice2"] })])
			);
			await service.whenSettled();

			expect(decoder.mock.calls.map(([src]) => src).sort()).toEqual([MUSIC, VOICE_2].sort());
			expect([...(service.levelsFor("music")?.keys() ?? [])]).toEqual(["alias://voice2"]);
		} finally {
			if (canParse) Object.defineProperty(URL, "canParse", canParse);
		}
	});

	it("settles, now and later, when a decode rejects, leaving that file unmeasured", async () => {
		const { service } = setup(async src => {
			if (src === VOICE) throw new Error("decoder crashed");
			return FILES[src] ?? null;
		});

		service.refresh(edit([voice("voice", VOICE, 2), voice("voice2", VOICE_2, 8)], [music("music", { under: ["alias://voice", "alias://voice2"] })]));
		await expect(service.whenSettled()).resolves.toBeUndefined();
		await expect(service.whenSettled()).resolves.toBeUndefined();

		expect([...(service.levelsFor("music")?.keys() ?? [])]).toEqual(["alias://voice2"]);
	});

	it("whenSettled resolves after pending decodes", async () => {
		const { decode, land } = heldDecoder();
		const { service, events } = setup(decode);
		const order: string[] = [];
		events.on(InternalEvent.DuckLevelsChanged, () => order.push("changed"));

		service.refresh(edit([voice("voice", VOICE, 2)], [music("music", { under: "alias://voice" })]));
		const settled = service.whenSettled().then(() => order.push("settled"));
		land(VOICE);
		await flush();
		expect(order).toEqual([]);

		land(MUSIC);
		await settled;
		expect(order).toEqual(["changed", "settled"]);
	});

	it("ignores decodes that land after it is disposed", async () => {
		const { decode, land } = heldDecoder();
		const { service, changed } = setup(decode);

		service.refresh(edit([voice("voice", VOICE, 2)], [music("music", { under: "alias://voice" })]));
		service.dispose();
		land(VOICE);
		land(MUSIC);
		await service.whenSettled();

		expect(changed).not.toHaveBeenCalled();
	});
});
