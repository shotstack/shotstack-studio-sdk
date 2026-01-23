/**
 * Player Sync Tests
 *
 * These tests verify that player time calculations use correct units (seconds).
 * Both edit.playbackTime and player.getPlaybackTime() are in seconds.
 *
 * Key invariants tested:
 * - getPlaybackTime() returns seconds relative to clip start
 * - getCurrentDrift() returns seconds (video vs expected time)
 * - Time values are consistent across all player types
 */

import { VideoPlayer } from "@canvas/players/video-player";
import { AudioPlayer } from "@canvas/players/audio-player";
import { LumaPlayer } from "@canvas/players/luma-player";
import { CaptionPlayer } from "@canvas/players/caption-player";
import type { Edit } from "@core/edit-session";
import type { ResolvedClip, VideoAsset, AudioAsset, LumaAsset, CaptionAsset } from "@schemas";
import * as pixi from "pixi.js";

// Mock pixi-filters (must be before pixi.js)
jest.mock("pixi-filters", () => ({
	AdjustmentFilter: jest.fn().mockImplementation(() => ({})),
	BloomFilter: jest.fn().mockImplementation(() => ({})),
	GlowFilter: jest.fn().mockImplementation(() => ({})),
	OutlineFilter: jest.fn().mockImplementation(() => ({})),
	DropShadowFilter: jest.fn().mockImplementation(() => ({}))
}));

// Mock pixi.js
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
			setMask: jest.fn()
		};
	};

	return {
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
		VideoSource: class MockVideoSource {
			resource: HTMLVideoElement;

			alphaMode = "premultiply-alpha-on-upload";

			constructor(opts: { resource: HTMLVideoElement }) {
				this.resource = opts.resource;
			}
		},
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() }))
	};
});

// Mock howler for AudioPlayer
jest.mock("howler", () => ({
	Howl: jest.fn().mockImplementation(() => ({
		play: jest.fn(),
		pause: jest.fn(),
		stop: jest.fn(),
		seek: jest.fn().mockReturnValue(0),
		volume: jest.fn().mockReturnValue(1),
		duration: jest.fn().mockReturnValue(10),
		unload: jest.fn()
	}))
}));

// Mock AssetLoader
jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockResolvedValue({}),
		loadVideoUnique: jest.fn().mockResolvedValue(null),
		unload: jest.fn(),
		getProgress: jest.fn().mockReturnValue(100),
		incrementRef: jest.fn(),
		decrementRef: jest.fn().mockReturnValue(true),
		loadTracker: { on: jest.fn(), off: jest.fn() }
	}))
}));

// Mock LumaMaskController
jest.mock("@core/luma-mask-controller", () => ({
	LumaMaskController: jest.fn().mockImplementation(() => ({
		initialize: jest.fn(),
		update: jest.fn(),
		dispose: jest.fn(),
		cleanupForPlayer: jest.fn()
	}))
}));

// Mock TextPlayer
jest.mock("@canvas/players/text-player", () => ({
	TextPlayer: { resetFontCache: jest.fn() }
}));

// Mock AlignmentGuides
jest.mock("@canvas/system/alignment-guides", () => ({
	AlignmentGuides: jest.fn().mockImplementation(() => ({
		drawCanvasGuide: jest.fn(),
		drawClipGuide: jest.fn(),
		clear: jest.fn()
	}))
}));

// Mock captions module
jest.mock("@core/captions", () => ({
	findActiveCue: jest.fn().mockReturnValue(null),
	isAliasReference: jest.fn().mockReturnValue(false),
	resolveTranscriptionAlias: jest.fn(),
	revokeVttUrl: jest.fn()
}));

// Mock subtitle loader
jest.mock("@loaders/subtitle-load-parser", () => ({
	SubtitleLoadParser: {
		load: jest.fn().mockResolvedValue([])
	}
}));

