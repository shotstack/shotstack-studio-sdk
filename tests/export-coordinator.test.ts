/** @jest-environment jsdom */

import type { Canvas } from "@canvas/shotstack-canvas";
import type { Edit } from "@core/edit-session";
import { ASSET_SETTLE_TIMEOUT_MS, ExportCoordinator } from "@core/export/export-coordinator";
import { ExportProgressUI } from "@core/export/export-progress-ui";
import { ExportError, exportBitrate } from "@core/export/export-utils";
import { calculateSizeFromPreset } from "@core/output-settings-manager";
import { canEncodeAudio, canEncodeVideo, CanvasSink, CanvasSource, Input, Output } from "mediabunny";

const mockOutputs: Array<{ cancel: jest.Mock; addAudioTrack: jest.Mock; state: string }> = [];

jest.mock("mediabunny", () => ({
	Output: jest.fn().mockImplementation(({ target }: { target: { buffer: ArrayBuffer | null } }) => {
		const output = {
			target,
			state: "pending",
			addVideoTrack: jest.fn(),
			addAudioTrack: jest.fn(),
			start: jest.fn(async () => {
				output.state = "started";
			}),
			finalize: jest.fn(async () => {
				output.state = "finalized";
				// eslint-disable-next-line no-param-reassign -- the fake target receives the muxed bytes
				target.buffer = new ArrayBuffer(8);
			}),
			cancel: jest.fn(async () => {
				output.state = "canceled";
			})
		};
		mockOutputs.push(output);
		return output;
	}),
	Mp4OutputFormat: jest.fn(),
	BufferTarget: jest.fn().mockImplementation(() => ({ buffer: null })),
	CanvasSource: jest.fn().mockImplementation(() => ({ add: jest.fn().mockResolvedValue(undefined) })),
	AudioBufferSource: jest.fn().mockImplementation(() => ({ add: jest.fn().mockResolvedValue(undefined) })),
	canEncodeVideo: jest.fn(),
	canEncodeAudio: jest.fn(),
	Input: jest.fn(),
	UrlSource: jest.fn(),
	CanvasSink: jest.fn(),
	MP4: {},
	WEBM: {}
}));

// Player modules extend pixi filters at load.
jest.mock("pixi.js", () => ({
	// eslint-disable-next-line global-require, @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
	...require("./helpers/pixi-mock-filters").pixiFilterStubs,
	Rectangle: jest.fn().mockImplementation((x: number, y: number, width: number, height: number) => ({ x, y, width, height })),
	Texture: Object.assign(
		jest.fn((options: object) => ({ ...options, destroy: jest.fn() })),
		{ from: jest.fn(() => ({ source: { update: jest.fn() }, destroy: jest.fn() })) }
	)
}));

// The canvas package needs TextEncoder, which jsdom lacks; the export only uses its font-name parser.
jest.mock("@shotstack/shotstack-canvas", () => ({ parseFontFamily: (family: string) => ({ family, weight: "400" }) }));

const mockRenderMix = jest.fn();
const mockHasAudio = jest.fn();

jest.mock("../src/core/export/audio-processor", () => ({
	AudioProcessor: jest.fn().mockImplementation(() => ({ renderMix: mockRenderMix, hasAudio: mockHasAudio }))
}));

const SIZE = { width: 4, height: 2 };

function createHarness() {
	const viewport = { position: { x: 120, y: 80 }, scale: { x: 0.5, y: 0.5 }, visible: true };
	const edit = {
		isPlaying: false,
		playbackTime: 1.5,
		totalDuration: 1,
		size: { ...SIZE },
		tracks: [] as Array<Array<{ clipId: string; needsResolution: boolean }>>,
		getEdit: jest.fn(() => ({ output: { fps: 2 } as { fps: number; mute?: boolean } })),
		getOutputFormat: jest.fn(() => "mp4"),
		getResolvedEdit: () => ({ timeline: { tracks: [] }, output: { format: "mp4" } }),
		getFontUrlByFamilyAndWeight: () => null,
		whenSettled: jest.fn(() => Promise.resolve()),
		getLoadingClipIds: jest.fn(() => [] as string[]),
		getTracks: () => edit.tracks,
		getClipError: jest.fn<{ error: string; assetType: string } | null, [number, number]>(() => null),
		setExportMode: jest.fn(),
		executeEditCommand: jest.fn(),
		getViewportContainer: () => viewport,
		pause: jest.fn(),
		play: jest.fn(),
		seek: jest.fn()
	};
	const viewAtExtract: Array<typeof viewport> = [];
	const renderer = {
		render: jest.fn(),
		extract: {
			pixels: jest.fn(() => {
				viewAtExtract.push(JSON.parse(JSON.stringify(viewport)));
				return { pixels: new Uint8ClampedArray(SIZE.width * SIZE.height * 4), width: SIZE.width, height: SIZE.height };
			})
		}
	};
	const app = { renderer, ticker: { started: true }, stop: jest.fn(), start: jest.fn() };
	const exporter = new ExportCoordinator(edit as unknown as Edit, { application: app } as unknown as Canvas);
	return { edit, app, renderer, viewport, viewAtExtract, exporter };
}

