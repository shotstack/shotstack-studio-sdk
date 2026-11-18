import { AudioPlayer } from "@canvas/players/audio-player";
import { EditDocument } from "@core/edit-document";
import type { Edit } from "@core/edit-session";
import { InternalEvent, type EditEventMap, type InternalEventMap } from "@core/events/edit-events";
import { EventEmitter } from "@core/events/event-emitter";
import { MergeFieldService } from "@core/merge/merge-field-service";
import { resolve } from "@core/resolver";
import type { Edit as EditConfig, ResolvedEdit } from "@schemas";
import { duckedVolumeFor, scanDucking } from "@shotstack/shotstack-canvas/duck";
import * as howler from "howler";

jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs,
	Container: jest.fn().mockImplementation(() => ({ addChild: jest.fn(), destroy: jest.fn() }))
}));

jest.mock("howler", () => ({
	// The player checks `instanceof Howl`, so the stub has to be a class.
	Howl: class {
		volume = jest.fn();

		stop = jest.fn();

		unload = jest.fn();
	}
}));

const MUSIC_TRACK = 1;

function config(musicAsset: Record<string, unknown>): EditConfig {
	return {
		timeline: {
			tracks: [
				{
					clips: [
						{ asset: { type: "audio", src: "https://example.com/intro.mp3" }, start: 0, length: 2 },
						{ alias: "voice", asset: { type: "audio", src: "https://example.com/voice.mp3" }, start: "auto", length: 3 }
					]
				},
				{ clips: [{ asset: { type: "audio", src: "https://example.com/music.mp3", ...musicAsset }, start: 0, length: 10 }] }
			]
		},
		output: { format: "mp4", size: { width: 1280, height: 720 } }
	} as EditConfig;
}

/** The parts of a session a player reads, over a real document and resolver. */
async function session(musicAsset: Record<string, unknown>) {
	const document = new EditDocument(config(musicAsset));
	const mergeFields = new MergeFieldService(new EventEmitter());
	const events = new EventEmitter<EditEventMap & InternalEventMap>();
	const levels = new Map<string, ReadonlyMap<string, number>>();
	let resolved: ResolvedEdit = resolve(document, { mergeFields });

	const edit = {
		playbackTime: 0,
		isPlaying: false,
		size: { width: 1280, height: 720 },
		assetLoader: { load: jest.fn(async () => new howler.Howl({ src: [""] })) },
		getInternalEvents: () => events,
		getResolvedEdit: jest.fn(() => resolved),
		getDuckLevels: () => ({ levelsFor: (clipId: string) => levels.get(clipId) })
	};

	const music = resolved.timeline.tracks[MUSIC_TRACK].clips[0];
	const player = new AudioPlayer(edit as unknown as Edit, music);
	player.clipId = music.id;
	await player.load();

	const reresolve = (): void => {
		resolved = resolve(document, { mergeFields });
		events.emit(InternalEvent.Resolved, { edit: resolved });
	};
	const expected = () => {
		const clip = resolved.timeline.tracks[MUSIC_TRACK].clips[0];
		return duckedVolumeFor(clip, scanDucking(resolved).aliases, levels.get(clip.id));
	};
	return { document, edit, events, levels, music, player, reresolve, expected };
}

const dipStart = (volume: unknown): number | undefined => (Array.isArray(volume) ? (volume[0] as { start: number }).start : undefined);

describe("AudioPlayer ducking", () => {
	it("getEffectiveVolume equals duckedVolumeFor with the resolved alias timings", async () => {
		const { player, expected } = await session({ duck: { under: "alias://voice" } });

		expect(player.getEffectiveVolume()).toEqual(expected());
		// The voice starts "auto" after the 2-second intro; its dip ramps down 0.3 s before that.
		expect(dipStart(player.getEffectiveVolume())).toBe(1.7);
	});

	it("rebuilds on Resolved when another clip moves, and on DuckLevelsChanged", async () => {
		const { document, edit, events, levels, music, player, reresolve, expected } = await session({ duck: { under: "alias://voice" } });

		document.updateClip(0, 0, { length: 4 });
		reresolve();
		expect(dipStart(player.getEffectiveVolume())).toBe(3.7);

		levels.set(music.id, new Map([["alias://voice", 0.2]]));
		events.emit(InternalEvent.DuckLevelsChanged, {});
		expect(player.getEffectiveVolume()).toEqual(expected());
		edit.playbackTime = 5;
		expect(player.getVolume()).toBeCloseTo(0.2);

		player.dispose();
		edit.getResolvedEdit.mockClear();
		reresolve();
		events.emit(InternalEvent.DuckLevelsChanged, {});
		expect(edit.getResolvedEdit).not.toHaveBeenCalled();
	});

	it("stays unsubscribed when disposed while its audio loads", async () => {
		const { edit, events, music, player: loaded, reresolve } = await session({ duck: { under: "alias://voice" } });
		loaded.dispose();
		let land!: (howl: howler.Howl) => void;
		const audio = new Promise<howler.Howl>(done => {
			land = done;
		});
		edit.assetLoader.load.mockImplementationOnce(() => audio);

		const player = new AudioPlayer(edit as unknown as Edit, music);
		player.clipId = music.id;
		const loading = player.load();
		player.dispose();
		land(new howler.Howl({ src: [""] }));
		await loading;

		edit.getResolvedEdit.mockClear();
		reresolve();
		events.emit(InternalEvent.DuckLevelsChanged, {});
		expect(edit.getResolvedEdit).not.toHaveBeenCalled();
	});

	it("without duck, keeps the asset's volume and fade and ignores other clips moving", async () => {
		const { document, edit, player, reresolve } = await session({ volume: 0.8, effect: "fadeIn" });
		const fade = [{ from: 0, to: 0.8, start: 0, length: 2 }];

		expect(player.getEffectiveVolume()).toEqual(fade);
		edit.playbackTime = 1;
		expect(player.getVolume()).toBeCloseTo(0.4);

		edit.getResolvedEdit.mockClear();
		document.updateClip(0, 0, { length: 4 });
		reresolve();
		expect(edit.getResolvedEdit).not.toHaveBeenCalled();
		expect(player.getEffectiveVolume()).toEqual(fade);
	});
});
