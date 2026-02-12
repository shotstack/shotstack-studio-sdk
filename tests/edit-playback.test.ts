/**
 * Edit Class Playback Tests
 *
 * Tests the playback state machine: play(), pause(), seek(), stop(), and update()
 * These methods control timeline playback and emit events for UI synchronization.
 */

import { Edit } from "@core/edit-session";
import type { EventEmitter } from "@core/events/event-emitter";
import { ms, sec } from "@core/timing/types";

// Mock pixi-filters (must be before pixi.js since it extends pixi classes)
jest.mock("pixi-filters", () => ({
	AdjustmentFilter: jest.fn().mockImplementation(() => ({})),
	BloomFilter: jest.fn().mockImplementation(() => ({})),
	GlowFilter: jest.fn().mockImplementation(() => ({})),
	OutlineFilter: jest.fn().mockImplementation(() => ({})),
	DropShadowFilter: jest.fn().mockImplementation(() => ({}))
}));

// Mock pixi.js to prevent WebGL initialization
jest.mock("pixi.js", () => {
	const createMockContainer = (): Record<string, unknown> => {
		const children: unknown[] = [];
		return {
			children,
			sortableChildren: true,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
			visible: true,
			scale: { set: jest.fn(), x: 1, y: 1 },
			pivot: { set: jest.fn(), x: 0, y: 0 },
			position: { set: jest.fn(), x: 0, y: 0 },
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				if (typeof child === "object" && child !== null) {
					// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
					child.parent = createMockContainer();
				}
				return child;
			}),
			removeChild: jest.fn((child: unknown) => {
				const idx = children.indexOf(child);
				if (idx !== -1) children.splice(idx, 1);
				return child;
			}),
			removeChildAt: jest.fn(),
			getChildByLabel: jest.fn(() => null),
			getChildIndex: jest.fn(() => 0),
			destroy: jest.fn(),
			setMask: jest.fn()
		};
	};

	const createMockGraphics = (): Record<string, unknown> => ({
		fillStyle: {},
		rect: jest.fn().mockReturnThis(),
		fill: jest.fn().mockReturnThis(),
		clear: jest.fn().mockReturnThis(),
		destroy: jest.fn()
	});

	return {
		Container: jest.fn().mockImplementation(createMockContainer),
		Graphics: jest.fn().mockImplementation(createMockGraphics),
		Sprite: jest.fn().mockImplementation(() => ({
			texture: {},
			width: 100,
			height: 100,
			parent: null,
			destroy: jest.fn()
		})),
		Texture: { from: jest.fn() },
		Assets: { load: jest.fn(), unload: jest.fn(), cache: { has: jest.fn().mockReturnValue(false) } },
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() }))
	};
});

// Mock AssetLoader
jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue({}),
		unload: jest.fn(),
		getProgress: jest.fn().mockReturnValue(100),
		incrementRef: jest.fn(),
		decrementRef: jest.fn().mockReturnValue(true),
		loadTracker: {
			on: jest.fn(),
			off: jest.fn()
		}
	}))
}));

// Mock LumaMaskController
jest.mock("@core/luma-mask-controller", () => ({
	LumaMaskController: jest.fn().mockImplementation(() => ({
		initialize: jest.fn(),
		update: jest.fn(),
		dispose: jest.fn(),
		cleanupForPlayer: jest.fn(),
		getActiveMaskCount: jest.fn().mockReturnValue(0)
	}))
}));

// Mock TextPlayer font cache
jest.mock("@canvas/players/text-player", () => ({
	TextPlayer: {
		resetFontCache: jest.fn()
	}
}));

// Mock AlignmentGuides
jest.mock("@canvas/system/alignment-guides", () => ({
	AlignmentGuides: jest.fn().mockImplementation(() => ({
		drawCanvasGuide: jest.fn(),
		drawClipGuide: jest.fn(),
		clear: jest.fn()
	}))
}));