beforeAll(() => {
	// jsdom has no 2D canvas; the coordinator only needs one to exist.
	Object.assign(globalThis, {
		ImageData: jest.fn((data: Uint8ClampedArray, width: number, height: number) => ({ data, width, height }))
	});
	Object.assign(HTMLCanvasElement.prototype, { getContext: () => ({ putImageData: jest.fn(), drawImage: jest.fn() }) });
});

beforeEach(() => {
	mockOutputs.length = 0;
	document.body.innerHTML = "";
	jest.mocked(canEncodeVideo).mockResolvedValue(true);
	jest.mocked(CanvasSource).mockClear();
	mockRenderMix.mockReset().mockResolvedValue(null);
	mockHasAudio.mockReset().mockReturnValue(false);
	jest.mocked(canEncodeAudio).mockReset().mockResolvedValue(true);
});

describe("ExportCoordinator.exportBlob", () => {
	it("resolves to an MP4 blob without an overlay or a download", async () => {
		const { exporter } = createHarness();
		const click = jest.spyOn(HTMLAnchorElement.prototype, "click");

		const blob = await exporter.exportBlob();

		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("video/mp4");
		expect(click).not.toHaveBeenCalled();
		expect(document.body.children).toHaveLength(0);
		exporter.dispose();
	});

	it("reports the existing stages as fractions, ending at the last frame", async () => {
		const { exporter } = createHarness();
		const onProgress = jest.fn();

		await exporter.exportBlob({ onProgress });

		expect(onProgress.mock.calls).toEqual([
			[0, "Preparing..."],
			[0.1, "Video ready"],
			[0.15, "Mixing audio..."],
			[0.25, "Exporting..."],
			[0.625, "Exporting..."],
			[1, "Exporting..."]
		]);
		exporter.dispose();
	});

	it("rejects with phase cancelled when the signal is already aborted", async () => {
		const { exporter, edit } = createHarness();
		const controller = new AbortController();
		controller.abort();

		await expect(exporter.exportBlob({ signal: controller.signal })).rejects.toMatchObject({ name: "ExportError", phase: "cancelled" });
		expect(edit.whenSettled).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("stops between frames when aborted, cancels the output and restores the session", async () => {
		const { exporter, edit, app, renderer } = createHarness();
		const controller = new AbortController();
		const onProgress = jest.fn((fraction: number) => {
			if (fraction > 0.25) controller.abort();
		});

		const error = await exporter.exportBlob({ signal: controller.signal, onProgress }).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ExportError);
		expect((error as ExportError).phase).toBe("cancelled");
		expect(renderer.extract.pixels).toHaveBeenCalledTimes(1);
		expect(mockOutputs[0].cancel).toHaveBeenCalled();
		expect(edit.seek).toHaveBeenCalledWith(1.5);
		expect(app.start).toHaveBeenCalled();
		exporter.dispose();
	});

	it("refuses an unsupported edit before encoding and lists every issue", async () => {
		const { exporter, edit } = createHarness();
		edit.getOutputFormat.mockReturnValue("gif");
		jest.mocked(canEncodeVideo).mockResolvedValue(false);

		const error = await exporter.exportBlob().catch((e: unknown) => e);

		expect(error).toMatchObject({ phase: "unsupported" });
		expect((error as ExportError).issues?.map(issue => issue.code)).toEqual(["output-format", "browser"]);
		expect(CanvasSource).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("waits for loads to settle, then fails a clip left on its placeholder with phase assets", async () => {
		const { exporter, edit } = createHarness();
		edit.tracks = [
			[
				{ clipId: "clip-ok", needsResolution: false },
				{ clipId: "clip-404", needsResolution: false }
			]
		];
		let settled = false;
		edit.whenSettled.mockImplementation(async () => {
			settled = true;
		});
		edit.getClipError.mockImplementation((_track, clip) => {
			expect(settled).toBe(true);
			return clip === 1 ? { error: "Request failed with status 404", assetType: "image" } : null;
		});

		const error = await exporter.exportBlob().catch((e: unknown) => e);

		expect(error).toMatchObject({ phase: "assets", context: { clipId: "clip-404" } });
		expect(CanvasSource).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("fails a clip still waiting for its source with phase assets", async () => {
		const { exporter, edit } = createHarness();
		edit.tracks = [[{ clipId: "caption", needsResolution: true }]];

		await expect(exporter.exportBlob()).rejects.toMatchObject({ phase: "assets", context: { clipId: "caption" } });
		exporter.dispose();
	});

	it("fails with phase assets, naming a clip, when a load hasn't settled by the timeout", async () => {
		jest.useFakeTimers();
		const { exporter, edit } = createHarness();
		edit.whenSettled.mockReturnValue(new Promise<void>(() => {}));
		edit.getLoadingClipIds.mockReturnValue(["slow-clip"]);
		let outcome: unknown = "pending";

		const result = exporter.exportBlob().catch((e: unknown) => {
			outcome = e;
		});
		await jest.advanceTimersByTimeAsync(ASSET_SETTLE_TIMEOUT_MS - 1);
		expect(outcome).toBe("pending");
		await jest.advanceTimersByTimeAsync(1);
		await result;

		expect(outcome).toMatchObject({ phase: "assets", context: { clipId: "slow-clip" } });
		expect((outcome as ExportError).message).toContain("didn't finish loading");
		expect(CanvasSource).not.toHaveBeenCalled();
		exporter.dispose();
		jest.useRealTimers();
	});

	it("still cancels a load that never settles when aborted before the timeout", async () => {
		jest.useFakeTimers();
		const { exporter, edit } = createHarness();
		edit.whenSettled.mockReturnValue(new Promise<void>(() => {}));
		const controller = new AbortController();

		const pending = exporter.exportBlob({ signal: controller.signal });
		await jest.advanceTimersByTimeAsync(ASSET_SETTLE_TIMEOUT_MS / 2);
		controller.abort();

		await expect(pending).rejects.toMatchObject({ phase: "cancelled" });
		expect(jest.getTimerCount()).toBe(0);
		exporter.dispose();
		jest.useRealTimers();
	});

	it("releases the single-flight flag when the output can't be constructed", async () => {
		const { exporter } = createHarness();
		jest.mocked(Output).mockImplementationOnce(() => {
			throw new Error("no muxer");
		});

		await expect(exporter.exportBlob()).rejects.toMatchObject({ phase: "export" });
		await expect(exporter.exportBlob()).resolves.toBeInstanceOf(Blob);
		exporter.dispose();
	});

	it("keeps the original error when cancelling the output also fails", async () => {
		const { exporter } = createHarness();
		const controller = new AbortController();
		jest.mocked(CanvasSource).mockImplementationOnce(() => {
			controller.abort();
			return { add: jest.fn() } as unknown as CanvasSource;
		});
		const construct = jest.mocked(Output).getMockImplementation() as unknown as (...a: unknown[]) => { cancel: jest.Mock };
		jest.mocked(Output).mockImplementationOnce((...args: unknown[]) => {
			const output = construct(...args);
			output.cancel.mockRejectedValue(new Error("cancel failed"));
			return output as never;
		});

		await expect(exporter.exportBlob({ signal: controller.signal })).rejects.toMatchObject({ phase: "cancelled" });
		exporter.dispose();
	});

	it("refuses a second export while one is running", async () => {
		const { exporter } = createHarness();
		const first = exporter.exportBlob();

		await expect(exporter.exportBlob()).rejects.toMatchObject({ phase: "init" });
		await first;
		exporter.dispose();
	});

	it("refuses a second exporter on the same edit while one is running", async () => {
		const { exporter, edit, app } = createHarness();
		const second = new ExportCoordinator(edit as unknown as Edit, { application: app } as unknown as Canvas);
		const first = exporter.exportBlob();

		await expect(second.exportBlob()).rejects.toMatchObject({ phase: "init", message: "Export in progress" });
		await first;
		await expect(second.exportBlob()).resolves.toBeInstanceOf(Blob);
		exporter.dispose();
		second.dispose();
	});
});

describe("output settings", () => {
	it("mixes no audio and adds no audio track for a muted output", async () => {
		const { exporter, edit } = createHarness();
		edit.getEdit.mockReturnValue({ output: { fps: 2, mute: true } });
		mockRenderMix.mockResolvedValue({ duration: 1 });

		await exporter.exportBlob();

		expect(mockRenderMix).not.toHaveBeenCalled();
		expect(mockOutputs[0].addAudioTrack).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("refuses an edit with audio before mixing when the browser can't encode AAC, unless it's muted", async () => {
		const { exporter, edit } = createHarness();
		mockHasAudio.mockReturnValue(true);
		jest.mocked(canEncodeAudio).mockResolvedValue(false);

		const error = await exporter.exportBlob().catch((e: unknown) => e);

		expect(error).toMatchObject({ phase: "unsupported" });
		expect((error as ExportError).issues?.map(issue => issue.code)).toEqual(["browser"]);
		expect(mockRenderMix).not.toHaveBeenCalled();

		edit.getEdit.mockReturnValue({ output: { fps: 2, mute: true } });
		await expect(exporter.exportBlob()).resolves.toBeInstanceOf(Blob);
		exporter.dispose();
	});
});

describe("off-screen export", () => {
	it("draws each frame from the viewport container at output size while the view stays where the user left it", async () => {
		const { exporter, edit, renderer, viewport, viewAtExtract } = createHarness();
		const before = JSON.parse(JSON.stringify(viewport));

		await exporter.exportBlob();

		expect(renderer.extract.pixels).toHaveBeenCalledTimes(2);
		expect(renderer.extract.pixels).toHaveBeenCalledWith({ target: viewport, frame: { x: 0, y: 0, width: 4, height: 2 }, resolution: 1 });
		expect(viewAtExtract).toEqual([before, before]);
		expect(viewport).toEqual(before);
		expect(renderer.render).not.toHaveBeenCalled();
		expect(edit.setExportMode).not.toHaveBeenCalled();
		expect(edit.executeEditCommand).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("holds the on-screen frame while drawing, then puts the playhead back", async () => {
		const { exporter, edit, app, renderer } = createHarness();

		await exporter.exportBlob();

		const extracts = renderer.extract.pixels.mock.invocationCallOrder;
		expect(app.stop.mock.invocationCallOrder[0]).toBeLessThan(extracts[0]);
		expect(app.start.mock.invocationCallOrder[0]).toBeGreaterThan(extracts[extracts.length - 1]);
		expect(edit.seek).toHaveBeenCalledWith(1.5);
		expect(edit.play).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("resumes playback that was running when the export started", async () => {
		const { exporter, edit } = createHarness();
		edit.isPlaying = true;

		await exporter.exportBlob();

		expect(edit.pause).toHaveBeenCalled();
		expect(edit.seek.mock.invocationCallOrder[0]).toBeLessThan(edit.play.mock.invocationCallOrder[0]);
		exporter.dispose();
	});
});

describe("speed", () => {
	it("decodes each video frame at the player's own source time for that frame", async () => {
		const { exporter, edit } = createHarness();
		// getSourceTime stands in for the preview's speed mapping.
		class VideoPlayer {
			playerType = "video";

			clipId = "fast-clip";

			needsResolution = false;

			clipConfiguration = { asset: { type: "video", src: "https://example.com/clip.mp4" } };

			start = 0;

			length = 1;

			update = jest.fn();

			constructor(private readonly session: { playbackTime: number }) {}

			getSourceTime(): number {
				return this.session.playbackTime * 3;
			}

			getStart(): number {
				return this.start;
			}

			getEnd(): number {
				return this.start + this.length;
			}
		}
		edit.tracks = [[new VideoPlayer(edit)]];
		const getCanvas = jest.fn(async () => ({ canvas: { width: 2, height: 2 } }));
		jest
			.mocked(Input)
			.mockImplementationOnce(
				() => ({ getPrimaryVideoTrack: async () => ({ canDecode: async () => true }), dispose: jest.fn() }) as unknown as InstanceType<typeof Input>
			);
		jest.mocked(CanvasSink).mockImplementationOnce(() => ({ getCanvas }) as unknown as InstanceType<typeof CanvasSink>);

		await exporter.exportBlob();

		expect(getCanvas.mock.calls).toEqual([[0], [1.5]]);
		exporter.dispose();
	});
});

describe("editor restart", () => {
	it("restarts the app and rejects when pausing playback throws", async () => {
		const { exporter, edit, app } = createHarness();
		edit.pause.mockImplementationOnce(() => {
			throw new Error("listener failed");
		});

		await expect(exporter.exportBlob()).rejects.toMatchObject({ phase: "export" });
		expect(app.start).toHaveBeenCalled();
		exporter.dispose();
	});

	it("restarts the app even when restoring the playhead throws", async () => {
		const { exporter, edit, app } = createHarness();
		edit.seek.mockImplementationOnce(() => {
			throw new Error("clip update failed");
		});

		await expect(exporter.exportBlob()).rejects.toMatchObject({ phase: "export" });
		expect(app.start).toHaveBeenCalled();
		exporter.dispose();
	});

	it("leaves an app that was already stopped stopped", async () => {
		const { exporter, app } = createHarness();
		app.ticker.started = false;

		await exporter.exportBlob();

		expect(app.start).not.toHaveBeenCalled();
		exporter.dispose();
	});
});

describe("output size", () => {
	it("draws and encodes at the size the editor lays clips out in, with a bitrate for that size", async () => {
		const { exporter, edit, renderer } = createHarness();
		// An edit sized by resolution "hd" and aspectRatio "9:16", with no output.size.
		edit.size = calculateSizeFromPreset("hd", "9:16");

		await exporter.exportBlob();

		expect(renderer.extract.pixels).toHaveBeenCalledWith(expect.objectContaining({ frame: { x: 0, y: 0, width: 720, height: 1280 } }));
		expect(canEncodeVideo).toHaveBeenCalledWith("avc", { width: 720, height: 1280, bitrate: 2_222_222 });
		expect(CanvasSource).toHaveBeenCalledWith(expect.objectContaining({ width: 720, height: 1280 }), { codec: "avc", bitrate: 2_222_222 });
		exporter.dispose();
	});
});

describe("exportBitrate", () => {
	it("keeps 5 Mbps at 1080p in either orientation and scales with pixel count", () => {
		expect(exportBitrate({ width: 1920, height: 1080 })).toBe(5_000_000);
		expect(exportBitrate({ width: 1080, height: 1920 })).toBe(5_000_000);
		expect(exportBitrate({ width: 3840, height: 2160 })).toBe(20_000_000);
		expect(exportBitrate({ width: 1280, height: 720 })).toBe(2_222_222);
	});

	it("never drops below 1 Mbps", () => {
		expect(exportBitrate({ width: 640, height: 360 })).toBe(1_000_000);
		expect(exportBitrate({ width: 512, height: 288 })).toBe(1_000_000);
	});
});

describe("ExportCoordinator.export", () => {
	it("wraps a failed download as an export-phase error and removes the overlay", async () => {
		const { exporter } = createHarness();
		const create = jest.fn(() => {
			throw new Error("blocked");
		});
		Object.assign(URL, { createObjectURL: create });

		await expect(exporter.export()).rejects.toMatchObject({ name: "ExportError", phase: "export" });
		expect(document.body.children).toHaveLength(0);
		exporter.dispose();
	});

	it("downloads the file under the given name behind its overlay", async () => {
		const { exporter } = createHarness();
		const downloads: string[] = [];
		jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function recordDownload(this: HTMLAnchorElement) {
			downloads.push(this.download);
		});
		Object.assign(URL, { createObjectURL: jest.fn(() => "blob:export"), revokeObjectURL: jest.fn() });
		const create = jest.spyOn(ExportProgressUI.prototype, "create");
		const remove = jest.spyOn(ExportProgressUI.prototype, "remove");

		await exporter.export("my-video.mp4", 2);

		expect(downloads).toEqual(["my-video.mp4"]);
		expect(create).toHaveBeenCalledTimes(1);
		expect(remove).toHaveBeenCalled();
		expect(document.body.children).toHaveLength(0);
		exporter.dispose();
	});
});
