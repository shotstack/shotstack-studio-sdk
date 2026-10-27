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

const draw = (playerType: PlayerType, fields: Partial<ResolvedClip>): Player => {
	const edit = { playbackTime: 1, size: { width: 1920, height: 1080 } };
	const clip = { id: "clip-1", asset: { type: "image", src: "https://example.com/a.png" }, start: sec(0), length: sec(5), ...fields };
	const player = new StillPlayer(edit as unknown as Edit, clip as ResolvedClip, playerType);
	player.reconfigureAfterRestore();
	player.applyPlayheadState();
	return player;
};

const filtersOf = (player: Player) => player.getContentContainer().filters ?? [];

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

	it("leaves clips the render draws as video unfiltered", () => {
		expect(filtersOf(draw(PlayerType.Video, { filter: "greyscale" }))).toEqual([]);
		expect(filtersOf(draw(PlayerType.Html5, { filter: "greyscale" }))).toEqual([]);
	});

	it("filters rich text only while it renders as an image", () => {
		const text = { type: "rich-text", text: "Hi" } as ResolvedClip["asset"];
		const animated = { ...text, animation: { preset: "typewriter" } } as ResolvedClip["asset"];

		expect(filtersOf(draw(PlayerType.RichText, { asset: text, filter: "darken" }))).toEqual([expect.any(ColorFilter)]);
		expect(filtersOf(draw(PlayerType.RichText, { asset: animated, filter: "darken" }))).toEqual([]);
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
});
