/** @jest-environment jsdom */

import type { Canvas } from "@canvas/shotstack-canvas";
import type { Edit } from "@core/edit-session";
import { ASSET_SETTLE_TIMEOUT_MS, ExportCoordinator } from "@core/export/export-coordinator";
import { ExportProgressUI } from "@core/export/export-progress-ui";
import { ExportError } from "@core/export/export-utils";
import { canEncodeVideo, CanvasSource } from "mediabunny";

const mockOutputs: Array<{ cancel: jest.Mock; state: string }> = [];

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
	AudioBufferSource: jest.fn(),
	canEncodeVideo: jest.fn(),
	Input: jest.fn(),
	UrlSource: jest.fn(),
	CanvasSink: jest.fn(),
	MP4: {},
	WEBM: {}
}));

jest.mock("pixi.js", () => ({
	Rectangle: jest.fn().mockImplementation((x: number, y: number, width: number, height: number) => ({ x, y, width, height })),
	Texture: { from: jest.fn() }
}));

// The canvas package needs TextEncoder, which jsdom lacks; the export only uses its font-name parser.
jest.mock("@shotstack/shotstack-canvas", () => ({ parseFontFamily: (family: string) => ({ family, weight: "400" }) }));

jest.mock("../src/core/export/audio-processor", () => ({
	AudioProcessor: jest.fn().mockImplementation(() => ({ renderMix: jest.fn().mockResolvedValue(null) }))
}));

const SIZE = { width: 4, height: 2 };

function createHarness() {
	const viewport = { position: { x: 120, y: 80 }, scale: { x: 0.5, y: 0.5 }, visible: true };
	const edit = {
		isPlaying: false,
		playbackTime: 1.5,
		totalDuration: 1,
		tracks: [] as Array<Array<{ clipId: string; needsResolution: boolean }>>,
		getEdit: () => ({ output: { fps: 2, size: SIZE } }),
		getOutputFormat: jest.fn(() => "mp4"),
		getResolvedEdit: () => ({ timeline: { tracks: [] }, output: { format: "mp4" } }),
		getFontUrlByFamilyAndWeight: () => null,
		whenSettled: jest.fn(() => Promise.resolve()),
		getLoadingClipIds: jest.fn(() => [] as string[]),
		getTracks: () => edit.tracks,
		getClipError: jest.fn<{ error: string; assetType: string } | null, [number, number]>(() => null),
		setExportMode: jest.fn(),
		executeEditCommand: jest.fn((command: { execute: (context: unknown) => unknown }) =>
			command.execute({ getClips: () => [], getTracks: () => [] })
		),
		getViewportContainer: () => viewport,
		pause: jest.fn(),
		play: jest.fn(),
		seek: jest.fn()
	};
	const renderer = {
		render: jest.fn(),
		extract: { pixels: jest.fn(() => ({ pixels: new Uint8ClampedArray(SIZE.width * SIZE.height * 4), width: SIZE.width, height: SIZE.height })) }
	};
	const canvas = { application: { renderer }, pauseTicker: jest.fn(), resumeTicker: jest.fn() };
	const exporter = new ExportCoordinator(edit as unknown as Edit, canvas as unknown as Canvas);
	return { edit, canvas, renderer, viewport, exporter };
}

beforeAll(() => {
	// jsdom has no 2D canvas; the coordinator only needs one to exist.
	Object.assign(globalThis, {
		ImageData: jest.fn((data: Uint8ClampedArray, width: number, height: number) => ({ data, width, height }))
	});
	Object.assign(HTMLCanvasElement.prototype, { getContext: () => ({ putImageData: jest.fn() }) });
});

beforeEach(() => {
	mockOutputs.length = 0;
	document.body.innerHTML = "";
	jest.mocked(canEncodeVideo).mockResolvedValue(true);
	jest.mocked(CanvasSource).mockClear();
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
		expect(edit.setExportMode).not.toHaveBeenCalled();
		exporter.dispose();
	});

	it("stops between frames when aborted, cancels the output and restores the session", async () => {
		const { exporter, edit, canvas, renderer } = createHarness();
		const controller = new AbortController();
		const onProgress = jest.fn((fraction: number) => {
			if (fraction > 0.25) controller.abort();
		});

		const error = await exporter.exportBlob({ signal: controller.signal, onProgress }).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ExportError);
		expect((error as ExportError).phase).toBe("cancelled");
		expect(renderer.extract.pixels).toHaveBeenCalledTimes(1);
		expect(mockOutputs[0].cancel).toHaveBeenCalled();
		expect(edit.setExportMode).toHaveBeenLastCalledWith(false);
		expect(canvas.resumeTicker).toHaveBeenCalled();
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

	it("refuses a second export while one is running", async () => {
		const { exporter } = createHarness();
		const first = exporter.exportBlob();

		await expect(exporter.exportBlob()).rejects.toMatchObject({ phase: "init" });
		await first;
		exporter.dispose();
	});
});

describe("ExportCoordinator.export", () => {
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
