import { WipeFilter } from "@animations/wipe-filter";
import { ColorFilter } from "@canvas/players/color-filter";
import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import type { Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";

jest.mock("pixi.js", () => {
	const point = () => ({ set: jest.fn() });
	return {
		// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
		...require("./helpers/pixi-mock-filters").pixiFilterStubs,
		Container: jest.fn().mockImplementation(() => ({ addChild: jest.fn(), scale: point(), pivot: point(), position: point(), skew: point() }))
	};
});

class StillPlayer extends Player {
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

		it("skips the types it has no shader for", () => {
			const unsupported: Entries = [
				{ type: "hue", value: 90 },
				{ type: "grade", exposure: 1 },
				{ type: "blur", value: 5 },
				{ type: "sharpen", value: 3 },
				{ type: "pixelate", value: 0.5 },
				{ type: "rgbSplit", x: 0.1 }
			];

			expect(filtersOf(drawn(unsupported))).toEqual([]);
			expect(filtersOf(drawn([...unsupported, { type: "negative" }]))).toHaveLength(1);
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
});
