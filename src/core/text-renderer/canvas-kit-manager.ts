import { loadCanvasKitFromCDN } from "@core/loaders/canvaskit-loader";
import type { CanvasKit, Surface, Paint, FontMgr, Typeface, TypefaceFontProvider } from "canvaskit-wasm";

export class CanvasKitManager {
	private static instance: CanvasKitManager;

	private canvasKit: CanvasKit | null = null;
	private initPromise: Promise<CanvasKit> | null = null;

	private surfaces: Map<string, Surface> = new Map();

	private provider: TypefaceFontProvider | null = null;
	private fontMgr: FontMgr | null = null;

	private loadedFonts: Map<string, ArrayBuffer> = new Map();

	private typefaces: Map<string, Typeface> = new Map();

	private constructor() {}

	static getInstance(): CanvasKitManager {
		if (!CanvasKitManager.instance) {
			CanvasKitManager.instance = new CanvasKitManager();
		}
		return CanvasKitManager.instance;
	}

	async initialize(): Promise<CanvasKit> {
		if (this.canvasKit) return this.canvasKit;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.loadCanvasKit();
		this.canvasKit = await this.initPromise;

		this.initializeFontProvider();
		return this.canvasKit;
	}

	private async loadCanvasKit(): Promise<CanvasKit> {
		try {
			const ck = await loadCanvasKitFromCDN();
			if (!ck) throw new Error("CanvasKit initialization returned null");
			console.log("✅ CanvasKit manager initialized");
			return ck;
		} catch (error) {
			console.error("❌ Failed to initialize CanvasKit:", error);
			throw new Error(`CanvasKit initialization failed: ${error}`);
		}
	}

	private initializeFontProvider(): void {
		if (!this.canvasKit) return;

		try {
			this.provider = this.canvasKit.TypefaceFontProvider.Make();
			this.fontMgr = this.provider as unknown as FontMgr;

			if (this.loadedFonts.size > 0) {
				for (const [family, buf] of this.loadedFonts.entries()) {
					this.registerBufferIntoProvider(buf, family);
				}
			}

			const count = this.fontMgr?.countFamilies?.() ?? 0;
			console.log(count > 0 ? `✅ Font provider initialized with ${count} families` : "ℹ️ Font provider ready (no fonts registered yet)");
		} catch (error) {
			console.warn("⚠️ Could not initialize TypefaceFontProvider:", error);
			this.provider = null;
			this.fontMgr = null;
		}
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

		if (id) this.surfaces.set(id, surface);
		return surface;
	}

	async createOffscreenSurface(width: number, height: number): Promise<Surface> {
		const ck = await this.initialize();
		const surface = ck.MakeSurface(width, height);
		if (!surface) throw new Error(`Failed to create offscreen surface ${width}x${height}`);
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
		await this.initialize();

		this.loadedFonts.set(familyName, fontData);

		if (!this.provider || !this.fontMgr) {
			this.initializeFontProvider();
			if (!this.provider) throw new Error("TypefaceFontProvider not available");
		}

		this.registerBufferIntoProvider(fontData, familyName);

		try {
			const face =
				(this.canvasKit as any)?.MakeTypefaceFromData?.(new Uint8Array(fontData)) ?? this.canvasKit!.Typeface.MakeFreeTypeFaceFromData(fontData);
			if (face) this.typefaces.set(familyName, face);
		} catch {}

		const count = this.fontMgr?.countFamilies?.() ?? 0;
		console.log(`✅ Registered font: ${familyName} (total families: ${count})`);
	}

	private registerBufferIntoProvider(buf: ArrayBuffer, familyName: string): void {
		if (!this.canvasKit || !this.provider) return;
		try {
			this.provider.registerFont(new Uint8Array(buf), familyName);
		} catch (e) {
			console.warn(`⚠️ registerBufferIntoProvider failed for "${familyName}":`, e);
		}
	}

	async getTypefaceForFont(fontFamily: string, fontWeight?: string | number, fontStyle?: string): Promise<Typeface | null> {
		const ck = await this.initialize();
		const mgr: FontMgr | null = this.fontMgr ?? this.provider;
		if (!mgr) return null;

		const toWeightEnum = (w?: string | number) => {
			if (typeof w === "string") {
				const s = w.toLowerCase();
				if (s === "normal") return ck.FontWeight.Normal;
				if (s === "bold") return ck.FontWeight.Bold;
				const n = parseInt(w, 10);
				if (!Number.isNaN(n)) w = n;
				else return ck.FontWeight.Normal;
			}
			const n = Math.max(1, Math.min(1000, (w as number) ?? 400));
			if (n <= 100) return ck.FontWeight.Thin;
			if (n <= 200) return ck.FontWeight.ExtraLight;
			if (n <= 300) return ck.FontWeight.Light;
			if (n <= 400) return ck.FontWeight.Normal;
			if (n <= 500) return ck.FontWeight.Medium;
			if (n <= 600) return ck.FontWeight.SemiBold;
			if (n <= 700) return ck.FontWeight.Bold;
			if (n <= 800) return ck.FontWeight.ExtraBold;
			if (n <= 900) return ck.FontWeight.Black;
			return ck.FontWeight.ExtraBlack;
		};

		const style = {
			weight: toWeightEnum(fontWeight),
			width: ck.FontWidth.Normal,
			slant: fontStyle === "italic" ? ck.FontSlant.Italic : fontStyle === "oblique" ? ck.FontSlant.Oblique : ck.FontSlant.Upright
		} as const;

		const hit = mgr.matchFamilyStyle?.(fontFamily, style) ?? null;
		if (hit) return hit;

		const roboto = mgr.matchFamilyStyle?.("Roboto", style) ?? null;
		if (roboto) return roboto;

		const cached = this.typefaces.get(fontFamily);
		return cached ?? null;
	}

	getTypeface(familyName: string): Typeface | undefined {
		return this.typefaces.get(familyName);
	}

	getFontManager(): FontMgr | null {
		return this.fontMgr;
	}

	cleanup(): void {
		this.typefaces.forEach(t => {
			try {
				(t as any).delete?.();
			} catch {}
		});
		this.typefaces.clear();

		this.surfaces.forEach(s => {
			try {
				(s as any).delete?.();
			} catch {}
		});
		this.surfaces.clear();

		if (this.provider) {
			try {
				(this.provider as any).delete?.();
			} catch {}
		}
		this.provider = null;
		this.fontMgr = null;

		this.loadedFonts.clear();
		this.canvasKit = null;
		this.initPromise = null;

		console.log("🧹 CanvasKit manager cleaned up");
	}

	isInitialized(): boolean {
		return this.canvasKit !== null;
	}

	getMemoryUsage(): { surfaces: number; fonts: number; typefaces: number } {
		return {
			surfaces: this.surfaces.size,
			fonts: this.loadedFonts.size,
			typefaces: this.typefaces.size
		};
	}
}
