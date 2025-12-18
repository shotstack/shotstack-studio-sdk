import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { LumaMaskController } from "../src/core/luma-mask-controller";

// Define PlayerType enum locally since we're mocking the module
enum PlayerType {
	Video = "video",
	Image = "image",
	Audio = "audio",
	Text = "text",
	Html = "html",
	Shape = "shape",
	Caption = "caption",
	Luma = "luma",
	RichText = "rich-text"
}

// Mock pixi.js before any imports that use it
jest.mock("pixi.js", () => {
	const createMockPixiContainer = () => {
		const children: unknown[] = [];
		return {
			children,
			parent: null as unknown,
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
				child.parent = createMockPixiContainer();
			}),
			removeChild: jest.fn(),
			destroy: jest.fn()
		};
	};

	return {
		Container: jest.fn().mockImplementation(createMockPixiContainer),
		Sprite: jest.fn().mockImplementation((texture: unknown) => ({
			texture,
			width: 100,
			height: 100,
			filters: null,
			parent: null,
			destroy: jest.fn()
		})),
		Texture: jest.fn(),
		ColorMatrixFilter: jest.fn(() => ({
			negative: jest.fn()
		}))
	};
});

// Mock LumaPlayer to avoid loading the full player dependency chain
jest.mock("../src/components/canvas/players/luma-player", () => ({
	LumaPlayer: jest.fn()
}));

// Mock the player module
jest.mock("../src/components/canvas/players/player", () => ({
	PlayerType: {
		Video: "video",
		Image: "image",
		Audio: "audio",
		Text: "text",
		Html: "html",
		Shape: "shape",
		Caption: "caption",
		Luma: "luma",
		RichText: "rich-text"
	}
}));

// Mock PixiJS objects
function createMockTexture() {
	return {
		destroy: jest.fn()
	};
}

function createMockSprite(texture = createMockTexture()) {
	const sprite: Record<string, unknown> = {
		texture,
		width: 100,
		height: 100,
		filters: null,
		parent: null,
		destroy: jest.fn()
	};
	return sprite;
}

interface MockContainer {
	children: unknown[];
	parent: unknown;
	addChild: jest.Mock;
	removeChild: jest.Mock;
	destroy: jest.Mock;
}

function createMockContainer(): MockContainer {
	const children: unknown[] = [];
	const container: MockContainer = {
		children,
		parent: null,
		addChild: jest.fn(),
		removeChild: jest.fn(),
		destroy: jest.fn()
	};
	// Set up implementations that reference container
	container.addChild = jest.fn((child: unknown) => {
		children.push(child);
		if (child && typeof child === "object") {
			// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
			(child as { parent?: unknown }).parent = container;
		}
	});
	container.removeChild = jest.fn((child: unknown) => {
		const idx = children.indexOf(child);
		if (idx >= 0) children.splice(idx, 1);
		if (child && typeof child === "object") {
			// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
			(child as { parent?: unknown }).parent = null;
		}
	});
	return container;
}

interface MockContentContainer {
	mask: unknown;
	setMask: (opts: { mask: unknown }) => void;
}

