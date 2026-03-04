import { Player, PlayerType } from "@canvas/players/player";
import { Edit } from "@core/edit-session";
import { InternalEvent } from "@core/events/edit-events";
import { parseFontFamily, resolveFontPath } from "@core/fonts/font-config";
import { type Size, type Vector } from "@layouts/geometry";
import { RichTextAssetSchema, type RichTextAsset, type ResolvedClip } from "@schemas";
import { createTextEngine, type CanvasRichTextAsset } from "@shotstack/shotstack-canvas";
import * as opentype from "opentype.js";
import * as pixi from "pixi.js";

// Derive TextEngine type from createTextEngine return type
type TextEngine = Awaited<ReturnType<typeof createTextEngine>>;

const extractFontNames = (url: string): { full: string; base: string } => {
	const filename = url.split("/").pop() || "";
	const withoutExtension = filename.replace(/\.(ttf|otf|woff|woff2)$/i, "");
	const baseFamily = withoutExtension.replace(/-(Bold|Light|Regular|Italic|Medium|SemiBold|Black|Thin|ExtraLight|ExtraBold|Heavy)$/i, "");

	return {
		full: withoutExtension,
		base: baseFamily
	};
};

/** Check if a font URL is from Google Fonts CDN */
const isGoogleFontUrl = (url: string): boolean => url.includes("fonts.gstatic.com");

export class RichTextPlayer extends Player {
	private static readonly PREVIEW_FPS = 60;
	private static readonly fontCapabilityCache = new Map<string, Promise<boolean>>();
	private textEngine: TextEngine | null = null;
	private renderer: ReturnType<TextEngine["createRenderer"]> | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;
	private lastRenderedTime: number = -1;
	private cachedFrames = new Map<number, pixi.Texture>();
	private isRendering: boolean = false;
	private pendingRenderTime: number | null = null; // Stores time requested while rendering (race condition fix)
	private validatedAsset: CanvasRichTextAsset | null = null;
	private fontSupportsBold: boolean = false;
	private loadComplete: boolean = false;
	private readonly fontRegistrationCache = new Map<string, Promise<boolean>>();

