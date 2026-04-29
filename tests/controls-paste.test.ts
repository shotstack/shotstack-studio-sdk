/**
 * Controls Paste-Dispatch Tests
 *
 * Verifies the Ctrl/Cmd+V priority ladder in Controls.dispatchPaste:
 *   1. SVG MIME blob → addSvgClip
 *   2. Clip JSON in OS text → addClipFromJson
 *   3. SVG markup in OS text → addSvgClip
 *   4. Internal copiedClip fallback → pasteClip
 */

import { Controls } from "@core/inputs/controls";
import type { Edit } from "@core/edit-session";

jest.mock("@core/clipboard/svg-clipboard", () => ({
	readSvgFromClipboardItems: jest.fn(),
	looksLikeSvg: jest.fn((text: string) => /^\s*<svg/i.test(text))
}));

jest.mock("@core/clipboard/system-clipboard", () => ({
	readSystemClipboardText: jest.fn()
}));

jest.mock("@core/clipboard/clip-json", () => ({
	tryParseClipJson: jest.fn(),
	tryParseTracksJson: jest.fn()
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
const { readSvgFromClipboardItems: mockReadMime } = require("@core/clipboard/svg-clipboard") as { readSvgFromClipboardItems: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
const { readSystemClipboardText: mockReadText } = require("@core/clipboard/system-clipboard") as { readSystemClipboardText: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
const { tryParseClipJson: mockParseClipJson, tryParseTracksJson: mockParseTracksJson } = require("@core/clipboard/clip-json") as {
	tryParseClipJson: jest.Mock;
	tryParseTracksJson: jest.Mock;
};

interface ControlsInternals {
	dispatchPaste(): Promise<void>;
	handlePaste(): void;
	pendingPaste: Promise<void> | null;
}

function createMockEdit(): Edit & {
	addSvgClip: jest.Mock;
	addClipFromJson: jest.Mock;
	addTracksFromJson: jest.Mock;
	pasteClip: jest.Mock;
	playbackTime: number;
} {
	return {
		playbackTime: 0,
		addSvgClip: jest.fn().mockResolvedValue(undefined),
		addClipFromJson: jest.fn().mockResolvedValue(undefined),
		addTracksFromJson: jest.fn().mockResolvedValue(undefined),
		pasteClip: jest.fn().mockResolvedValue(undefined)
	} as unknown as Edit & {
		addSvgClip: jest.Mock;
		addClipFromJson: jest.Mock;
		addTracksFromJson: jest.Mock;
		pasteClip: jest.Mock;
		playbackTime: number;
	};
}

beforeEach(() => {
	mockReadMime.mockReset();
	mockReadText.mockReset();
	mockParseClipJson.mockReset();
	mockParseTracksJson.mockReset();
});

describe("dispatchPaste — priority ladder", () => {
	it("addSvgClip wins when an svg+xml MIME blob is in the clipboard", async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>';
		mockReadMime.mockResolvedValueOnce(svg);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.addSvgClip).toHaveBeenCalledWith(svg);
		expect(mockReadText).not.toHaveBeenCalled();
		expect(edit.addClipFromJson).not.toHaveBeenCalled();
		expect(edit.pasteClip).not.toHaveBeenCalled();
	});

	it("addClipFromJson wins when text is parseable clip JSON (and no MIME SVG)", async () => {
		const clipObj = { asset: { type: "image", src: "x" }, start: 0, length: 5 };
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce(JSON.stringify(clipObj));
		mockParseClipJson.mockReturnValueOnce(clipObj);
		const edit = createMockEdit();
		edit.playbackTime = 7;
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.addClipFromJson).toHaveBeenCalledWith(clipObj, { start: 7 });
		expect(edit.addSvgClip).not.toHaveBeenCalled();
		expect(edit.pasteClip).not.toHaveBeenCalled();
	});

	it("addTracksFromJson wins when text is parseable tracks JSON (and not clip-shaped)", async () => {
		const tracksObj = [{ clips: [{ asset: { type: "image", src: "x" }, start: 0, length: 5 }] }];
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce(JSON.stringify(tracksObj));
		mockParseClipJson.mockReturnValueOnce(null);
		mockParseTracksJson.mockReturnValueOnce(tracksObj);
		const edit = createMockEdit();
		edit.playbackTime = 12;
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.addTracksFromJson).toHaveBeenCalledWith(tracksObj, { start: 12 });
		expect(edit.addClipFromJson).not.toHaveBeenCalled();
		expect(edit.addSvgClip).not.toHaveBeenCalled();
		expect(edit.pasteClip).not.toHaveBeenCalled();
	});

	it("addSvgClip with raw text wins when text is SVG and not parseable as clip or tracks JSON", async () => {
		const svg = "<svg></svg>";
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce(svg);
		mockParseClipJson.mockReturnValueOnce(null);
		mockParseTracksJson.mockReturnValueOnce(null);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.addSvgClip).toHaveBeenCalledWith(svg);
		expect(edit.addClipFromJson).not.toHaveBeenCalled();
		expect(edit.addTracksFromJson).not.toHaveBeenCalled();
		expect(edit.pasteClip).not.toHaveBeenCalled();
	});

	it("falls back to pasteClip when text is neither JSON-parseable nor SVG", async () => {
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce("hello world");
		mockParseClipJson.mockReturnValueOnce(null);
		mockParseTracksJson.mockReturnValueOnce(null);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.pasteClip).toHaveBeenCalledTimes(1);
		expect(edit.addSvgClip).not.toHaveBeenCalled();
		expect(edit.addClipFromJson).not.toHaveBeenCalled();
		expect(edit.addTracksFromJson).not.toHaveBeenCalled();
	});

	it("does NOT fall back to pasteClip when addTracksFromJson throws — failure is logged only", async () => {
		const tracksObj = [{ clips: [{ asset: { type: "image", src: "x" }, start: 0, length: 5 }] }];
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce("[]");
		mockParseClipJson.mockReturnValueOnce(null);
		mockParseTracksJson.mockReturnValueOnce(tracksObj);
		const edit = createMockEdit();
		edit.addTracksFromJson.mockRejectedValueOnce(new Error("schema validation failed"));
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.pasteClip).not.toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("tracks JSON paste failed"), expect.any(Error));
		consoleSpy.mockRestore();
	});

	it("falls back to pasteClip when there is no OS clipboard content at all", async () => {
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce(null);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.pasteClip).toHaveBeenCalledTimes(1);
	});

	it("does NOT fall back to pasteClip when addClipFromJson throws — failure is logged only", async () => {
		const clipObj = { asset: { type: "image", src: "x" }, start: 0, length: 5 };
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce("{}");
		mockParseClipJson.mockReturnValueOnce(clipObj);
		const edit = createMockEdit();
		edit.addClipFromJson.mockRejectedValueOnce(new Error("schema validation failed"));
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.pasteClip).not.toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("clip JSON paste failed"), expect.any(Error));
		consoleSpy.mockRestore();
	});
});

describe("handlePaste — concurrency gate", () => {
	it("ignores additional invocations while a paste is in flight", async () => {
		let resolveFirst: (() => void) | undefined;
		mockReadMime.mockImplementationOnce(
			() =>
				new Promise<null>(resolve => {
					resolveFirst = () => resolve(null);
				})
		);

		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		controls.handlePaste();
		controls.handlePaste();
		controls.handlePaste();

		expect(mockReadMime).toHaveBeenCalledTimes(1);

		resolveFirst?.();
		await controls.pendingPaste;

		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce(null);
		controls.handlePaste();
		expect(mockReadMime).toHaveBeenCalledTimes(2);
	});

	it("clears pendingPaste after the dispatch resolves", async () => {
		mockReadMime.mockResolvedValueOnce(null);
		mockReadText.mockResolvedValueOnce(null);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		controls.handlePaste();
		expect(controls.pendingPaste).not.toBeNull();
		await controls.pendingPaste;
		expect(controls.pendingPaste).toBeNull();
	});
});
