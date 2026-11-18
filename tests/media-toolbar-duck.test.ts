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
	const clipAt = (t: number, c: number) => tracks[t]?.[c] ?? null;

	const edit = {
		getClipId: jest.fn((t: number, c: number) => clipAt(t, c)?.id ?? null),
		getResolvedClip: jest.fn(clipAt),
		getDocumentClip: jest.fn(clipAt),
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

	return { edit };
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
	const music = () => tracks[MUSIC][0];
	return { ...mocked, toolbar, parent, q, music };
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
