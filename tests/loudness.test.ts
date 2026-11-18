import { integratedLoudness } from "@shotstack/shotstack-canvas/duck";

import { decodeLoudnessBlocks, kWeightedBlocks } from "../src/core/audio/loudness";

const RATE = 48000;
const TOLERANCE = 0.15;

const tone = (hz: number, amplitude: number, seconds: number): Float32Array =>
	Float32Array.from({ length: seconds * RATE }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE));

const silence = (seconds: number): Float32Array => new Float32Array(seconds * RATE);

const join = (...parts: Float32Array[]): Float32Array => {
	const out = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
	parts.reduce((offset, part) => {
		out.set(part, offset);
		return offset + part.length;
	}, 0);
	return out;
};

const onePass = (channels: Float32Array[]): Promise<Float64Array> => kWeightedBlocks(channels, { hopsPerCheck: Infinity });

const measure = async (...channels: Float32Array[]): Promise<number | null> =>
	integratedLoudness(await onePass(channels), 0, channels[0].length / RATE);

describe("kWeightedBlocks", () => {
	// Reference values are ffmpeg 8.1.1's ebur128 momentary loudness, gated by integratedLoudness.
	const cases: Array<[string, () => Float32Array[], number]> = [
		["1 kHz, both channels", () => [tone(1000, 0.25, 3), tone(1000, 0.25, 3)], -12.0],
		["100 Hz, both channels", () => [tone(100, 0.25, 3), tone(100, 0.25, 3)], -13.9],
		["4 kHz, both channels", () => [tone(4000, 0.25, 3), tone(4000, 0.25, 3)], -8.8],
		["1 kHz, left channel only", () => [tone(1000, 0.25, 3), silence(3)], -15.0],
		["1 s of silence then 2 s of 1 kHz", () => [join(silence(1), tone(1000, 0.25, 2)), join(silence(1), tone(1000, 0.25, 2))], -12.4],
		["2 s loud then 2 s at a tenth", () => [join(tone(1000, 0.25, 2), tone(1000, 0.025, 2)), join(tone(1000, 0.25, 2), tone(1000, 0.025, 2))], -12.4],
		["a single channel holding the left signal", () => [tone(1000, 0.25, 3)], -15.0]
	];

	it.each(cases)("measures %s", async (_name, channels, expected) => {
		const lufs = await measure(...channels());
		expect(lufs).not.toBeNull();
		expect(Math.abs((lufs as number) - expected)).toBeLessThanOrEqual(TOLERANCE);
	});

	it("emits one block per complete hop and zero-pads before 0", async () => {
		const blocks = await onePass([tone(1000, 0.25, 3), tone(1000, 0.25, 3)]);
		expect(blocks).toHaveLength(30);

		const partial = await onePass([join(tone(1000, 0.25, 1), new Float32Array(100))]);
		expect(partial).toHaveLength(10);

		// Block 0 holds one hop of signal in a window of four, so a quarter of the steady-state energy.
		expect(blocks[0] / blocks[10]).toBeCloseTo(0.25, 1);
		expect(blocks[1] / blocks[10]).toBeCloseTo(0.5, 1);
	});

	it("gives blocks for a file shorter than one window that gate to null", async () => {
		const blocks = await onePass([tone(1000, 0.25, 0.3)]);
		expect(blocks).toHaveLength(3);
		expect(integratedLoudness(blocks, 0, 0.3)).toBeNull();
	});

	it("measures digital silence after a tone as exactly 0 within half a second", async () => {
		const blocks = await onePass([join(tone(1000, 0.25, 1), silence(3))]);

		// Block k opens at (k - 3) * 0.1 s, so block 18 is the first to open 0.5 s after the tone ends.
		expect([...blocks.slice(18)]).toEqual(new Array(blocks.length - 18).fill(0));
	});

	it("returns no blocks for no audio", async () => {
		expect(await onePass([])).toHaveLength(0);
		expect(await onePass([new Float32Array(0)])).toHaveLength(0);
	});
});

describe("decodeLoudnessBlocks", () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, "OfflineAudioContext");

	beforeEach(() => {
		jest.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
		if (original) Object.defineProperty(globalThis, "OfflineAudioContext", original);
		else Reflect.deleteProperty(globalThis, "OfflineAudioContext");
	});

	const ok = (): typeof fetch => (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;

	function mockContext(decodeAudioData: jest.Mock): jest.Mock {
		const ctor = jest.fn(() => ({ decodeAudioData }));
		Object.assign(globalThis, { OfflineAudioContext: ctor });
		return ctor;
	}

	const decoding = (channels: Float32Array[]): jest.Mock =>
		mockContext(jest.fn(async () => ({ numberOfChannels: channels.length, getChannelData: (i: number) => channels[i] })));

	// A clock that never moves never yields, so no test here waits on real time or a MessageChannel.
	const still = (): number => 0;
	const ticking = (ms: number): (() => number) => {
		let time = 0;
		return () => {
			time += ms;
			return time;
		};
	};

	it("decodes at 48 kHz and measures every channel", async () => {
		const channels = [tone(1000, 0.25, 3), tone(1000, 0.25, 3)];
		const ctor = decoding(channels);

		const blocks = await decodeLoudnessBlocks("https://example.com/voice.mp3", ok(), { now: still });

		expect(ctor).toHaveBeenCalledWith(1, 1, RATE);
		expect(blocks).toEqual(await onePass(channels));
	});

	describe("in slices", () => {
		// Each channel's filters decay into subnormals within a few hops of the tone ending, across several slice boundaries.
		const bed = (): Float32Array[] => [join(tone(1000, 0.25, 2), silence(3)), join(tone(100, 0.5, 2), silence(3))];

		it("lets the event loop in once a slice has run for 8 ms, without changing the result", async () => {
			const channels = bed();
			decoding(channels);
			const yieldToEventLoop = jest.fn(async () => undefined);

			const blocks = await decodeLoudnessBlocks("https://example.com/bed.mp3", ok(), { yieldToEventLoop, now: ticking(3) });

			expect(yieldToEventLoop.mock.calls.length).toBeGreaterThan(1);
			expect(blocks).toEqual(await onePass(channels));
		});

		it("never yields while a slice stays under 8 ms", async () => {
			const channels = bed();
			decoding(channels);
			const yieldToEventLoop = jest.fn(async () => undefined);

			// About thirty reads in all, so the whole measurement takes 3 ms.
			const blocks = await decodeLoudnessBlocks("https://example.com/bed.mp3", ok(), { yieldToEventLoop, now: ticking(0.1) });

			expect(yieldToEventLoop).not.toHaveBeenCalled();
			expect(blocks).toEqual(await onePass(channels));
		});
	});

	it("returns null when fetch rejects", async () => {
		mockContext(jest.fn());
		const failing = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;

		await expect(decodeLoudnessBlocks("https://example.com/voice.mp3", failing)).resolves.toBeNull();
	});

	it("returns null when the response is not ok", async () => {
		const decode = jest.fn();
		mockContext(decode);
		const missing = (async () => ({ ok: false })) as unknown as typeof fetch;

		await expect(decodeLoudnessBlocks("https://example.com/voice.mp3", missing)).resolves.toBeNull();
		expect(decode).not.toHaveBeenCalled();
	});

	it("returns null when decoding throws", async () => {
		mockContext(
			jest.fn(async () => {
				throw new Error("no audio track");
			})
		);

		await expect(decodeLoudnessBlocks("https://example.com/voice.mp3", ok())).resolves.toBeNull();
	});
});