describe("Edit Playback", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		// Create Edit instance from template
		edit = new Edit({
			timeline: {
				tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 0, length: 1 }] }]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});

		// Initialize the container (normally done by Canvas)
		await edit.load();

		// Access the internal events emitter
		events = edit.getInternalEvents();
		emitSpy = jest.spyOn(events, "emit");

		// Set up a mock duration for testing (use Seconds branded type)
		edit.totalDuration = sec(10); // 10 seconds
		edit.playbackTime = sec(0);
		edit.isPlaying = false;
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("play()", () => {
		it("sets isPlaying to true", () => {
			expect(edit.isPlaying).toBe(false);

			edit.play();

			expect(edit.isPlaying).toBe(true);
		});

		it("emits playback:play event", () => {
			edit.play();

			expect(emitSpy).toHaveBeenCalledWith("playback:play");
		});

		it("does not change playbackTime", () => {
			edit.playbackTime = sec(5);

			edit.play();

			expect(edit.playbackTime).toBe(5);
		});
	});

	describe("pause()", () => {
		it("sets isPlaying to false", () => {
			edit.isPlaying = true;

			edit.pause();

			expect(edit.isPlaying).toBe(false);
		});

		it("emits playback:pause event", () => {
			edit.pause();

			expect(emitSpy).toHaveBeenCalledWith("playback:pause");
		});

		it("does not change playbackTime", () => {
			edit.playbackTime = sec(5);
			edit.isPlaying = true;

			edit.pause();

			expect(edit.playbackTime).toBe(5);
		});
	});

	describe("seek()", () => {
		it("updates playbackTime to target", () => {
			edit.seek(sec(5));

			expect(edit.playbackTime).toBe(5);
		});

		it("clamps negative time to 0", () => {
			edit.seek(sec(-1));

			expect(edit.playbackTime).toBe(0);
		});

		it("clamps time beyond duration to totalDuration", () => {
			edit.seek(sec(20)); // Beyond 10 second duration

			expect(edit.playbackTime).toBe(10);
		});

		it("pauses playback when seeking", () => {
			edit.isPlaying = true;

			edit.seek(sec(5));

			expect(edit.isPlaying).toBe(false);
		});

		it("emits playback:pause event", () => {
			edit.isPlaying = true;

			edit.seek(sec(5));

			expect(emitSpy).toHaveBeenCalledWith("playback:pause");
		});

		it("seeks to exact boundary values", () => {
			edit.seek(sec(0));
			expect(edit.playbackTime).toBe(0);

			edit.seek(sec(10));
			expect(edit.playbackTime).toBe(10);
		});
	});

	describe("stop()", () => {
		it("resets playbackTime to 0", () => {
			edit.playbackTime = sec(5);

			edit.stop();

			expect(edit.playbackTime).toBe(0);
		});

		it("pauses playback", () => {
			edit.isPlaying = true;

			edit.stop();

			expect(edit.isPlaying).toBe(false);
		});
	});

	describe("update() playback advancement", () => {
		it("advances playbackTime by elapsed when playing", () => {
			edit.isPlaying = true;
			edit.playbackTime = sec(0);

			edit.update(0.016, ms(100)); // 100ms elapsed = 0.1s

			expect(edit.playbackTime).toBe(0.1);
		});

		it("does not advance playbackTime when paused", () => {
			edit.isPlaying = false;
			edit.playbackTime = sec(1);

			edit.update(0.016, ms(100));

			expect(edit.playbackTime).toBe(1);
		});

		it("clamps playbackTime to totalDuration", () => {
			edit.isPlaying = true;
			edit.playbackTime = sec(9.95);

			edit.update(0.016, ms(100)); // Would advance to 10.05, but should clamp to 10

			expect(edit.playbackTime).toBe(10);
		});

		it("auto-pauses when reaching end of timeline", () => {
			edit.isPlaying = true;
			edit.playbackTime = sec(9.95);

			edit.update(0.016, ms(100)); // Reaches end

			expect(edit.isPlaying).toBe(false);
			expect(emitSpy).toHaveBeenCalledWith("playback:pause");
		});

		it("clamps negative elapsed values to 0", () => {
			edit.isPlaying = true;
			edit.playbackTime = sec(5);

			edit.update(0.016, ms(-100)); // Negative elapsed (-100ms = -0.1s)

			// playbackTime + (-0.1) = 4.9, clamped to max(0, min(4.9, 10)) = 4.9
			expect(edit.playbackTime).toBe(4.9);
		});

		it("correctly converts milliseconds to seconds for playback time (regression: #play-immediately-pauses)", () => {
			// This test prevents regression of a bug where milliseconds were added directly
			// to playbackTime (in seconds), causing playback to jump to end immediately.
			// At 60fps, ticker passes ~16.67ms. If added as seconds, playback would advance
			// 16.67 "seconds" per frame instead of 0.01667 seconds.
			edit.isPlaying = true;
			edit.playbackTime = sec(0);
			edit.totalDuration = sec(10);

			// Simulate 60fps frame (~16.67ms)
			edit.update(0.016, ms(16.67));

			// Should advance by ~0.01667 seconds, NOT 16.67 seconds
			expect(edit.playbackTime).toBeCloseTo(0.01667, 3);
			expect(edit.isPlaying).toBe(true); // Should still be playing, not auto-paused
		});
	});

	describe("playback edge cases", () => {
		it("handles empty timeline (duration 0)", () => {
			edit.totalDuration = sec(0);
			edit.playbackTime = sec(0);
			edit.isPlaying = true;

			edit.update(0.016, ms(100));

			// Should immediately hit end and pause
			expect(edit.playbackTime).toBe(0);
			expect(edit.isPlaying).toBe(false);
		});

		it("seek while playing stops playback", () => {
			edit.isPlaying = true;
			edit.playbackTime = sec(2);

			edit.seek(sec(8));

			expect(edit.isPlaying).toBe(false);
			expect(edit.playbackTime).toBe(8);
		});

		it("play at end of timeline (no advancement)", () => {
			edit.playbackTime = sec(10);
			edit.isPlaying = true;

			edit.update(0.016, ms(100));

			// Already at end, should pause immediately
			expect(edit.playbackTime).toBe(10);
			expect(edit.isPlaying).toBe(false);
		});
	});

	describe("playback state sequences", () => {
		it("play → pause → play preserves position", () => {
			edit.playbackTime = sec(3);

			edit.play();
			expect(edit.isPlaying).toBe(true);
			expect(edit.playbackTime).toBe(3);

			edit.pause();
			expect(edit.isPlaying).toBe(false);
			expect(edit.playbackTime).toBe(3);

			edit.play();
			expect(edit.isPlaying).toBe(true);
			expect(edit.playbackTime).toBe(3);
		});

		it("play → seek → play restarts from seek position", () => {
			edit.play();
			edit.playbackTime = sec(2); // Simulate some advancement

			edit.seek(sec(7));
			expect(edit.isPlaying).toBe(false);
			expect(edit.playbackTime).toBe(7);

			edit.play();
			expect(edit.isPlaying).toBe(true);
			expect(edit.playbackTime).toBe(7);
		});

		it("stop always returns to beginning", () => {
			edit.play();
			edit.playbackTime = sec(5);

			edit.stop();
			expect(edit.playbackTime).toBe(0);
			expect(edit.isPlaying).toBe(false);

			edit.play();
			edit.playbackTime = sec(8);

			edit.stop();
			expect(edit.playbackTime).toBe(0);
		});

		it("repeated stops are idempotent", () => {
			edit.playbackTime = sec(5);

			edit.stop();
			expect(edit.playbackTime).toBe(0);

			edit.stop();
			expect(edit.playbackTime).toBe(0);

			edit.stop();
			expect(edit.playbackTime).toBe(0);
		});
	});

	describe("event emission patterns", () => {
		it("pause emits single event per call", () => {
			edit.pause();
			edit.pause();
			edit.pause();

			const pauseEvents = emitSpy.mock.calls.filter(call => call[0] === "playback:pause");
			expect(pauseEvents.length).toBe(3);
		});

		it("play emits single event per call", () => {
			edit.play();
			edit.play();

			const playEvents = emitSpy.mock.calls.filter(call => call[0] === "playback:play");
			expect(playEvents.length).toBe(2);
		});

		it("seek emits pause event (via internal pause call)", () => {
			edit.isPlaying = true;
			emitSpy.mockClear();

			edit.seek(sec(5));

			expect(emitSpy).toHaveBeenCalledWith("playback:pause");
		});

		it("stop emits pause event (via seek → pause)", () => {
			edit.isPlaying = true;
			emitSpy.mockClear();

			edit.stop();

			expect(emitSpy).toHaveBeenCalledWith("playback:pause");
		});
	});
});
