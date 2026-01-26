/**
 * Regression Tests: Intent Value Stripping on Timeline Manipulation
 *
 * When clips with "intent values" (`auto`, `end`, alias references, merge fields)
 * are manipulated through timeline commands, these values must be:
 * 1. Stripped and replaced with numeric values in the document
 * 2. Restored on undo
 * 3. Reflected correctly in getResolvedEdit()
 */

/* eslint-disable max-classes-per-file -- Test helper classes */
/* eslint-disable global-require, @typescript-eslint/no-require-imports -- Jest hoists mock factories */
import { Edit } from "@core/edit-session";
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

describe("Intent value stripping on manipulation", () => {
	describe("alias reference stripping", () => {
		let edit: Edit;

		beforeEach(async () => {
			// Setup: Clip B references Clip A's length via alias
			// Note: alias://intro in the length field references intro's length
			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 5, alias: "intro" }]
						},
						{
							clips: [
								{
									asset: { type: "image", src: "https://example.com/b.jpg" },
									start: 0,
									length: "alias://intro" as unknown as number
								}
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

		it("strips alias reference from length when clip is resized", async () => {
			// Verify initial state - document should have the alias reference
			const docClipBefore = edit.getDocument()?.getClip(1, 0);
			expect(docClipBefore?.length).toBe("alias://intro");

			// Execute: Resize Clip B to 3 seconds
			const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
			const resizeCommand = new ResizeClipCommand(1, 0, sec(3));
			await edit.executeEditCommand(resizeCommand);

			// Verify: Document should have numeric length, not alias
			const docClipAfter = edit.getDocument()?.getClip(1, 0);
			expect(typeof docClipAfter?.length).toBe("number");
			expect(docClipAfter?.length).toBe(3);
		});

		it("restores alias reference on undo after resize", async () => {
			// Execute resize
			const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
			const resizeCommand = new ResizeClipCommand(1, 0, sec(3));
			await edit.executeEditCommand(resizeCommand);

			// Verify stripped
			const docClipAfterResize = edit.getDocument()?.getClip(1, 0);
			expect(docClipAfterResize?.length).toBe(3);

			// Undo
			await edit.undo();

			// Verify: Document should have alias reference restored
			const docClipAfterUndo = edit.getDocument()?.getClip(1, 0);
			expect(docClipAfterUndo?.length).toBe("alias://intro");
		});

		it("strips alias reference from start when clip is moved", async () => {
			// Create a new edit with alias reference in start
			edit.dispose();

			// Note: alias://intro in the start field references intro's start
			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 2, length: 5, alias: "intro" }]
						},
						{
							clips: [
								{
									asset: { type: "image", src: "https://example.com/b.jpg" },
									start: "alias://intro" as unknown as number,
									length: 3
								}
							]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			});
			await edit.load();

			// Verify initial state
			const docClipBefore = edit.getDocument()?.getClip(1, 0);
			expect(docClipBefore?.start).toBe("alias://intro");

			// Execute: Move Clip B to position 5
			const { MoveClipCommand } = await import("@core/commands/move-clip-command");
			const moveCommand = new MoveClipCommand(1, 0, 1, sec(5));
			await edit.executeEditCommand(moveCommand);

			// Verify: Document should have numeric start, not alias
			const docClipAfter = edit.getDocument()?.getClip(1, 0);
			expect(typeof docClipAfter?.start).toBe("number");
			expect(docClipAfter?.start).toBe(5);
		});

		it("restores alias reference on undo after move", async () => {
			// Create a new edit with alias reference in start
			edit.dispose();

			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 2, length: 5, alias: "intro" }]
						},
						{
							clips: [
								{
									asset: { type: "image", src: "https://example.com/b.jpg" },
									start: "alias://intro" as unknown as number,
									length: 3
								}
							]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			});
			await edit.load();

			// Execute move
			const { MoveClipCommand } = await import("@core/commands/move-clip-command");
			const moveCommand = new MoveClipCommand(1, 0, 1, sec(5));
			await edit.executeEditCommand(moveCommand);

			// Verify stripped
			expect(edit.getDocument()?.getClip(1, 0)?.start).toBe(5);

			// Undo
			await edit.undo();

			// Verify: Document should have alias reference restored
			const docClipAfterUndo = edit.getDocument()?.getClip(1, 0);
			expect(docClipAfterUndo?.start).toBe("alias://intro");
		});
	});

	describe("auto value stripping", () => {
		let edit: Edit;

		beforeEach(async () => {
			// Setup: Clip B has start: "auto" (sequential positioning)
			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [
								{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 3 },
								{ asset: { type: "image", src: "https://example.com/b.jpg" }, start: "auto", length: 2 }
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

		it("strips 'auto' start when clip is moved", async () => {
			// Verify initial state
			const docClipBefore = edit.getDocument()?.getClip(0, 1);
			expect(docClipBefore?.start).toBe("auto");

			// Execute: Move Clip B to position 5
			const { MoveClipCommand } = await import("@core/commands/move-clip-command");
			const moveCommand = new MoveClipCommand(0, 1, 0, sec(5));
			await edit.executeEditCommand(moveCommand);

			// Verify: Document should have numeric start, not "auto"
			const docClipAfter = edit.getDocument()?.getClip(0, 1);
			expect(typeof docClipAfter?.start).toBe("number");
			expect(docClipAfter?.start).toBe(5);
		});

		it("restores 'auto' start on undo after move", async () => {
			// Execute move
			const { MoveClipCommand } = await import("@core/commands/move-clip-command");
			const moveCommand = new MoveClipCommand(0, 1, 0, sec(5));
			await edit.executeEditCommand(moveCommand);

			// Verify stripped
			expect(edit.getDocument()?.getClip(0, 1)?.start).toBe(5);

			// Undo
			await edit.undo();

			// Verify: Document should have "auto" restored
			const docClipAfterUndo = edit.getDocument()?.getClip(0, 1);
			expect(docClipAfterUndo?.start).toBe("auto");
		});
	});

	describe("end value stripping", () => {
		let edit: Edit;

		beforeEach(async () => {
			// Setup: Track 1 clip has length: "end" (extend to timeline end)
			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/content.jpg" }, start: 0, length: 5 }]
						},
						{
							clips: [
								{
									asset: { type: "image", src: "https://example.com/bg.jpg" },
									start: 0,
									length: "end" as unknown as number
								}
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

		it("strips 'end' length when clip is resized", async () => {
			// Verify initial state
			const docClipBefore = edit.getDocument()?.getClip(1, 0);
			expect(docClipBefore?.length).toBe("end");

			// Execute: Resize to 3 seconds
			const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
			const resizeCommand = new ResizeClipCommand(1, 0, sec(3));
			await edit.executeEditCommand(resizeCommand);

			// Verify: Document should have numeric length, not "end"
			const docClipAfter = edit.getDocument()?.getClip(1, 0);
			expect(typeof docClipAfter?.length).toBe("number");
			expect(docClipAfter?.length).toBe(3);
		});

		it("restores 'end' length on undo after resize", async () => {
			// Execute resize
			const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
			const resizeCommand = new ResizeClipCommand(1, 0, sec(3));
			await edit.executeEditCommand(resizeCommand);

			// Verify stripped
			expect(edit.getDocument()?.getClip(1, 0)?.length).toBe(3);

			// Undo
			await edit.undo();

			// Verify: Document should have "end" restored
			const docClipAfterUndo = edit.getDocument()?.getClip(1, 0);
			expect(docClipAfterUndo?.length).toBe("end");
		});
	});

	describe("cache synchronization (snap-back prevention)", () => {
		describe("with explicit numeric values", () => {
			let edit: Edit;

			beforeEach(async () => {
				// Setup: Clips with explicit numeric values to test cache sync
				edit = new Edit({
					timeline: {
						tracks: [
							{
								clips: [{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 5 }]
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

			it("updates getResolvedEdit() after resize", async () => {
				// Get initial resolved state
				const resolvedBefore = edit.getResolvedEdit();
				const resolvedLengthBefore = resolvedBefore.timeline.tracks[0].clips[0].length;
				expect(resolvedLengthBefore).toBe(5);

				// Execute: Resize to 3 seconds
				const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
				const resizeCommand = new ResizeClipCommand(0, 0, sec(3));
				await edit.executeEditCommand(resizeCommand);

				// Verify: getResolvedEdit() returns new numeric value
				const resolvedAfter = edit.getResolvedEdit();
				const resolvedLengthAfter = resolvedAfter.timeline.tracks[0].clips[0].length;
				expect(resolvedLengthAfter).toBe(3);
			});

			it("updates getResolvedEdit() after move", async () => {
				// Get initial resolved state
				const resolvedBefore = edit.getResolvedEdit();
				const resolvedStartBefore = resolvedBefore.timeline.tracks[0].clips[0].start;
				expect(resolvedStartBefore).toBe(0);

				// Execute: Move to position 2
				const { MoveClipCommand } = await import("@core/commands/move-clip-command");
				const moveCommand = new MoveClipCommand(0, 0, 0, sec(2));
				await edit.executeEditCommand(moveCommand);

				// Verify: getResolvedEdit() returns new position
				const resolvedAfter = edit.getResolvedEdit();
				const resolvedStartAfter = resolvedAfter.timeline.tracks[0].clips[0].start;
				expect(resolvedStartAfter).toBe(2);
			});

			it("maintains cache consistency through undo/redo cycle", async () => {
				// Execute resize
				const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
				const resizeCommand = new ResizeClipCommand(0, 0, sec(3));
				await edit.executeEditCommand(resizeCommand);

				// Verify after resize
				expect(edit.getResolvedEdit().timeline.tracks[0].clips[0].length).toBe(3);

				// Undo
				await edit.undo();

				// Verify after undo - should be back to original value
				const resolvedAfterUndo = edit.getResolvedEdit();
				expect(resolvedAfterUndo.timeline.tracks[0].clips[0].length).toBe(5);

				// Redo
				await edit.redo();

				// Verify after redo - should be back to resized value
				expect(edit.getResolvedEdit().timeline.tracks[0].clips[0].length).toBe(3);
			});
		});

		describe("with auto start values", () => {
			let edit: Edit;

			beforeEach(async () => {
				// Setup: Clip with auto start
				edit = new Edit({
					timeline: {
						tracks: [
							{
								clips: [
									{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 3 },
									{ asset: { type: "image", src: "https://example.com/b.jpg" }, start: "auto", length: 2 }
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

			it("updates getResolvedEdit() after moving clip with auto start", async () => {
				// Get initial resolved state
				const resolvedBefore = edit.getResolvedEdit();
				const resolvedStartBefore = resolvedBefore.timeline.tracks[0].clips[1].start;
				expect(resolvedStartBefore).toBe(3); // Auto resolved to after first clip

				// Execute: Move to position 5
				const { MoveClipCommand } = await import("@core/commands/move-clip-command");
				const moveCommand = new MoveClipCommand(0, 1, 0, sec(5));
				await edit.executeEditCommand(moveCommand);

				// Verify: getResolvedEdit() returns new position
				const resolvedAfter = edit.getResolvedEdit();
				const resolvedStartAfter = resolvedAfter.timeline.tracks[0].clips[1].start;
				expect(resolvedStartAfter).toBe(5);
			});
		});
	});

	describe("alias reference resolution edge cases", () => {
		let edit: Edit;

		afterEach(() => {
			if (edit) {
				edit.dispose();
			}
			jest.clearAllMocks();
		});

		it("handles resize after move preserving correct intent state", async () => {
			// Setup: Clip with auto start and explicit length
			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [
								{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 3 },
								{ asset: { type: "image", src: "https://example.com/b.jpg" }, start: "auto", length: 2 }
							]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			});
			await edit.load();

			// Move first (strips auto)
			const { MoveClipCommand } = await import("@core/commands/move-clip-command");
			await edit.executeEditCommand(new MoveClipCommand(0, 1, 0, sec(5)));

			// Resize second (changes length)
			const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
			await edit.executeEditCommand(new ResizeClipCommand(0, 1, sec(4)));

			// Verify both are numeric now
			const docClip = edit.getDocument()?.getClip(0, 1);
			expect(docClip?.start).toBe(5);
			expect(docClip?.length).toBe(4);

			// Undo resize - length should go back to 2
			await edit.undo();
			expect(edit.getDocument()?.getClip(0, 1)?.length).toBe(2);

			// Undo move - start should go back to "auto"
			await edit.undo();
			expect(edit.getDocument()?.getClip(0, 1)?.start).toBe("auto");
		});

		it("preserves alias reference when aliased clip is not modified", async () => {
			// Setup: Clip B references Clip A's length
			edit = new Edit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "https://example.com/a.jpg" }, start: 0, length: 5, alias: "intro" }]
						},
						{
							clips: [
								{
									asset: { type: "image", src: "https://example.com/b.jpg" },
									start: 0,
									length: "alias://intro" as unknown as number
								}
							]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" }
			});
			await edit.load();

			// Modify the aliased clip (intro)
			const { ResizeClipCommand } = await import("@core/commands/resize-clip-command");
			await edit.executeEditCommand(new ResizeClipCommand(0, 0, sec(7)));

			// The referencing clip should still have the alias reference
			const docClipB = edit.getDocument()?.getClip(1, 0);
			expect(docClipB?.length).toBe("alias://intro");

			// But resolved edit should show the new length value
			const resolved = edit.getResolvedEdit();
			expect(resolved.timeline.tracks[1].clips[0].length).toBe(7);
		});
	});
});
