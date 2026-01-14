/**
 * Output Resolution and AspectRatio Tests
 *
 * Tests the setOutputResolution() and setOutputAspectRatio() methods,
 * including size calculation, event emission, and mutual exclusivity
 * with custom size.
 */

import { Edit } from "@core/edit-session";
import { EditEvent } from "@core/events/edit-events";
import type { EditConfig } from "@schemas";

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
					Object.assign(child, { parent: self });
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
		Texture: {
			from: jest.fn().mockReturnValue({ width: 100, height: 100 }),
			EMPTY: { width: 0, height: 0 }
		},
		Assets: {
			load: jest.fn().mockResolvedValue({ width: 100, height: 100 }),
			add: jest.fn(),
			get: jest.fn(),
			setPreferences: jest.fn()
		},
		Text: jest.fn().mockImplementation(() => ({
			text: "",
			style: {},
			anchor: { set: jest.fn() },
			destroy: jest.fn()
		})),
		TextStyle: jest.fn().mockImplementation(() => ({})),
		HTMLText: jest.fn().mockImplementation(() => ({
			text: "",
			style: {},
			anchor: { set: jest.fn() },
			destroy: jest.fn()
		})),
		HTMLTextStyle: jest.fn().mockImplementation(() => ({}))
	};
});

function createMinimalEdit(): EditConfig {
	return {
		timeline: {
			tracks: [{ clips: [{ asset: { type: "image", src: "https://example.com/image.jpg" }, start: 0, length: 1 }] }]
		},
		output: {
			size: { width: 1920, height: 1080 },
			format: "mp4"
		}
	};
}

