/**
 * Edit Class Merge Field Tests
 *
 * Tests the merge field system: applyMergeField, removeMergeField, getMergeFieldForProperty,
 * updateMergeFieldValueLive, deleteMergeFieldGlobally.
 *
 * Merge fields enable dynamic content substitution using {{ FIELD_NAME }} templates.
 * The system uses dual storage: originalEdit stores templates, clipConfiguration stores resolved values.
 */

import { ShotstackEdit } from "@core/shotstack-edit";
import { PlayerType } from "@canvas/players/player";
import type { EventEmitter } from "@core/events/event-emitter";
import type { ResolvedClip } from "@schemas";
import { sec } from "@core/timing/types";

// Mock pixi-filters
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
		const self = {
			children,
			sortableChildren: true,
			parent: null as unknown,
			label: null as string | null,
			zIndex: 0,
			visible: true,
			destroyed: false,
			addChild: jest.fn((child: { parent?: unknown }) => {
				children.push(child);
				if (typeof child === "object" && child !== null) {
					// eslint-disable-next-line no-param-reassign -- Intentional mock of Pixi.js Container behavior
					child.parent = self;
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
			destroy: jest.fn(() => {
				self.destroyed = true;
			}),
			setMask: jest.fn()
		};
		return self;
	};

	const createMockGraphics = (): Record<string, unknown> => ({
		fillStyle: {},
		rect: jest.fn().mockReturnThis(),
		fill: jest.fn().mockReturnThis(),
		clear: jest.fn().mockReturnThis(),
		stroke: jest.fn().mockReturnThis(),
		strokeStyle: {},
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
			anchor: { set: jest.fn() },
			scale: { set: jest.fn() },
			position: { set: jest.fn() },
			destroy: jest.fn()
		})),
		Texture: { from: jest.fn() },
		Assets: { load: jest.fn().mockResolvedValue({}), unload: jest.fn(), cache: { has: jest.fn().mockReturnValue(false) } },
		ColorMatrixFilter: jest.fn(() => ({ negative: jest.fn() })),
		Rectangle: jest.fn()
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
		loadTracker: { on: jest.fn(), off: jest.fn() }
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

// Mock AlignmentGuides
jest.mock("@canvas/system/alignment-guides", () => ({
	AlignmentGuides: jest.fn().mockImplementation(() => ({
		drawCanvasGuide: jest.fn(),
		drawClipGuide: jest.fn(),
		clear: jest.fn()
	}))
}));

// Create mock container for players
const createMockPlayerContainer = () => {
	const children: unknown[] = [];
	return {
		children,
		parent: null,
		visible: true,
		zIndex: 0,
		addChild: jest.fn((child: unknown) => {
			children.push(child);
			return child;
		}),
		removeChild: jest.fn(),
		destroy: jest.fn(),
		setMask: jest.fn()
	};
};

// Mock player factory - create functional mock players
const createMockPlayer = (edit: ShotstackEdit, config: ResolvedClip, type: PlayerType) => {
	const container = createMockPlayerContainer();
	const contentContainer = createMockPlayerContainer();

	const startMs = typeof config.start === "number" ? config.start * 1000 : 0;
	const lengthMs = typeof config.length === "number" ? config.length * 1000 : 3000;

	let resolvedTiming = { start: startMs, length: lengthMs };

	// Mock player object - clipId will be set by reconciler after creation
	const mockPlayer: Record<string, unknown> = {
		clipConfiguration: config,
		clipId: null as string | null,
		layer: 0,
		playerType: type,
		shouldDispose: false,
		getContainer: () => container,
		getContentContainer: () => contentContainer,
		getStart: () => resolvedTiming.start,
		getLength: () => resolvedTiming.length,
		getEnd: () => resolvedTiming.start + resolvedTiming.length,
		getSize: () => ({ width: 1920, height: 1080 }),
		// Read timing intent from document (matches real Player behavior)
		getTimingIntent: () => {
			const clipId = mockPlayer["clipId"] as string | null;
			if (clipId) {
				const docClip = edit.getDocumentClipById(clipId);
				if (docClip) {
					return {
						start: docClip.start,
						length: docClip.length
					};
				}
			}
			// Fallback: use resolved values from clipConfiguration
			return {
				start: config.start,
				length: config.length
			};
		},
		getResolvedTiming: () => ({ ...resolvedTiming }),
		setResolvedTiming: jest.fn((timing: { start: number; length: number }) => {
			resolvedTiming = { ...timing };
		}),
		load: jest.fn().mockResolvedValue(undefined),
		draw: jest.fn(),
		update: jest.fn(),
		reconfigureAfterRestore: jest.fn(),
		reloadAsset: jest.fn().mockResolvedValue(undefined),
		dispose: jest.fn(),
		isActive: () => true,
		// Export - placeholder restoration now handled by document.toJSON()
		getExportableClip: () => {
			const exported = structuredClone(mockPlayer["clipConfiguration"]) as Record<string, unknown>;
			// Apply timing intent from document (matches real Player behavior)
			const intent = (mockPlayer["getTimingIntent"] as () => { start: unknown; length: unknown })();
			exported["start"] = intent.start;
			exported["length"] = intent.length;
			return exported as ResolvedClip;
		}
	};

	return mockPlayer;
};

// Mock all player types
jest.mock("@canvas/players/video-player", () => ({
	VideoPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Video))
}));