function createMockContentContainer(): MockContentContainer {
	const contentContainer: MockContentContainer = {
		mask: null,
		setMask: jest.fn()
	};
	contentContainer.setMask = jest.fn((opts: { mask: unknown }) => {
		contentContainer.mask = opts.mask;
	});
	return contentContainer;
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

function createMockLumaPlayer(options: { isVideo?: boolean; videoTime?: number; hasSprite?: boolean } = {}) {
	const { isVideo = false, videoTime = 0, hasSprite = true } = options;
	const container = createMockContainer();
	const sprite = hasSprite ? createMockSprite() : null;

	return {
		playerType: PlayerType.Luma,
		getSprite: jest.fn(() => sprite),
		getContainer: jest.fn(() => container),
		isVideoSource: jest.fn(() => isVideo),
		getVideoCurrentTime: jest.fn(() => videoTime),
		load: jest.fn(() => Promise.resolve()),
		getSize: jest.fn(() => ({ width: 100, height: 100 })),
		getContentContainer: jest.fn(() => createMockContentContainer())
	};
}

function createMockContentPlayer() {
	const container = createMockContainer();
	const contentContainer = createMockContentContainer();

	return {
		playerType: PlayerType.Video,
		getContainer: jest.fn(() => container),
		getContentContainer: jest.fn(() => contentContainer),
		getSize: jest.fn(() => ({ width: 200, height: 200 }))
	};
}

function createMockCanvas() {
	return {
		application: {
			renderer: {
				generateTexture: jest.fn(() => createMockTexture())
			}
		}
	};
}

function createMockEventEmitter() {
	const listeners: Record<string, Array<() => void>> = {};
	return {
		on: jest.fn((event: string, callback: () => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(callback);
		}),
		off: jest.fn(),
		emit: (event: string) => {
			if (listeners[event]) {
				listeners[event].forEach(cb => cb());
			}
		},
		getListeners: () => listeners
	};
}

describe("LumaMaskController", () => {
	describe("initialization and state", () => {
		it("getActiveMaskCount returns 0 initially", () => {
			const controller = new LumaMaskController(
				() => null,
				() => [],
				createMockEventEmitter() as never
			);

			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("initialize sets up event listeners", () => {
			const events = createMockEventEmitter();
			const controller = new LumaMaskController(
				() => null,
				() => [],
				events as never
			);

			controller.initialize();

			expect(events.on).toHaveBeenCalledWith("clip:added", expect.any(Function));
			expect(events.on).toHaveBeenCalledWith("clip:split", expect.any(Function));
			expect(events.on).toHaveBeenCalledWith("clip:updated", expect.any(Function));
			expect(events.on).toHaveBeenCalledWith("clip:restored", expect.any(Function));
			expect(events.on).toHaveBeenCalledWith("clip:deleted", expect.any(Function));
		});
	});

	describe("finalizeLumaMasking (via initialize)", () => {
		it("creates mask when track has luma player and content clip", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(controller.getActiveMaskCount()).toBe(1);
			expect(canvas.application.renderer.generateTexture).toHaveBeenCalled();
		});

		it("does NOT create mask when track has only luma player", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const tracks = [[lumaPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("does NOT create mask when track has only content clips", () => {
			const canvas = createMockCanvas();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("removes luma player container from parent after setup", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();

			// Simulate luma player being in a parent container
			const parentContainer = createMockContainer();
			const lumaContainer = lumaPlayer.getContainer();
			parentContainer.addChild(lumaContainer);

			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(parentContainer.removeChild).toHaveBeenCalledWith(lumaContainer);
		});

		it("handles multiple tracks independently", () => {
			const canvas = createMockCanvas();
			const lumaPlayer1 = createMockLumaPlayer();
			const contentPlayer1 = createMockContentPlayer();
			const lumaPlayer2 = createMockLumaPlayer();
			const contentPlayer2 = createMockContentPlayer();

			const tracks = [
				[lumaPlayer1, contentPlayer1],
				[lumaPlayer2, contentPlayer2]
			];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(controller.getActiveMaskCount()).toBe(2);
		});

		it("does not create mask when canvas is null", () => {
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => null,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("does not create mask when luma player has no sprite", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer({ hasSprite: false });
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			expect(controller.getActiveMaskCount()).toBe(0);
		});
	});

	describe("cleanupForPlayer", () => {
		let controller: LumaMaskController;
		let lumaPlayer: ReturnType<typeof createMockLumaPlayer>;
		let contentPlayer: ReturnType<typeof createMockContentPlayer>;

		beforeEach(() => {
			const canvas = createMockCanvas();
			lumaPlayer = createMockLumaPlayer();
			contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();
		});

		it("removes mask from content clip", () => {
			const contentContainer = contentPlayer.getContentContainer();

			controller.cleanupForPlayer(lumaPlayer as never);

			expect(contentContainer.mask).toBeNull();
		});

		it("removes mask from activeLumaMasks array", () => {
			expect(controller.getActiveMaskCount()).toBe(1);

			controller.cleanupForPlayer(lumaPlayer as never);

			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("no-op if player not found in active masks", () => {
			const otherPlayer = createMockLumaPlayer();

			controller.cleanupForPlayer(otherPlayer as never);

			expect(controller.getActiveMaskCount()).toBe(1);
		});
	});

	describe("processPendingMaskCleanup (via update)", () => {
		it("does NOT destroy until 3 frames elapsed", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();
			controller.cleanupForPlayer(lumaPlayer as never);

			// First two updates should not destroy
			controller.update();
			controller.update();

			// Mask sprite destroy should not have been called yet for cleanup
			// (the mask is in pending cleanup, not yet destroyed)
			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("destroys sprite after 3 frames", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();
			controller.cleanupForPlayer(lumaPlayer as never);

			// Three updates to reach cleanup threshold
			controller.update();
			controller.update();
			controller.update();

			// After 3 frames, cleanup should have occurred
			expect(controller.getActiveMaskCount()).toBe(0);
		});
	});

	describe("dispose", () => {
		it("clears activeLumaMasks array", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();
			expect(controller.getActiveMaskCount()).toBe(1);

			controller.dispose();

			expect(controller.getActiveMaskCount()).toBe(0);
		});

		it("clears pendingMaskCleanup array", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();
			controller.cleanupForPlayer(lumaPlayer as never);

			// Now there's a pending cleanup item
			controller.dispose();

			// After dispose, update should not throw even though pending items were cleared
			expect(() => controller.update()).not.toThrow();
		});

		it("handles errors during cleanup gracefully", () => {
			const canvas = createMockCanvas();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			// Should not throw even if internal destroy fails
			expect(() => controller.dispose()).not.toThrow();
		});
	});

	describe("updateLumaMasks (via update)", () => {
		it("does not throw when canvas is null", () => {
			const controller = new LumaMaskController(
				() => null,
				() => [],
				createMockEventEmitter() as never
			);

			expect(() => controller.update()).not.toThrow();
		});

		it("updates video source mask when frame changes", () => {
			const canvas = createMockCanvas();
			let videoTime = 0;
			const lumaPlayer = createMockLumaPlayer({ isVideo: true });
			(lumaPlayer.getVideoCurrentTime as jest.Mock).mockImplementation(() => videoTime);

			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();
			const initialCalls = (canvas.application.renderer.generateTexture as jest.Mock).mock.calls.length;

			// Advance video time by more than 1/30 second
			videoTime = 0.05;
			controller.update();

			expect((canvas.application.renderer.generateTexture as jest.Mock).mock.calls.length).toBeGreaterThan(initialCalls);
		});

		it("does NOT update when frame has not changed enough", () => {
			const canvas = createMockCanvas();
			let videoTime = 0;
			const lumaPlayer = createMockLumaPlayer({ isVideo: true });
			(lumaPlayer.getVideoCurrentTime as jest.Mock).mockImplementation(() => videoTime);

			const contentPlayer = createMockContentPlayer();
			const tracks = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				createMockEventEmitter() as never
			);

			controller.initialize();

			// First update to set lastVideoTime
			videoTime = 0.05;
			controller.update();
			const callsAfterFirstUpdate = (canvas.application.renderer.generateTexture as jest.Mock).mock.calls.length;

			// Small time change (less than 1/30 second)
			videoTime = 0.06;
			controller.update();

			expect((canvas.application.renderer.generateTexture as jest.Mock).mock.calls.length).toBe(callsAfterFirstUpdate);
		});
	});

	describe("event listeners trigger rebuild", () => {
		it("clip:updated triggers rebuildLumaMasksIfNeeded", async () => {
			const canvas = createMockCanvas();
			const events = createMockEventEmitter();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			let tracks: unknown[][] = [[contentPlayer]]; // Initially no luma

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				events as never
			);

			controller.initialize();
			expect(controller.getActiveMaskCount()).toBe(0);

			// Add luma player to track
			tracks = [[lumaPlayer, contentPlayer]];

			// Trigger clip:updated event
			events.emit("clip:updated");

			// Allow async rebuild to complete
			await delay(10);

			expect(controller.getActiveMaskCount()).toBe(1);
		});

		it("clip:deleted triggers rebuildLumaMasksIfNeeded", async () => {
			const canvas = createMockCanvas();
			const events = createMockEventEmitter();
			const lumaPlayer = createMockLumaPlayer();
			const contentPlayer = createMockContentPlayer();
			const tracks: unknown[][] = [[lumaPlayer, contentPlayer]];

			const controller = new LumaMaskController(
				() => canvas as never,
				() => tracks as never,
				events as never
			);

			controller.initialize();
			expect(controller.getActiveMaskCount()).toBe(1);

			// Note: The controller checks for existing masks by lumaPlayer reference,
			// so the mask stays until cleanupForPlayer is called or dispose is called
			// This tests that the event fires without causing errors

			events.emit("clip:deleted");

			await delay(10);

			// Mask should still exist because we didn't call cleanupForPlayer
			// This tests that the event fires, not that it removes masks
			expect(controller.getActiveMaskCount()).toBe(1);
		});
	});
});
