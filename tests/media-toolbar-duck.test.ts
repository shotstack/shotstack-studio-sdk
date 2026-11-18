/**
 * @jest-environment jsdom
 */
import type { Edit } from "@core/edit-session";
import { deepMerge } from "@core/shared/utils";
import { MediaToolbar } from "@core/ui/media-toolbar";

jest.mock("pixi.js", () => ({}));
jest.mock("../src/components/canvas/players/player", () => ({ Player: class MockPlayer {}, PlayerType: {} }));
jest.mock("../src/core/shotstack-edit", () => ({}));
jest.mock("../src/core/edit-session", () => ({}));
jest.mock("@styles/inject", () => ({ injectShotstackStyles: jest.fn() }));

// jsdom has no structuredClone, and the toolbar's slider drags call it.
if (typeof structuredClone === "undefined") {
	global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

type TestClip = Record<string, unknown> & { id: string; start: number; length: number; asset: Record<string, unknown> };

const MUSIC = 0;
const NARRATION = 2;

/** Music on track 0 is the selected clip; everything else is a candidate to duck under. */
function createTracks(music: Record<string, unknown> = {}, narration: Record<string, unknown> = { alias: "narration" }): TestClip[][] {
	return [
		[{ id: "clip-music-a1b2c3d4", start: 0, length: 20, asset: { type: "audio", src: "https://example.com/music.mp3", volume: 0.8, ...music } }],
		[
			{ id: "clip-voice-0000beef", alias: "voice", start: 2, length: 5, asset: { type: "audio", src: "https://example.com/voice.mp3" } },
			{ id: "clip-outro-0000cafe", alias: "outro", start: 30, length: 5, asset: { type: "audio", src: "https://example.com/outro.mp3" } }
		],
		[
			{
				id: "clip-speech-3f9a2c10",
				start: 8,
				length: 4,
				...narration,
				asset: { type: "text-to-speech", text: "Welcome to the show", voice: "Matthew", src: "https://example.com/narration.mp3" }
			}
		],
		[{ id: "clip-video-00c0ffee", alias: "broll", start: 0, length: 20, asset: { type: "video", src: "https://example.com/broll.mp4" } }]
	];
}

function createEdit(tracks: TestClip[][]) {
	const listeners = new Map<string, Array<(payload: unknown) => void>>();
	const levels = new Map<string, ReadonlyMap<string, number>>();
	let settled: Promise<void> = Promise.resolve();
	const clipAt = (t: number, c: number) => tracks[t]?.[c] ?? null;

	const edit = {
		getClipId: jest.fn((t: number, c: number) => clipAt(t, c)?.id ?? null),
		getResolvedClip: jest.fn(clipAt),
		getDocumentClip: jest.fn(clipAt),
		getDocument: () => ({ getTrackCount: () => tracks.length, getClipsInTrack: (t: number) => tracks[t] }),
		getResolvedEdit: () => ({ timeline: { tracks: tracks.map(clips => ({ clips })) } }),
		getDuckLevels: () => ({ levelsFor: (clipId: string) => levels.get(clipId), whenSettled: () => settled }),
		// Applied a tick later, like the command queue, so writes land after the handler that made them.
		updateClip: jest.fn((t: number, c: number, updates: Record<string, unknown>) =>
			Promise.resolve().then(() => {
				Object.assign(tracks[t][c], deepMerge(tracks[t][c], updates));
				listeners.get("edit:changed")?.forEach(listener => listener({ source: "setUpdatedClip" }));
				return { status: "success" };
			})
		),
		updateClipInDocument: jest.fn((clipId: string, updates: Record<string, unknown>) => {
			const clip = tracks.flat().find(({ id }) => id === clipId);
			if (clip) Object.assign(clip, structuredClone(updates));
		}),
		resolveClip: jest.fn(),
		commitClipUpdate: jest.fn(),
		deleteClip: jest.fn(),
		canDeleteClip: jest.fn(() => true),
		playbackTime: 0,
		isPlaying: false,
		pause: jest.fn(),
		getOutputFps: jest.fn(() => 30),
		seek: jest.fn(),
		events: {
			on: jest.fn((event: string, listener: (payload: unknown) => void) => listeners.set(event, [...(listeners.get(event) ?? []), listener])),
			off: jest.fn()
		},
		size: { width: 1920, height: 1080 }
	};

	return {
		edit,
		levels,
		setSettled: (promise: Promise<void>) => {
			settled = promise;
		}
	};
}

const flush = () =>
	new Promise(resolve => {
		setTimeout(resolve, 0);
	});

function drag(slider: HTMLInputElement, values: string[]): void {
	slider.dispatchEvent(new Event("pointerdown"));
	values.forEach(value => {
		Object.assign(slider, { value });
		slider.dispatchEvent(new Event("input"));
	});
	slider.dispatchEvent(new Event("change"));
}

function mount(tracks: TestClip[][], selected: [number, number] = [MUSIC, 0]) {
	const mocked = createEdit(tracks);
	const toolbar = new MediaToolbar(mocked.edit as unknown as Edit);
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	toolbar.mount(parent);
	toolbar.show(...selected);

	const q = <T extends HTMLElement = HTMLElement>(selector: string) => parent.querySelector(selector) as T;
	const duckButton = q<HTMLButtonElement>('[data-action="duck"]');
	const open = () => duckButton.click();
	const box = (clipId: string) => q<HTMLInputElement>(`[data-duck-clip="${clipId}"]`);
	const music = () => tracks[MUSIC][0];
	return { ...mocked, toolbar, parent, q, duckButton, open, box, music };
}

describe("MediaToolbar on a ducked clip", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		jest.clearAllMocks();
	});

	it("disables the speed section while duck is set", () => {
		const ducking = mount(createTracks({ duck: { under: ["alias://voice"] } }));
		const speed = ducking.q<HTMLButtonElement>('[data-action="speed"]');
		expect(speed.disabled).toBe(true);
		expect(speed.title).toBe("Turn off ducking to change speed");
		ducking.toolbar.dispose();

		const plain = mount(createTracks());
		expect(plain.q<HTMLButtonElement>('[data-action="speed"]').disabled).toBe(false);
		plain.toolbar.dispose();
	});

	it("writes no speed while duck is set, from a preset, the slider or the typed value", async () => {
		const { edit, toolbar, q } = mount(createTracks({ duck: { under: ["alias://voice"] } }));
		q('[data-speed-preset="2"]').click();
		const slider = q<HTMLInputElement>("[data-speed-slider]");
		slider.value = "450";
		slider.dispatchEvent(new Event("change"));
		const input = q<HTMLInputElement>("[data-speed-display]");
		input.value = "2×";
		input.dispatchEvent(new Event("blur"));
		await flush();

		expect(edit.updateClip).not.toHaveBeenCalled();
		expect(q("[data-speed-value]").textContent).toBe("1×");
		toolbar.dispose();
	});

	describe("lowering the volume to or below a Custom level", () => {
		it("writes the typed volume and removes duck.volume in one updateClip", async () => {
			const { edit, toolbar, q, music } = mount(createTracks({ duck: { under: ["alias://voice"], volume: 0.3 } }));
			const input = q<HTMLInputElement>("[data-volume-display]");
			input.value = "30%";
			input.dispatchEvent(new Event("blur"));
			await flush();

			expect(edit.updateClip).toHaveBeenCalledTimes(1);
			expect(music().asset["volume"]).toBe(0.3);
			expect(music().asset["duck"]).toEqual({ under: ["alias://voice"] });
			expect((music().asset["duck"] as { volume?: number }).volume).toBeUndefined();
			toolbar.dispose();
		});

		it("commits a slider drag with the volume and the Auto level as one undo entry", () => {
			const { edit, toolbar, q } = mount(createTracks({ duck: { under: ["alias://voice"], volume: 0.3 } }));
			drag(q<HTMLInputElement>("[data-volume-slider]"), ["40", "20", "10"]);

			// Ticks preview the volume only; the level changes with the commit.
			expect(edit.updateClipInDocument.mock.calls[2][1]["asset"]).toEqual(
				expect.objectContaining({ volume: 0.1, duck: { under: ["alias://voice"], volume: 0.3 } })
			);
			expect(edit.updateClip).not.toHaveBeenCalled();
			expect(edit.commitClipUpdate).toHaveBeenCalledTimes(1);
			const [, initial, final] = edit.commitClipUpdate.mock.calls[0];
			expect(initial.asset).toEqual(expect.objectContaining({ volume: 0.8, duck: { under: ["alias://voice"], volume: 0.3 } }));
			expect(final.asset.volume).toBe(0.1);
			expect(final.asset.duck.volume).toBeUndefined();
			toolbar.dispose();
		});

		it("keeps a Custom level that stays below the new volume", async () => {
			const { toolbar, q, music } = mount(createTracks({ duck: { under: ["alias://voice"], volume: 0.3 } }));
			const input = q<HTMLInputElement>("[data-volume-display]");
			input.value = "50%";
			input.dispatchEvent(new Event("blur"));
			await flush();

			expect(music().asset["duck"]).toEqual({ under: ["alias://voice"], volume: 0.3 });
			toolbar.dispose();
		});
	});
});

