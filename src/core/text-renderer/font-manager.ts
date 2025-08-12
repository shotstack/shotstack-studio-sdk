import * as opentype from "opentype.js";
import { CANVAS_CONFIG } from "./config";
import { CanvasKitManager } from "./canvas-kit-manager";
import type { CustomFont } from "./types";
import robotoRegularUrl from "../../assets/fonts/Roboto-Regular.ttf";
import robotoBoldUrl from "../../assets/fonts/Roboto-Bold.ttf";

export class FontManager {
	private static instance: FontManager;

	private fontCache: Map<string, opentype.Font> = new Map();
	private fontUrlCache: Map<string, ArrayBuffer> = new Map();
	private loadingPromises: Map<string, Promise<void>> = new Map();
	private canvasKitManager: CanvasKitManager;

	private registeredNames: Set<string> = new Set();

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

		await this.canvasKitManager.initialize();

		await this.registerBundledFallbacks();

		this.markSystemNames();

		console.log(`📚 Registered ${this.registeredNames.size} system fonts`);
	}

	private async registerBundledFallbacks(): Promise<void> {
		try {
			const buf = await this.fetchArrayBuffer(robotoRegularUrl);
			await this.canvasKitManager.registerFont(buf, "Roboto");

			await this.canvasKitManager.registerFont(buf, "Arial");
			await this.canvasKitManager.registerFont(buf, "Helvetica");
			await this.canvasKitManager.registerFont(buf, "Verdana");
			await this.canvasKitManager.registerFont(buf, "Georgia");
			await this.canvasKitManager.registerFont(buf, "Times New Roman");
			await this.canvasKitManager.registerFont(buf, "Courier New");

			this.fontUrlCache.set("Roboto", buf);
			this.registeredNames.add("Roboto");
			["Arial", "Helvetica", "Verdana", "Georgia", "Times New Roman", "Courier New"].forEach(n => this.registeredNames.add(n));
		} catch (e) {
			console.warn("⚠️ Failed to register bundled Roboto Regular:", e);
		}

		try {
			const bufBold = await this.fetchArrayBuffer(robotoBoldUrl);

			await this.canvasKitManager.registerFont(bufBold, "Roboto");
			this.fontUrlCache.set("Roboto-Bold", bufBold);
			this.registeredNames.add("Roboto-Bold");
		} catch (e) {
			console.warn("⚠️ Failed to register bundled Roboto Bold:", e);
		}
	}

	private markSystemNames(): void {
		["Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia", "Verdana", "Roboto"].forEach(name => this.registeredNames.add(name));
	}

	private async fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
		return res.arrayBuffer();
	}

	async loadGoogleFont(family: string, weight: string = "400", style: "normal" | "italic" = "normal"): Promise<void> {
		const fontKey = `${family}-${weight}-${style}`;
		if (this.registeredNames.has(fontKey)) return;
		if (this.loadingPromises.has(fontKey)) return this.loadingPromises.get(fontKey)!;

		const p = this.fetchGoogleFont(family, weight, style);
		this.loadingPromises.set(fontKey, p);

		try {
			await p;
			this.registeredNames.add(fontKey);
			this.registeredNames.add(family);
		} finally {
			this.loadingPromises.delete(fontKey);
		}
	}

	private async fetchGoogleFont(family: string, weight: string, style: "normal" | "italic"): Promise<void> {
		const familyQuery = family.trim().replace(/\s+/g, "+");
		const ital = style === "italic" ? 1 : 0;
		const cssUrl = `https://fonts.googleapis.com/css2?family=${familyQuery}:ital,wght@${ital},${weight}&display=swap`;

		const cssResp = await fetch(cssUrl, { mode: "cors" });
		if (!cssResp.ok) throw new Error(`Failed to fetch Google Fonts CSS: ${cssResp.status}`);
		const css = await cssResp.text();

		const blockRegex = /@font-face\s*{[^}]*}/g;
		const blocks = css.match(blockRegex) || [];
		const needleStyle = `font-style:${style}`;
		const needleWeight = `font-weight:${weight}`;
		let fontUrl: string | null = null;

		for (const block of blocks) {
			if (block.includes(needleStyle) && block.includes(needleWeight)) {
				const urlMatch = block.match(/src:\s*url\((https:[^)]+\.woff2)\)/i);
				if (urlMatch) {
					fontUrl = urlMatch[1];
					break;
				}
			}
		}
		if (!fontUrl) {
			const anyMatch = css.match(/url\((https:[^)]+\.woff2)\)/i);
			if (!anyMatch) throw new Error("Could not find a woff2 URL in Google Fonts CSS");
			fontUrl = anyMatch[1];
		}

		const fontResp = await fetch(fontUrl);
		if (!fontResp.ok) throw new Error(`Failed to fetch font file: ${fontResp.status}`);
		const woff2Buffer = await fontResp.arrayBuffer();

		await this.canvasKitManager.registerFont(woff2Buffer, family);

		try {
			const link = document.createElement("link");
			link.href = cssUrl;
			link.rel = "stylesheet";
			document.head.appendChild(link);
			await (document as any).fonts.load(`${weight} 16px "${family}"`);
		} catch {}

		this.registeredNames.add(family);
		this.fontUrlCache.set(family, woff2Buffer);
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
			if (!response.ok) throw new Error(`Failed to fetch font: ${response.statusText}`);
			const fontBuffer = await response.arrayBuffer();

			const ot = opentype.parse(fontBuffer);
			this.fontCache.set(fontKey, ot);

			await this.canvasKitManager.registerFont(fontBuffer, font.family);

			this.fontUrlCache.set(fontKey, fontBuffer);
			this.registeredNames.add(fontKey);

			const fontFace = new FontFace(font.family, fontBuffer, {
				weight: font.weight?.toString() || "normal",
				style: font.style || "normal"
			});
			await fontFace.load();
			(document as any).fonts.add(fontFace);

			console.log(`✅ Successfully loaded custom font: ${font.family}`);
		} catch (error) {
			console.error(`❌ Failed to load custom font ${font.family}:`, error);
			throw error;
		}
	}

	async loadCustomFonts(fonts: CustomFont[]): Promise<void> {
		await Promise.all(fonts.map(f => this.loadCustomFont(f)));
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
		if (this.registeredNames.has(family)) return true;
		if (weight && this.registeredNames.has(`${family}-${weight}`)) return true;

		try {
			return (document as any).fonts?.check?.(`12px "${family}"`) ?? true;
		} catch {
			return true;
		}
	}

	getSupportedWeights(family: string): string[] {
		return CANVAS_CONFIG.FONT_WEIGHTS[family] || ["400"];
	}

	getAllRegisteredFonts(): string[] {
		return Array.from(this.registeredNames);
	}

	cleanup(): void {
		this.fontCache.clear();
		this.fontUrlCache.clear();
		this.loadingPromises.clear();
		this.registeredNames.clear();
		console.log("🧹 Font Manager cleaned up");
	}
}
