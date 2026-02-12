/**
 * Edit Class Command History Tests
 *
 * Tests the undo/redo mechanics and command pattern behaviour.
 */

/* eslint-disable max-classes-per-file -- Test helper classes */
/* eslint-disable global-require, @typescript-eslint/no-require-imports -- Jest hoists mock factories
 * before imports/declarations. To share mock classes between mocks (e.g., MockImageSource for instanceof
 * checks), we must use require() at runtime inside the factory. This is the standard Jest pattern. */
import { Edit } from "@core/edit-session";
import { type EditCommand, type CommandContext, type CommandResult, CommandSuccess } from "@core/commands/types";
import type { EventEmitter } from "@core/events/event-emitter";
import { InternalEvent } from "@core/events/edit-events";
import { sec } from "@core/timing/types";

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
	class MockImageSource {
		width = 100;

		height = 100;
	}

	class MockVideoSource {
		width = 100;

		height = 100;

		alphaMode = "premultiply-alpha";
	}

	const createMockContainer = (): Record<string, unknown> => {
		const children: unknown[] = [];
		return {
			children,
			sortableChildren: true,
			sortDirty: false,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
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
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() })),
		ImageSource: MockImageSource,
		VideoSource: MockVideoSource
	};
});

jest.mock("@loaders/asset-loader", () => ({
	AssetLoader: jest.fn().mockImplementation(() => ({
		load: jest.fn().mockImplementation(() => {
			const { ImageSource } = require("pixi.js");
			return Promise.resolve({
				source: new ImageSource(),
				width: 100,
				height: 100,
				destroy: jest.fn()
			});
		}),
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

/**
 * Simple test command for verifying command mechanics without complex state.
 */
class TestCommand implements EditCommand {
	readonly name: string;

	executeCount = 0;

	undoCount = 0;

	lastContext: CommandContext | undefined;

	constructor(name: string = "TestCommand") {
		this.name = name;
	}

	execute(context?: CommandContext): CommandResult {
		this.executeCount += 1;
		this.lastContext = context;
		return CommandSuccess();
	}

	undo(context?: CommandContext): CommandResult {
		this.undoCount += 1;
		this.lastContext = context;
		return CommandSuccess();
	}
}

/**
 * Async test command for testing async command behavior.
 */
class AsyncTestCommand implements EditCommand {
	readonly name = "AsyncTestCommand";

	executeCount = 0;

	undoCount = 0;

	resolveDelay: number;

	constructor(resolveDelay: number = 10) {
		this.resolveDelay = resolveDelay;
	}

	async execute(): Promise<CommandResult> {
		await new Promise<void>(resolve => {
			setTimeout(resolve, this.resolveDelay);
		});
		this.executeCount += 1;
		return CommandSuccess();
	}

	async undo(): Promise<CommandResult> {
		await new Promise<void>(resolve => {
			setTimeout(resolve, this.resolveDelay);
		});
		this.undoCount += 1;
		return CommandSuccess();
	}
}

/**
 * Command without undo for testing optional undo behavior.
 */
class NoUndoCommand implements EditCommand {
	readonly name = "NoUndoCommand";

	executeCount = 0;

	execute(): CommandResult {
		this.executeCount += 1;
		return CommandSuccess();
	}
	// Intentionally no undo method
}

/**
 * Helper to access private Edit properties for testing.
 */
function getCommandState(edit: Edit): { history: EditCommand[]; index: number } {
	const anyEdit = edit as unknown as { commandHistory: EditCommand[]; commandIndex: number };
	return {
		history: anyEdit.commandHistory,
		index: anyEdit.commandIndex
	};
}

/**
 * Helper to create a mock Canvas with viewport container for tests.
 * Canvas now owns the viewport container. Edit emits events for visual
 * sync; Canvas subscribes and updates visuals. Tests verify events are
 * emitted correctly; Canvas behavior is tested separately.
 */
function createMockCanvas(): {
	getViewportContainer: () => Record<string, unknown>;
	viewportContainer: Record<string, unknown>;
	getZoom: () => number;
} {
	const children: unknown[] = [];
	const viewportContainer: Record<string, unknown> = {
		children,
		sortableChildren: true,
		sortDirty: false,
		parent: null,
		label: "viewport",
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
		getChildByLabel: jest.fn(() => null),
		destroy: jest.fn(),
		setMask: jest.fn()
	};

	return {
		getViewportContainer: () => viewportContainer,
		viewportContainer,
		getZoom: () => 1
	};
}

describe("Edit Command History", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 0, length: 1 }]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();

		events = edit.getInternalEvents();
		emitSpy = jest.spyOn(events, "emit");
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("executeCommand() behavior", () => {
		it("adds command to history", async () => {
			const cmd = new TestCommand();

			await edit.executeEditCommand(cmd);

			const { history } = getCommandState(edit);
			expect(history).toContain(cmd);
			expect(history.length).toBe(1);
		});

		it("increments commandIndex", async () => {
			const { index: initialIndex } = getCommandState(edit);
			expect(initialIndex).toBe(-1); // Starts at -1

			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);

			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(1);

			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(2);
		});

		it("calls command.execute() with context", async () => {
			const cmd = new TestCommand();

			await edit.executeEditCommand(cmd);

			expect(cmd.executeCount).toBe(1);
			expect(cmd.lastContext).toBeDefined();
			// Verify context has expected methods
			expect(typeof cmd.lastContext?.getClips).toBe("function");
			expect(typeof cmd.lastContext?.getTracks).toBe("function");
			expect(typeof cmd.lastContext?.emitEvent).toBe("function");
		});

		it("returns Promise for all commands (queue-based execution)", async () => {
			const cmd = new TestCommand();
			const result = edit.executeEditCommand(cmd);
			expect(result).toBeInstanceOf(Promise);
			await result;
			expect(cmd.executeCount).toBe(1);
		});

		it("returns Promise for async commands", async () => {
			const cmd = new AsyncTestCommand(5);
			const result = edit.executeEditCommand(cmd);

			expect(result).toBeInstanceOf(Promise);
			await result;
			expect(cmd.executeCount).toBe(1);
		});
	});

	describe("undo() method", () => {
		it("calls command.undo() with context", async () => {
			const cmd = new TestCommand();
			await edit.executeEditCommand(cmd);

			await edit.undo();

			expect(cmd.undoCount).toBe(1);
			expect(cmd.lastContext).toBeDefined();
		});

		it("decrements commandIndex after undo", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(1);

			await edit.undo();
			expect(getCommandState(edit).index).toBe(0);

			await edit.undo();
			expect(getCommandState(edit).index).toBe(-1);
		});

		it("emits edit:undo event with command name", async () => {
			const cmd = new TestCommand("MyTestCmd");
			await edit.executeEditCommand(cmd);
			emitSpy.mockClear();

			await edit.undo();

			expect(emitSpy).toHaveBeenCalledWith("edit:undo", { command: "MyTestCmd" });
		});

		it("is no-op when commandIndex is -1 (empty history)", async () => {
			expect(getCommandState(edit).index).toBe(-1);
			emitSpy.mockClear();

			await edit.undo();

			expect(getCommandState(edit).index).toBe(-1);
			expect(emitSpy).not.toHaveBeenCalledWith("edit:undo", expect.anything());
		});

		it("is no-op when command has no undo method", async () => {
			const cmd = new NoUndoCommand();
			await edit.executeEditCommand(cmd);
			const { index: afterExec } = getCommandState(edit);
			emitSpy.mockClear();

			await edit.undo();

			// Index should not change since undo is undefined
			expect(getCommandState(edit).index).toBe(afterExec);
			expect(emitSpy).not.toHaveBeenCalledWith("edit:undo", expect.anything());
		});

		it("allows multiple sequential undos", async () => {
			const cmd1 = new TestCommand("Cmd1");
			const cmd2 = new TestCommand("Cmd2");
			const cmd3 = new TestCommand("Cmd3");

			await edit.executeEditCommand(cmd1);
			await edit.executeEditCommand(cmd2);
			await edit.executeEditCommand(cmd3);

			await edit.undo();
			expect(cmd3.undoCount).toBe(1);
			expect(getCommandState(edit).index).toBe(1);

			await edit.undo();
			expect(cmd2.undoCount).toBe(1);
			expect(getCommandState(edit).index).toBe(0);

			await edit.undo();
			expect(cmd1.undoCount).toBe(1);
			expect(getCommandState(edit).index).toBe(-1);
		});
	});

	describe("redo() method", () => {
		it("increments commandIndex before execute", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.undo();
			expect(getCommandState(edit).index).toBe(-1);

			await edit.redo();

			expect(getCommandState(edit).index).toBe(0);
		});

		it("calls command.execute() with context", async () => {
			const cmd = new TestCommand();
			await edit.executeEditCommand(cmd);
			await edit.undo();
			cmd.executeCount = 0; // Reset after initial execute

			await edit.redo();

			expect(cmd.executeCount).toBe(1);
			expect(cmd.lastContext).toBeDefined();
		});

		it("emits edit:redo event with command name", async () => {
			const cmd = new TestCommand("MyRedoCmd");
			await edit.executeEditCommand(cmd);
			await edit.undo();
			emitSpy.mockClear();

			await edit.redo();

			expect(emitSpy).toHaveBeenCalledWith("edit:redo", { command: "MyRedoCmd" });
		});

		it("is no-op when at end of history", async () => {
			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);
			emitSpy.mockClear();

			await edit.redo();

			expect(getCommandState(edit).index).toBe(0);
			expect(emitSpy).not.toHaveBeenCalledWith("edit:redo", expect.anything());
		});

		it("allows multiple sequential redos", async () => {
			const cmd1 = new TestCommand("Cmd1");
			const cmd2 = new TestCommand("Cmd2");
			const cmd3 = new TestCommand("Cmd3");

			await edit.executeEditCommand(cmd1);
			await edit.executeEditCommand(cmd2);
			await edit.executeEditCommand(cmd3);
			await edit.undo();
			await edit.undo();
			await edit.undo();

			// Reset execute counts
			cmd1.executeCount = 0;
			cmd2.executeCount = 0;
			cmd3.executeCount = 0;

			await edit.redo();
			expect(cmd1.executeCount).toBe(1);
			expect(getCommandState(edit).index).toBe(0);

			await edit.redo();
			expect(cmd2.executeCount).toBe(1);
			expect(getCommandState(edit).index).toBe(1);

			await edit.redo();
			expect(cmd3.executeCount).toBe(1);
			expect(getCommandState(edit).index).toBe(2);
		});
	});

	describe("history truncation", () => {
		it("truncates future commands when executing after undo", async () => {
			const cmdA = new TestCommand("A");
			const cmdB = new TestCommand("B");
			const cmdC = new TestCommand("C");
			const cmdD = new TestCommand("D");

			await edit.executeEditCommand(cmdA);
			await edit.executeEditCommand(cmdB);
			await edit.executeEditCommand(cmdC);
			// History: [A, B, C], index = 2

			await edit.undo(); // index = 1
			await edit.undo(); // index = 0
			// History still [A, B, C], but index = 0

			await edit.executeEditCommand(cmdD);
			// Should truncate B and C, leaving [A, D]

			const { history, index } = getCommandState(edit);
			expect(history.length).toBe(2);
			expect(history[0]).toBe(cmdA);
			expect(history[1]).toBe(cmdD);
			expect(index).toBe(1);
		});

		it("preserves commands before current index", async () => {
			const cmdA = new TestCommand("A");
			const cmdB = new TestCommand("B");
			const cmdC = new TestCommand("C");
			const cmdNew = new TestCommand("New");

			await edit.executeEditCommand(cmdA);
			await edit.executeEditCommand(cmdB);
			await edit.executeEditCommand(cmdC);

			await edit.undo(); // index = 1 (at B)

			await edit.executeEditCommand(cmdNew);

			const { history } = getCommandState(edit);
			expect(history).toContain(cmdA);
			expect(history).toContain(cmdB);
			expect(history).toContain(cmdNew);
			expect(history).not.toContain(cmdC);
		});

		it("clears entire redo stack on new command", async () => {
			const cmd1 = new TestCommand("1");
			const cmd2 = new TestCommand("2");
			const cmd3 = new TestCommand("3");
			const cmd4 = new TestCommand("4");
			const cmdNew = new TestCommand("New");

			await edit.executeEditCommand(cmd1);
			await edit.executeEditCommand(cmd2);
			await edit.executeEditCommand(cmd3);
			await edit.executeEditCommand(cmd4);
			// Undo all the way back
			await edit.undo();
			await edit.undo();
			await edit.undo();
			await edit.undo();
			// index = -1, but history = [1, 2, 3, 4]

			await edit.executeEditCommand(cmdNew);

			const { history, index } = getCommandState(edit);
			expect(history.length).toBe(1);
			expect(history[0]).toBe(cmdNew);
			expect(index).toBe(0);
		});
	});

	describe("commandIndex tracking", () => {
		it("starts at -1 (no commands)", async () => {
			const { index } = getCommandState(edit);
			expect(index).toBe(-1);
		});

		it("equals 0 after first command", async () => {
			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);
		});

		it("equals history.length - 1 after multiple commands", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());

			const { history, index } = getCommandState(edit);
			expect(index).toBe(history.length - 1);
			expect(index).toBe(4);
		});

		it("decrements on undo", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(1);

			await edit.undo();
			expect(getCommandState(edit).index).toBe(0);
		});

		it("increments on redo", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			await edit.undo();
			await edit.undo();
			expect(getCommandState(edit).index).toBe(-1);

			await edit.redo();
			expect(getCommandState(edit).index).toBe(0);
		});

		it("resets correctly after truncation", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			await edit.executeEditCommand(new TestCommand());
			// index = 2, history.length = 3

			await edit.undo();
			await edit.undo();
			// index = 0, history.length = 3

			await edit.executeEditCommand(new TestCommand());
			// Should be: index = 1, history.length = 2

			const { history, index } = getCommandState(edit);
			expect(index).toBe(1);
			expect(history.length).toBe(2);
			expect(index).toBe(history.length - 1);
		});
	});

	describe("state restoration", () => {
		it("undo restores previous state via command.undo()", async () => {
			// Use a command that tracks state changes
			let stateValue = 0;

			const stateCmd: EditCommand = {
				name: "StateCmd",
				execute: () => {
					stateValue = 42;
					return CommandSuccess();
				},
				undo: () => {
					stateValue = 0;
					return CommandSuccess();
				}
			};

			expect(stateValue).toBe(0);
			await edit.executeEditCommand(stateCmd);
			expect(stateValue).toBe(42);

			await edit.undo();
			expect(stateValue).toBe(0);
		});

		it("redo re-applies state change", async () => {
			let stateValue = 0;

			const stateCmd: EditCommand = {
				name: "StateCmd",
				execute: () => {
					stateValue = 100;
					return CommandSuccess();
				},
				undo: () => {
					stateValue = 0;
					return CommandSuccess();
				}
			};

			await edit.executeEditCommand(stateCmd);
			await edit.undo();
			expect(stateValue).toBe(0);

			await edit.redo();
			expect(stateValue).toBe(100);
		});

		it("multiple undo/redo cycles preserve state integrity", async () => {
			const stateHistory: number[] = [];

			const incrementCmd: EditCommand = {
				name: "Increment",
				execute: () => {
					stateHistory.push(stateHistory.length);
					return CommandSuccess();
				},
				undo: () => {
					stateHistory.pop();
					return CommandSuccess();
				}
			};

			// Execute 3 times
			await edit.executeEditCommand(incrementCmd);
			await edit.executeEditCommand(incrementCmd);
			await edit.executeEditCommand(incrementCmd);
			expect(stateHistory).toEqual([0, 1, 2]);

			// Undo twice
			await edit.undo();
			await edit.undo();
			expect(stateHistory).toEqual([0]);

			// Redo once
			await edit.redo();
			expect(stateHistory).toEqual([0, 1]);

			// Undo once
			await edit.undo();
			expect(stateHistory).toEqual([0]);

			// Redo twice
			await edit.redo();
			await edit.redo();
			expect(stateHistory).toEqual([0, 1, 2]);
		});
	});

	describe("edge cases", () => {
		it("handles empty history gracefully", async () => {
			// Verify no errors thrown
			expect(() => edit.undo()).not.toThrow();
			expect(() => edit.redo()).not.toThrow();

			const { history, index } = getCommandState(edit);
			expect(history.length).toBe(0);
			expect(index).toBe(-1);
		});

		it("undo at beginning is idempotent", async () => {
			await edit.executeEditCommand(new TestCommand());
			await edit.undo();
			expect(getCommandState(edit).index).toBe(-1);

			// Multiple undos at beginning should not change state
			await edit.undo();
			await edit.undo();
			await edit.undo();

			expect(getCommandState(edit).index).toBe(-1);
		});

		it("redo at end is idempotent", async () => {
			await edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);

			// Multiple redos at end should not change state
			await edit.redo();
			await edit.redo();
			await edit.redo();

			expect(getCommandState(edit).index).toBe(0);
		});

		it("mixed undo/redo/execute sequence", async () => {
			const cmdA = new TestCommand("A");
			const cmdB = new TestCommand("B");
			const cmdC = new TestCommand("C");
			const cmdD = new TestCommand("D");
			const cmdE = new TestCommand("E");

			// Execute A, B, C
			await edit.executeEditCommand(cmdA);
			await edit.executeEditCommand(cmdB);
			await edit.executeEditCommand(cmdC);
			expect(getCommandState(edit).history.map(c => c.name)).toEqual(["A", "B", "C"]);

			// Undo to B
			await edit.undo();
			expect(getCommandState(edit).index).toBe(1);

			// Execute D (should truncate C)
			await edit.executeEditCommand(cmdD);
			expect(getCommandState(edit).history.map(c => c.name)).toEqual(["A", "B", "D"]);

			// Undo D and B
			await edit.undo();
			await edit.undo();
			expect(getCommandState(edit).index).toBe(0);

			// Redo B
			await edit.redo();
			expect(getCommandState(edit).index).toBe(1);

			// Execute E (should truncate D)
			await edit.executeEditCommand(cmdE);
			expect(getCommandState(edit).history.map(c => c.name)).toEqual(["A", "B", "E"]);
			expect(getCommandState(edit).index).toBe(2);
		});
	});

	describe("event emission patterns", () => {
		it("undo emits exactly one edit:undo event", async () => {
			await edit.executeEditCommand(new TestCommand("Test"));
			emitSpy.mockClear();

			await edit.undo();

			const undoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:undo");
			expect(undoEvents.length).toBe(1);
		});

		it("redo emits exactly one edit:redo event", async () => {
			await edit.executeEditCommand(new TestCommand("Test"));
			await edit.undo();
			emitSpy.mockClear();

			await edit.redo();

			const redoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:redo");
			expect(redoEvents.length).toBe(1);
		});

		it("no-op undo does not emit event", async () => {
			emitSpy.mockClear();

			await edit.undo(); // Empty history

			const undoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:undo");
			expect(undoEvents.length).toBe(0);
		});

		it("no-op redo does not emit event", async () => {
			await edit.executeEditCommand(new TestCommand());
			emitSpy.mockClear();

			await edit.redo(); // Already at end

			const redoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:redo");
			expect(redoEvents.length).toBe(0);
		});
	});
});