jest.mock("@canvas/players/image-player", () => ({
	ImagePlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Image))
}));

jest.mock("@canvas/players/text-player", () => ({
	TextPlayer: Object.assign(
		jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Text)),
		{ resetFontCache: jest.fn() }
	)
}));

jest.mock("@canvas/players/audio-player", () => ({
	AudioPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Audio))
}));

jest.mock("@canvas/players/luma-player", () => ({
	LumaPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Luma))
}));

jest.mock("@canvas/players/shape-player", () => ({
	ShapePlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Shape))
}));

jest.mock("@canvas/players/html-player", () => ({
	HtmlPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Html))
}));

jest.mock("@canvas/players/rich-text-player", () => ({
	RichTextPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.RichText))
}));

jest.mock("@canvas/players/caption-player", () => ({
	CaptionPlayer: jest.fn().mockImplementation((edit, config) => createMockPlayer(edit, config, PlayerType.Caption))
}));

/**
 * Helper to access private Edit state for testing.
 */
function getEditState(edit: ShotstackEdit): {
	tracks: unknown[][];
	commandHistory: unknown[];
	commandIndex: number;
} {
	const anyEdit = edit as unknown as {
		tracks: unknown[][];
		commandHistory: unknown[];
		commandIndex: number;
	};
	return {
		tracks: anyEdit.tracks,
		commandHistory: anyEdit.commandHistory,
		commandIndex: anyEdit.commandIndex
	};
}

/**
 * Create a simple image clip config for testing.
 */
function createImageClip(start: number, length: number, src: string = "https://example.com/image.jpg"): ResolvedClip {
	return {
		id: crypto.randomUUID(),
		asset: { type: "image", src },
		start: sec(start),
		length: sec(length),
		fit: "crop"
	};
}

/**
 * Create a text clip config for testing.
 */
function createTextClip(start: number, length: number, text: string = "Hello World"): ResolvedClip {
	return {
		id: crypto.randomUUID(),
		asset: { type: "text", text },
		start: sec(start),
		length: sec(length),
		fit: "none"
	};
}

