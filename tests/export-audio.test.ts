import { PlayerType, type Player } from "@canvas/players/player";
import { AudioProcessor } from "@core/export/audio-processor";

// Player modules extend pixi filters at load; the mix itself never touches pixi.
jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs
}));

type Scheduled = { start: unknown[][]; stop: unknown[][]; rate: { setValueAtTime: jest.Mock; setValueCurveAtTime: jest.Mock } };

const scheduled: Scheduled[] = [];

function createBufferSource() {
	const source = {
		buffer: null as unknown,
		playbackRate: { setValueAtTime: jest.fn(), setValueCurveAtTime: jest.fn() },
		connect: (node: unknown) => node,
		start: jest.fn(),
		stop: jest.fn()
	};
	scheduled.push({ start: source.start.mock.calls, stop: source.stop.mock.calls, rate: source.playbackRate });
	return source;
}

const createGain = () => ({ gain: { setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() }, connect: (node: unknown) => node });

function mediaClip(playerType: PlayerType, asset: Record<string, unknown>, start: number, length: number): Player {
	return {
		clipId: `${playerType}-clip`,
		playerType,
		clipConfiguration: { asset },
		getStart: () => start,
		getLength: () => length
	} as unknown as Player;
}

beforeAll(() => {
	// Node has no Web Audio; the mix only needs these calls to schedule sources.
	Object.assign(globalThis, {
		OfflineAudioContext: jest.fn(() => ({
			destination: {},
			createBufferSource,
			createGain,
			decodeAudioData: async () => ({ duration: 60 }),
			startRendering: async () => ({ length: 1 })
		})),
		fetch: jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
	});
});

beforeEach(() => {
	scheduled.length = 0;
});

describe("AudioProcessor speed", () => {
	it("plays a constant speed at that rate from speed × trim, for the clip's length", async () => {
		await new AudioProcessor().renderMix(
			[[mediaClip(PlayerType.Audio, { type: "audio", src: "https://example.com/a.mp3", trim: 1, speed: 2 }, 3, 4)]],
			10
		);

		expect(scheduled[0].rate.setValueAtTime).toHaveBeenCalledWith(2, 3);
		expect(scheduled[0].start).toEqual([[3, 2]]);
		expect(scheduled[0].stop).toEqual([[7]]);
	});

	it("plays at normal speed from the trim when the clip has no speed", async () => {
		await new AudioProcessor().renderMix([[mediaClip(PlayerType.Audio, { type: "audio", src: "https://example.com/a.mp3", trim: 1 }, 0, 4)]], 10);

		expect(scheduled[0].rate.setValueAtTime).toHaveBeenCalledWith(1, 0);
		expect(scheduled[0].start).toEqual([[0, 1]]);
	});

	it("follows a speed curve from the unscaled trim", async () => {
		const speed = [{ from: 1, to: 3, start: 0, length: 2 }];

		await new AudioProcessor().renderMix(
			[[mediaClip(PlayerType.Video, { type: "video", src: "https://example.com/v.mp4", trim: 1, speed }, 0.5, 2)]],
			10
		);

		const [curve, when, duration] = scheduled[0].rate.setValueCurveAtTime.mock.calls[0];
		expect(when).toBe(0.5);
		expect(duration).toBe(2);
		expect(curve[0]).toBeCloseTo(1);
		expect(curve[curve.length - 1]).toBeCloseTo(3);
		expect(scheduled[0].start).toEqual([[0.5, 1]]);
		expect(scheduled[0].stop).toEqual([[2.5]]);
	});
});

describe("AudioProcessor failures", () => {
	beforeEach(() => {
		jest.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("fails with phase assets, naming the clip, when an audio or speech clip's file can't be fetched or decoded", async () => {
		jest.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
		await expect(
			new AudioProcessor().renderMix([[mediaClip(PlayerType.Audio, { type: "audio", src: "https://example.com/gone.mp3" }, 0, 4)]], 10)
		).rejects.toMatchObject({ name: "ExportError", phase: "assets", context: { clipId: "audio-clip" } });

		jest.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
		await expect(
			new AudioProcessor().renderMix([[mediaClip(PlayerType.TextToSpeech, { type: "text-to-speech", src: "https://example.com/tts.mp3" }, 0, 4)]], 10)
		).rejects.toMatchObject({ phase: "assets", context: { clipId: "text-to-speech-clip" } });
	});

	it("leaves a video without usable audio silent", async () => {
		jest.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);

		await expect(
			new AudioProcessor().renderMix([[mediaClip(PlayerType.Video, { type: "video", src: "https://example.com/silent.mp4" }, 0, 4)]], 10)
		).resolves.toBeNull();
	});
});
