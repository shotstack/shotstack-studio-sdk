/**
 * WebGL Error Overlay
 *
 * Displays a user-friendly message when the browser doesn't support WebGL.
 */

export interface WebGLErrorOptions {
	/** Custom title (default: "Browser Not Supported") */
	title?: string;
	/** Custom message */
	message?: string;
}

const DEFAULT_TITLE = "Browser Not Supported";
const DEFAULT_MESSAGE = "Please try a different browser or enable hardware acceleration in your browser settings.";

/**
 * Creates and displays a WebGL error overlay in the specified container.
 */
export function createWebGLErrorOverlay(
	container: HTMLElement,
	options?: WebGLErrorOptions
): HTMLElement {
	const title = options?.title ?? DEFAULT_TITLE;
	const message = options?.message ?? DEFAULT_MESSAGE;

	const overlay = document.createElement("div");
	overlay.className = "ss-webgl-error-overlay";

	const content = document.createElement("div");
	content.className = "ss-webgl-error-content";

	// Monitor icon - informative, not alarming
	const icon = document.createElement("div");
	icon.className = "ss-webgl-error-icon";
	icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
		<line x1="8" y1="21" x2="16" y2="21"/>
		<line x1="12" y1="17" x2="12" y2="21"/>
	</svg>`;

	// Title
	const titleEl = document.createElement("h2");
	titleEl.className = "ss-webgl-error-title";
	titleEl.textContent = title;

	// Message
	const messageEl = document.createElement("p");
	messageEl.className = "ss-webgl-error-message";
	messageEl.textContent = message;

	content.appendChild(icon);
	content.appendChild(titleEl);
	content.appendChild(messageEl);
	overlay.appendChild(content);
	container.appendChild(overlay);

	return overlay;
}
