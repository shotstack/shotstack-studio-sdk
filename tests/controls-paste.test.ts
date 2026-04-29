/**
 * Controls Paste-Dispatch Tests
 *
 * Verifies the Ctrl/Cmd+V branching logic in Controls.handlePaste:
 *   - SVG present in clipboard → edit.addSvgClip(svg)
 *   - No SVG → edit.pasteClip()
 *   - Clipboard read failure → falls back to edit.pasteClip()
 *   - Concurrency gate: rapid paste invocations don't stack
 */

import { Controls } from "@core/inputs/controls";
import type { Edit } from "@core/edit-session";

// Mock the clipboard module so each test controls what readSvgFromClipboard returns
// without needing the system clipboard or DOMParser.
jest.mock("@core/clipboard/svg-clipboard", () => ({
	readSvgFromClipboard: jest.fn()
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
const { readSvgFromClipboard: mockReadSvg } = require("@core/clipboard/svg-clipboard") as { readSvgFromClipboard: jest.Mock };

interface ControlsInternals {
	dispatchPaste(): Promise<void>;
	handlePaste(): void;
	pendingPaste: Promise<void> | null;
}

function createMockEdit(): Edit & { addSvgClip: jest.Mock; pasteClip: jest.Mock } {
	return {
		addSvgClip: jest.fn().mockResolvedValue(undefined),
		pasteClip: jest.fn().mockResolvedValue(undefined)
	} as unknown as Edit & { addSvgClip: jest.Mock; pasteClip: jest.Mock };
}

beforeEach(() => {
	mockReadSvg.mockReset();
});

describe("Controls.dispatchPaste — branch selection", () => {
	it("calls edit.addSvgClip when the clipboard contains SVG markup", async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
		mockReadSvg.mockResolvedValueOnce(svg);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.addSvgClip).toHaveBeenCalledWith(svg);
		expect(edit.pasteClip).not.toHaveBeenCalled();
	});

	it("falls back to edit.pasteClip when the clipboard has no SVG", async () => {
		mockReadSvg.mockResolvedValueOnce(null);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.pasteClip).toHaveBeenCalledTimes(1);
		expect(edit.addSvgClip).not.toHaveBeenCalled();
	});

	it("falls back to edit.pasteClip when the clipboard read throws", async () => {
		mockReadSvg.mockRejectedValueOnce(new Error("clipboard denied"));
		const edit = createMockEdit();
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		expect(edit.pasteClip).toHaveBeenCalledTimes(1);
		expect(edit.addSvgClip).not.toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("clipboard read failed"), expect.any(Error));
		consoleSpy.mockRestore();
	});

	it("does NOT fall back to pasteClip when addSvgClip throws — the failure is logged only", async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
		mockReadSvg.mockResolvedValueOnce(svg);
		const edit = createMockEdit();
		edit.addSvgClip.mockRejectedValueOnce(new Error("schema validation failed"));
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		await controls.dispatchPaste();

		// pasteClip must not fire — that would silently paste content the user
		// didn't ask for (a stale internal-clipboard clip from earlier).
		expect(edit.pasteClip).not.toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SVG paste failed"), expect.any(Error));
		consoleSpy.mockRestore();
	});
});

describe("Controls.handlePaste — concurrency gate", () => {
	it("ignores additional paste invocations while one is in flight", async () => {
		// Build a controlled promise so the first paste stays pending until we resolve it.
		let resolveFirst: ((value: string | null) => void) | undefined;
		mockReadSvg.mockImplementationOnce(
			() =>
				new Promise<string | null>(resolve => {
					resolveFirst = resolve;
				})
		);

		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		// Three rapid invocations — only the first should start a real read.
		controls.handlePaste();
		controls.handlePaste();
		controls.handlePaste();

		expect(mockReadSvg).toHaveBeenCalledTimes(1);

		// Resolve the in-flight paste so the gate clears.
		resolveFirst?.(null);
		await controls.pendingPaste;

		// After the gate clears, a new invocation can run.
		mockReadSvg.mockResolvedValueOnce(null);
		controls.handlePaste();
		expect(mockReadSvg).toHaveBeenCalledTimes(2);
	});

	it("clears the pendingPaste field after the dispatch resolves", async () => {
		mockReadSvg.mockResolvedValueOnce(null);
		const edit = createMockEdit();
		const controls = new Controls(edit) as unknown as ControlsInternals;

		controls.handlePaste();
		expect(controls.pendingPaste).not.toBeNull();

		await controls.pendingPaste;
		expect(controls.pendingPaste).toBeNull();
	});
});
