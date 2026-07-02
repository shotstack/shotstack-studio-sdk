/**
 * @jest-environment jsdom
 *
 * Copy Shortcut Guard Tests
 *
 * Cmd/Ctrl+C must only be intercepted when it will act on a clip: with no clip
 * selected, or with an active text selection anywhere in the document, the
 * browser's default copy has to run so host-app text stays copyable.
 */
import { Controls } from "@core/inputs/controls";

import type { Edit } from "@core/edit-session";

interface MockEdit {
	getSelectedClipInfo: jest.Mock;
	copyClip: jest.Mock;
}

function makeEdit(selected: { trackIndex: number; clipIndex: number } | null): MockEdit {
	return {
		getSelectedClipInfo: jest.fn().mockReturnValue(selected),
		copyClip: jest.fn()
	};
}

function dispatchCopy(target: EventTarget): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		code: "KeyC",
		key: "c",
		metaKey: true,
		bubbles: true,
		cancelable: true
	});
	target.dispatchEvent(event);
	return event;
}

function selectText(text: string): void {
	const container = document.createElement("div");
	container.textContent = text;
	document.body.appendChild(container);
	const range = document.createRange();
	range.selectNodeContents(container);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}

describe("Controls copy shortcut", () => {
	let controls: Controls;
	let edit: MockEdit;

	async function loadControls(selected: { trackIndex: number; clipIndex: number } | null): Promise<void> {
		edit = makeEdit(selected);
		controls = new Controls(edit as unknown as Edit);
		await controls.load();
	}

	afterEach(() => {
		controls.dispose();
		window.getSelection()?.removeAllRanges();
		document.body.innerHTML = "";
	});

	it("lets the browser handle copy when no clip is selected", async () => {
		await loadControls(null);

		const event = dispatchCopy(document.body);

		expect(event.defaultPrevented).toBe(false);
		expect(edit.copyClip).not.toHaveBeenCalled();
	});

	it("copies the selected clip when nothing else claims the shortcut", async () => {
		await loadControls({ trackIndex: 1, clipIndex: 2 });

		const event = dispatchCopy(document.body);

		expect(event.defaultPrevented).toBe(true);
		expect(edit.copyClip).toHaveBeenCalledWith(1, 2);
	});

	it("prefers an active text selection over the selected clip", async () => {
		await loadControls({ trackIndex: 1, clipIndex: 2 });
		selectText("copy this message text");

		const event = dispatchCopy(document.body);

		expect(event.defaultPrevented).toBe(false);
		expect(edit.copyClip).not.toHaveBeenCalled();
	});

	it("stays exempt inside editable fields", async () => {
		await loadControls({ trackIndex: 1, clipIndex: 2 });
		const textarea = document.createElement("textarea");
		document.body.appendChild(textarea);

		const event = dispatchCopy(textarea);

		expect(event.defaultPrevented).toBe(false);
		expect(edit.copyClip).not.toHaveBeenCalled();
	});
});
