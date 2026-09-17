/**
 * Regression: Howler rate() getter crashes when _sounds[0] is undefined
 * (unload / empty pool) while AudioPlayer.update still runs on the Pixi ticker.
 *
 * @jest-environment jsdom
 */
/* eslint-disable no-underscore-dangle */

import { AudioPlayer } from "@canvas/players/audio-player";
import type { Edit } from "@core/edit-session";
import { sec, type Seconds } from "@core/timing/types";
import type { AudioAsset, ResolvedClip } from "@schemas";

jest.mock("pixi-filters", () => ({
	AdjustmentFilter: jest.fn().mockImplementation(() => ({})),
	BloomFilter: jest.fn().mockImplementation(() => ({})),
	GlowFilter: jest.fn().mockImplementation(() => ({})),
	OutlineFilter: jest.fn().mockImplementation(() => ({})),
	DropShadowFilter: jest.fn().mockImplementation(() => ({}))
}));

jest.mock("pixi.js", () => {
	const createMockContainer = (): Record<string, unknown> => {
		const children: unknown[] = [];
		return {
			children,
			sortableChildren: true,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				return child;
			}),
			removeChild: jest.fn((child: unknown) => {
				const idx = children.indexOf(child);
				if (idx !== -1) children.splice(idx, 1);
				return child;
			}),
			destroy: jest.fn(),
			setMask: jest.fn(),
			alpha: 1,
			visible: true,
			rotation: 0,
			angle: 0,
			position: { x: 0, y: 0, set: jest.fn() },
			scale: { x: 1, y: 1, set: jest.fn() },
			pivot: { x: 0, y: 0, set: jest.fn() },
			skew: { set: jest.fn() }
		};
	};

	return {
		// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
		...require("./helpers/pixi-mock-filters").pixiFilterStubs,
		Container: jest.fn().mockImplementation(createMockContainer),
		Graphics: jest.fn().mockImplementation(() => ({
			rect: jest.fn().mockReturnThis(),
			fill: jest.fn().mockReturnThis(),
			clear: jest.fn().mockReturnThis(),
			destroy: jest.fn()
		})),
		Sprite: jest.fn().mockImplementation(() => ({
			texture: {},
			width: 1920,
			height: 1080,
			anchor: { set: jest.fn() },
			destroy: jest.fn()
		})),
		Texture: {
			from: jest.fn(),
			WHITE: {}
		},
		Rectangle: jest.fn().mockImplementation((x, y, w, h) => ({ x, y, width: w, height: h })),
		Assets: {
			load: jest.fn(),
			unload: jest.fn(),
			cache: { has: jest.fn().mockReturnValue(false) }
		},
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() }))
	};
});

jest.mock("howler", () => ({
	Howl: jest.fn()
}));

function createMockEdit(playbackTimeSec: number, isPlaying = true): Edit {
	return {
		playbackTime: sec(playbackTimeSec) as Seconds,
		isPlaying,
		assetLoader: {
			load: jest.fn(),
			loadVideoUnique: jest.fn(),
			incrementRef: jest.fn(),
			decrementRef: jest.fn()
		},
		events: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
		size: { width: 1920, height: 1080 },
		output: { size: { width: 1920, height: 1080 } }
	} as unknown as Edit;
}

function createAudioClipConfig(speed = 1): ResolvedClip {
	return {
		asset: { type: "audio", src: "test.mp3", volume: 1, speed } as AudioAsset,
		start: 0,
		length: 10
	} as ResolvedClip;
}

type MockHowl = {
	_sounds: Array<{ _id: number; _rate?: number }>;
	_rate: number;
	_volume: number;
	state: jest.Mock;
	rate: jest.Mock;
	volume: jest.Mock;
	seek: jest.Mock;
	play: jest.Mock;
	pause: jest.Mock;
	stop: jest.Mock;
	unload: jest.Mock;
	duration: jest.Mock;
};

