import type { CanvasKit } from "canvaskit-wasm";
import CanvasKitInit from "canvaskit-wasm";

let canvasKitInstance: CanvasKit | null = null;
let initializationPromise: Promise<CanvasKit> | null = null;

export async function loadCanvasKitFromCDN(): Promise<CanvasKit> {
	if (canvasKitInstance) {
		return canvasKitInstance;
	}

	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = new Promise<CanvasKit>(async (resolve, reject) => {
		try {
			console.log("🌐 Loading CanvasKit from CDN...");
			
			const ck = await CanvasKitInit({
				locateFile: (file: string) => {
					return `https://unpkg.com/canvaskit-wasm@0.40.0/bin/${file}`;
				}
			});
			
			if (!ck) {
				throw new Error("CanvasKit initialization returned null");
			}

			canvasKitInstance = ck;
			console.log("✅ CanvasKit loaded successfully from CDN");
			resolve(ck);
		} catch (error) {
			console.error("❌ Failed to load CanvasKit from CDN:", error);
			reject(error);
		}
	});

	return initializationPromise;
}
