import { Player, PlayerType } from "@canvas/players/player";
import { Edit } from "@core/edit-session";
import { parseFontFamily, resolveFontPath } from "@core/fonts/font-config";
import { type Size, type Vector } from "@layouts/geometry";
import { RichCaptionAssetSchema, type RichCaptionAsset, type ResolvedClip } from "@schemas";
import {
	FontRegistry,
	CaptionLayoutEngine,
	generateRichCaptionFrame,
	createDefaultGeneratorConfig,
	createWebPainter,
	parseSubtitleToWords,
	CanvasRichCaptionAssetSchema,
	type CanvasRichCaptionAsset,
	type CaptionLayout,
	type CaptionLayoutConfig,
	type RichCaptionGeneratorConfig,
	type WordTiming,
} from "@shotstack/shotstack-canvas";
import * as pixi from "pixi.js";

const SOFT_WORD_LIMIT = 1500;
const HARD_WORD_LIMIT = 5000;
const SUBTITLE_FETCH_TIMEOUT_MS = 10_000;

const extractFontNames = (url: string): { full: string; base: string } => {
	const filename = url.split("/").pop() || "";
	const withoutExtension = filename.replace(/\.(ttf|otf|woff|woff2)$/i, "");
	const baseFamily = withoutExtension.replace(/-(Bold|Light|Regular|Italic|Medium|SemiBold|Black|Thin|ExtraLight|ExtraBold|Heavy)$/i, "");

	return {
		full: withoutExtension,
		base: baseFamily
	};
};

const isGoogleFontUrl = (url: string): boolean => url.includes("fonts.gstatic.com");

export class RichCaptionPlayer extends Player {
	private fontRegistry: FontRegistry | null = null;
	private layoutEngine: CaptionLayoutEngine | null = null;
	private captionLayout: CaptionLayout | null = null;
	private validatedAsset: CanvasRichCaptionAsset | null = null;
	private generatorConfig: RichCaptionGeneratorConfig | null = null;

	private canvas: HTMLCanvasElement | null = null;
	private painter: ReturnType<typeof createWebPainter> | null = null;
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;

	private loadComplete: boolean = false;

