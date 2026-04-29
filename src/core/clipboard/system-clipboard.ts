/**
 * Generic OS clipboard read/write for plain text.
 */

const LOG_PREFIX = "[shotstack-studio:system-clipboard]";

export async function readSystemClipboardText(): Promise<string | null> {
	if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
		return null;
	}
	try {
		return await navigator.clipboard.readText();
	} catch (err) {
		console.warn(`${LOG_PREFIX} readText failed`, err);
		return null;
	}
}

export async function writeSystemClipboardText(text: string): Promise<void> {
	if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
		return;
	}
	try {
		await navigator.clipboard.writeText(text);
	} catch (err) {
		console.warn(`${LOG_PREFIX} writeText failed`, err);
	}
}
