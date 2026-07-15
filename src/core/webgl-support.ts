/**
 * WebGL Support Detection
 *
 * Checks if the browser supports WebGL, which is required for PixiJS rendering.
 * Should be called before attempting to initialize the canvas.
 */

export interface WebGLSupportResult {
	supported: boolean;
	reason?: "webgl-unavailable" | "webgl-error";
}

/**
 * Thrown by `Canvas.load()` when WebGL is unavailable, so hosts can show
 * their own error state instead of treating the editor as loaded.
 */
export class WebGLUnsupportedError extends Error {
	constructor(reason?: WebGLSupportResult["reason"]) {
		super(
			reason === "webgl-error"
				? "WebGL initialisation failed. The editor cannot render in this browser."
				: "WebGL is not available in this browser. Enable hardware acceleration or use a browser that supports WebGL."
		);
		this.name = "WebGLUnsupportedError";
	}
}

/**
 * Check if WebGL is available in the current browser.
 * Tests both WebGL2 and WebGL1 for maximum compatibility.
 */
export function checkWebGLSupport(): WebGLSupportResult {
	try {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

		if (!gl) {
			return { supported: false, reason: "webgl-unavailable" };
		}

		return { supported: true };
	} catch {
		return { supported: false, reason: "webgl-error" };
	}
}