describe("Output Resolution and AspectRatio", () => {
	let edit: Edit;
	let emitSpy: jest.SpyInstance;

	beforeEach(async () => {
		edit = new Edit(createMinimalEdit());
		await edit.load();
		emitSpy = jest.spyOn(edit.events, "emit");
	});

	afterEach(() => {
		emitSpy.mockRestore();
	});

	describe("setOutputResolution()", () => {
		describe("size calculations", () => {
			it("calculates correct size for preview (512x288)", () => {
				edit.setOutputResolution("preview");
				expect(edit.size).toEqual({ width: 512, height: 288 });
			});

			it("calculates correct size for mobile (640x360)", () => {
				edit.setOutputResolution("mobile");
				expect(edit.size).toEqual({ width: 640, height: 360 });
			});

			it("calculates correct size for sd (1024x576)", () => {
				edit.setOutputResolution("sd");
				expect(edit.size).toEqual({ width: 1024, height: 576 });
			});

			it("calculates correct size for hd (1280x720)", () => {
				edit.setOutputResolution("hd");
				expect(edit.size).toEqual({ width: 1280, height: 720 });
			});

			it("calculates correct size for 1080 (1920x1080)", () => {
				edit.setOutputResolution("1080");
				expect(edit.size).toEqual({ width: 1920, height: 1080 });
			});

			it("calculates correct size for 4k (3840x2160)", () => {
				edit.setOutputResolution("4k");
				expect(edit.size).toEqual({ width: 3840, height: 2160 });
			});
		});

		describe("getter", () => {
			it("returns the set resolution", () => {
				edit.setOutputResolution("hd");
				expect(edit.getOutputResolution()).toBe("hd");
			});

			it("returns undefined when no resolution is set", () => {
				expect(edit.getOutputResolution()).toBeUndefined();
			});
		});

		describe("events", () => {
			it("emits OutputResolutionChanged event", () => {
				edit.setOutputResolution("hd");
				expect(emitSpy).toHaveBeenCalledWith(EditEvent.OutputResolutionChanged, { resolution: "hd" });
			});

			it("emits OutputResized event with new dimensions", () => {
				edit.setOutputResolution("hd");
				expect(emitSpy).toHaveBeenCalledWith(EditEvent.OutputResized, { width: 1280, height: 720 });
			});

			it("emits edit:changed event", () => {
				edit.setOutputResolution("hd");
				expect(emitSpy).toHaveBeenCalledWith(EditEvent.EditChanged, expect.objectContaining({ source: "output:resolution" }));
			});
		});

		describe("validation", () => {
			it("throws error for invalid resolution", () => {
				expect(() => edit.setOutputResolution("invalid" as string)).toThrow();
			});

			it("throws error for empty string", () => {
				expect(() => edit.setOutputResolution("" as string)).toThrow();
			});
		});

		describe("mutual exclusivity with size", () => {
			it("clears custom size when setting resolution", () => {
				edit.setOutputSize(800, 600);
				edit.setOutputResolution("hd");

				const json = edit.getEdit();
				expect(json.output.size).toBeUndefined();
				expect(json.output.resolution).toBe("hd");
			});
		});
	});

	describe("setOutputAspectRatio()", () => {
		describe("with resolution set", () => {
			beforeEach(() => {
				edit.setOutputResolution("hd"); // Base: 1280x720
				emitSpy.mockClear();
			});

			it("16:9 returns base dimensions", () => {
				edit.setOutputAspectRatio("16:9");
				expect(edit.size).toEqual({ width: 1280, height: 720 });
			});

			it("9:16 flips dimensions for vertical", () => {
				edit.setOutputAspectRatio("9:16");
				expect(edit.size).toEqual({ width: 720, height: 1280 });
			});

			it("1:1 creates square using height as base", () => {
				edit.setOutputAspectRatio("1:1");
				expect(edit.size).toEqual({ width: 720, height: 720 });
			});

			it("4:5 creates short vertical", () => {
				edit.setOutputAspectRatio("4:5");
				expect(edit.size).toEqual({ width: 576, height: 720 });
			});

			it("4:3 creates legacy TV ratio", () => {
				edit.setOutputAspectRatio("4:3");
				expect(edit.size).toEqual({ width: 960, height: 720 });
			});

			it("emits OutputResized event when recalculating", () => {
				edit.setOutputAspectRatio("9:16");
				expect(emitSpy).toHaveBeenCalledWith(EditEvent.OutputResized, { width: 720, height: 1280 });
			});
		});

		describe("without resolution set", () => {
			it("stores aspectRatio without recalculating size", () => {
				const originalSize = { ...edit.size };
				edit.setOutputAspectRatio("9:16");

				expect(edit.size).toEqual(originalSize);
				expect(edit.getOutputAspectRatio()).toBe("9:16");
			});

			it("does not emit OutputResized when no resolution", () => {
				edit.setOutputAspectRatio("9:16");
				expect(emitSpy).not.toHaveBeenCalledWith(EditEvent.OutputResized, expect.anything());
			});
		});

		describe("getter", () => {
			it("returns the set aspectRatio", () => {
				edit.setOutputAspectRatio("1:1");
				expect(edit.getOutputAspectRatio()).toBe("1:1");
			});

			it("returns undefined when no aspectRatio is set", () => {
				expect(edit.getOutputAspectRatio()).toBeUndefined();
			});
		});

		describe("events", () => {
			it("emits OutputAspectRatioChanged event", () => {
				edit.setOutputAspectRatio("1:1");
				expect(emitSpy).toHaveBeenCalledWith(EditEvent.OutputAspectRatioChanged, { aspectRatio: "1:1" });
			});

			it("emits edit:changed event", () => {
				edit.setOutputAspectRatio("1:1");
				expect(emitSpy).toHaveBeenCalledWith(EditEvent.EditChanged, expect.objectContaining({ source: "output:aspectRatio" }));
			});
		});

		describe("validation", () => {
			it("throws error for invalid aspectRatio", () => {
				expect(() => edit.setOutputAspectRatio("invalid" as string)).toThrow();
			});

			it("throws error for empty string", () => {
				expect(() => edit.setOutputAspectRatio("" as string)).toThrow();
			});
		});
	});

	describe("mutual exclusivity", () => {
		it("setting size clears resolution", () => {
			edit.setOutputResolution("hd");
			edit.setOutputSize(800, 600);

			expect(edit.getOutputResolution()).toBeUndefined();
		});

		it("setting size clears aspectRatio", () => {
			edit.setOutputAspectRatio("9:16");
			edit.setOutputSize(800, 600);

			expect(edit.getOutputAspectRatio()).toBeUndefined();
		});

		it("setting size clears both resolution and aspectRatio", () => {
			edit.setOutputResolution("hd");
			edit.setOutputAspectRatio("9:16");
			edit.setOutputSize(800, 600);

			expect(edit.getOutputResolution()).toBeUndefined();
			expect(edit.getOutputAspectRatio()).toBeUndefined();
		});

		it("serialization reflects mutual exclusivity", () => {
			edit.setOutputResolution("hd");
			edit.setOutputAspectRatio("9:16");

			let json = edit.getEdit();
			expect(json.output.resolution).toBe("hd");
			expect(json.output.aspectRatio).toBe("9:16");
			expect(json.output.size).toBeUndefined();

			edit.setOutputSize(800, 600);

			json = edit.getEdit();
			expect(json.output.resolution).toBeUndefined();
			expect(json.output.aspectRatio).toBeUndefined();
			expect(json.output.size).toEqual({ width: 800, height: 600 });
		});
	});

	describe("combined resolution and aspectRatio", () => {
		const testCases = [
			{ resolution: "hd", aspectRatio: "16:9", expected: { width: 1280, height: 720 } },
			{ resolution: "hd", aspectRatio: "9:16", expected: { width: 720, height: 1280 } },
			{ resolution: "hd", aspectRatio: "1:1", expected: { width: 720, height: 720 } },
			{ resolution: "1080", aspectRatio: "9:16", expected: { width: 1080, height: 1920 } },
			{ resolution: "1080", aspectRatio: "1:1", expected: { width: 1080, height: 1080 } },
			{ resolution: "4k", aspectRatio: "9:16", expected: { width: 2160, height: 3840 } }
		];

		testCases.forEach(({ resolution, aspectRatio, expected }) => {
			it(`${resolution} + ${aspectRatio} = ${expected.width}x${expected.height}`, () => {
				edit.setOutputResolution(resolution);
				edit.setOutputAspectRatio(aspectRatio);
				expect(edit.size).toEqual(expected);
			});
		});
	});

	describe("Edit class has no pixel limit", () => {
		it("allows 4K resolution (3840x2160)", () => {
			expect(() => edit.setOutputSize(3840, 2160)).not.toThrow();
			expect(edit.size).toEqual({ width: 3840, height: 2160 });
		});

		it("allows any valid resolution without pixel limit", () => {
			expect(() => edit.setOutputSize(1920, 1080)).not.toThrow();
			expect(() => edit.setOutputSize(2560, 1440)).not.toThrow();
			expect(() => edit.setOutputSize(3840, 2160)).not.toThrow();
		});
	});

	describe("undo/redo for output settings", () => {
		describe("setOutputSize", () => {
			it("can undo size change", () => {
				const originalSize = { ...edit.size };
				edit.setOutputSize(1280, 720);
				expect(edit.size).toEqual({ width: 1280, height: 720 });

				edit.undo();
				expect(edit.size).toEqual(originalSize);
			});

			it("can redo size change", () => {
				edit.setOutputSize(1280, 720);
				edit.undo();

				edit.redo();
				expect(edit.size).toEqual({ width: 1280, height: 720 });
			});

			it("can undo multiple size changes", () => {
				const originalSize = { ...edit.size };
				edit.setOutputSize(1280, 720);
				edit.setOutputSize(800, 600);
				edit.setOutputSize(640, 480);

				edit.undo();
				expect(edit.size).toEqual({ width: 800, height: 600 });

				edit.undo();
				expect(edit.size).toEqual({ width: 1280, height: 720 });

				edit.undo();
				expect(edit.size).toEqual(originalSize);
			});
		});

		describe("setOutputFps", () => {
			it("can undo fps change", () => {
				const originalFps = edit.getOutputFps();
				edit.setOutputFps(24);
				expect(edit.getOutputFps()).toBe(24);

				edit.undo();
				expect(edit.getOutputFps()).toBe(originalFps);
			});

			it("can redo fps change", () => {
				edit.setOutputFps(24);
				edit.undo();

				edit.redo();
				expect(edit.getOutputFps()).toBe(24);
			});
		});

		describe("setTimelineBackground", () => {
			it("can undo background change", () => {
				const originalBg = edit.getTimelineBackground();
				edit.setTimelineBackground("#ff0000");
				expect(edit.getTimelineBackground()).toBe("#ff0000");

				edit.undo();
				expect(edit.getTimelineBackground()).toBe(originalBg);
			});

			it("can redo background change", () => {
				edit.setTimelineBackground("#ff0000");
				edit.undo();

				edit.redo();
				expect(edit.getTimelineBackground()).toBe("#ff0000");
			});
		});

		describe("mixed operations", () => {
			it("can undo interleaved size and fps changes", () => {
				const originalSize = { ...edit.size };
				const originalFps = edit.getOutputFps();

				edit.setOutputSize(1280, 720);
				edit.setOutputFps(24);
				edit.setOutputSize(800, 600);

				expect(edit.size).toEqual({ width: 800, height: 600 });
				expect(edit.getOutputFps()).toBe(24);

				edit.undo(); // Undo size to 800x600
				expect(edit.size).toEqual({ width: 1280, height: 720 });

				edit.undo(); // Undo fps
				expect(edit.getOutputFps()).toBe(originalFps);

				edit.undo(); // Undo size to 1280x720
				expect(edit.size).toEqual(originalSize);
			});
		});
	});
});
