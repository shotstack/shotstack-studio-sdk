/**
 * @jest-environment jsdom
 *
 * Controls Teardown Tests
 *
 * After dispose() nothing the class set up may reach the edit: neither the
 * document key listeners nor a paste that was still reading the clipboard.
 */
import { readSvgFromClipboardItems } from "@core/clipboard/svg-clipboard";
import { readSystemClipboardText } from "@core/clipboard/system-clipboard";
import { Controls } from "@core/inputs/controls";

import type { Edit } from "@core/edit-session";

jest.mock("@core/clipboard/svg-clipboard", () => ({
	...jest.requireActual("@core/clipboard/svg-clipboard"),
	readSvgFromClipboardItems: jest.fn()
}));

jest.mock("@core/clipboard/system-clipboard", () => ({
	readSystemClipboardText: jest.fn()
}));

const mockReadMime = jest.mocked(readSvgFromClipboardItems);
const mockReadText = jest.mocked(readSystemClipboardText);

function makeEdit() {
	return {
		playbackTime: 0,
		getSelectedClipInfo: jest.fn().mockReturnValue(null),
		seek: jest.fn(),
		addSvgClip: jest.fn().mockResolvedValue(undefined),
		pasteClip: jest.fn().mockResolvedValue(undefined)
	};
}

function press(code: string, init: KeyboardEventInit = {}): void {
	document.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init }));
}

function pendingPaste(controls: Controls): Promise<void> | null {
	return (controls as unknown as { pendingPaste: Promise<void> | null }).pendingPaste;
}

describe("Controls dispose", () => {
	let edit: ReturnType<typeof makeEdit>;
	let controls: Controls;

	beforeEach(() => {
		mockReadMime.mockReset().mockResolvedValue(null);
		mockReadText.mockReset().mockResolvedValue(null);
		edit = makeEdit();
		controls = new Controls(edit as unknown as Edit);
	});

	afterEach(() => {
		controls.dispose();
	});

	it("routes document key presses to the edit once loaded", async () => {
		await controls.load();

		press("ArrowRight");

		expect(edit.seek).toHaveBeenCalledTimes(1);
	});

	it("stops routing key presses after dispose", async () => {
		await controls.load();
		controls.dispose();

		press("ArrowRight");

		expect(edit.seek).not.toHaveBeenCalled();
	});

	it("tolerates a second dispose", async () => {
		await controls.load();
		controls.dispose();

		expect(() => controls.dispose()).not.toThrow();
		press("ArrowRight");
		expect(edit.seek).not.toHaveBeenCalled();
	});

	it("tolerates dispose before load, and still loads afterwards", async () => {
		expect(() => controls.dispose()).not.toThrow();
		press("ArrowRight");
		expect(edit.seek).not.toHaveBeenCalled();

		await controls.load();
		press("ArrowRight");
		expect(edit.seek).toHaveBeenCalledTimes(1);
	});

	it("drops a paste disposed while it reads clipboard items", async () => {
		mockReadMime.mockImplementationOnce(async () => {
			controls.dispose();
			return "<svg></svg>";
		});
		await controls.load();

		press("KeyV", { metaKey: true });
		await pendingPaste(controls);

		expect(edit.addSvgClip).not.toHaveBeenCalled();
	});

	it("drops a paste disposed while it reads clipboard text", async () => {
		mockReadText.mockImplementationOnce(async () => {
			controls.dispose();
			return "plain text";
		});
		await controls.load();

		press("KeyV", { metaKey: true });
		await pendingPaste(controls);

		expect(mockReadText).toHaveBeenCalledTimes(1);
		expect(edit.pasteClip).not.toHaveBeenCalled();
	});

	it("pastes again when loaded after a dispose", async () => {
		await controls.load();
		controls.dispose();
		await controls.load();

		press("KeyV", { metaKey: true });
		await pendingPaste(controls);

		expect(edit.pasteClip).toHaveBeenCalledTimes(1);
	});
});
