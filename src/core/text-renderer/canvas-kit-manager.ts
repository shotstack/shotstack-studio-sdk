import CanvasKitInit from "canvaskit-wasm";
import type { CanvasKit, Surface, Paint, FontMgr } from "canvaskit-wasm";

export class CanvasKitManager {
	private static instance: CanvasKitManager;
	private canvasKit: CanvasKit | null = null;
	private initPromise: Promise<CanvasKit> | null = null;
	private surfaces: Map<string, Surface> = new Map();
	private fontMgr: FontMgr | null = null;
	private loadedFonts: Map<string, ArrayBuffer> = new Map();

	private constructor() {}

	static getInstance(): CanvasKitManager {
		if (!CanvasKitManager.instance) {
			CanvasKitManager.instance = new CanvasKitManager();
		}
		return CanvasKitManager.instance;
	}

	async initialize(): Promise<CanvasKit> {
		if (this.canvasKit) {
			return this.canvasKit;
		}

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.loadCanvasKit();
		this.canvasKit = await this.initPromise;
		this.fontMgr = this.canvasKit.FontMgr.FromData(...this.getSystemFonts());

		return this.canvasKit;
	}

	private async loadCanvasKit(): Promise<CanvasKit> {
		try {
			const ck = await CanvasKitInit({
				locateFile: (file: string) => {
					return `https://unpkg.com/canvaskit-wasm@0.38.2/bin/${file}`;
				}
			});

			console.log("✅ CanvasKit initialized successfully");
			return ck;
		} catch (error) {
			console.error("❌ Failed to initialize CanvasKit:", error);
			throw new Error(`CanvasKit initialization failed: ${error}`);
		}
	}

	private getSystemFonts(): ArrayBuffer[] {
		return [];
	}

	async createSurface(width: number, height: number, id?: string): Promise<Surface> {
		const ck = await this.initialize();

		if (id && this.surfaces.has(id)) {
			const oldSurface = this.surfaces.get(id);
			oldSurface?.delete();
			this.surfaces.delete(id);
		}

		const surface = ck.MakeSurface(width, height);
		if (!surface) {
			throw new Error(`Failed to create surface with dimensions ${width}x${height}`);
		}

		if (id) {
			this.surfaces.set(id, surface);
		}

		return surface;
	}

	async createOffscreenSurface(width: number, height: number): Promise<Surface> {
		const ck = await this.initialize();
		const surface = ck.MakeSurface(width, height);

		if (!surface) {
			throw new Error(`Failed to create offscreen surface ${width}x${height}`);
		}

		return surface;
	}

	getSurface(id: string): Surface | undefined {
		return this.surfaces.get(id);
	}

	deleteSurface(id: string): void {
		const surface = this.surfaces.get(id);
		if (surface) {
			surface.delete();
			this.surfaces.delete(id);
		}
	}

	async createPaint(): Promise<Paint> {
		const ck = await this.initialize();
		return new ck.Paint();
	}

	async getCanvasKit(): Promise<CanvasKit> {
		return this.initialize();
	}

	async registerFont(fontData: ArrayBuffer, familyName: string): Promise<void> {
		const ck = await this.initialize();

		if (this.loadedFonts.has(familyName)) {
			console.log(`Font ${familyName} already registered`);
			return;
		}

		try {
			const fontMgr = ck.FontMgr.FromData(fontData);
			if (fontMgr) {
				this.loadedFonts.set(familyName, fontData);
				console.log(`✅ Registered font: ${familyName}`);
			}
		} catch (error) {
			console.error(`❌ Failed to register font ${familyName}:`, error);
			throw error;
		}
	}

	getFontManager(): FontMgr | null {
		return this.fontMgr;
	}

	cleanup(): void {
		this.surfaces.forEach(surface => {
			surface.delete();
		});
		this.surfaces.clear();

		if (this.fontMgr) {
			this.fontMgr.delete();
			this.fontMgr = null;
		}

		this.loadedFonts.clear();

		console.log("🧹 CanvasKit manager cleaned up");
	}

	isInitialized(): boolean {
		return this.canvasKit !== null;
	}

	getMemoryUsage(): { surfaces: number; fonts: number } {
		return {
			surfaces: this.surfaces.size,
			fonts: this.loadedFonts.size
		};
	}
}
