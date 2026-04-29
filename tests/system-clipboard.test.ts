/**
 * @jest-environment jsdom
 */

import { readSystemClipboardText, writeSystemClipboardText } from "@core/clipboard/system-clipboard";

const originalClipboard = navigator.clipboard;

afterEach(() => {
	Object.defineProperty(navigator, "clipboard", {
		value: originalClipboard,
		configurable: true
	});
});

function setClipboard(impl: Partial<Clipboard> | undefined): void {
	Object.defineProperty(navigator, "clipboard", {
		value: impl,
		configurable: true
	});
}

describe("readSystemClipboardText", () => {
	it("returns null when the clipboard API is unavailable", async () => {
		setClipboard(undefined);
		expect(await readSystemClipboardText()).toBeNull();
	});

	it("returns the clipboard text on success", async () => {
		setClipboard({ readText: jest.fn().mockResolvedValue("hello") } as unknown as Clipboard);
		expect(await readSystemClipboardText()).toBe("hello");
	});

	it("logs a warning and returns null when readText throws", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation();
		setClipboard({ readText: jest.fn().mockRejectedValue(new Error("denied")) } as unknown as Clipboard);

		expect(await readSystemClipboardText()).toBeNull();
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("readText failed"), expect.any(Error));
		warnSpy.mockRestore();
	});
});

describe("writeSystemClipboardText", () => {
	it("is a no-op when the clipboard API is unavailable", async () => {
		setClipboard(undefined);
		await expect(writeSystemClipboardText("anything")).resolves.toBeUndefined();
	});

	it("writes text via clipboard.writeText", async () => {
		const writeText = jest.fn().mockResolvedValue(undefined);
		setClipboard({ writeText } as unknown as Clipboard);

		await writeSystemClipboardText("payload");
		expect(writeText).toHaveBeenCalledWith("payload");
	});

	it("logs a warning when writeText throws (does not propagate)", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation();
		setClipboard({ writeText: jest.fn().mockRejectedValue(new Error("denied")) } as unknown as Clipboard);

		await expect(writeSystemClipboardText("payload")).resolves.toBeUndefined();
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("writeText failed"), expect.any(Error));
		warnSpy.mockRestore();
	});
});
