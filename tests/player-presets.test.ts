import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit-session";
import { sec } from "@core/timing/types";
import type { Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";

jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs,
	Container: jest.fn().mockImplementation(() => ({ addChild: jest.fn() }))
}));

const EDIT_SIZE = { width: 1920, height: 1080 };

/** A still that fills the frame. */
class StillPlayer extends Player {
	public override getSize(): Size {
		return this.edit.size;
	}
}

/** The player for a 5 s clip, read at a given time. */
const play = (fields: Partial<ResolvedClip>): ((time: number) => Player) => {
	const edit = { playbackTime: 0, size: EDIT_SIZE };
	const clip = { id: "clip-1", asset: { type: "image", src: "https://example.com/a.png" }, start: sec(0), length: sec(5), ...fields };
	const player = new StillPlayer(edit as unknown as Edit, clip as ResolvedClip, PlayerType.Image);
	player.reconfigureAfterRestore();
	return time => {
		edit.playbackTime = time;
		return player;
	};
};

describe("Player presets", () => {
	it("fades a static opacity in along the render's default curve", () => {
		const at = play({ opacity: 0.8, transition: { in: "fade" } });

		expect(at(0).getOpacity()).toBe(0);
		expect(at(0.5).getOpacity()).toBeCloseTo(0.4);
		expect(at(2).getOpacity()).toBeCloseTo(0.8);
	});

	it("plays an empty tween list as the property's default", () => {
		expect(play({ opacity: [], transition: { in: "fade" } })(2).getOpacity()).toBe(1);
	});

	it("fades in from the keyframed opacity where the fade ends", () => {
		const at = play({ opacity: [{ from: 0.5, to: 1, start: 0, length: 5, interpolation: "linear" }], transition: { in: "fade" } });

		expect(at(0).getOpacity()).toBe(0);
		expect(at(1).getOpacity()).toBeCloseTo(0.6);
		expect(at(3).getOpacity()).toBeCloseTo(0.8);
	});

	it("keeps keyframes that fall inside a transition", () => {
		const at = play({
			opacity: [
				{ from: 1, to: 0.2, start: 0, length: 0.5, interpolation: "linear" },
				{ from: 0.2, to: 1, start: 0.5, length: 4.5, interpolation: "linear" }
			],
			transition: { in: "fade" }
		});

		expect(at(0.25).getOpacity()).toBeCloseTo(0.1);
		expect(at(0.5).getOpacity()).toBeCloseTo(0.2);
	});

	it("zooms in from the render's distance added to keyframed scale", () => {
		const at = play({ scale: [{ from: 0.5, to: 1, start: 0, length: 5, interpolation: "linear" }], transition: { in: "zoom" } });

		expect(at(0).getScale()).toBeCloseTo(9.5);
		expect(at(0.4).getScale()).toBeCloseTo(0.54);
	});

	it("applies the effect before the transitions", () => {
		const at = play({ effect: "zoomIn", transition: { out: "zoom" } });

		expect(at(5).getScale()).toBeCloseTo(10.3);
	});

	it("pans a slide effect from the render's offset, whatever the clip's own", () => {
		const at = play({ offset: { x: 0.2, y: 0 }, effect: "slideLeft" });

		expect(at(0).getPosition().x).toBeCloseTo(0.08 * EDIT_SIZE.width);
		expect(at(5).getPosition().x).toBeCloseTo(-0.08 * EDIT_SIZE.width);
	});
});
