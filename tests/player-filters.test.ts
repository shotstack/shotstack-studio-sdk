import { WipeFilter } from "@animations/wipe-filter";
import { buildClipFilters } from "@canvas/players/clip-filters";
import { ColorFilter } from "@canvas/players/color-filter";
import { GradeFilter, gradePixel } from "@canvas/players/grade-filter";
import { HueFilter, huePixel } from "@canvas/players/hue-filter";
import { ImagePlayer } from "@canvas/players/image-player";
import { PixelateFilter, pixelateBlocks } from "@canvas/players/pixelate-filter";
import { RgbSplitFilter, rgbSplitSource } from "@canvas/players/rgb-split-filter";
import { ShapePlayer } from "@canvas/players/shape-player";
import { SharpenFilter, sharpenPixel } from "@canvas/players/sharpen-filter";
import { SvgPlayer } from "@canvas/players/svg-player";
import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import type { Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";
import * as pixi from "pixi.js";

// earcut is ESM-only, which jest cannot require. Nothing drawn here needs triangulating.
jest.mock("earcut", () => ({ __esModule: true, default: () => [] }));

// pixi's scene graph is real, so a clip's bounds are the ones pixi draws. Shaders need WebGL, so the filters are stand-ins.
jest.mock("pixi.js", () => ({
	...jest.requireActual("pixi.js"),
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs
}));

// The size the svg rasteriser reports for the next svg clip.
let mockRaster: Size = { width: 0, height: 0 };
jest.mock("@shotstack/shotstack-canvas", () => ({
	initResvg: async () => undefined,
	renderSvgAssetToPng: async () => ({ png: new Uint8Array(), ...mockRaster })
}));

// The svg player waits on an image; this one reports loaded once the player is listening.
function LoadedImage(this: { onload?: () => void }): void {
	queueMicrotask(() => this.onload?.());
}
Object.assign(globalThis, { Image: LoadedImage });

// The shape player nests its shape in a Graphics, which pixi reports as deprecated.
pixi.deprecation.quiet = true;

class StillPlayer extends Player {
	public frameUpscale = 1;

	protected override getFrameUpscale(): number {
		return this.frameUpscale;
	}

	public override getSize(): Size {
		return this.edit.size;
	}
}

const draw = (playerType: PlayerType, fields: Partial<ResolvedClip>, playbackTime = 1): Player => {
	const edit = { playbackTime, size: { width: 1920, height: 1080 } };
	const clip = { id: "clip-1", asset: { type: "image", src: "https://example.com/a.png" }, start: sec(0), length: sec(5), ...fields };
	const player = new StillPlayer(edit as unknown as Edit, clip as ResolvedClip, playerType);
	player.reconfigureAfterRestore();
	player.applyPlayheadState();
	return player;
};

const filtersOf = (player: Player) => player.getContentContainer().filters ?? [];

type Entries = NonNullable<ResolvedClip["filters"]>;
type Uniforms = Record<"uBrightness" | "uContrast" | "uSaturation" | "uNegate", number>;

const uniformsOf = (filter: unknown): Uniforms =>
	(filter as { resources: { colorUniforms: { uniforms: Uniforms } } }).resources.colorUniforms.uniforms;

// The render hook is where filters take their value for the frame.
const render = (player: Player): Player => {
	player.getContainer().onRender?.({} as never);
	return player;
};

const drawn = (filters: Entries, playbackTime = 1, playerType = PlayerType.Image): Player => render(draw(playerType, { filters }, playbackTime));

const valueAt = (filters: Entries, key: keyof Uniforms, playbackTime: number): number => uniformsOf(filtersOf(drawn(filters, playbackTime))[0])[key];

describe("Player clip filters", () => {
	it("draws an image through its filter", () => {
		expect(filtersOf(draw(PlayerType.Image, { filter: "negative" }))).toEqual([expect.any(ColorFilter)]);
	});

	it("blurs with edges clamped like the render's box blur, sized by the clip's scale as it draws", () => {
		const player = draw(PlayerType.Image, { filter: "blur", scale: 0.5 });
		player.getContainer().onRender?.({} as never);
		const [blur] = filtersOf(player) as unknown as { repeatEdgePixels: boolean; strength: number }[];

		expect(blur.repeatEdgePixels).toBe(true);
		expect(blur.strength).toBeCloseTo(4.69 * 0.5);
	});

	it("draws a video clip through its filter", () => {
		expect(filtersOf(draw(PlayerType.Video, { filter: "greyscale" }))).toEqual([expect.any(ColorFilter)]);
	});

	it("draws an html5 clip through its filter", () => {
		expect(filtersOf(draw(PlayerType.Html5, { filter: "greyscale" }))).toEqual([expect.any(ColorFilter)]);
	});

	it("draws rich captions through their filter", () => {
		expect(filtersOf(draw(PlayerType.RichCaption, { filter: "greyscale" }))).toEqual([expect.any(ColorFilter)]);
	});

	it("draws rich text through its filter whether or not it animates", () => {
		const text = { type: "rich-text", text: "Hi" } as ResolvedClip["asset"];
		const animated = { ...text, animation: { preset: "typewriter" } } as ResolvedClip["asset"];

		expect(filtersOf(draw(PlayerType.RichText, { asset: text, filter: "darken" }))).toEqual([expect.any(ColorFilter)]);
		expect(filtersOf(draw(PlayerType.RichText, { asset: animated, filter: "darken" }))).toEqual([expect.any(ColorFilter)]);
	});

	it("applies the filter before a wipe transition", () => {
		const player = draw(PlayerType.Image, { filter: "lighten", transition: { in: "wipeRight" } });

		expect(filtersOf(player)).toEqual([expect.any(ColorFilter), expect.any(WipeFilter)]);
	});

	it("drops the filter when the clip clears it", () => {
		const player = draw(PlayerType.Image, { filter: "muted" });
		player.clipConfiguration.filter = "none";
		player.applyPlayheadState();

		expect(filtersOf(player)).toEqual([]);
	});

	describe("filters", () => {
		it("draws entries in array order, ahead of the preset and the wipe", () => {
			const player = render(
				draw(PlayerType.Image, {
					filters: [{ type: "saturation", value: 0 }, { type: "negative" }],
					filter: "lighten",
					transition: { in: "wipeRight" }
				})
			);
			const [saturation, negative, preset, wipe] = filtersOf(player);

			expect(filtersOf(player)).toHaveLength(4);
			expect(uniformsOf(saturation)).toMatchObject({ uSaturation: 0, uNegate: 0 });
			expect(uniformsOf(negative)).toMatchObject({ uNegate: 1 });
			expect(uniformsOf(preset)).toMatchObject({ uBrightness: 0.15 });
			expect(wipe).toBeInstanceOf(WipeFilter);
		});

		it("stacks entries of the same type", () => {
			const filters = filtersOf(
				drawn([
					{ type: "brightness", value: 0.2 },
					{ type: "brightness", value: -0.3 }
				])
			);

			expect(filters.map(filter => uniformsOf(filter).uBrightness)).toEqual([0.2, -0.3]);
		});

		it("reads a tween as the clip plays", () => {
			const filters: Entries = [{ type: "brightness", value: [{ from: 0, to: 0.4, start: 0.5, length: 0.5 }] }];

			expect(valueAt(filters, "uBrightness", 0.2)).toBeCloseTo(0);
			expect(valueAt(filters, "uBrightness", 0.75)).toBeCloseTo(0.2);
			expect(valueAt(filters, "uBrightness", 1.6)).toBeCloseTo(0.4);
		});

		it("takes contrast and saturation as multipliers", () => {
			const [contrast, saturation] = filtersOf(
				drawn([
					{ type: "contrast", value: 2 },
					{ type: "saturation", value: 3 }
				])
			);

			expect(uniformsOf(contrast).uContrast).toBe(2);
			expect(uniformsOf(saturation).uSaturation).toBe(3);
		});

		it("limits a plain value to its range", () => {
			expect(valueAt([{ type: "contrast", value: -5 }], "uContrast", 1)).toBe(0);
			expect(valueAt([{ type: "contrast", value: 9 }], "uContrast", 1)).toBe(4);
			expect(valueAt([{ type: "brightness", value: -3 }], "uBrightness", 1)).toBe(-1);
			expect(valueAt([{ type: "saturation", value: 12 }], "uSaturation", 1)).toBe(4);
		});

		it("limits tween ends before easing between them", () => {
			// Easing from the limited 0 reads 0.5 halfway; limiting only the result would read 0.
			const contrast: Entries = [{ type: "contrast", value: [{ from: -5, to: 1, start: 0, length: 1, interpolation: "linear" }] }];
			const saturation: Entries = [{ type: "saturation", value: [{ from: 1, to: 9, start: 0, length: 1, interpolation: "linear" }] }];

			expect(valueAt(contrast, "uContrast", 0.5)).toBeCloseTo(0.5);
			expect(valueAt(saturation, "uSaturation", 0.5)).toBeCloseTo(2.5);
			expect(valueAt(saturation, "uSaturation", 1)).toBe(4);
		});

		it("limits a value an easing overshoots", () => {
			const overshoot: Entries = [
				{ type: "contrast", value: [{ from: 1, to: 4, start: 0, length: 1, interpolation: "bezier", easing: "easeOutBack" }] }
			];
			const peaks = [0.5, 0.6, 0.7, 0.8, 0.9].map(time => valueAt(overshoot, "uContrast", time));

			expect(Math.max(...peaks)).toBe(4);
		});

		it("builds nothing for entries that leave the clip as it is", () => {
			const neutral: Entries = [
				{ type: "brightness", value: 0 },
				{ type: "contrast" },
				{ type: "saturation", value: 1 },
				{ type: "saturation", value: [] }
			];

			expect(filtersOf(drawn(neutral))).toEqual([]);
		});

		it("builds a filter for a tween that rests at neutral", () => {
			expect(filtersOf(drawn([{ type: "brightness", value: [{ from: 0, to: 0, start: 0, length: 1 }] }]))).toHaveLength(1);
		});

		it("rebuilds when the entries change and drops them when they are cleared", () => {
			const player = drawn([{ type: "brightness", value: 0.1 }]);
			expect(uniformsOf(filtersOf(player)[0]).uBrightness).toBe(0.1);

			player.clipConfiguration.filters = [{ type: "brightness", value: 0.6 }];
			player.applyPlayheadState();
			render(player);
			expect(filtersOf(player).map(filter => uniformsOf(filter).uBrightness)).toEqual([0.6]);

			player.clipConfiguration.filters = undefined;
			player.applyPlayheadState();
			expect(filtersOf(player)).toEqual([]);
		});

		it("draws a video clip through its filters", () => {
			expect(filtersOf(drawn([{ type: "negative" }], 1, PlayerType.Video))).toEqual([expect.any(ColorFilter)]);
		});

		it("leaves a clip the render doesn't filter untouched", () => {
			expect(filtersOf(drawn([{ type: "negative" }], 1, PlayerType.Luma))).toEqual([]);
		});
	});

	describe("shader filters", () => {
		const uniformsIn = (filter: unknown): Record<string, number> =>
			Object.assign(
				{},
				...Object.values((filter as { resources: Record<string, { uniforms: Record<string, number> }> }).resources).map(group => group.uniforms)
			);

		const built = (entry: Entries[number], time = 0, scale = 1) => {
			const [clipFilter] = buildClipFilters([entry]);
			clipFilter.update(time, scale, { width: 1920, height: 1080 });
			return clipFilter.filter;
		};

		it("turns hue by the entry's degrees", () => {
			const filter = built({ type: "hue", value: 120 });
			expect(filter).toBeInstanceOf(HueFilter);
			expect(uniformsIn(filter)["uDegrees"]).toBe(120);
		});

		it("follows a hue tween between frames", () => {
			const [hue] = buildClipFilters([{ type: "hue", value: [{ from: 0, to: 480, start: 0, length: 1, interpolation: "linear" }] }]);
			hue.update(0.25, 1, { width: 1920, height: 1080 });
			expect(uniformsIn(hue.filter)["uDegrees"]).toBeCloseTo(120);
			hue.update(1, 1, { width: 1920, height: 1080 });
			expect(uniformsIn(hue.filter)["uDegrees"]).toBeCloseTo(480);
		});

		it("grades with each field, limited to its range", () => {
			const filter = built({ type: "grade", exposure: 9, temperature: 0.5, tint: -0.25, highlights: -3, shadows: 0.75, vibrance: 1 });
			expect(filter).toBeInstanceOf(GradeFilter);
			expect(uniformsIn(filter)).toMatchObject({ uExposure: 4, uTemperature: 0.5, uTint: -0.25, uHighlights: -1, uShadows: 0.75, uVibrance: 1 });
		});

		it("sharpens with the amount and a default radius of 3", () => {
			const filter = built({ type: "sharpen", value: 12 });
			expect(filter).toBeInstanceOf(SharpenFilter);
			expect(uniformsIn(filter)).toMatchObject({ uAmount: 12, uRadius: 3 });
			expect(uniformsIn(built({ type: "sharpen", value: 50, radius: 12 }))).toMatchObject({ uAmount: 40, uRadius: 10 });
		});

		it("pixelates up to the render's limit, sized by the frame's scale", () => {
			const filter = built({ type: "pixelate", value: 1 }, 0, 0.5);
			expect(filter).toBeInstanceOf(PixelateFilter);
			expect(uniformsIn(filter)).toMatchObject({ uValue: 0.9999, uScale: 0.5 });
		});

		it("splits red and blue by the entry's shift", () => {
			const filter = built({ type: "rgbSplit", x: 0.1, y: -2 });
			expect(filter).toBeInstanceOf(RgbSplitFilter);
			expect(uniformsIn(filter)).toMatchObject({ uX: 0.1, uY: -1 });
		});

		it("blurs each axis by its radius, at the preset's strength per 10 and the clip's scale", () => {
			const blur = built({ type: "blur", x: 20, y: 0 }, 0, 0.5) as unknown as { strengthX: number; strengthY: number; repeatEdgePixels: boolean };
			expect(blur.strengthX).toBeCloseTo(4.69);
			expect(blur.strengthY).toBe(0);
			expect(blur.repeatEdgePixels).toBe(true);
			const even = built({ type: "blur", value: 10 }) as unknown as { strengthX: number; strengthY: number };
			expect([even.strengthX, even.strengthY]).toEqual([4.69, 4.69]);
		});

		it("builds nothing for the new types at neutral", () => {
			const neutral: Entries = [
				{ type: "hue", value: 0 },
				{ type: "grade" },
				{ type: "blur", x: 0, y: 0 },
				{ type: "sharpen", value: 0, radius: 5 },
				{ type: "pixelate", value: 0 },
				{ type: "rgbSplit" }
			];
			expect(buildClipFilters(neutral)).toEqual([]);
		});

		const PLAYERS = {
			image: [ImagePlayer, { type: "image", src: "https://example.com/a.png" }],
			svg: [SvgPlayer, { type: "svg", src: "<svg xmlns='http://www.w3.org/2000/svg'/>" }],
			shape: [ShapePlayer, { type: "shape", shape: "rectangle", rectangle: { width: 100, height: 50 }, width: 300, height: 200 }]
		} as const;
		const pixelate: Entries = [{ type: "pixelate", value: 0.5 }];

		// The clip's own player class over a source of `native` size, so that player's sizing and fit decide what draws.
		const loaded = async (kind: keyof typeof PLAYERS, fields: Partial<ResolvedClip>, native = { width: 1920, height: 1080 }): Promise<Player> => {
			const texture = new pixi.Texture({ source: new pixi.ImageSource(native) });
			mockRaster = native;
			jest.spyOn(pixi.Texture, "from").mockReturnValue(texture);
			const edit = {
				playbackTime: 1,
				size: { width: 1920, height: 1080 },
				assetLoader: { load: async () => texture },
				resolveMergeFields: (value: string) => value
			};
			const [PlayerClass, asset] = PLAYERS[kind];
			const player = new PlayerClass(edit as unknown as Edit, { id: "clip-1", asset, start: sec(0), length: sec(5), ...fields } as ResolvedClip);
			await player.load();
			expect(player.loadError).toBeNull();
			player.applyPlayheadState();
			return render(player);
		};

		const framesOf = (player: Player) =>
			filtersOf(player)
				.map(filter => uniformsIn(filter))
				.map(({ uFrameWidth, uFrameHeight }) => [uFrameWidth, uFrameHeight]);

		afterEach(() => jest.restoreAllMocks());

		it("measures pixelate, split and sharpen against the clip's frame wherever it sits", async () => {
			const player = await loaded("image", {
				filters: [
					{ type: "pixelate", value: 0.5 },
					{ type: "rgbSplit", x: 0.1 },
					{ type: "sharpen", value: 4 }
				]
			});
			const before = framesOf(player);

			player.clipConfiguration.offset = { x: 0.9, y: -0.7 };
			player.reconfigureAfterRestore();
			player.applyPlayheadState();
			render(player);

			expect(before).toEqual([
				[1920, 1080],
				[1920, 1080],
				[1920, 1080]
			]);
			expect(framesOf(player)).toEqual(before);
			expect(filtersOf(player).every(filter => (filter as unknown as { clipToViewport: boolean }).clipToViewport === false)).toBe(true);
		});

		it.each([
			["image", "crop", [1920, 1080], [800, 600]],
			["image", "contain", [1920, 1080], [800, 450]],
			["image", "none", [400, 300], [400, 300]],
			["image", "none", [1920, 1080], [800, 600]],
			["svg", "crop", [400, 300], [800, 600]],
			["svg", "contain", [1920, 1080], [800, 450]]
		] as const)(
			"measures a fixed-size %s clip with fit %s as its content cut to the box",
			async (kind, fit, [width, height], [frameWidth, frameHeight]) => {
				const player = await loaded(kind, { width: 800, height: 600, fit, filters: pixelate }, { width, height });

				expect(framesOf(player)).toEqual([[expect.closeTo(frameWidth), expect.closeTo(frameHeight)]]);
			}
		);

		it("measures an unmasked clip by its content, whatever box it sets", async () => {
			const player = await loaded("shape", { width: 800, height: 600, fit: "none", filters: pixelate });

			expect(framesOf(player)).toEqual([[300, 200]]);
		});

		it("keeps the fit in the frame and leaves the clip's scale to the filter", async () => {
			const player = await loaded("image", { fit: "cover", scale: 0.5, filters: pixelate }, { width: 1440, height: 1080 });

			expect(framesOf(player)).toEqual([[expect.closeTo(1920), expect.closeTo(1080)]]);
			expect(uniformsIn(filtersOf(player)[0])["uScale"]).toBe(0.5);
		});

		it("keeps the viewport clip for filters that read no frame", () => {
			const [hue, grade] = buildClipFilters([
				{ type: "hue", value: 10 },
				{ type: "grade", exposure: 1 }
			]);
			expect([hue.filter, grade.filter].some(filter => (filter as unknown as { clipToViewport?: boolean }).clipToViewport === false)).toBe(false);
		});

		it("widens blur on a video drawn larger than its source, as the render blurs before upscaling it", () => {
			const player = draw(PlayerType.Video, { filter: "blur", filters: [{ type: "blur", value: 10 }] }) as StillPlayer;
			player.frameUpscale = 2;
			render(player);
			const [entry, preset] = filtersOf(player) as unknown as { strengthX: number; strength: number }[];
			expect(entry.strengthX).toBeCloseTo(4.69 * 2);
			expect(preset.strength).toBeCloseTo(4.69 * 2);
		});

		it("declares the uniform it shares with pixi's vertex stage at that stage's precision, as WebGL needs to link", () => {
			const { GlProgram, defaultFilterVert } = jest.requireActual<typeof pixi>("pixi.js");
			// Each uniform's precision by name; one declared without a precision takes its stage's default.
			const declared = (source: string, fallback?: string) =>
				Object.fromEntries(
					[...source.matchAll(/uniform\s+(?:(lowp|mediump|highp)\s+)?\w+\s+(\w+);/g)].map(([, precision, name]) => [name, precision ?? fallback])
				);
			const vertex = declared(defaultFilterVert, GlProgram.defaultOptions.preferredVertexPrecision);
			const shaders = buildClipFilters([
				{ type: "hue", value: 10 },
				{ type: "grade", exposure: 1 },
				{ type: "sharpen", value: 4 },
				{ type: "pixelate", value: 0.5 },
				{ type: "rgbSplit", x: 0.1 }
			]);

			shaders.forEach(({ filter }) => {
				const program = { ...GlProgram.defaultOptions, ...(filter as unknown as { glProgram: pixi.GlProgramOptions }).glProgram };
				const fragment = declared(program.fragment, program.preferredFragmentPrecision);
				const shared = Object.keys(fragment).filter(name => name in vertex);

				expect(shared).toEqual(["uInputSize"]);
				shared.forEach(name => expect(fragment[name]).toBe(vertex[name]));
			});
		});
	});

	describe("shader maths", () => {
		const bytes = (rgb: readonly number[]) => rgb.map(channel => Math.round(channel * 255));
		const grey = (level: number) => [level / 255, level / 255, level / 255] as const;
		const noGrade = { exposure: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0, vibrance: 0 };
		const expectBytes = (rgb: readonly number[], expected: number[]) =>
			bytes(rgb).forEach((channel, index) => expect(Math.abs(channel - expected[index])).toBeLessThanOrEqual(2));

		it("turns red to green at 120 degrees, wrapping whole turns", () => {
			expect(bytes(huePixel([1, 0, 0], 120))).toEqual([0, 255, 0]);
			expect(bytes(huePixel([1, 0, 0], 480))).toEqual([0, 255, 0]);
			expect(bytes(huePixel([1, 0, 0], -240))).toEqual([0, 255, 0]);
		});

		it.each([
			["temperature", { temperature: 1 }, grey(128), [158, 126, 94]],
			["tint", { tint: 1 }, grey(128), [140, 101, 140]],
			["shadows", { shadows: 1 }, grey(64), [114, 114, 114]],
			["highlights", { highlights: -1 }, grey(192), [140, 140, 140]],
			["vibrance", { vibrance: 1 }, [160 / 255, 128 / 255, 128 / 255], [179, 120, 120]],
			["exposure", { exposure: 1 }, grey(64), [128, 128, 128]]
		])("grades %s as the render measures it", (_name, grade, rgb, expected) => {
			expectBytes(gradePixel(rgb, { ...noGrade, ...grade }), expected);
		});

		it("sharpens luma only, limiting halos", () => {
			const out = sharpenPixel([0.6, 0.6, 0.6], [0.5, 0.5, 0.5], 2);
			expect(out[0]).toBeCloseTo(0.6 + 2 * 0.1 * 0.9);
			expect(out[0]).toBe(out[2]);
			expect(sharpenPixel([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], 40)).toEqual([0.5, 0.5, 0.5]);
		});

		it("collapses a 640 px frame to one block from about 0.935", () => {
			expect(pixelateBlocks(640, 0.935)).toBe(1);
			expect(pixelateBlocks(640, 0.8)).toBe(2);
			expect(pixelateBlocks(640, 0.5)).toBe(20);
		});

		it("wraps a split at the frame's edge, a whole frame showing no split", () => {
			expect(rgbSplitSource(0.05, 0.1)).toBeCloseTo(0.95);
			expect(rgbSplitSource(0.3, 1)).toBeCloseTo(0.3);
			expect(rgbSplitSource(0.3, -1)).toBeCloseTo(0.3);
		});
	});
});