// Mock font config
jest.mock("@core/fonts/font-config", () => ({
	parseFontFamily: jest.fn().mockReturnValue("Arial"),
	resolveFontPath: jest.fn().mockReturnValue(null)
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function createMockVideoElement(): HTMLVideoElement {
	return {
		currentTime: 0,
		play: jest.fn().mockResolvedValue(undefined),
		pause: jest.fn(),
		paused: false,
		volume: 1,
		readyState: 4,
		videoWidth: 1920,
		videoHeight: 1080,
		duration: 10,
		src: "",
		load: jest.fn()
	} as unknown as HTMLVideoElement;
}

function createMockEdit(playbackTimeSec: number): Edit {
	return {
		playbackTime: playbackTimeSec,
		isPlaying: true,
		recordSyncCorrection: jest.fn(),
		assetLoader: {
			load: jest.fn(),
			loadVideoUnique: jest.fn(),
			incrementRef: jest.fn(),
			decrementRef: jest.fn()
		},
		events: { emit: jest.fn(), on: jest.fn(), off: jest.fn() },
		output: { size: { width: 1920, height: 1080 } }
	} as unknown as Edit;
}

function createVideoClipConfig(trim = 0, start = 0): ResolvedClip {
	return {
		asset: { type: "video", src: "test.mp4", trim } as VideoAsset,
		start,
		length: 10
	} as ResolvedClip;
}

function createAudioClipConfig(trim = 0, start = 0): ResolvedClip {
	return {
		asset: { type: "audio", src: "test.mp3", trim } as AudioAsset,
		start,
		length: 10
	} as ResolvedClip;
}

function createLumaClipConfig(start = 0): ResolvedClip {
	return {
		asset: { type: "luma", src: "luma.mp4" } as LumaAsset,
		start,
		length: 10
	} as ResolvedClip;
}

function createCaptionClipConfig(start = 0): ResolvedClip {
	return {
		asset: { type: "caption", src: "captions.srt" } as CaptionAsset,
		start,
		length: 10
	} as ResolvedClip;
}

// ─────────────────────────────────────────────────────────────────────────────
// VideoPlayer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("VideoPlayer", () => {
	describe("getPlaybackTime", () => {
		it("returns time in seconds", () => {
			// edit.playbackTime = 2.5 seconds from timeline start
			const mockEdit = createMockEdit(2.5);

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(0, 0));

			// getPlaybackTime() should return 2.5 seconds
			const playbackTime = player.getPlaybackTime();

			expect(playbackTime).toBe(2.5);
		});

		it("accounts for clip start time", () => {
			// edit.playbackTime = 5 seconds, clip starts at 2 seconds
			const mockEdit = createMockEdit(5);

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(0, 2));

			// playbackTime should be 5 - 2 = 3 seconds (relative to clip start)
			expect(player.getPlaybackTime()).toBe(3);
		});

		it("clamps to 0 when before clip start", () => {
			// edit.playbackTime = 1 second, but clip starts at 2 seconds
			const mockEdit = createMockEdit(1);

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(0, 2));

			// Should return 0, not negative
			expect(player.getPlaybackTime()).toBe(0);
		});

		it("clamps to clip length when past end", () => {
			// edit.playbackTime = 15 seconds, clip is 10 seconds long starting at 0
			const mockEdit = createMockEdit(15);

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(0, 0));

			// Should return 10 (clip length), not 15
			expect(player.getPlaybackTime()).toBe(10);
		});
	});

	describe("getCurrentDrift", () => {
		it("returns drift in seconds", () => {
			const mockEdit = createMockEdit(3); // 3 seconds
			const mockVideoElement = createMockVideoElement();
			const trim = 0.5;

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(trim, 0));

			// Set up texture with video element
			const mockTexture = {
				source: new pixi.VideoSource({ resource: mockVideoElement }),
				width: 1920,
				height: 1080
			};
			// @ts-expect-error - accessing private property for testing
			player.texture = mockTexture;

			// video.currentTime = 4.0, expected = playbackTime + trim = 3 + 0.5 = 3.5
			// drift = |4.0 - 0.5 - 3.0| = 0.5 seconds
			mockVideoElement.currentTime = 4.0;

			const drift = player.getCurrentDrift();

			// Drift should be 0.5 seconds
			expect(drift).toBe(0.5);
			// Should be a small decimal, not hundreds
			expect(drift).toBeLessThan(10);
		});

		it("handles zero drift correctly", () => {
			const mockEdit = createMockEdit(2); // 2 seconds
			const mockVideoElement = createMockVideoElement();
			const trim = 1.0;

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(trim, 0));

			const mockTexture = {
				source: new pixi.VideoSource({ resource: mockVideoElement }),
				width: 1920,
				height: 1080
			};
			// @ts-expect-error - accessing private property for testing
			player.texture = mockTexture;

			// video.currentTime = 3.0, expected = 2 + 1 = 3.0 (perfect sync)
			mockVideoElement.currentTime = 3.0;

			expect(player.getCurrentDrift()).toBe(0);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// AudioPlayer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AudioPlayer", () => {
	describe("getPlaybackTime", () => {
		it("returns time in seconds", () => {
			const mockEdit = createMockEdit(4.5); // 4.5 seconds

			const player = new AudioPlayer(mockEdit, createAudioClipConfig(0, 0));

			expect(player.getPlaybackTime()).toBe(4.5);
		});

		it("accounts for clip start time", () => {
			const mockEdit = createMockEdit(6); // 6 seconds

			const player = new AudioPlayer(mockEdit, createAudioClipConfig(0, 1));

			// 6 - 1 = 5 seconds relative to clip start
			expect(player.getPlaybackTime()).toBe(5);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// LumaPlayer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("LumaPlayer", () => {
	describe("getPlaybackTime", () => {
		it("returns time in seconds", () => {
			const mockEdit = createMockEdit(6); // 6 seconds

			const player = new LumaPlayer(mockEdit, createLumaClipConfig(0));

			expect(player.getPlaybackTime()).toBe(6);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// CaptionPlayer Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CaptionPlayer", () => {
	describe("getPlaybackTime", () => {
		it("returns time in seconds", () => {
			const mockEdit = createMockEdit(7.5); // 7.5 seconds

			const player = new CaptionPlayer(mockEdit, createCaptionClipConfig(0));

			expect(player.getPlaybackTime()).toBe(7.5);
		});
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression Guard Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Regression guards", () => {
	describe("time unit consistency across all players", () => {
		it("all players return getPlaybackTime in seconds for same edit.playbackTime", () => {
			const mockEdit = createMockEdit(5); // 5 seconds

			const videoPlayer = new VideoPlayer(mockEdit, createVideoClipConfig(0, 0));
			const audioPlayer = new AudioPlayer(mockEdit, createAudioClipConfig(0, 0));
			const lumaPlayer = new LumaPlayer(mockEdit, createLumaClipConfig(0));
			const captionPlayer = new CaptionPlayer(mockEdit, createCaptionClipConfig(0));

			// All should return 5 seconds
			expect(videoPlayer.getPlaybackTime()).toBe(5);
			expect(audioPlayer.getPlaybackTime()).toBe(5);
			expect(lumaPlayer.getPlaybackTime()).toBe(5);
			expect(captionPlayer.getPlaybackTime()).toBe(5);
		});

		it("verifies values are small decimals (seconds)", () => {
			// Use 8 seconds - within the 10s clip length
			const mockEdit = createMockEdit(8);

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(0, 0));
			const playbackTime = player.getPlaybackTime();

			// Should be exactly 8 seconds
			expect(playbackTime).toBe(8);
			// Should be a small value, not hundreds or thousands
			expect(playbackTime).toBeLessThan(100);
		});
	});

	describe("drift calculation unit consistency", () => {
		it("getCurrentDrift returns small values (seconds)", () => {
			const mockEdit = createMockEdit(5);
			const mockVideoElement = createMockVideoElement();

			const player = new VideoPlayer(mockEdit, createVideoClipConfig(0, 0));

			const mockTexture = {
				source: new pixi.VideoSource({ resource: mockVideoElement }),
				width: 1920,
				height: 1080
			};
			// @ts-expect-error - accessing private property for testing
			player.texture = mockTexture;

			// Set video 0.3 seconds ahead
			mockVideoElement.currentTime = 5.3;

			const drift = player.getCurrentDrift();

			// Drift in seconds: 0.3
			expect(drift).toBeCloseTo(0.3, 1);
			// Should be a small value
			expect(drift).not.toBeGreaterThan(10);
		});
	});
});