describe("Edit Merge Fields", () => {
	let edit: ShotstackEdit;
	let events: EventEmitter;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		const minimalClip = { asset: { type: "image" as const, src: "https://example.com/image.jpg" }, start: 0, length: 1 };
		edit = new ShotstackEdit({
			timeline: { tracks: [{ clips: [minimalClip] }] },
			output: { size: { width: 1920, height: 1080 }, format: "mp4" }
		});
		await edit.load();

		// Initialize originalEdit with tracks so merge field templates can be stored
		// When addClip is called, it syncs to originalEdit.timeline.tracks[trackIdx]
		// We pre-create track objects with minimal clips so the sync will work
		await edit.loadEdit({
			timeline: {
				tracks: [
					{ clips: [minimalClip] }, // Track 0
					{ clips: [minimalClip] } // Track 1
				]
			},
			output: {
				size: { width: 1920, height: 1080 },
				format: "mp4"
			}
		});

		events = edit.events;
		emitSpy = jest.spyOn(events, "emit");
	});

	afterEach(() => {
		edit.dispose();
		jest.clearAllMocks();
	});

	describe("applyMergeField()", () => {
		it("stores {{ FIELD }} template in document bindings", async () => {
			// Add a clip first
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			// Apply merge field
			edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://cdn.example.com/new.jpg");

			// Check document has binding with template
			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;
			const binding = clipId ? document?.getClipBinding(clipId, "asset.src") : undefined;
			expect(binding?.placeholder).toBe("{{ MEDIA_URL }}");
			expect(binding?.resolvedValue).toBe("https://cdn.example.com/new.jpg");
		});

		it("updates clipConfiguration with resolved value", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://cdn.example.com/new.jpg");

			// Check player's clipConfiguration has resolved value
			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://cdn.example.com/new.jpg");
		});

		it("handles asset.src path", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "IMAGE_SRC", "https://example.com/image.png");

			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/image.png");
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBe("IMAGE_SRC");
		});

		it("handles asset.text path", async () => {
			const clip = createTextClip(0, 3, "Original text");
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.text", "HEADLINE", "New headline text");

			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("text", "New headline text");
			expect(edit.getMergeFieldForProperty(0, 0, "asset.text")).toBe("HEADLINE");
		});

		it("is undoable - restores previous value", async () => {
			const originalSrc = "https://example.com/original.jpg";
			const clip = createImageClip(0, 3, originalSrc);
			await edit.addClip(0, clip);

			// Apply merge field
			edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://cdn.example.com/new.jpg", originalSrc);

			// Undo
			await edit.undo();
			await Promise.resolve(); // Flush async operations

			// Check restored value
			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", originalSrc);
		});

		it("registers field in merge field service", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "NEW_FIELD", "https://example.com/value.jpg");

			const field = edit.mergeFields.get("NEW_FIELD");
			expect(field).toBeDefined();
			expect(field?.defaultValue).toBe("https://example.com/value.jpg");
		});

		it("emits mergefield:applied event", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);
			emitSpy.mockClear();

			edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://example.com/new.jpg");
			// Flush microtask queue - command.execute() is async
			await Promise.resolve();

			expect(emitSpy).toHaveBeenCalledWith(
				"mergefield:applied",
				expect.objectContaining({
					propertyPath: "asset.src",
					fieldName: "MEDIA_URL",
					trackIndex: 0,
					clipIndex: 0
				})
			);
		});

		it("replaces existing merge field on same property", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			// Apply first merge field
			await edit.applyMergeField(0, 0, "asset.src", "FIELD_A", "https://a.example.com/a.jpg");
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBe("FIELD_A");

			// Apply second merge field to same property
			await edit.applyMergeField(0, 0, "asset.src", "FIELD_B", "https://b.example.com/b.jpg");
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBe("FIELD_B");
		});

		it("calls reloadAsset for src field changes", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			const player = edit.getPlayerClip(0, 0);
			const reloadSpy = jest.spyOn(player!, "reloadAsset");

			await edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://example.com/new.jpg");

			expect(reloadSpy).toHaveBeenCalled();
		});

		it("is no-op for invalid track/clip indices", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			const { commandIndex: beforeIndex } = getEditState(edit);

			// Try to apply to non-existent clip
			edit.applyMergeField(99, 99, "asset.src", "FIELD", "value");

			const { commandIndex: afterIndex } = getEditState(edit);
			// Command should not have been added
			expect(afterIndex).toBe(beforeIndex);
		});
	});

	describe("removeMergeField()", () => {
		it("removes binding from player", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			// Apply merge field first
			await edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://example.com/new.jpg");

			// Remove merge field
			await edit.removeMergeField(0, 0, "asset.src", "https://example.com/restored.jpg");

			// Check binding was removed from document
			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;
			const binding = clipId ? document?.getClipBinding(clipId, "asset.src") : undefined;
			expect(binding).toBeUndefined();
		});

		it("sets restoreValue in clipConfiguration", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			await edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://example.com/new.jpg");
			await edit.removeMergeField(0, 0, "asset.src", "https://example.com/restored.jpg");

			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/restored.jpg");
		});

		it("removes field from registry", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			await edit.applyMergeField(0, 0, "asset.src", "REMOVE_ME", "https://example.com/value.jpg");
			expect(edit.mergeFields.get("REMOVE_ME")).toBeDefined();

			await edit.removeMergeField(0, 0, "asset.src", "https://example.com/restored.jpg");
			expect(edit.mergeFields.get("REMOVE_ME")).toBeUndefined();
		});

		it("is undoable - re-applies field", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			await edit.applyMergeField(0, 0, "asset.src", "UNDO_TEST", "https://example.com/merged.jpg");
			await edit.removeMergeField(0, 0, "asset.src", "https://example.com/original.jpg");

			// Undo the remove
			await edit.undo();
			await Promise.resolve();

			// Binding should be back in document
			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;
			const binding = clipId ? document?.getClipBinding(clipId, "asset.src") : undefined;
			expect(binding?.placeholder).toBe("{{ UNDO_TEST }}");
		});

		it("is no-op when no merge field exists", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			const { commandIndex: beforeIndex } = getEditState(edit);

			// Try to remove non-existent merge field
			edit.removeMergeField(0, 0, "asset.src", "https://example.com/restored.jpg");

			const { commandIndex: afterIndex } = getEditState(edit);
			// No command should have been added
			expect(afterIndex).toBe(beforeIndex);
		});

		it("emits mergefield:removed event on undo", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "MEDIA_URL", "https://example.com/new.jpg");
			emitSpy.mockClear();

			await edit.undo();
			await Promise.resolve();

			expect(emitSpy).toHaveBeenCalledWith(
				"mergefield:removed",
				expect.objectContaining({
					propertyPath: "asset.src",
					trackIndex: 0,
					clipIndex: 0
				})
			);
		});
	});

	describe("getMergeFieldForProperty()", () => {
		it("returns field name when merge field applied", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "IMAGE_URL", "https://example.com/image.jpg");

			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBe("IMAGE_URL");
		});

		it("returns null when no merge field", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBeNull();
		});

		it("returns null for invalid track/clip indices", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			expect(edit.getMergeFieldForProperty(99, 0, "asset.src")).toBeNull();
			expect(edit.getMergeFieldForProperty(0, 99, "asset.src")).toBeNull();
		});

		it("returns null for non-merge-field properties", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			// asset.src is not a merge field, so should return null
			expect(edit.getMergeFieldForProperty(0, 0, "start")).toBeNull();
		});
	});

	describe("updateMergeFieldValueLive()", () => {
		it("updates field defaultValue in registry", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "LIVE_UPDATE", "https://example.com/initial.jpg");

			edit.updateMergeFieldValueLive("LIVE_UPDATE", "https://example.com/updated.jpg");

			const field = edit.mergeFields.get("LIVE_UPDATE");
			expect(field?.defaultValue).toBe("https://example.com/updated.jpg");
		});

		it("updates clipConfiguration with new value", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "LIVE_UPDATE", "https://example.com/initial.jpg");

			edit.updateMergeFieldValueLive("LIVE_UPDATE", "https://example.com/updated.jpg");

			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/updated.jpg");
		});

		it("does NOT create undo entry (command history unchanged)", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			edit.applyMergeField(0, 0, "asset.src", "NO_UNDO", "https://example.com/initial.jpg");

			const { commandIndex: beforeIndex } = getEditState(edit);

			edit.updateMergeFieldValueLive("NO_UNDO", "https://example.com/updated.jpg");

			const { commandIndex: afterIndex } = getEditState(edit);
			expect(afterIndex).toBe(beforeIndex);
		});

		it("is no-op for non-existent field", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			const player = edit.getPlayerClip(0, 0);
			const originalSrc = (player?.clipConfiguration.asset as { src: string }).src;

			edit.updateMergeFieldValueLive("NONEXISTENT", "https://example.com/new.jpg");

			// Original value should be unchanged
			expect(player?.clipConfiguration.asset).toHaveProperty("src", originalSrc);
		});

		it("updates all clips using the same field", async () => {
			// Add two clips
			const clip1 = createImageClip(0, 3);
			const clip2 = createImageClip(3, 3);
			await edit.addClip(0, clip1);
			await edit.addClip(0, clip2);

			// Apply same merge field to both
			await edit.applyMergeField(0, 0, "asset.src", "SHARED_FIELD", "https://example.com/initial.jpg");
			await edit.applyMergeField(0, 1, "asset.src", "SHARED_FIELD", "https://example.com/initial.jpg");

			// Update the field value
			await edit.updateMergeFieldValueLive("SHARED_FIELD", "https://example.com/updated.jpg");

			// Both clips should be updated
			const player1 = edit.getPlayerClip(0, 0);
			const player2 = edit.getPlayerClip(0, 1);
			expect(player1?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/updated.jpg");
			expect(player2?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/updated.jpg");
		});

		it("preserves merge field placeholder in template when updating value (regression)", async () => {
			// Bug: Changing placeholder value in merge field overview was removing {{ FIELD }}
			// from the text asset and replacing it with the placeholder value.
			// Expected: {{ FIELD }} stays in template/export, canvas shows new resolved value.
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "text", text: "Hello {{ NAME }}" }, start: 0, length: 3, fit: "none" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "NAME", replace: "World" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Before update: verify initial state
			expect((player?.clipConfiguration.asset as { text?: string }).text).toBe("Hello World");
			const bindingBefore = clipId ? document?.getClipBinding(clipId, "asset.text") : undefined;
			expect(bindingBefore?.placeholder).toBe("Hello {{ NAME }}");

			// Update the merge field value (simulates changing placeholder in merge field overview)
			edit.updateMergeFieldValueLive("NAME", "Universe");

			// After update:
			// 1. clipConfiguration should have the new RESOLVED value (for canvas rendering)
			expect((player?.clipConfiguration.asset as { text?: string }).text).toBe("Hello Universe");

			// 2. Binding placeholder should still contain {{ NAME }} (for toolbar display)
			const bindingAfter = clipId ? document?.getClipBinding(clipId, "asset.text") : undefined;
			expect(bindingAfter?.placeholder).toBe("Hello {{ NAME }}");

			// 3. Export should still contain {{ NAME }} (for template output)
			const exported = document?.toJSON();
			const exportedClip = exported?.timeline?.tracks?.[0]?.clips?.[0];
			expect((exportedClip?.asset as { text?: string }).text).toBe("Hello {{ NAME }}");
		});
	});

	describe("deleteMergeFieldGlobally()", () => {
		it("removes field from registry", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			await edit.applyMergeField(0, 0, "asset.src", "DELETE_ME", "https://example.com/value.jpg");
			expect(edit.mergeFields.get("DELETE_ME")).toBeDefined();

			await edit.deleteMergeFieldGlobally("DELETE_ME");
			expect(edit.mergeFields.get("DELETE_ME")).toBeUndefined();
		});

		it("restores defaultValue to affected clips", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			await edit.applyMergeField(0, 0, "asset.src", "RESTORE_TEST", "https://example.com/merged.jpg");

			await edit.deleteMergeFieldGlobally("RESTORE_TEST");

			// The clip should have the default value restored
			const player = edit.getPlayerClip(0, 0);
			expect(player?.clipConfiguration.asset).toHaveProperty("src", "https://example.com/merged.jpg");

			// Merge field should be removed from property
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBeNull();
		});

		it("removes field from all clips using it", async () => {
			// Add two clips
			const clip1 = createImageClip(0, 3);
			const clip2 = createImageClip(3, 3);
			await edit.addClip(0, clip1);
			await edit.addClip(0, clip2);

			// Apply same merge field to both
			await edit.applyMergeField(0, 0, "asset.src", "SHARED", "https://example.com/shared.jpg");
			await edit.applyMergeField(0, 1, "asset.src", "SHARED", "https://example.com/shared.jpg");

			// Delete globally
			await edit.deleteMergeFieldGlobally("SHARED");

			// Both should have merge field removed
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBeNull();
			expect(edit.getMergeFieldForProperty(0, 1, "asset.src")).toBeNull();
		});

		it("is no-op for non-existent field", async () => {
			const clip = createImageClip(0, 3);
			await edit.addClip(0, clip);

			const { commandIndex: beforeIndex } = getEditState(edit);

			await edit.deleteMergeFieldGlobally("NONEXISTENT");

			const { commandIndex: afterIndex } = getEditState(edit);
			// No commands added for non-existent field
			expect(afterIndex).toBe(beforeIndex);
		});
	});

	describe("MergeFieldService integration", () => {
		it("generateUniqueName creates unique field names", async () => {
			// Register some fields
			edit.mergeFields.register({ name: "MEDIA_1", defaultValue: "value1" });
			edit.mergeFields.register({ name: "MEDIA_2", defaultValue: "value2" });

			// Should skip existing and return MEDIA_3
			const uniqueName = edit.mergeFields.generateUniqueName("MEDIA");
			expect(uniqueName).toBe("MEDIA_3");
		});

		it("createTemplate formats {{ FIELD }} correctly", async () => {
			const template = edit.mergeFields.createTemplate("MY_FIELD");
			expect(template).toBe("{{ MY_FIELD }}");
		});

		it("extractFieldName parses template string", async () => {
			expect(edit.mergeFields.extractFieldName("{{ MY_FIELD }}")).toBe("MY_FIELD");
			expect(edit.mergeFields.extractFieldName("{{MY_FIELD}}")).toBe("MY_FIELD");
			expect(edit.mergeFields.extractFieldName("{{  MY_FIELD  }}")).toBe("MY_FIELD");
			expect(edit.mergeFields.extractFieldName("no field here")).toBeNull();
		});

		it("isMergeFieldTemplate detects template strings", async () => {
			expect(edit.mergeFields.isMergeFieldTemplate("{{ FIELD }}")).toBe(true);
			expect(edit.mergeFields.isMergeFieldTemplate("{{FIELD}}")).toBe(true);
			expect(edit.mergeFields.isMergeFieldTemplate("no template")).toBe(false);
			expect(edit.mergeFields.isMergeFieldTemplate("")).toBe(false);
		});

		it("resolve substitutes field values in strings", async () => {
			edit.mergeFields.register({ name: "NAME", defaultValue: "John" });
			edit.mergeFields.register({ name: "GREETING", defaultValue: "Hello" });

			const result = edit.mergeFields.resolve("{{ GREETING }}, {{ NAME }}!");
			expect(result).toBe("Hello, John!");
		});

		it("toSerializedArray exports in Shotstack format", async () => {
			edit.mergeFields.register({ name: "FIELD_A", defaultValue: "value_a" });
			edit.mergeFields.register({ name: "FIELD_B", defaultValue: "value_b" });

			const serialized = edit.mergeFields.toSerializedArray();
			expect(serialized).toContainEqual({ find: "FIELD_A", replace: "value_a" });
			expect(serialized).toContainEqual({ find: "FIELD_B", replace: "value_b" });
		});
	});

	describe("text asset merge field display", () => {
		it("player binding stores placeholder for text asset display", async () => {
			// Load edit with text merge field - this tests the scenario where
			// a text toolbar needs to show {{ TITLE }} instead of resolved value
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "text", text: "{{ TITLE }}" }, start: 0, length: 3, fit: "none" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "TITLE", replace: "Resolved Title" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Resolved value in clipConfiguration (for rendering)
			expect((player?.clipConfiguration.asset as { text?: string }).text).toBe("Resolved Title");

			// Placeholder accessible via document binding (for UI display)
			const binding = clipId ? document?.getClipBinding(clipId, "asset.text") : undefined;
			expect(binding?.placeholder).toBe("{{ TITLE }}");
			expect(binding?.resolvedValue).toBe("Resolved Title");
		});

		it("editing text with merge fields resolves them for canvas rendering", async () => {
			// Load edit with merge field
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "text", text: "{{ TITLE }}" }, start: 0, length: 3, fit: "none" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "TITLE", replace: "Hello World" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Simulate text edit in toolbar: user types "{{ TITLE }} extra text"
			const rawText = "{{ TITLE }} extra text";
			const resolvedText = edit.mergeFields.resolve(rawText); // "Hello World extra text"

			// Update document binding (what toolbar should do)
			if (clipId && document) {
				document.setClipBinding(clipId, "asset.text", {
					placeholder: rawText,
					resolvedValue: resolvedText
				});
			}

			// Update clip with resolved text (what toolbar should do)
			edit.updateClip(0, 0, { asset: { type: "text", text: resolvedText } });

			// Canvas should show resolved value
			expect((player?.clipConfiguration.asset as { text?: string }).text).toBe("Hello World extra text");

			// Export via toJSON should restore placeholder
			const exported = document?.toJSON();
			const exportedClip = exported?.timeline?.tracks?.[0]?.clips?.[0];
			expect((exportedClip?.asset as { text?: string }).text).toBe("{{ TITLE }} extra text");
		});

		it("removing merge fields from text removes the binding", async () => {
			// Load edit with merge field
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "text", text: "{{ TITLE }}" }, start: 0, length: 3, fit: "none" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "TITLE", replace: "Hello World" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Initially has binding
			expect(clipId && document?.getClipBinding(clipId, "asset.text")).toBeDefined();

			// Simulate text edit removing merge field: user types plain text
			const plainText = "Just plain text";

			// Remove binding via document (what toolbar should do when no merge field)
			if (clipId) {
				document?.removeClipBinding(clipId, "asset.text");
			}

			// Update clip with plain text
			edit.updateClip(0, 0, { asset: { type: "text", text: plainText } });

			// No binding should exist
			expect(clipId && document?.getClipBinding(clipId, "asset.text")).toBeUndefined();

			// Export via toJSON should show plain text (since document was also updated with plain text)
			const exported = document?.toJSON();
			const exportedClip = exported?.timeline?.tracks?.[0]?.clips?.[0];
			expect((exportedClip?.asset as { text?: string }).text).toBe("Just plain text");
		});
	});

	describe("media asset merge field display", () => {
		it("image source with merge field preserves placeholder for export", async () => {
			// Load edit with image merge field
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "{{ IMAGE_URL }}" }, start: 0, length: 3, fit: "crop" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "IMAGE_URL", replace: "https://cdn.example.com/image.jpg" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Resolved value in clipConfiguration (for rendering)
			expect((player?.clipConfiguration.asset as { src?: string }).src).toBe("https://cdn.example.com/image.jpg");

			// Binding stored in document for export
			const binding = clipId ? document?.getClipBinding(clipId, "asset.src") : undefined;
			expect(binding?.placeholder).toBe("{{ IMAGE_URL }}");
			expect(binding?.resolvedValue).toBe("https://cdn.example.com/image.jpg");

			// Export via toJSON restores placeholder
			const exported = document?.toJSON();
			const exportedClip = exported?.timeline?.tracks?.[0]?.clips?.[0];
			expect((exportedClip?.asset as { src?: string }).src).toBe("{{ IMAGE_URL }}");
		});

		it("video source with merge field preserves placeholder for export", async () => {
			// Load edit with video merge field
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "video", src: "{{ VIDEO_URL }}", transcode: false }, start: 0, length: 5, fit: "crop" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "VIDEO_URL", replace: "https://cdn.example.com/video.mp4" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Resolved value in clipConfiguration (for rendering)
			expect((player?.clipConfiguration.asset as { src?: string }).src).toBe("https://cdn.example.com/video.mp4");

			// Binding stored in document (source of truth) for export
			const binding = clipId ? document?.getClipBinding(clipId, "asset.src") : undefined;
			expect(binding?.placeholder).toBe("{{ VIDEO_URL }}");

			// Export via toJSON restores placeholder
			const exported = document?.toJSON();
			const exportedClip = exported?.timeline?.tracks?.[0]?.clips?.[0];
			expect((exportedClip?.asset as { src?: string }).src).toBe("{{ VIDEO_URL }}");
		});

		it("changing source to different URL while binding exists updates export correctly", async () => {
			// Load edit with merge field
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "{{ IMAGE_URL }}" }, start: 0, length: 3, fit: "crop" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "IMAGE_URL", replace: "https://cdn.example.com/original.jpg" }]
			});

			const player = edit.getPlayerClip(0, 0);

			// Simulate toolbar changing source to a completely different URL
			const newSrc = "https://different-cdn.example.com/new-image.jpg";

			// Update clip with new source (toolbar would do this)
			edit.updateClip(0, 0, { asset: { type: "image", src: newSrc } });

			// Canvas should show new URL
			expect((player?.clipConfiguration.asset as { src?: string }).src).toBe(newSrc);

			// Export should show new URL (not placeholder) since value changed
			const exported = player?.getExportableClip();
			expect((exported?.asset as { src?: string }).src).toBe(newSrc);
		});

		it("removing merge field binding from source exports literal URL", async () => {
			// Load edit with merge field
			await edit.loadEdit({
				timeline: {
					tracks: [
						{
							clips: [{ asset: { type: "image", src: "{{ IMAGE_URL }}" }, start: 0, length: 3, fit: "crop" }]
						}
					]
				},
				output: { size: { width: 1920, height: 1080 }, format: "mp4" },
				merge: [{ find: "IMAGE_URL", replace: "https://cdn.example.com/image.jpg" }]
			});

			const player = edit.getPlayerClip(0, 0);
			const document = edit.getDocument();
			const clipId = player?.clipId;

			// Initially has binding
			expect(clipId && document?.getClipBinding(clipId, "asset.src")).toBeDefined();

			// Remove merge field via API (updates document data AND removes binding)
			await edit.removeMergeField(0, 0, "asset.src", "https://cdn.example.com/image.jpg");

			// No binding should exist
			expect(clipId && document?.getClipBinding(clipId, "asset.src")).toBeUndefined();

			// Export via toJSON should show literal URL (no placeholder to restore)
			const exported = document?.toJSON();
			const exportedClip = exported?.timeline?.tracks?.[0]?.clips?.[0];
			expect((exportedClip?.asset as { src?: string }).src).toBe("https://cdn.example.com/image.jpg");
		});
	});

	describe("undo/redo sequences", () => {
		it("undo then redo preserves merge field state", async () => {
			const clip = createImageClip(0, 3, "https://original.example.com/image.jpg");
			await edit.addClip(0, clip);

			const newValue = "https://new.example.com/image.jpg";
			edit.applyMergeField(0, 0, "asset.src", "SEQUENCE_TEST", newValue, "https://original.example.com/image.jpg");

			// Verify applied
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBe("SEQUENCE_TEST");

			// Undo
			await edit.undo();
			await Promise.resolve();
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBeNull();

			// Redo
			await edit.redo();
			await Promise.resolve();
			expect(edit.getMergeFieldForProperty(0, 0, "asset.src")).toBe("SEQUENCE_TEST");
		});

		it("multiple merge field operations can be undone in sequence", async () => {
			const clip = createTextClip(0, 3, "Original");
			await edit.addClip(0, clip);

			// Apply first merge field
			edit.applyMergeField(0, 0, "asset.text", "FIELD_1", "Value 1", "Original");

			// Apply second merge field (replaces first)
			edit.applyMergeField(0, 0, "asset.text", "FIELD_2", "Value 2");

			// Undo second
			await edit.undo();
			await Promise.resolve();
			expect(edit.getMergeFieldForProperty(0, 0, "asset.text")).toBe("FIELD_1");

			// Undo first
			await edit.undo();
			await Promise.resolve();
			expect(edit.getMergeFieldForProperty(0, 0, "asset.text")).toBeNull();
		});
	});
});