	private static getFontSourceCacheKey(sourcePath: string): string {
		const withoutHash = sourcePath.split("#", 1)[0];
		return withoutHash.split("?", 1)[0];
	}

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		// Remove fit property for rich-text assets
		// This aligns with @shotstack/schemas v1.5.6 which filters fit at track validation
		const { fit, ...configWithoutFit } = clipConfiguration;
		super(edit, configWithoutFit, PlayerType.RichText);
	}

	private resolveFontWeight(richTextAsset: RichTextAsset, fallbackWeight: number): number {
		const explicitWeight = richTextAsset.font?.weight;
		if (typeof explicitWeight === "string") {
			return parseInt(explicitWeight, 10) || fallbackWeight;
		}
		if (typeof explicitWeight === "number") {
			return explicitWeight;
		}

		return fallbackWeight;
	}

	private buildCanvasPayload(
		richTextAsset: RichTextAsset,
		fontInfo?: { baseFontFamily: string; fontWeight: number }
	): RichTextAsset & {
		width: number;
		height: number;
		font?: RichTextAsset["font"] & { family: string; weight: number };
		customFonts?: Array<{ src: string; family: string; weight: string }>;
	} {
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;

		// Use provided font info or parse fresh (for reconfigure/updateTextContent calls)
		const requestedFamily = richTextAsset.font?.family;
		const { baseFontFamily, fontWeight: parsedWeight } =
			fontInfo ?? (requestedFamily ? parseFontFamily(requestedFamily) : { baseFontFamily: requestedFamily, fontWeight: 400 });

		// Use explicit font.weight if set, otherwise fall back to parsed weight from family name
		const fontWeight = this.resolveFontWeight(richTextAsset, parsedWeight);

		// Find matching timeline font for customFonts payload
		const timelineFonts = this.edit.getTimelineFonts();
		const matchingFont = requestedFamily
			? timelineFonts.find(font => {
					const { full, base } = extractFontNames(font.src);
					const requested = requestedFamily.toLowerCase();
					return full.toLowerCase() === requested || base.toLowerCase() === requested;
				})
			: undefined;

		// Build customFonts array for the text engine
		// Match by URL filename first, then by binary font name from metadata
		let customFonts: Array<{ src: string; family: string; weight: string }> | undefined;
		if (matchingFont && requestedFamily) {
			customFonts = [{ src: matchingFont.src, family: baseFontFamily || requestedFamily, weight: fontWeight.toString() }];
		} else if (requestedFamily) {
			// Filename matching failed — try matching by binary font name from metadata
			const fontMetadata = this.edit.getFontMetadata();
			const lowerRequested = (baseFontFamily || requestedFamily).toLowerCase();
			const nonGoogleFonts = timelineFonts.filter(font => !isGoogleFontUrl(font.src));

			const metadataMatch = nonGoogleFonts.find(font => {
				const meta = fontMetadata.get(font.src);
				return meta?.baseFamilyName.toLowerCase() === lowerRequested;
			});
			if (metadataMatch) {
				customFonts = [{ src: metadataMatch.src, family: baseFontFamily || requestedFamily, weight: fontWeight.toString() }];
			}
			// No match → no customFonts → text engine falls back to default font
		}

		// Determine the font family for the canvas payload:
		// Use matched custom font name, or built-in font, or fall back to Roboto
		const hasFontMatch = customFonts || (requestedFamily && resolveFontPath(requestedFamily));
		const resolvedFamily = hasFontMatch ? baseFontFamily || requestedFamily : undefined;

		return {
			...richTextAsset,
			width,
			height,
			font: richTextAsset.font ? { ...richTextAsset.font, family: resolvedFamily || "Roboto", weight: fontWeight } : undefined,
			stroke: richTextAsset.font?.stroke,
			...(customFonts && { customFonts })
		};
	}

	private async registerFont(
		family: string,
		weight: number,
		source: { type: "url"; path: string } | { type: "file"; path: string }
	): Promise<boolean> {
		if (!this.textEngine) return false;
		const normalizedPath = RichTextPlayer.getFontSourceCacheKey(source.path);
		const cacheKey = `${source.type}:${normalizedPath}|${family}|${weight}`;
		const cached = this.fontRegistrationCache.get(cacheKey);
		if (cached) return cached;

		const registrationPromise = (async (): Promise<boolean> => {
			try {
				const fontDesc = { family, weight: weight.toString() };
				if (source.type === "url") {
					await this.textEngine!.registerFontFromUrl(source.path, fontDesc);
				} else {
					await this.textEngine!.registerFontFromFile(source.path, fontDesc);
				}
				return true;
			} catch {
				return false;
			}
		})();
		this.fontRegistrationCache.set(cacheKey, registrationPromise);
		return registrationPromise;
	}

	private createFontCapabilityCheckPromise(fontUrl: string): Promise<boolean> {
		return (async (): Promise<boolean> => {
			try {
				const response = await fetch(fontUrl);
				if (!response.ok) {
					throw new Error(`Failed to fetch font: ${response.status}`);
				}
				const buffer = await response.arrayBuffer();
				const font = opentype.parse(buffer);

				// Check for fvar table (variable font) with weight axis
				const fvar = font.tables["fvar"] as { axes?: Array<{ tag: string }> } | undefined;
				return !!fvar?.axes?.find(axis => axis.tag === "wght");
			} catch (error) {
				console.warn("Failed to check font capabilities:", error);
				return false;
			}
		})();
	}

	private async prepareFontForAsset(richTextAsset: RichTextAsset, emitCapabilitiesEvent: boolean): Promise<void> {
		const fontUrl = await this.ensureFontRegistered(richTextAsset);
		if (!fontUrl) {
			return;
		}

		const cacheKey = RichTextPlayer.getFontSourceCacheKey(fontUrl);
		const cachedCheck = RichTextPlayer.fontCapabilityCache.get(cacheKey);
		const capabilityCheck = cachedCheck ?? this.createFontCapabilityCheckPromise(fontUrl);
		if (!cachedCheck) {
			RichTextPlayer.fontCapabilityCache.set(cacheKey, capabilityCheck);
		}

		this.fontSupportsBold = await capabilityCheck;

		if (emitCapabilitiesEvent) {
			this.edit.getInternalEvents().emit(InternalEvent.FontCapabilitiesChanged, { supportsBold: this.fontSupportsBold });
		}
	}

	public supportsBold(): boolean {
		return this.fontSupportsBold;
	}

	private resolveFont(family: string): { url: string; baseFontFamily: string; fontWeight: number } | null {
		const { baseFontFamily, fontWeight } = parseFontFamily(family);

		// Check stored font metadata first (for template fonts with UUID-based URLs)
		// Uses normalized base family + weight to match the correct font file
		const metadataUrl = this.edit.getFontUrlByFamilyAndWeight(baseFontFamily, fontWeight);
		if (metadataUrl) {
			return { url: metadataUrl, baseFontFamily, fontWeight };
		}

		// Check timeline fonts by filename matching (legacy fallback)
		const editData = this.edit.getEdit();
		const timelineFonts = editData?.timeline?.fonts || [];
		const matchingFont = timelineFonts.find(font => {
			const { full, base } = extractFontNames(font.src);
			const requested = family.toLowerCase();
			return full.toLowerCase() === requested || base.toLowerCase() === requested;
		});

		if (matchingFont) {
			return { url: matchingFont.src, baseFontFamily, fontWeight };
		}

		// Fall back to built-in fonts from FONT_PATHS
		const builtInPath = resolveFontPath(family);
		if (builtInPath) {
			return { url: builtInPath, baseFontFamily, fontWeight };
		}

		return null;
	}

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();
		this.reconfigure(this.clipConfiguration.asset as RichTextAsset);
	}

	private async reconfigure(richTextAsset: RichTextAsset): Promise<void> {
		try {
			await this.prepareFontForAsset(richTextAsset, true);

			for (const texture of this.cachedFrames.values()) {
				texture.destroy();
			}
			this.cachedFrames.clear();
			this.lastRenderedTime = -1;

			if (this.textEngine) {
				const canvasPayload = this.buildCanvasPayload(richTextAsset);
				const { value: validated } = this.textEngine.validate(canvasPayload);
				this.validatedAsset = validated;
			}

			if (this.textEngine && this.renderer) {
				this.renderFrameSafe(this.getPlaybackTime());
			}
		} catch {
			// Validation or font loading failed (e.g., incompatible merge field value).
			// Keep rendering the last valid state — don't update validatedAsset.
		}
	}

	private async ensureFontRegistered(richTextAsset: RichTextAsset): Promise<string | null> {
		if (!this.textEngine) return null;

		const family = richTextAsset.font?.family;
		if (!family) return null;

		const resolved = this.resolveFont(family);
		if (!resolved) return null;

		const fontWeight = this.resolveFontWeight(richTextAsset, resolved.fontWeight);
		await this.registerFont(resolved.baseFontFamily, fontWeight, { type: "url", path: resolved.url });
		return resolved.url;
	}

	public override async load(): Promise<void> {
		await super.load();

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;

		try {
			const validationResult = RichTextAssetSchema.safeParse(richTextAsset);
			if (!validationResult.success) {
				this.createFallbackText(richTextAsset);
				return;
			}

			// Parse font info once, reuse throughout
			const requestedFamily = richTextAsset.font?.family;
			const fontInfo = requestedFamily ? parseFontFamily(requestedFamily) : undefined;
			const canvasPayload = this.buildCanvasPayload(richTextAsset, fontInfo);

			this.textEngine = (await createTextEngine({
				width: canvasPayload.width,
				height: canvasPayload.height,
				fps: RichTextPlayer.PREVIEW_FPS
			})) as TextEngine;

			const { value: validated } = this.textEngine!.validate(canvasPayload);
			this.validatedAsset = validated;

			this.canvas = document.createElement("canvas");
			this.canvas.width = canvasPayload.width;
			this.canvas.height = canvasPayload.height;

			this.renderer = this.textEngine!.createRenderer(this.canvas);
			await this.prepareFontForAsset(richTextAsset, false);

			await this.renderFrame(0);
			this.configureKeyframes();
			this.loadComplete = true;
		} catch {
			this.cleanupResources();
			this.createFallbackText(richTextAsset);
		}
	}

	private cleanupResources(): void {
		if (this.textEngine) {
			try {
				this.textEngine.destroy();
			} catch (e) {
				console.warn("Error destroying text engine:", e);
			}
			this.textEngine = null;
		}

		this.renderer = null;
		this.canvas = null;
		this.validatedAsset = null;
	}

	private async renderFrame(timeSeconds: number): Promise<void> {
		if (!this.textEngine || !this.renderer || !this.canvas || !this.validatedAsset) return;

		const cacheKey = Math.floor(timeSeconds * RichTextPlayer.PREVIEW_FPS);

		if (this.cachedFrames.has(cacheKey)) {
			const cachedTexture = this.cachedFrames.get(cacheKey)!;
			if (this.sprite && this.sprite.texture !== cachedTexture) {
				this.sprite.texture = cachedTexture;
			}
			this.lastRenderedTime = timeSeconds;
			return;
		}

		try {
			// Pass clip duration so animations can cap their length appropriately
			const clipDuration = this.getLength();
			const ops = await this.textEngine.renderFrame(this.validatedAsset, timeSeconds, clipDuration);

			const ctx = this.canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

			await this.renderer.render(ops);

			const tex = pixi.Texture.from(this.canvas);

			if (!this.sprite) {
				this.sprite = new pixi.Sprite(tex);
				this.contentContainer.addChild(this.sprite);
			} else {
				if (this.texture && !this.cachedFrames.has(cacheKey)) {
					this.texture.destroy();
				}
				this.sprite.texture = tex;
			}

			this.texture = tex;
			if (this.cachedFrames.size < 150) {
				this.cachedFrames.set(cacheKey, tex);
			}

			this.lastRenderedTime = timeSeconds;
		} catch (err) {
			console.error("Failed to render rich text frame:", err);
		}
	}

	private createFallbackText(richTextAsset: RichTextAsset): void {
		const editData = this.edit.getEdit();
		const containerWidth = this.clipConfiguration.width || editData?.output?.size?.width || this.edit.size.width;
		const containerHeight = this.clipConfiguration.height || editData?.output?.size?.height || this.edit.size.height;

		const style = new pixi.TextStyle({
			fontFamily: richTextAsset.font?.family || "Arial",
			fontSize: richTextAsset.font?.size || 48,
			fill: richTextAsset.font?.color || "#ffffff",
			align: richTextAsset.align?.horizontal || "center",
			wordWrap: true,
			wordWrapWidth: containerWidth
		});

		const fallbackText = new pixi.Text(richTextAsset.text, style);

		switch (richTextAsset.align?.horizontal) {
			case "left":
				fallbackText.anchor.set(0, 0.5);
				fallbackText.x = 0;
				break;
			case "right":
				fallbackText.anchor.set(1, 0.5);
				fallbackText.x = containerWidth;
				break;
			default:
				fallbackText.anchor.set(0.5, 0.5);
				fallbackText.x = containerWidth / 2;
		}

		switch (richTextAsset.align?.vertical) {
			case "top":
				fallbackText.anchor.set(fallbackText.anchor.x, 0);
				fallbackText.y = 0;
				break;
			case "bottom":
				fallbackText.anchor.set(fallbackText.anchor.x, 1);
				fallbackText.y = containerHeight;
				break;
			default:
				fallbackText.anchor.set(fallbackText.anchor.x, 0.5);
				fallbackText.y = containerHeight / 2;
		}

		this.contentContainer.addChild(fallbackText);
		this.configureKeyframes();
	}
	private renderFrameSafe(timeSeconds: number): void {
		if (this.isRendering) {
			// Store pending time to render after current render completes (race condition fix)
			this.pendingRenderTime = timeSeconds;

			// Show nearest cached frame instead of skipping entirely
			const cacheKey = Math.floor(timeSeconds * RichTextPlayer.PREVIEW_FPS);
			const cachedTexture = this.cachedFrames.get(cacheKey);
			if (cachedTexture && this.sprite && this.sprite.texture !== cachedTexture) {
				this.sprite.texture = cachedTexture;
			}
			return;
		}

		this.isRendering = true;
		this.pendingRenderTime = null;

		this.renderFrame(timeSeconds)
			.catch(err => console.error("Failed to render rich text frame:", err))
			.finally(() => {
				this.isRendering = false;

				// Check if a render was requested while we were busy
				if (this.pendingRenderTime !== null && this.pendingRenderTime !== timeSeconds) {
					const pending = this.pendingRenderTime;
					this.pendingRenderTime = null;
					this.renderFrameSafe(pending);
				}
			});
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		// Reset render state on seek to prevent race conditions
		if (elapsed === Edit.SEEK_ELAPSED_MARKER) {
			this.isRendering = false;
			this.pendingRenderTime = null;
			this.lastRenderedTime = -1;
		}

		if (!this.isActive()) {
			return;
		}

		// Guard against rendering before load() completes (font may not be registered yet)
		if (!this.loadComplete) {
			return;
		}

		if (this.textEngine && this.renderer && !this.isRendering) {
			const currentTimeSeconds = this.getPlaybackTime();
			const frameInterval = 1 / 60; // Always render at 60fps for smooth preview

			if (Math.abs(currentTimeSeconds - this.lastRenderedTime) > frameInterval) {
				this.renderFrameSafe(currentTimeSeconds);
			}
		}
	}

	public override dispose(): void {
		super.dispose();
		this.loadComplete = false;

		for (const texture of this.cachedFrames.values()) {
			texture.destroy();
		}
		this.cachedFrames.clear();

		if (this.texture && !this.cachedFrames.has(Math.floor(this.lastRenderedTime * RichTextPlayer.PREVIEW_FPS))) {
			this.texture.destroy();
		}
		this.texture = null;

		if (this.sprite) {
			this.sprite.destroy();
			this.sprite = null;
		}

		if (this.canvas) {
			this.canvas = null;
		}

		if (this.textEngine) {
			this.textEngine.destroy();
			this.textEngine = null;
		}

		this.renderer = null;
		this.validatedAsset = null;
	}

	public override getSize(): Size {
		const editData = this.edit.getEdit();
		return {
			width: this.clipConfiguration.width || editData?.output?.size?.width || this.edit.size.width,
			height: this.clipConfiguration.height || editData?.output?.size?.height || this.edit.size.height
		};
	}

	public override getContentSize(): Size {
		return {
			width: this.clipConfiguration.width || this.canvas?.width || this.edit.size.width,
			height: this.clipConfiguration.height || this.canvas?.height || this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	protected override getContainerScale(): Vector {
		// Rich text should not be fit-scaled - use only the user-defined scale
		const scale = this.getScale();
		return { x: scale, y: scale };
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}

	protected override onDimensionsChanged(): void {
		if (!this.textEngine || !this.renderer || !this.canvas) return;

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;
		const { width, height } = this.getSize();

		this.canvas.width = width;
		this.canvas.height = height;

		for (const texture of this.cachedFrames.values()) {
			texture.destroy();
		}
		this.cachedFrames.clear();
		this.lastRenderedTime = -1;

		const canvasPayload = this.buildCanvasPayload(richTextAsset);
		const { value: validated } = this.textEngine.validate(canvasPayload);
		this.validatedAsset = validated;

		this.renderFrameSafe(this.getPlaybackTime());
	}

	public updateTextContent(newText: string): void {
		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;
		richTextAsset.text = newText;

		if (this.textEngine) {
			const canvasPayload = this.buildCanvasPayload(richTextAsset);
			const { value: validated } = this.textEngine.validate(canvasPayload);
			this.validatedAsset = validated;
		}

		for (const texture of this.cachedFrames.values()) {
			texture.destroy();
		}
		this.cachedFrames.clear();

		this.lastRenderedTime = -1;
		if (this.textEngine && this.renderer) {
			this.renderFrameSafe(this.getPlaybackTime());
		}
	}

	public getCacheSize(): number {
		return this.cachedFrames.size;
	}
}
