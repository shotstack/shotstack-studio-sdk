/** @jest-environment jsdom */

import type { Canvas } from "@canvas/shotstack-canvas";
import type { Edit } from "@core/edit-session";
import { ExportCoordinator } from "@core/export/export-coordinator";
import { ExportProgressUI } from "@core/export/export-progress-ui";
import { ExportError } from "@core/export/export-utils";

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
		getEdit: () => ({ output: { fps: 2, size: SIZE } }),
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
	// jsdom has no WebCodecs or 2D canvas; the coordinator only needs them to exist.
	Object.assign(globalThis, {
		VideoEncoder: jest.fn(),
		ImageData: jest.fn((data: Uint8ClampedArray, width: number, height: number) => ({ data, width, height }))
	});
	Object.assign(HTMLCanvasElement.prototype, { getContext: () => ({ putImageData: jest.fn() }) });
});

beforeEach(() => {
	mockOutputs.length = 0;
	document.body.innerHTML = "";
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
