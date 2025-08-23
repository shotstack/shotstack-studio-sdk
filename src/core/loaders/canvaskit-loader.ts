import type { CanvasKit } from "canvaskit-wasm";

let canvasKitInstance: CanvasKit | null = null;
let initializationPromise: Promise<CanvasKit> | null = null;

export async function loadCanvasKitFromCDN(): Promise<CanvasKit> {
	if (canvasKitInstance) {
		return canvasKitInstance;
	}

	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = new Promise<CanvasKit>((resolve, reject) => {
		if (typeof window !== "undefined" && (window as any).CanvasKitInit) {
			(window as any)
				.CanvasKitInit({
					locateFile: (file: string) => {
						return `https://unpkg.com/canvaskit-wasm@0.40.0/bin/${file}`;
					}
				})
				.then((ck: CanvasKit) => {
					canvasKitInstance = ck;
					resolve(ck);
				})
				.catch(reject);
			return;
		}

		const script = document.createElement("script");
		script.src = "https://unpkg.com/canvaskit-wasm@0.40.0/bin/canvaskit.js";
		script.async = true;

		script.onload = () => {
			if (!(window as any).CanvasKitInit) {
				reject(new Error("CanvasKitInit not found after script load"));
				return;
			}

			(window as any)
				.CanvasKitInit({
					locateFile: (file: string) => {
						return `https://unpkg.com/canvaskit-wasm@0.40.0/bin/${file}`;
					}
				})
				.then((ck: CanvasKit) => {
					canvasKitInstance = ck;
					console.log("✅ CanvasKit loaded successfully");
					resolve(ck);
				})
				.catch((error: Error) => {
					console.error("❌ Failed to initialize CanvasKit:", error);
					reject(error);
				});
		};

		script.onerror = () => {
			reject(new Error("Failed to load CanvasKit script"));
		};

		document.head.appendChild(script);
	});

	return initializationPromise;
}
