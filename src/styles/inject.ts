import styles from "./index.css?inline";

let injected = false;

/**
 * Injects the Shotstack Studio SDK styles into the document head.
 * This function is idempotent - calling it multiple times has no effect.
 *
 * The styles are bundled inline via Vite's ?inline import and injected
 * as a single <style> element with id "shotstack-studio-styles".
 */
export function injectShotstackStyles(): void {
	if (injected || typeof document === "undefined") return;

	const existing = document.getElementById("shotstack-studio-styles");
	if (existing) {
		injected = true;
		return;
	}

	const style = document.createElement("style");
	style.id = "shotstack-studio-styles";
	style.textContent = styles;
	document.head.appendChild(style);

	injected = true;
}

/**
 * Resets the injection state. Only used for testing.
 * @internal
 */
export function resetStyleInjection(): void {
	injected = false;
	const existing = document.getElementById("shotstack-studio-styles");
	existing?.remove();
}
