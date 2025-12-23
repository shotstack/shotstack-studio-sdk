/**
 * Edit Class Command History Tests
 *
 * Tests the undo/redo mechanics and command pattern behavior.
 * The command system is the foundation for all editing operations.
 */

/* eslint-disable max-classes-per-file -- Test helper classes */
import { Edit } from "@core/edit-session";
import type { EditCommand, CommandContext } from "@core/commands/types";
import type { EventEmitter } from "@core/events/event-emitter";
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

	execute(context?: CommandContext): void {
		this.executeCount += 1;
		this.lastContext = context;
	}

	undo(context?: CommandContext): void {
		this.undoCount += 1;
		this.lastContext = context;
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

	async execute(): Promise<void> {
		await new Promise<void>(resolve => {
			setTimeout(resolve, this.resolveDelay);
		});
		this.executeCount += 1;
	}

	async undo(): Promise<void> {
		await new Promise<void>(resolve => {
			setTimeout(resolve, this.resolveDelay);
		});
		this.undoCount += 1;
	}
}

/**
 * Command without undo for testing optional undo behavior.
 */
class NoUndoCommand implements EditCommand {
	readonly name = "NoUndoCommand";

	executeCount = 0;

	execute(): void {
		this.executeCount += 1;
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

describe("Edit Command History", () => {
	let edit: Edit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		edit = new Edit({
			timeline: { tracks: [] },
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();

		events = edit.events;
		emitSpy = jest.spyOn(events, "emit");
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("executeCommand() behavior", () => {
		it("adds command to history", () => {
			const cmd = new TestCommand();

			edit.executeEditCommand(cmd);

			const { history } = getCommandState(edit);
			expect(history).toContain(cmd);
			expect(history.length).toBe(1);
		});

		it("increments commandIndex", () => {
			const { index: initialIndex } = getCommandState(edit);
			expect(initialIndex).toBe(-1); // Starts at -1

			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);

			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(1);

			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(2);
		});

		it("calls command.execute() with context", () => {
			const cmd = new TestCommand();

			edit.executeEditCommand(cmd);

			expect(cmd.executeCount).toBe(1);
			expect(cmd.lastContext).toBeDefined();
			// Verify context has expected methods
			expect(typeof cmd.lastContext?.getClips).toBe("function");
			expect(typeof cmd.lastContext?.getTracks).toBe("function");
			expect(typeof cmd.lastContext?.emitEvent).toBe("function");
		});

		it("returns void for sync commands", () => {
			const cmd = new TestCommand();
			const result = edit.executeEditCommand(cmd);
			expect(result).toBeUndefined();
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
		it("calls command.undo() with context", () => {
			const cmd = new TestCommand();
			edit.executeEditCommand(cmd);

			edit.undo();

			expect(cmd.undoCount).toBe(1);
			expect(cmd.lastContext).toBeDefined();
		});

		it("decrements commandIndex after undo", () => {
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(1);

			edit.undo();
			expect(getCommandState(edit).index).toBe(0);

			edit.undo();
			expect(getCommandState(edit).index).toBe(-1);
		});

		it("emits edit:undo event with command name", () => {
			const cmd = new TestCommand("MyTestCmd");
			edit.executeEditCommand(cmd);
			emitSpy.mockClear();

			edit.undo();

			expect(emitSpy).toHaveBeenCalledWith("edit:undo", { command: "MyTestCmd" });
		});

		it("is no-op when commandIndex is -1 (empty history)", () => {
			expect(getCommandState(edit).index).toBe(-1);
			emitSpy.mockClear();

			edit.undo();

			expect(getCommandState(edit).index).toBe(-1);
			expect(emitSpy).not.toHaveBeenCalledWith("edit:undo", expect.anything());
		});

		it("is no-op when command has no undo method", () => {
			const cmd = new NoUndoCommand();
			edit.executeEditCommand(cmd);
			const { index: afterExec } = getCommandState(edit);
			emitSpy.mockClear();

			edit.undo();

			// Index should not change since undo is undefined
			expect(getCommandState(edit).index).toBe(afterExec);
			expect(emitSpy).not.toHaveBeenCalledWith("edit:undo", expect.anything());
		});

		it("allows multiple sequential undos", () => {
			const cmd1 = new TestCommand("Cmd1");
			const cmd2 = new TestCommand("Cmd2");
			const cmd3 = new TestCommand("Cmd3");

			edit.executeEditCommand(cmd1);
			edit.executeEditCommand(cmd2);
			edit.executeEditCommand(cmd3);

			edit.undo();
			expect(cmd3.undoCount).toBe(1);
			expect(getCommandState(edit).index).toBe(1);

			edit.undo();
			expect(cmd2.undoCount).toBe(1);
			expect(getCommandState(edit).index).toBe(0);

			edit.undo();
			expect(cmd1.undoCount).toBe(1);
			expect(getCommandState(edit).index).toBe(-1);
		});
	});

	describe("redo() method", () => {
		it("increments commandIndex before execute", () => {
			edit.executeEditCommand(new TestCommand());
			edit.undo();
			expect(getCommandState(edit).index).toBe(-1);

			edit.redo();

			expect(getCommandState(edit).index).toBe(0);
		});

		it("calls command.execute() with context", () => {
			const cmd = new TestCommand();
			edit.executeEditCommand(cmd);
			edit.undo();
			cmd.executeCount = 0; // Reset after initial execute

			edit.redo();

			expect(cmd.executeCount).toBe(1);
			expect(cmd.lastContext).toBeDefined();
		});

		it("emits edit:redo event with command name", () => {
			const cmd = new TestCommand("MyRedoCmd");
			edit.executeEditCommand(cmd);
			edit.undo();
			emitSpy.mockClear();

			edit.redo();

			expect(emitSpy).toHaveBeenCalledWith("edit:redo", { command: "MyRedoCmd" });
		});

		it("is no-op when at end of history", () => {
			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);
			emitSpy.mockClear();

			edit.redo();

			expect(getCommandState(edit).index).toBe(0);
			expect(emitSpy).not.toHaveBeenCalledWith("edit:redo", expect.anything());
		});

		it("allows multiple sequential redos", () => {
			const cmd1 = new TestCommand("Cmd1");
			const cmd2 = new TestCommand("Cmd2");
			const cmd3 = new TestCommand("Cmd3");

			edit.executeEditCommand(cmd1);
			edit.executeEditCommand(cmd2);
			edit.executeEditCommand(cmd3);
			edit.undo();
			edit.undo();
			edit.undo();

			// Reset execute counts
			cmd1.executeCount = 0;
			cmd2.executeCount = 0;
			cmd3.executeCount = 0;

			edit.redo();
			expect(cmd1.executeCount).toBe(1);
			expect(getCommandState(edit).index).toBe(0);

			edit.redo();
			expect(cmd2.executeCount).toBe(1);
			expect(getCommandState(edit).index).toBe(1);

			edit.redo();
			expect(cmd3.executeCount).toBe(1);
			expect(getCommandState(edit).index).toBe(2);
		});
	});

	describe("history truncation", () => {
		it("truncates future commands when executing after undo", () => {
			const cmdA = new TestCommand("A");
			const cmdB = new TestCommand("B");
			const cmdC = new TestCommand("C");
			const cmdD = new TestCommand("D");

			edit.executeEditCommand(cmdA);
			edit.executeEditCommand(cmdB);
			edit.executeEditCommand(cmdC);
			// History: [A, B, C], index = 2

			edit.undo(); // index = 1
			edit.undo(); // index = 0
			// History still [A, B, C], but index = 0

			edit.executeEditCommand(cmdD);
			// Should truncate B and C, leaving [A, D]

			const { history, index } = getCommandState(edit);
			expect(history.length).toBe(2);
			expect(history[0]).toBe(cmdA);
			expect(history[1]).toBe(cmdD);
			expect(index).toBe(1);
		});

		it("preserves commands before current index", () => {
			const cmdA = new TestCommand("A");
			const cmdB = new TestCommand("B");
			const cmdC = new TestCommand("C");
			const cmdNew = new TestCommand("New");

			edit.executeEditCommand(cmdA);
			edit.executeEditCommand(cmdB);
			edit.executeEditCommand(cmdC);

			edit.undo(); // index = 1 (at B)

			edit.executeEditCommand(cmdNew);

			const { history } = getCommandState(edit);
			expect(history).toContain(cmdA);
			expect(history).toContain(cmdB);
			expect(history).toContain(cmdNew);
			expect(history).not.toContain(cmdC);
		});

		it("clears entire redo stack on new command", () => {
			const cmd1 = new TestCommand("1");
			const cmd2 = new TestCommand("2");
			const cmd3 = new TestCommand("3");
			const cmd4 = new TestCommand("4");
			const cmdNew = new TestCommand("New");

			edit.executeEditCommand(cmd1);
			edit.executeEditCommand(cmd2);
			edit.executeEditCommand(cmd3);
			edit.executeEditCommand(cmd4);
			// Undo all the way back
			edit.undo();
			edit.undo();
			edit.undo();
			edit.undo();
			// index = -1, but history = [1, 2, 3, 4]

			edit.executeEditCommand(cmdNew);

			const { history, index } = getCommandState(edit);
			expect(history.length).toBe(1);
			expect(history[0]).toBe(cmdNew);
			expect(index).toBe(0);
		});
	});

	describe("commandIndex tracking", () => {
		it("starts at -1 (no commands)", () => {
			const { index } = getCommandState(edit);
			expect(index).toBe(-1);
		});

		it("equals 0 after first command", () => {
			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);
		});

		it("equals history.length - 1 after multiple commands", () => {
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());

			const { history, index } = getCommandState(edit);
			expect(index).toBe(history.length - 1);
			expect(index).toBe(4);
		});

		it("decrements on undo", () => {
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(1);

			edit.undo();
			expect(getCommandState(edit).index).toBe(0);
		});

		it("increments on redo", () => {
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			edit.undo();
			edit.undo();
			expect(getCommandState(edit).index).toBe(-1);

			edit.redo();
			expect(getCommandState(edit).index).toBe(0);
		});

		it("resets correctly after truncation", () => {
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			edit.executeEditCommand(new TestCommand());
			// index = 2, history.length = 3

			edit.undo();
			edit.undo();
			// index = 0, history.length = 3

			edit.executeEditCommand(new TestCommand());
			// Should be: index = 1, history.length = 2

			const { history, index } = getCommandState(edit);
			expect(index).toBe(1);
			expect(history.length).toBe(2);
			expect(index).toBe(history.length - 1);
		});
	});

	describe("state restoration", () => {
		it("undo restores previous state via command.undo()", () => {
			// Use a command that tracks state changes
			let stateValue = 0;

			const stateCmd: EditCommand = {
				name: "StateCmd",
				execute: () => {
					stateValue = 42;
				},
				undo: () => {
					stateValue = 0;
				}
			};

			expect(stateValue).toBe(0);
			edit.executeEditCommand(stateCmd);
			expect(stateValue).toBe(42);

			edit.undo();
			expect(stateValue).toBe(0);
		});

		it("redo re-applies state change", () => {
			let stateValue = 0;

			const stateCmd: EditCommand = {
				name: "StateCmd",
				execute: () => {
					stateValue = 100;
				},
				undo: () => {
					stateValue = 0;
				}
			};

			edit.executeEditCommand(stateCmd);
			edit.undo();
			expect(stateValue).toBe(0);

			edit.redo();
			expect(stateValue).toBe(100);
		});

		it("multiple undo/redo cycles preserve state integrity", () => {
			const stateHistory: number[] = [];

			const incrementCmd: EditCommand = {
				name: "Increment",
				execute: () => {
					stateHistory.push(stateHistory.length);
				},
				undo: () => {
					stateHistory.pop();
				}
			};

			// Execute 3 times
			edit.executeEditCommand(incrementCmd);
			edit.executeEditCommand(incrementCmd);
			edit.executeEditCommand(incrementCmd);
			expect(stateHistory).toEqual([0, 1, 2]);

			// Undo twice
			edit.undo();
			edit.undo();
			expect(stateHistory).toEqual([0]);

			// Redo once
			edit.redo();
			expect(stateHistory).toEqual([0, 1]);

			// Undo once
			edit.undo();
			expect(stateHistory).toEqual([0]);

			// Redo twice
			edit.redo();
			edit.redo();
			expect(stateHistory).toEqual([0, 1, 2]);
		});
	});

	describe("edge cases", () => {
		it("handles empty history gracefully", () => {
			// Verify no errors thrown
			expect(() => edit.undo()).not.toThrow();
			expect(() => edit.redo()).not.toThrow();

			const { history, index } = getCommandState(edit);
			expect(history.length).toBe(0);
			expect(index).toBe(-1);
		});

		it("undo at beginning is idempotent", () => {
			edit.executeEditCommand(new TestCommand());
			edit.undo();
			expect(getCommandState(edit).index).toBe(-1);

			// Multiple undos at beginning should not change state
			edit.undo();
			edit.undo();
			edit.undo();

			expect(getCommandState(edit).index).toBe(-1);
		});

		it("redo at end is idempotent", () => {
			edit.executeEditCommand(new TestCommand());
			expect(getCommandState(edit).index).toBe(0);

			// Multiple redos at end should not change state
			edit.redo();
			edit.redo();
			edit.redo();

			expect(getCommandState(edit).index).toBe(0);
		});

		it("mixed undo/redo/execute sequence", () => {
			const cmdA = new TestCommand("A");
			const cmdB = new TestCommand("B");
			const cmdC = new TestCommand("C");
			const cmdD = new TestCommand("D");
			const cmdE = new TestCommand("E");

			// Execute A, B, C
			edit.executeEditCommand(cmdA);
			edit.executeEditCommand(cmdB);
			edit.executeEditCommand(cmdC);
			expect(getCommandState(edit).history.map(c => c.name)).toEqual(["A", "B", "C"]);

			// Undo to B
			edit.undo();
			expect(getCommandState(edit).index).toBe(1);

			// Execute D (should truncate C)
			edit.executeEditCommand(cmdD);
			expect(getCommandState(edit).history.map(c => c.name)).toEqual(["A", "B", "D"]);

			// Undo D and B
			edit.undo();
			edit.undo();
			expect(getCommandState(edit).index).toBe(0);

			// Redo B
			edit.redo();
			expect(getCommandState(edit).index).toBe(1);

			// Execute E (should truncate D)
			edit.executeEditCommand(cmdE);
			expect(getCommandState(edit).history.map(c => c.name)).toEqual(["A", "B", "E"]);
			expect(getCommandState(edit).index).toBe(2);
		});
	});

	describe("event emission patterns", () => {
		it("undo emits exactly one edit:undo event", () => {
			edit.executeEditCommand(new TestCommand("Test"));
			emitSpy.mockClear();

			edit.undo();

			const undoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:undo");
			expect(undoEvents.length).toBe(1);
		});

		it("redo emits exactly one edit:redo event", () => {
			edit.executeEditCommand(new TestCommand("Test"));
			edit.undo();
			emitSpy.mockClear();

			edit.redo();

			const redoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:redo");
			expect(redoEvents.length).toBe(1);
		});

		it("no-op undo does not emit event", () => {
			emitSpy.mockClear();

			edit.undo(); // Empty history

			const undoEvents = emitSpy.mock.calls.filter(call => call[0] === "edit:undo");
			expect(undoEvents.length).toBe(0);
		});

		it("no-op redo does not emit event", () => {
			edit.executeEditCommand(new TestCommand());
			emitSpy.mockClear();

			edit.redo(); // Already at end

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
		await edit.addClip(0, { start: 10, length: 3, fit: "cover", asset: { type: "image", src: "https://example.com/clip-c.jpg" } });

		// Initial order: [A at 0, B at 5, C at 10]
		const playerA = edit.getPlayerClip(0, 0);
		const playerB = edit.getPlayerClip(0, 1);
		const playerC = edit.getPlayerClip(0, 2);

		expect(edit.getClip(0, 0)?.asset).toMatchObject({ src: "https://example.com/clip-a.jpg" });
		expect(edit.getClip(0, 1)?.asset).toMatchObject({ src: "https://example.com/clip-b.jpg" });
		expect(edit.getClip(0, 2)?.asset).toMatchObject({ src: "https://example.com/clip-c.jpg" });

		// Move A to start=15 (after C) → order becomes [B, C, A]
		const { MoveClipCommand } = await import("@core/commands/move-clip-command");
		edit.executeEditCommand(new MoveClipCommand(0, 0, 0, sec(15)));

		expect(edit.getPlayerClip(0, 0)).toBe(playerB);
		expect(edit.getPlayerClip(0, 1)).toBe(playerC);
		expect(edit.getPlayerClip(0, 2)).toBe(playerA);

		// Move C to start=1 (between original B position) → order becomes [C, B, A]
		edit.executeEditCommand(new MoveClipCommand(0, 1, 0, sec(1)));

		expect(edit.getPlayerClip(0, 0)).toBe(playerC);
		expect(edit.getPlayerClip(0, 1)).toBe(playerB);
		expect(edit.getPlayerClip(0, 2)).toBe(playerA);
	});
});

describe("Luma Attachment Registration", () => {
	let edit: Edit;

	beforeEach(async () => {
		// Create edit with a video clip on track 0, luma clip on track 1
		// Using separate tracks to avoid the image-to-luma transform complexity
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [{ start: 0, length: 5, fit: "cover", asset: { type: "video", src: "https://example.com/video.mp4" } }]
					},
					{
						clips: [{ start: 0, length: 5, fit: "cover", asset: { type: "luma", src: "https://example.com/luma.mp4" } }]
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

	it("registerLumaAttachment populates the attachment map", () => {
		// Get initial state - video at track 0 index 0, luma at track 1 index 0
		const videoPlayer = edit.getPlayerClip(0, 0);
		expect(videoPlayer).toBeDefined();

		const lumaPlayer = edit.getPlayerClip(1, 0);
		expect(lumaPlayer).toBeDefined();

		// Initially no luma attached to video
		expect(edit.hasLumaMask(0, 0)).toBe(false);

		// Register the luma attachment
		edit.registerLumaAttachment(0, 0, 1, 0);

		// Now hasLumaMask should return true
		expect(edit.hasLumaMask(0, 0)).toBe(true);

		// And getAttachedLumaPlayer should find the luma player
		const attachedLuma = edit.getAttachedLumaPlayer(videoPlayer!);
		expect(attachedLuma).toBe(lumaPlayer);
	});

	it("syncAttachedLuma syncs timing after registerLumaAttachment", () => {
		// Register the attachment
		edit.registerLumaAttachment(0, 0, 1, 0);

		// Change video clip start time directly
		const videoClipBefore = edit.getClip(0, 0);
		expect(videoClipBefore?.start).toBe(0);

		// Update video start (simulating what happens after a move)
		const videoPlayer = edit.getPlayerClip(0, 0);
		if (videoPlayer?.clipConfiguration) {
			videoPlayer.clipConfiguration.start = 2;
		}

		// Sync luma to content clip
		edit.syncAttachedLuma(0, 0);

		// Verify luma timing matches video
		const lumaPlayer = edit.getPlayerClip(1, 0);
		expect(lumaPlayer?.clipConfiguration.start).toBe(2);
	});

	it("syncAttachedLuma returns early if attachment not registered", () => {
		// DON'T register attachment
		expect(edit.hasLumaMask(0, 0)).toBe(false);

		// Get luma initial timing
		const lumaPlayer = edit.getPlayerClip(1, 0);
		const initialStart = lumaPlayer?.clipConfiguration.start;

		// Update video start
		const videoPlayer = edit.getPlayerClip(0, 0);
		if (videoPlayer?.clipConfiguration) {
			videoPlayer.clipConfiguration.start = 2;
		}

		// Try to sync - should do nothing since attachment not registered
		edit.syncAttachedLuma(0, 0);

		// Luma timing should be unchanged (sync was skipped)
		expect(lumaPlayer?.clipConfiguration.start).toBe(initialStart);
	});
});

/**
 * TransformClipAssetCommand Tests
 *
 * Tests for the clip asset type transformation command used for luma attachment/detachment.
 * Verifies async load handling and original type preservation.
 */
describe("TransformClipAssetCommand", () => {
	let edit: Edit;

	beforeEach(async () => {
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ start: 0, length: 5, fit: "cover", asset: { type: "video", src: "https://example.com/video.mp4" } },
							{ start: 5, length: 3, fit: "cover", asset: { type: "image", src: "https://example.com/image.jpg" } }
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

	it("transformToLuma changes asset type to luma", () => {
		const clipBefore = edit.getClip(0, 0);
		expect(clipBefore?.asset?.type).toBe("video");

		edit.transformToLuma(0, 0);

		const clipAfter = edit.getClip(0, 0);
		expect(clipAfter?.asset?.type).toBe("luma");
		// Source URL should be preserved
		expect((clipAfter?.asset as { src: string })?.src).toBe("https://example.com/video.mp4");
	});

	it("transformFromLuma restores original video type", () => {
		// First transform to luma
		edit.transformToLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("luma");

		// Now transform back
		edit.transformFromLuma(0, 0);

		const clipAfter = edit.getClip(0, 0);
		expect(clipAfter?.asset?.type).toBe("video");
		expect((clipAfter?.asset as { src: string })?.src).toBe("https://example.com/video.mp4");
	});

	it("transformFromLuma restores original image type", () => {
		// First transform image to luma
		edit.transformToLuma(0, 1);
		expect(edit.getClip(0, 1)?.asset?.type).toBe("luma");

		// Now transform back
		edit.transformFromLuma(0, 1);

		const clipAfter = edit.getClip(0, 1);
		expect(clipAfter?.asset?.type).toBe("image");
		expect((clipAfter?.asset as { src: string })?.src).toBe("https://example.com/image.jpg");
	});

	it("undo during transform is safe", () => {
		const originalPlayer = edit.getPlayerClip(0, 0);
		expect(originalPlayer).toBeDefined();

		// Transform to luma (async load starts)
		edit.transformToLuma(0, 0);

		// Immediately undo (while load may still be in progress)
		// This should NOT crash even though the new player may not be fully loaded
		expect(() => {
			edit.undo();
		}).not.toThrow();

		// Original player should be restored
		const restoredPlayer = edit.getPlayerClip(0, 0);
		expect(restoredPlayer).toBe(originalPlayer);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("video");
	});

	it("preserves asset type through multiple transform cycles", () => {
		// Video → luma → video
		edit.transformToLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("luma");

		edit.transformFromLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("video");

		// Another cycle
		edit.transformToLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("luma");

		edit.transformFromLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("video");
	});

	it("handles CDN URLs without extensions via stored type", async () => {
		// Dispose existing edit and create new one with CDN URL
		edit.dispose();

		// Create a clip with a CDN URL (no extension)
		// This tests that we use stored original type, not URL inference
		edit = new Edit({
			timeline: {
				tracks: [
					{
						clips: [
							{ start: 0, length: 5, fit: "cover", asset: { type: "video", src: "https://cdn.example.com/media/abc123" } }
						]
					}
				]
			},
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();

		// Transform to luma - stores original type
		edit.transformToLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("luma");

		// Transform back - should use stored type (video), not URL inference (would be image)
		edit.transformFromLuma(0, 0);
		expect(edit.getClip(0, 0)?.asset?.type).toBe("video");
	});
});