function createCrashingHowl(options: { state: "loaded" | "unloaded" | "loading"; sounds: Array<{ _id: number; _rate?: number }> }): MockHowl {
	const howl: MockHowl = {
		_sounds: options.sounds,
		_rate: 1,
		_volume: 1,
		state: jest.fn().mockReturnValue(options.state),
		rate: jest.fn(function rate(this: MockHowl, ...args: unknown[]) {
			// Mirror Howler's unguarded getter: rate() → _sounds[0]._id
			if (args.length === 0) {
				const [sound] = this._sounds;
				// Intentionally unguarded — reproduces Howler TypeError when pool empty
				return sound._rate ?? this._rate ?? 1;
			}
			const [maybeRate] = args;
			if (typeof maybeRate === "number") {
				this._rate = maybeRate;
			}
			return this;
		}),
		volume: jest.fn(function volume(this: MockHowl, ...args: unknown[]) {
			if (args.length === 0) {
				return this._volume;
			}
			this._volume = args[0] as number;
			return this;
		}),
		seek: jest.fn().mockReturnValue(0),
		play: jest.fn().mockReturnValue(1),
		pause: jest.fn(),
		stop: jest.fn(),
		unload: jest.fn(),
		duration: jest.fn().mockReturnValue(10)
	};
	return howl;
}

describe("AudioPlayer Howler rate guard", () => {
	it("does not call Howler rate when _sounds is empty (avoids TypeError on _id)", () => {
		const mockEdit = createMockEdit(1, true);
		const player = new AudioPlayer(mockEdit, createAudioClipConfig(1.5));

		const howl = createCrashingHowl({ state: "unloaded", sounds: [] });

		// Simulate a Howl that was unloaded while the player still holds a reference
		// @ts-expect-error - private fields for regression harness
		player.audioResource = howl;
		// @ts-expect-error - private fields for regression harness
		player.volumeKeyframeBuilder = { getValue: () => 1 };
		// @ts-expect-error - private fields for regression harness
		player.isPlaying = true;

		expect(() => player.update(16, 16)).not.toThrow();
		expect(howl.rate).not.toHaveBeenCalled();
		expect(howl.volume).not.toHaveBeenCalled();
		expect(howl.play).not.toHaveBeenCalled();
		// @ts-expect-error - private fields for regression harness
		expect(player.isPlaying).toBe(false);
	});

	it("does not call Howler rate when state is loaded but sound pool is empty", () => {
		const mockEdit = createMockEdit(1, true);
		const player = new AudioPlayer(mockEdit, createAudioClipConfig(2));

		const howl = createCrashingHowl({ state: "loaded", sounds: [] });

		// @ts-expect-error - private fields for regression harness
		player.audioResource = howl;
		// @ts-expect-error - private fields for regression harness
		player.volumeKeyframeBuilder = { getValue: () => 1 };

		expect(() => player.update(16, 16)).not.toThrow();
		expect(howl.rate).not.toHaveBeenCalled();
	});

	it("applies rate when Howl is loaded with an active sound", () => {
		const mockEdit = createMockEdit(1, true);
		const player = new AudioPlayer(mockEdit, createAudioClipConfig(1.25));

		const howl = createCrashingHowl({
			state: "loaded",
			sounds: [{ _id: 42, _rate: 1 }]
		});

		// @ts-expect-error - private fields for regression harness
		player.audioResource = howl;
		// @ts-expect-error - private fields for regression harness
		player.volumeKeyframeBuilder = { getValue: () => 0.8 };
		// @ts-expect-error - private fields for regression harness
		player.isPlaying = false;

		expect(() => player.update(16, 16)).not.toThrow();
		expect(howl.rate).toHaveBeenCalled();
		expect(howl.play).toHaveBeenCalled();
		// @ts-expect-error - private fields for regression harness
		expect(player.isPlaying).toBe(true);
	});
});