/**
 * Regression Tests for getPlayerClip/getClip
 *
 * These tests verify that clip lookups return the correct clip based on
 * positional order (as stored in tracks[]) rather than insertion order.
 *
 * Bug: getPlayerClip() was filtering this.clips (insertion order) instead
 * of using this.tracks[][] (position order), causing wrong clips to be
 * returned after move operations.
 */
describe("Edit getPlayerClip regression", () => {
	let edit: Edit;

	beforeEach(async () => {
		// Create edit with two clips on a single track
		// Clip A starts at 0, Clip B starts at 5
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ start: 0, length: 3, fit: "cover", asset: { type: "image", src: "https://example.com/clip-a.jpg" } },
							{ start: 5, length: 3, fit: "cover", asset: { type: "image", src: "https://example.com/clip-b.jpg" } }
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	it("returns clips in position order after move reorders them", async () => {
		// Verify initial state - clips should be [A at 0, B at 5]
		const clipA = edit.getClip(0, 0);
		const clipB = edit.getClip(0, 1);

		expect(clipA?.asset).toMatchObject({ src: "https://example.com/clip-a.jpg" });
		expect(clipB?.asset).toMatchObject({ src: "https://example.com/clip-b.jpg" });

		// Store references to the actual Player objects
		const playerA = edit.getPlayerClip(0, 0);
		const playerB = edit.getPlayerClip(0, 1);

		expect(playerA).not.toBeNull();
		expect(playerB).not.toBeNull();
		expect(playerA).not.toBe(playerB);

		// Now move Clip A from start=0 to start=10 (after Clip B)
		// This should reorder the track array so B is at index 0, A is at index 1
		const { MoveClipCommand } = await import("@core/commands/move-clip-command");
		const moveCommand = new MoveClipCommand(0, 0, 0, sec(10)); // Same track, from index 0, to start=10
		edit.executeEditCommand(moveCommand);

		// After the move, the track order should now be [B at 5, A at 10]
		// getClip(0, 0) should now return clip B
		// getClip(0, 1) should now return clip A
		const newClip0 = edit.getClip(0, 0);
		const newClip1 = edit.getClip(0, 1);

		expect(newClip0?.asset).toMatchObject({ src: "https://example.com/clip-b.jpg" });
		expect(newClip1?.asset).toMatchObject({ src: "https://example.com/clip-a.jpg" });

		// getPlayerClip should also return the correct players by position
		const newPlayer0 = edit.getPlayerClip(0, 0);
		const newPlayer1 = edit.getPlayerClip(0, 1);

		// Player references should swap - B is now at index 0, A is now at index 1
		expect(newPlayer0).toBe(playerB);
		expect(newPlayer1).toBe(playerA);
	});

	it("returns correct clips when multiple moves reorder repeatedly", async () => {
		// Add a third clip
		await edit.addClip(0, { start: sec(10), length: sec(3), fit: "cover", asset: { type: "image", src: "https://example.com/clip-c.jpg" } });

		// Initial order: [A at 0, B at 5, C at 10]
		const playerA = edit.getPlayerClip(0, 0);
		const playerB = edit.getPlayerClip(0, 1);
		const playerC = edit.getPlayerClip(0, 2);

		expect(edit.getClip(0, 0)?.asset).toMatchObject({ src: "https://example.com/clip-a.jpg" });
		expect(edit.getClip(0, 1)?.asset).toMatchObject({ src: "https://example.com/clip-b.jpg" });
		expect(edit.getClip(0, 2)?.asset).toMatchObject({ src: "https://example.com/clip-c.jpg" });

		// Move A to start=15 (after C) → order becomes [B, C, A]
		const { MoveClipCommand } = await import("@core/commands/move-clip-command");
		await edit.executeEditCommand(new MoveClipCommand(0, 0, 0, sec(15)));

		expect(edit.getPlayerClip(0, 0)).toBe(playerB);
		expect(edit.getPlayerClip(0, 1)).toBe(playerC);
		expect(edit.getPlayerClip(0, 2)).toBe(playerA);

		// Move C to start=1 (between original B position) → order becomes [C, B, A]
		await edit.executeEditCommand(new MoveClipCommand(0, 1, 0, sec(1)));

		expect(edit.getPlayerClip(0, 0)).toBe(playerC);
		expect(edit.getPlayerClip(0, 1)).toBe(playerB);
		expect(edit.getPlayerClip(0, 2)).toBe(playerA);
	});
});

/**
 * Track Reordering Z-Index Regression Tests
 *
 * These tests verify that when clips are moved between tracks, the canvas
 * container's sortDirty flag is set to trigger PixiJS z-index re-sorting.
 *
 */
describe("Track Reordering Z-Index", () => {
	let edit: Edit;
	let mockCanvas: ReturnType<typeof createMockCanvas>;

	beforeEach(async () => {
		// Create edit with clips on two different tracks
		// Track 0 (top): image clip
		// Track 1 (bottom): video clip
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [{ start: 0, length: 5, fit: "cover", asset: { type: "image", src: "https://example.com/image.jpg" } }]
					},
					{
						clips: [{ start: 0, length: 5, fit: "cover", asset: { type: "video", src: "https://example.com/video.mp4", transcode: false } }]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});

		// Attach mock canvas so getContainer() works (Canvas now owns the viewport container)
		mockCanvas = createMockCanvas();
		edit.setCanvas(mockCanvas as unknown as Parameters<typeof edit.setCanvas>[0]);

		await edit.load();
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	it("emits PlayerMovedBetweenTracks event when moving clip to different track", async () => {
		// Spy on event emission
		const emitSpy = jest.spyOn(edit.getInternalEvents(), "emit");

		// Move clip from track 1 to track 0
		const { MoveClipCommand } = await import("@core/commands/move-clip-command");
		const moveCommand = new MoveClipCommand(1, 0, 0, sec(0)); // From track 1, index 0 → track 0
		edit.executeEditCommand(moveCommand);

		// Verify PlayerMovedBetweenTracks event was emitted (Canvas subscribes and sets sortDirty)
		expect(emitSpy).toHaveBeenCalledWith(
			InternalEvent.PlayerMovedBetweenTracks,
			expect.objectContaining({
				fromTrackIndex: 1,
				toTrackIndex: 0
			})
		);
	});

	it("player layer updates correctly when moving between tracks", async () => {
		// Get initial player on track 1
		const player = edit.getPlayerClip(1, 0);
		expect(player).toBeDefined();
		expect(player?.layer).toBe(2); // Track 1 = layer 2 (trackIdx + 1)

		// Move clip from track 1 to track 0
		const { MoveClipCommand } = await import("@core/commands/move-clip-command");
		const moveCommand = new MoveClipCommand(1, 0, 0, sec(6)); // Move to track 0, after existing clip
		edit.executeEditCommand(moveCommand);

		// Player should now have layer 1 (track 0 = layer 1)
		expect(player?.layer).toBe(1);
	});

	it("emits PlayerMovedBetweenTracks event on undo when moving clip back to original track", async () => {
		// Move clip from track 1 to track 0
		const { MoveClipCommand } = await import("@core/commands/move-clip-command");
		const moveCommand = new MoveClipCommand(1, 0, 0, sec(6));
		edit.executeEditCommand(moveCommand);

		// Spy on event emission after the first move
		const emitSpy = jest.spyOn(edit.getInternalEvents(), "emit");

		// Undo the move (MoveClipCommand.undo is async, wait for it)
		await edit.undo();
		await new Promise(resolve => {
			setTimeout(resolve, 0);
		});

		// Verify PlayerMovedBetweenTracks event was emitted again (clip moved back)
		expect(emitSpy).toHaveBeenCalledWith(
			InternalEvent.PlayerMovedBetweenTracks,
			expect.objectContaining({
				fromTrackIndex: 0,
				toTrackIndex: 1
			})
		);
	});
});

/**
 * AddTrackCommand Z-Index Regression Tests
 *
 * These tests verify that when a new track is inserted between existing tracks,
 * only clips AFTER the insertion point have their layers shifted.
 *
 * Bug: AddTrackCommand.execute() used `clip.layer >= this.trackIdx` which shifted
 * ALL clips including those at the insertion point. Since layer = trackIndex + 1,
 * Track 0 clips (layer=1) were incorrectly shifted when inserting at index 1.
 *
 * Fix: Changed condition to `clip.layer > this.trackIdx` so clips on tracks
 * BEFORE the insertion point are not affected.
 */
describe("AddTrackCommand Z-Index", () => {
	let edit: Edit;
	let mockCanvas: ReturnType<typeof createMockCanvas>;

	beforeEach(async () => {
		// Create edit with clips on two tracks
		// Track 0 (top): image clip
		// Track 1 (bottom): video clip
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [{ start: 0, length: 5, fit: "cover", asset: { type: "image", src: "https://example.com/image.jpg" } }]
					},
					{
						clips: [{ start: 0, length: 5, fit: "cover", asset: { type: "video", src: "https://example.com/video.mp4", transcode: false } }]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});

		// Attach mock canvas so getContainer() works (Canvas now owns the viewport container)
		mockCanvas = createMockCanvas();
		edit.setCanvas(mockCanvas as unknown as Parameters<typeof edit.setCanvas>[0]);

		await edit.load();
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	it("does not shift Track 0 layer when inserting at index 1", async () => {
		// Get initial layers
		const track0Player = edit.getPlayerClip(0, 0);
		const track1Player = edit.getPlayerClip(1, 0);

		expect(track0Player?.layer).toBe(1); // Track 0 = layer 1
		expect(track1Player?.layer).toBe(2); // Track 1 = layer 2

		// Insert new track at index 1 (between Track 0 and Track 1)
		const { AddTrackCommand } = await import("@core/commands/add-track-command");
		const addTrackCommand = new AddTrackCommand(1);
		edit.executeEditCommand(addTrackCommand);

		// Track 0 should NOT be affected (layer stays 1)
		expect(track0Player?.layer).toBe(1);

		// Old Track 1 is now Track 2 (layer becomes 3)
		expect(track1Player?.layer).toBe(3);
	});

	it("updates track count when adding track", async () => {
		const initialTracks = edit.getTracks().length;

		const { AddTrackCommand } = await import("@core/commands/add-track-command");
		const addTrackCommand = new AddTrackCommand(1);
		edit.executeEditCommand(addTrackCommand);

		expect(edit.getTracks().length).toBe(initialTracks + 1);
	});

	it("document track count is restored on undo", async () => {
		const initialDocTracks = edit.getDocument()?.getTrackCount() ?? 0;

		const { AddTrackCommand } = await import("@core/commands/add-track-command");
		const addTrackCommand = new AddTrackCommand(1);
		edit.executeEditCommand(addTrackCommand);

		expect(edit.getDocument()?.getTrackCount()).toBe(initialDocTracks + 1);

		await edit.undo();

		// Document track count is restored (source of truth)
		expect(edit.getDocument()?.getTrackCount()).toBe(initialDocTracks);
	});

	it("restores layers correctly on undo", async () => {
		const track0Player = edit.getPlayerClip(0, 0);
		const track1Player = edit.getPlayerClip(1, 0);

		const { AddTrackCommand } = await import("@core/commands/add-track-command");
		const addTrackCommand = new AddTrackCommand(1);
		edit.executeEditCommand(addTrackCommand);

		// After add: Track 0 stays layer 1, old Track 1 becomes layer 3
		expect(track0Player?.layer).toBe(1);
		expect(track1Player?.layer).toBe(3);

		// Undo should restore original layers
		await edit.undo();

		expect(track0Player?.layer).toBe(1);
		expect(track1Player?.layer).toBe(2);
	});
});

/**
 * Output Settings Command Fail-Fast Tests
 *
 * Verifies that output settings commands throw on missing context
 * rather than silently failing (fail-fast principle).
 */
describe("Output Settings Commands fail-fast", () => {
	it("SetOutputSizeCommand throws when context is undefined", async () => {
		const { SetOutputSizeCommand } = await import("@core/commands/set-output-size-command");
		const cmd = new SetOutputSizeCommand(800, 600);
		expect(() => cmd.execute(undefined)).toThrow("requires context");
		expect(() => cmd.undo(undefined)).toThrow("requires context");
	});

	it("SetOutputFpsCommand throws when context is undefined", async () => {
		const { SetOutputFpsCommand } = await import("@core/commands/set-output-fps-command");
		const cmd = new SetOutputFpsCommand(24);
		expect(() => cmd.execute(undefined)).toThrow("requires context");
		expect(() => cmd.undo(undefined)).toThrow("requires context");
	});

	it("SetTimelineBackgroundCommand throws when context is undefined", async () => {
		const { SetTimelineBackgroundCommand } = await import("@core/commands/set-timeline-background-command");
		const cmd = new SetTimelineBackgroundCommand("#ff0000");
		expect(() => cmd.execute(undefined)).toThrow("requires context");
		expect(() => cmd.undo(undefined)).toThrow("requires context");
	});
});

describe("AttachLumaCommand", () => {
	let edit: Edit;

	beforeEach(async () => {
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							// Content clip
							{ asset: { type: "video", src: "https://example.com/video.mp4" }, start: 0, length: 5 },
							// Image to be transformed to luma
							{ asset: { type: "image", src: "https://example.com/luma.png" }, start: 0, length: 3 }
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();
	});

	afterEach(() => {
		edit.dispose();
	});

	it("attaches luma with single undo operation", async () => {
		const { AttachLumaCommand } = await import("@core/commands/attach-luma-command");

		// Initial state
		expect(edit.getClip(0, 1)?.asset?.type).toBe("image");

		// Attach luma
		const command = new AttachLumaCommand(0, 1, 0, 0);
		await edit.executeEditCommand(command);

		// Verify attachment
		const lumaClip = edit.getClip(0, 1);
		expect(lumaClip?.asset?.type).toBe("luma");
		expect(lumaClip?.start).toBe(0);
		expect(lumaClip?.length).toBe(5); // Synced to content

		// Single undo should reverse everything
		await edit.undo();

		// Verify restoration
		const restoredClip = edit.getClip(0, 1);
		expect(restoredClip?.asset?.type).toBe("image");
		expect(restoredClip?.start).toBe(0);
		expect(restoredClip?.length).toBe(3); // Original timing restored
	});

	it("establishes luma→content relationship", async () => {
		const { AttachLumaCommand } = await import("@core/commands/attach-luma-command");

		const contentPlayer = edit.getPlayerClip(0, 0);

		// Attach luma
		const command = new AttachLumaCommand(0, 1, 0, 0);
		await edit.executeEditCommand(command);

		// Get luma player after transformation
		const lumaPlayer = edit.getPlayerClip(0, 1);

		// Verify relationship exists
		if (lumaPlayer?.clipId && contentPlayer?.clipId) {
			const relationship = edit.getContentClipIdForLuma(lumaPlayer.clipId);
			expect(relationship).toBe(contentPlayer.clipId);
		} else {
			fail("Failed to get clip IDs");
		}
	});

	it("redo re-attaches correctly", async () => {
		const { AttachLumaCommand } = await import("@core/commands/attach-luma-command");

		// Attach
		const command = new AttachLumaCommand(0, 1, 0, 0);
		await edit.executeEditCommand(command);
		expect(edit.getClip(0, 1)?.asset?.type).toBe("luma");

		// Undo
		await edit.undo();
		expect(edit.getClip(0, 1)?.asset?.type).toBe("image");

		// Redo
		await edit.redo();
		const redoneClip = edit.getClip(0, 1);
		expect(redoneClip?.asset?.type).toBe("luma");
		expect(redoneClip?.start).toBe(0);
		expect(redoneClip?.length).toBe(5);
	});

	it("clears relationship on undo", async () => {
		const { AttachLumaCommand } = await import("@core/commands/attach-luma-command");

		// Attach
		const command = new AttachLumaCommand(0, 1, 0, 0);
		await edit.executeEditCommand(command);

		const lumaPlayer = edit.getPlayerClip(0, 1);
		const lumaClipId = lumaPlayer?.clipId;

		// Verify relationship exists
		if (lumaClipId) {
			expect(edit.getContentClipIdForLuma(lumaClipId)).toBeTruthy();
		}

		// Undo
		await edit.undo();

		// Verify relationship cleared (note: after undo, clipId changes back)
		const restoredPlayer = edit.getPlayerClip(0, 1);
		if (restoredPlayer?.clipId) {
			expect(edit.getContentClipIdForLuma(restoredPlayer.clipId)).toBeNull();
		}
	});
});
