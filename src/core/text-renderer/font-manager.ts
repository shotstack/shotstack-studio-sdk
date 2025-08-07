import * as opentype from "opentype.js";
import { CANVAS_CONFIG } from "./config";
import { CanvasKitManager } from "./canvas-kit-manager";
import type { CustomFont } from "./types";

export class FontManager {
	private static instance: FontManager;
	private fontCache: Map<string, opentype.Font> = new Map();
	private fontUrlCache: Map<string, ArrayBuffer> = new Map();
	private loadingPromises: Map<string, Promise<void>> = new Map();
	private canvasKitManager: CanvasKitManager;
	private registeredFonts: Set<string> = new Set();

	private constructor() {
		this.canvasKitManager = CanvasKitManager.getInstance();
	}

	static getInstance(): FontManager {
		if (!FontManager.instance) {
			FontManager.instance = new FontManager();
		}
		return FontManager.instance;
	}

	async initialize(): Promise<void> {
		console.log("🔤 Initializing Font Manager...");
		await this.loadSystemFonts();
	}

	private async loadSystemFonts(): Promise<void> {
		const systemFonts = ["Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia", "Verdana"];

		systemFonts.forEach(font => {
			this.registeredFonts.add(font);
		});

		console.log(`📚 Registered ${systemFonts.length} system fonts`);
	}

	async loadGoogleFont(family: string, weight: string = "400"): Promise<void> {
		const fontKey = `${family}-${weight}`;

		if (this.registeredFonts.has(fontKey)) {
			return;
		}

		if (this.loadingPromises.has(fontKey)) {
			return this.loadingPromises.get(fontKey)!;
		}

		const loadPromise = this.fetchGoogleFont(family, weight);
		this.loadingPromises.set(fontKey, loadPromise);

		try {
			await loadPromise;
			this.registeredFonts.add(fontKey);
			this.loadingPromises.delete(fontKey);
		} catch (error) {
			this.loadingPromises.delete(fontKey);
			throw error;
		}
	}

	private async fetchGoogleFont(family: string, weight: string): Promise<void> {
		try {
			const link = document.createElement("link");
			link.href = `https://fonts.googleapis.com/css2?family=${family.replace(" ", "+")}:wght@${weight}&display=swap`;

			link.rel = "stylesheet";
			document.head.appendChild(link);

			await document.fonts.load(`${weight} 16px "${family}"`);

			console.log(`✅ Loaded Google Font: ${family} (${weight})`);
		} catch (error) {
			console.error(`❌ Failed to load Google Font ${family}:`, error);
			throw error;
		}
	}

	async loadCustomFont(font: CustomFont): Promise<void> {
		const fontKey = font.family;

		if (this.fontUrlCache.has(fontKey)) {
			console.log(`📝 Font ${fontKey} already loaded`);
			return;
		}

		try {
			console.log(`📥 Loading custom font: ${font.family} from ${font.src}`);

			const response = await fetch(font.src);
			if (!response.ok) {
				throw new Error(`Failed to fetch font: ${response.statusText}`);
			}

			const fontBuffer = await response.arrayBuffer();

			const opentypeFont = opentype.parse(fontBuffer);
			this.fontCache.set(fontKey, opentypeFont);

			await this.canvasKitManager.registerFont(fontBuffer, font.family);

			this.fontUrlCache.set(fontKey, fontBuffer);
			this.registeredFonts.add(fontKey);

			const fontFace = new FontFace(font.family, fontBuffer, {
				weight: font.weight?.toString() || "normal",
				style: font.style || "normal"
			});

			await fontFace.load();
			document.fonts.add(fontFace);

			console.log(`✅ Successfully loaded custom font: ${font.family}`);
		} catch (error) {
			console.error(`❌ Failed to load custom font ${font.family}:`, error);
			throw error;
		}
	}

	async loadCustomFonts(fonts: CustomFont[]): Promise<void> {
		const loadPromises = fonts.map(font => this.loadCustomFont(font));
		await Promise.all(loadPromises);
	}

	buildFontString(family: string, size: number, weight: string | number = "normal", style: string = "normal"): string {
		const weightStr = typeof weight === "number" ? weight.toString() : weight;
		return `${style} ${weightStr} ${size}px "${family}"`;
	}

	getFontMetrics(family: string, size: number): { ascent: number; descent: number; lineHeight: number } {
		const font = this.fontCache.get(family);

		if (font) {
			const scale = size / font.unitsPerEm;
			return {
				ascent: font.ascender * scale,
				descent: Math.abs(font.descender * scale),
				lineHeight: (font.ascender - font.descender) * scale * 1.2
			};
		}

		return {
			ascent: size * 0.8,
			descent: size * 0.2,
			lineHeight: size * 1.2
		};
	}

	isCustomFont(family: string): boolean {
		return this.fontUrlCache.has(family);
	}

	isFontAvailable(family: string, weight?: string): boolean {
		if (this.registeredFonts.has(family)) {
			return true;
		}

		if (weight) {
			const fontKey = `${family}-${weight}`;
			if (this.registeredFonts.has(fontKey)) {
				return true;
			}
		}

		try {
			const testString = `12px "${family}"`;
			return document.fonts.check(testString);
		} catch {
			return false;
		}
	}

	getSupportedWeights(family: string): string[] {
		return CANVAS_CONFIG.FONT_WEIGHTS[family] || ["400"];
	}

	getAllRegisteredFonts(): string[] {
		return Array.from(this.registeredFonts);
	}

	cleanup(): void {
		this.fontCache.clear();
		this.fontUrlCache.clear();
		this.loadingPromises.clear();
		this.registeredFonts.clear();
		console.log("🧹 Font Manager cleaned up");
	}
}