describe("MediaToolbar Duck control", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		jest.clearAllMocks();
	});

	it("shows for audio clips only", () => {
		const tracks = createTracks();
		const speech = mount(tracks, [NARRATION, 0]);
		expect(speech.q("[data-audio-section]").classList.contains("hidden")).toBe(false);
		expect(speech.q("[data-duck-section]").classList.contains("hidden")).toBe(true);
		speech.toolbar.dispose();

		const music = mount(tracks);
		expect(music.q("[data-duck-section]").classList.contains("hidden")).toBe(false);
		music.toolbar.dispose();
	});

	it("switching on ducks under the overlapping audio and speech clips, listing video unticked", async () => {
		const { edit, toolbar, open, q, box, music } = mount(createTracks());
		open();
		q<HTMLInputElement>("[data-duck-toggle]").click();
		await flush();

		expect(edit.updateClip).toHaveBeenCalledTimes(1);
		expect(edit.updateClip).toHaveBeenCalledWith(MUSIC, 0, { asset: { duck: { under: ["alias://narration", "alias://voice"] } } });
		expect(music().asset["duck"]).toEqual({ under: ["alias://narration", "alias://voice"] });

		expect(q<HTMLInputElement>("[data-duck-toggle]").checked).toBe(true);
		expect(box("clip-voice-0000beef").checked).toBe(true);
		expect(box("clip-speech-3f9a2c10").checked).toBe(true);
		expect(box("clip-video-00c0ffee").checked).toBe(false);
		expect(box("clip-video-00c0ffee").closest("label")?.textContent).toContain("broll");
		expect(box("clip-outro-0000cafe").checked).toBe(false);
		expect(box("clip-music-a1b2c3d4")).toBeNull();
		toolbar.dispose();
	});

	const [[bed], [, outro]] = createTracks();
	it.each([
		["only clips that don't overlap", [[bed], [outro]], "No audio plays over this clip. Tick the clips to duck under."],
		["no other clips", [[bed]], "There are no other clips to duck under."]
	])("switching on with %s writes nothing and says why", async (_case, tracks, message) => {
		const { edit, toolbar, open, q } = mount(tracks);
		open();
		q<HTMLInputElement>("[data-duck-toggle]").click();
		await flush();

		expect(edit.updateClip).not.toHaveBeenCalled();
		expect(q("[data-duck-error]").textContent).toBe(message);
		toolbar.dispose();
	});

	it("ticking a clip with no alias gives it one and writes alias://<alias>", async () => {
		const tracks = createTracks({ duck: { under: ["alias://voice"] } }, {});
		const { edit, toolbar, open, box, music } = mount(tracks);
		open();
		box("clip-speech-3f9a2c10").click();
		await flush();

		expect(tracks[NARRATION][0]["alias"]).toBe("source_3f9a2c10");
		expect(edit.updateClip).toHaveBeenLastCalledWith(MUSIC, 0, { asset: { duck: { under: ["alias://voice", "alias://source_3f9a2c10"] } } });
		expect(music().asset["duck"]).toEqual({ under: ["alias://voice", "alias://source_3f9a2c10"] });
		toolbar.dispose();
	});

	it("unticking the last clip removes duck", async () => {
		const { edit, toolbar, open, box, music, q } = mount(createTracks({ duck: { under: ["alias://voice"], volume: 0.2 } }));
		open();
		box("clip-voice-0000beef").click();
		await flush();

		expect(edit.updateClip).toHaveBeenCalledTimes(1);
		expect(music().asset["duck"]).toBeUndefined();
		expect(q<HTMLInputElement>("[data-duck-toggle]").checked).toBe(false);
		toolbar.dispose();
	});

	it("Custom writes duck.volume and Auto removes it", async () => {
		const { toolbar, open, q, music } = mount(createTracks({ duck: { under: ["alias://voice"] } }));
		open();
		const slider = q<HTMLInputElement>("[data-duck-volume]");
		expect(q("[data-duck-custom]").hidden).toBe(true);

		q('[data-duck-level-option="custom"]').click();
		await flush();
		expect(music().asset["duck"]).toEqual({ under: ["alias://voice"], volume: 0.05 });
		expect(q("[data-duck-custom]").hidden).toBe(false);
		expect(slider.value).toBe("5");

		slider.value = "20";
		slider.dispatchEvent(new Event("input", { bubbles: true }));
		expect(q("[data-duck-volume-value]").textContent).toBe("20%");
		slider.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();
		expect(music().asset["duck"]).toEqual({ under: ["alias://voice"], volume: 0.2 });

		q('[data-duck-level-option="auto"]').click();
		await flush();
		expect((music().asset["duck"] as { volume?: number }).volume).toBeUndefined();
		expect(q('[data-duck-level-option="auto"]').getAttribute("aria-pressed")).toBe("true");
		toolbar.dispose();
	});

	it("warns about a Custom level at or above the clip's volume and writes nothing", async () => {
		const { edit, toolbar, open, q, music } = mount(createTracks({ duck: { under: ["alias://voice"], volume: 0.3 } }));
		open();
		const slider = q<HTMLInputElement>("[data-duck-volume]");
		slider.value = "80";
		slider.dispatchEvent(new Event("input", { bubbles: true }));
		slider.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();

		expect(edit.updateClip).not.toHaveBeenCalled();
		expect(q("[data-duck-error]").textContent).toBe("Choose a level below the clip's volume.");
		expect(music().asset["duck"]).toEqual({ under: ["alias://voice"], volume: 0.3 });
		toolbar.dispose();
	});

	it("writes a valid Custom level even with a dangling duck reference", async () => {
		const { edit, toolbar, open, q, music } = mount(createTracks({ duck: { under: ["alias://voice", "alias://gone"], volume: 0.3 } }));
		open();
		expect(q("[data-duck-reason]").textContent).toBe("A clip this ducks under no longer exists.");
		const slider = q<HTMLInputElement>("[data-duck-volume]");
		slider.value = "20";
		slider.dispatchEvent(new Event("change", { bubbles: true }));
		await flush();

		expect(edit.updateClip).toHaveBeenCalledTimes(1);
		expect(q("[data-duck-error]").textContent).toBe("");
		expect(music().asset["duck"]).toEqual({ under: ["alias://voice", "alias://gone"], volume: 0.2 });
		toolbar.dispose();
	});

	it.each([
		["the volume is an array", { volume: [{ from: 0, to: 1, start: 0, length: 1 }] }, "Ducking needs a constant volume."],
		["the speed is not 1", { speed: 2 }, "Ducking needs normal speed."]
	])("disables the control with a reason when %s", (_case, asset, reason) => {
		const { toolbar, duckButton } = mount(createTracks(asset));
		expect(duckButton.disabled).toBe(true);
		expect(duckButton.title).toBe(reason);
		toolbar.dispose();
	});

	it("makes every change one undo entry when the clips already have aliases", async () => {
		const { edit, toolbar, open, q, box } = mount(createTracks());
		open();
		const oneEntry = async (step: string, act: () => void) => {
			const before = edit.updateClip.mock.calls.length;
			act();
			await flush();
			expect([step, edit.updateClip.mock.calls.length - before]).toEqual([step, 1]);
		};

		await oneEntry("switch on", () => q("[data-duck-toggle]").click());
		await oneEntry("untick", () => box("clip-voice-0000beef").click());
		await oneEntry("tick", () => box("clip-voice-0000beef").click());
		await oneEntry("custom", () => q('[data-duck-level-option="custom"]').click());
		await oneEntry("drag the level", () => drag(q<HTMLInputElement>("[data-duck-volume]"), ["10", "20", "30"]));
		await oneEntry("auto", () => q('[data-duck-level-option="auto"]').click());
		await oneEntry("switch off", () => q("[data-duck-toggle]").click());
		expect(edit.updateClipInDocument).not.toHaveBeenCalled();
		expect(edit.commitClipUpdate).not.toHaveBeenCalled();
		toolbar.dispose();
	});

	describe("measurement hint", () => {
		const HINT = "Couldn't measure some clips' loudness, so their dips use the default level.";

		it("appears once measuring settles with a planned clip unmeasured", async () => {
			const { toolbar, open, q, levels, setSettled } = mount(createTracks({ duck: { under: ["alias://voice", "alias://narration"] } }));
			let settle!: () => void;
			setSettled(
				new Promise<void>(resolve => {
					settle = resolve;
				})
			);
			open();
			await flush();
			expect(q("[data-duck-hint]").textContent).toBe("");

			levels.set("clip-music-a1b2c3d4", new Map([["alias://voice", 0.12]]));
			settle();
			await flush();
			expect(q("[data-duck-hint]").textContent).toBe(HINT);
			toolbar.dispose();
		});

		it("ignores clips that don't overlap, since they have no dip", async () => {
			const { toolbar, open, q, levels } = mount(createTracks({ duck: { under: ["alias://voice", "alias://outro"] } }));
			levels.set("clip-music-a1b2c3d4", new Map([["alias://voice", 0.12]]));
			open();
			await flush();
			expect(q("[data-duck-hint]").textContent).toBe("");
			toolbar.dispose();
		});

		it("stays hidden for a Custom level", async () => {
			const { toolbar, open, q } = mount(createTracks({ duck: { under: ["alias://voice"], volume: 0.2 } }));
			open();
			await flush();
			expect(q("[data-duck-hint]").textContent).toBe("");
			toolbar.dispose();
		});

		it("clears as soon as the level changes, without waiting for measuring to settle", async () => {
			const { toolbar, open, q, setSettled } = mount(createTracks({ duck: { under: ["alias://voice"] } }));
			open();
			await flush();
			expect(q("[data-duck-hint]").textContent).toBe(HINT);

			setSettled(new Promise<void>(() => {}));
			q('[data-duck-level-option="custom"]').click();
			await flush();
			expect(q("[data-duck-hint]").textContent).toBe("");
			toolbar.dispose();
		});
	});
});