	private readonly fontRegistrationCache = new Map<string, Promise<boolean>>();

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		const { fit, ...configWithoutFit } = clipConfiguration;
		super(edit, configWithoutFit, PlayerType.RichCaption);
	}

	public override async load(): Promise<void> {
		await super.load();

		const richCaptionAsset = this.clipConfiguration.asset as RichCaptionAsset;

		try {
			const validationResult = RichCaptionAssetSchema.safeParse(richCaptionAsset);
			if (!validationResult.success) {
				this.createFallbackGraphic("Invalid caption asset");
				return;
			}

			let words: WordTiming[];
			if (richCaptionAsset.src) {
				words = await this.fetchAndParseSubtitle(richCaptionAsset.src);
			} else {
				words = (richCaptionAsset.words ?? []).map(w => ({
					text: w.text,
					start: w.start,
					end: w.end,
					confidence: w.confidence,
				}));
			}

			if (words.length > HARD_WORD_LIMIT) {
				this.createFallbackGraphic(`Word count (${words.length}) exceeds limit of ${HARD_WORD_LIMIT}`);
				return;
			}
			if (words.length > SOFT_WORD_LIMIT) {
				console.warn(`RichCaptionPlayer: ${words.length} words exceeds soft limit of ${SOFT_WORD_LIMIT}. Performance may degrade.`);
			}

			const canvasPayload = this.buildCanvasPayload(richCaptionAsset, words);
			const canvasValidation = CanvasRichCaptionAssetSchema.safeParse(canvasPayload);
			if (!canvasValidation.success) {
				console.error("Canvas caption validation failed:", canvasValidation.error?.issues ?? canvasValidation.error);
				this.createFallbackGraphic("Caption validation failed");
				return;
			}
			this.validatedAsset = canvasValidation.data;

			this.fontRegistry = await FontRegistry.getSharedInstance();
			await this.registerFonts(richCaptionAsset);

			this.layoutEngine = new CaptionLayoutEngine(this.fontRegistry);

			const { width, height } = this.getSize();
			const layoutConfig = this.buildLayoutConfig(this.validatedAsset, width, height);

			const canvasTextMeasurer = this.createCanvasTextMeasurer();
			if (canvasTextMeasurer) {
				layoutConfig.measureTextWidth = canvasTextMeasurer;
			}

			this.captionLayout = await this.layoutEngine.layoutCaption(words, layoutConfig);

			this.generatorConfig = createDefaultGeneratorConfig(width, height, 1);

			this.canvas = document.createElement("canvas");
			this.canvas.width = width;
			this.canvas.height = height;
			this.painter = createWebPainter(this.canvas);

			this.renderFrameSync(0);
			this.configureKeyframes();
			this.loadComplete = true;
		} catch (error) {
			console.error("RichCaptionPlayer load failed:", error);
			this.cleanupResources();
			this.createFallbackGraphic("Failed to load caption");
		}
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (!this.isActive() || !this.loadComplete) {
			return;
		}

		const currentTimeMs = this.getPlaybackTime() * 1000;
		this.renderFrameSync(currentTimeMs);
	}

	private renderFrameSync(timeMs: number): void {
		if (!this.layoutEngine || !this.captionLayout || !this.canvas || !this.painter || !this.validatedAsset || !this.generatorConfig) {
			return;
		}

		try {
			const { ops } = generateRichCaptionFrame(
				this.validatedAsset,
				this.captionLayout,
				timeMs,
				this.layoutEngine,
				this.generatorConfig
			);

			const ctx = this.canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

			this.painter.render(ops);

			const tex = pixi.Texture.from(this.canvas);

			if (!this.sprite) {
				this.sprite = new pixi.Sprite(tex);
				this.contentContainer.addChild(this.sprite);
			} else {
				if (this.texture) {
					this.texture.destroy();
				}
				this.sprite.texture = tex;
			}

			this.texture = tex;
		} catch (err) {
			console.error("Failed to render rich caption frame:", err);
		}
	}

	private async fetchAndParseSubtitle(src: string): Promise<WordTiming[]> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), SUBTITLE_FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(src, { signal: controller.signal });
			if (!response.ok) {
				throw new Error(`Subtitle fetch failed: ${response.status}`);
			}
			const content = await response.text();
			return parseSubtitleToWords(content);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async registerFonts(asset: RichCaptionAsset): Promise<void> {
		if (!this.fontRegistry) return;

		const family = asset.font?.family;
		if (family) {
			const assetWeight = asset.font?.weight ? parseInt(String(asset.font.weight), 10) || 400 : 400;
			const resolved = this.resolveFontWithWeight(family, assetWeight);
			if (resolved) {
				await this.registerFontFromUrl(resolved.url, resolved.baseFontFamily, resolved.fontWeight);
			}
		}

		const customFonts = this.buildCustomFontsFromTimeline(asset);
		for (const customFont of customFonts) {
			await this.registerFontFromUrl(customFont.src, customFont.family, parseInt(customFont.weight, 10) || 400);
		}
	}

	private async registerFontFromUrl(url: string, family: string, weight: number): Promise<boolean> {
		if (!this.fontRegistry) return false;
		const cacheKey = `${url}|${family}|${weight}`;
		const cached = this.fontRegistrationCache.get(cacheKey);
		if (cached) return cached;

		const registrationPromise = (async (): Promise<boolean> => {
			try {
				const response = await fetch(url);
				if (!response.ok) return false;
				const bytes = await response.arrayBuffer();
				await this.fontRegistry!.registerFromBytes(bytes, { family, weight: weight.toString() });

				try {
					const fontFace = new FontFace(family, `url(${url})`, {
						weight: weight.toString(),
					});
					await fontFace.load();
					document.fonts.add(fontFace);
				} catch {
					// Browser FontFace registration is best-effort
				}

				return true;
			} catch {
				return false;
			}
		})();

		this.fontRegistrationCache.set(cacheKey, registrationPromise);
		return registrationPromise;
	}

	private resolveFontWithWeight(family: string, requestedWeight: number): { url: string; baseFontFamily: string; fontWeight: number } | null {
		const { baseFontFamily, fontWeight: parsedWeight } = parseFontFamily(family);
		const effectiveWeight = parsedWeight !== 400 ? parsedWeight : requestedWeight;

		const metadataUrl = this.edit.getFontUrlByFamilyAndWeight(baseFontFamily, effectiveWeight);
		if (metadataUrl) {
			return { url: metadataUrl, baseFontFamily, fontWeight: effectiveWeight };
		}

		const editData = this.edit.getEdit();
		const timelineFonts = editData?.timeline?.fonts || [];
		const matchingFont = timelineFonts.find(font => {
			const { full, base } = extractFontNames(font.src);
			const requested = family.toLowerCase();
			return full.toLowerCase() === requested || base.toLowerCase() === requested;
		});

		if (matchingFont) {
			return { url: matchingFont.src, baseFontFamily, fontWeight: effectiveWeight };
		}

		const weightedFamilyName = this.buildWeightedFamilyName(baseFontFamily, effectiveWeight);
		if (weightedFamilyName) {
			const weightedPath = resolveFontPath(weightedFamilyName);
			if (weightedPath) {
				return { url: weightedPath, baseFontFamily, fontWeight: effectiveWeight };
			}
		}

		const builtInPath = resolveFontPath(family);
		if (builtInPath) {
			return { url: builtInPath, baseFontFamily, fontWeight: effectiveWeight };
		}

		return null;
	}

	private buildWeightedFamilyName(baseFontFamily: string, weight: number): string | null {
		const WEIGHT_TO_MODIFIER: Record<number, string> = {
			100: "Thin",
			200: "ExtraLight",
			300: "Light",
			400: "Regular",
			500: "Medium",
			600: "SemiBold",
			700: "Bold",
			800: "ExtraBold",
			900: "Black",
		};

		const modifier = WEIGHT_TO_MODIFIER[weight];
		if (!modifier || modifier === "Regular") return null;

		return `${baseFontFamily} ${modifier}`;
	}

	private buildCustomFontsFromTimeline(asset: RichCaptionAsset): Array<{ src: string; family: string; weight: string }> {
		const requestedFamily = asset.font?.family;
		if (!requestedFamily) return [];

		const { baseFontFamily, fontWeight } = parseFontFamily(requestedFamily);

		const timelineFonts = this.edit.getTimelineFonts();
		const matchingFont = timelineFonts.find(font => {
			const { full, base } = extractFontNames(font.src);
			const requested = requestedFamily.toLowerCase();
			return full.toLowerCase() === requested || base.toLowerCase() === requested;
		});

		if (matchingFont) {
			return [{ src: matchingFont.src, family: baseFontFamily || requestedFamily, weight: fontWeight.toString() }];
		}

		const fontMetadata = this.edit.getFontMetadata();
		const lowerRequested = (baseFontFamily || requestedFamily).toLowerCase();
		const nonGoogleFonts = timelineFonts.filter(font => !isGoogleFontUrl(font.src));

		const metadataMatch = nonGoogleFonts.find(font => {
			const meta = fontMetadata.get(font.src);
			return meta?.baseFamilyName.toLowerCase() === lowerRequested;
		});

		if (metadataMatch) {
			return [{ src: metadataMatch.src, family: baseFontFamily || requestedFamily, weight: fontWeight.toString() }];
		}

		return [];
	}

	private buildCanvasPayload(asset: RichCaptionAsset, words: WordTiming[]): Record<string, unknown> {
		const { width, height } = this.getSize();
		const customFonts = this.buildCustomFontsFromTimeline(asset);
		const { src, ...assetWithoutSrc } = asset;

		return {
			...assetWithoutSrc,
			words: words.map(w => ({ text: w.text, start: w.start, end: w.end, confidence: w.confidence })),
			width,
			height,
			...(customFonts.length > 0 && { customFonts }),
		};
	}

	private buildLayoutConfig(asset: CanvasRichCaptionAsset, frameWidth: number, frameHeight: number): CaptionLayoutConfig {
		const font = asset.font;
		const style = asset.style;

		return {
			frameWidth,
			frameHeight,
			maxWidth: asset.maxWidth ?? 0.9,
			maxLines: asset.maxLines ?? 2,
			position: asset.position ?? "bottom",
			fontSize: font?.size ?? 24,
			fontFamily: font?.family ?? "Roboto",
			fontWeight: String(font?.weight ?? "400"),
			letterSpacing: style?.letterSpacing ?? 0,
			wordSpacing: typeof style?.wordSpacing === "number" ? style.wordSpacing : 0,
			lineHeight: style?.lineHeight ?? 1.2,
			textTransform: (style?.textTransform as CaptionLayoutConfig["textTransform"]) ?? "none",
			pauseThreshold: 500,
		};
	}

	private createCanvasTextMeasurer(): ((text: string, font: string) => number) | undefined {
		try {
			const measureCanvas = document.createElement("canvas");
			const ctx = measureCanvas.getContext("2d");
			if (!ctx) return undefined;

			return (text: string, font: string): number => {
				ctx.font = font;
				return ctx.measureText(text).width;
			};
		} catch {
			return undefined;
		}
	}

	private createFallbackGraphic(message: string): void {
		const { width, height } = this.getSize();

		const style = new pixi.TextStyle({
			fontFamily: "Arial",
			fontSize: 24,
			fill: "#ffffff",
			align: "center",
			wordWrap: true,
			wordWrapWidth: width
		});

		const fallbackText = new pixi.Text(message, style);
		fallbackText.anchor.set(0.5, 0.5);
		fallbackText.x = width / 2;
		fallbackText.y = height / 2;

		this.contentContainer.addChild(fallbackText);
	}

	private cleanupResources(): void {
		if (this.fontRegistry) {
			try {
				this.fontRegistry.release();
			} catch (e) {
				console.warn("Error releasing font registry:", e);
			}
			this.fontRegistry = null;
		}

		this.layoutEngine = null;
		this.captionLayout = null;
		this.validatedAsset = null;
		this.generatorConfig = null;
		this.canvas = null;
		this.painter = null;
	}

	public override dispose(): void {
		super.dispose();
		this.loadComplete = false;

		if (this.texture) {
			this.texture.destroy();
		}
		this.texture = null;

		if (this.sprite) {
			this.sprite.destroy();
			this.sprite = null;
		}

		this.cleanupResources();
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
		const scale = this.getScale();
		return { x: scale, y: scale };
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}
}
