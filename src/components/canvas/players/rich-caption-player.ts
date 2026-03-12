import { Player, PlayerType } from "@canvas/players/player";
import { Edit } from "@core/edit-session";
import { parseFontFamily, resolveFontPath, getFontDisplayName } from "@core/fonts/font-config";
import { extractFontNames, isGoogleFontUrl } from "@core/fonts/font-utils";
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
	type WordTiming
} from "@shotstack/shotstack-canvas";
import * as pixi from "pixi.js";

const SOFT_WORD_LIMIT = 1500;
const HARD_WORD_LIMIT = 5000;
const SUBTITLE_FETCH_TIMEOUT_MS = 10_000;

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

	private words: WordTiming[] = [];
	private loadComplete: boolean = false;

	private readonly fontRegistrationCache = new Map<string, Promise<boolean>>();
	private lastRegisteredFontKey: string = "";
	private pendingLayoutId: number = 0;
	private resolvedPauseThreshold: number = 500;

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
				this.resolvedPauseThreshold = 5;
			} else {
				words = ((richCaptionAsset as RichCaptionAsset & { words?: WordTiming[] }).words ?? []).map((w: WordTiming) => ({
					text: w.text,
					start: w.start,
					end: w.end,
					confidence: w.confidence
				}));
			}

			if (words.length === 0) {
				this.createFallbackGraphic("No caption words found");
				return;
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
			this.words = words;

			this.fontRegistry = await FontRegistry.getSharedInstance();
			await this.registerFonts(richCaptionAsset);
			this.lastRegisteredFontKey = `${richCaptionAsset.font?.family ?? "Roboto"}|${richCaptionAsset.font?.weight ?? 400}`;

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

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();
		this.reconfigure();
	}

	private async reconfigure(): Promise<void> {
		if (!this.loadComplete || !this.layoutEngine || !this.canvas || !this.painter) {
			return;
		}

		try {
			const asset = this.clipConfiguration.asset as RichCaptionAsset;

			const fontKey = `${asset.font?.family ?? "Roboto"}|${asset.font?.weight ?? 400}`;
			if (fontKey !== this.lastRegisteredFontKey) {
				await this.registerFonts(asset);
				this.lastRegisteredFontKey = fontKey;
			}

			const canvasPayload = this.buildCanvasPayload(asset, this.words);
			const canvasValidation = CanvasRichCaptionAssetSchema.safeParse(canvasPayload);
			if (!canvasValidation.success) {
				console.error("Caption reconfigure validation failed:", canvasValidation.error?.issues);
				return;
			}
			this.validatedAsset = canvasValidation.data;

			const { width, height } = this.getSize();
			const layoutConfig = this.buildLayoutConfig(this.validatedAsset, width, height);
			const canvasTextMeasurer = this.createCanvasTextMeasurer();
			if (canvasTextMeasurer) {
				layoutConfig.measureTextWidth = canvasTextMeasurer;
			}
			this.captionLayout = await this.layoutEngine.layoutCaption(this.words, layoutConfig);

			this.generatorConfig = createDefaultGeneratorConfig(width, height, 1);

			this.renderFrameSync(this.getPlaybackTime() * 1000);
		} catch (error) {
			console.error("RichCaptionPlayer reconfigure failed:", error);
		}
	}

	private renderFrameSync(timeMs: number): void {
		if (!this.layoutEngine || !this.captionLayout || !this.canvas || !this.painter || !this.validatedAsset || !this.generatorConfig) {
			return;
		}

		try {
			const { ops } = generateRichCaptionFrame(this.validatedAsset, this.captionLayout, timeMs, this.layoutEngine, this.generatorConfig);

			if (ops.length === 0 && this.sprite) {
				this.sprite.visible = false;
				return;
			}

			const ctx = this.canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

			this.painter.render(ops);

			if (!this.texture) {
				this.texture = pixi.Texture.from(this.canvas);
			} else {
				this.texture.source.update();
			}

			if (!this.sprite) {
				this.sprite = new pixi.Sprite(this.texture);
				this.contentContainer.addChild(this.sprite);
			}

			this.sprite.visible = true;
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

		const family = asset.font?.family ?? "Roboto";
		const assetWeight = asset.font?.weight ? parseInt(String(asset.font.weight), 10) || 400 : 400;
		const resolved = this.resolveFontWithWeight(family, assetWeight);
		if (resolved) {
			await this.registerFontFromUrl(resolved.url, resolved.baseFontFamily, resolved.fontWeight);
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
					const fontFace = new FontFace(family, bytes, {
						weight: weight.toString()
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
		const resolvedFamily = getFontDisplayName(family);
		const { baseFontFamily, fontWeight: parsedWeight } = parseFontFamily(resolvedFamily);
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
			900: "Black"
		};

		const modifier = WEIGHT_TO_MODIFIER[weight];
		if (!modifier || modifier === "Regular") return null;

		return `${baseFontFamily} ${modifier}`;
	}

	private buildCustomFontsFromTimeline(asset: RichCaptionAsset): Array<{ src: string; family: string; weight: string }> {
		const rawFamily = asset.font?.family;
		if (!rawFamily) return [];

		const requestedFamily = getFontDisplayName(rawFamily);
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
		const resolvedFamily = getFontDisplayName(asset.font?.family ?? "Roboto");

		const payload: Record<string, unknown> = {
			type: asset.type,
			words: words.map(w => ({ text: w.text, start: w.start, end: w.end, confidence: w.confidence })),
			font: { ...asset.font, family: resolvedFamily },
			width,
			height
		};

		const optionalFields: Record<string, unknown> = {
			active: asset.active,
			stroke: asset.stroke,
			shadow: asset.shadow,
			background: asset.background,
			border: asset.border,
			padding: asset.padding,
			style: asset.style,
			wordAnimation: asset.wordAnimation,
			align: asset.align,
			pauseThreshold: this.resolvedPauseThreshold
		};

		for (const [key, value] of Object.entries(optionalFields)) {
			if (value !== undefined) {
				payload[key] = value;
			}
		}

		if (customFonts.length > 0) {
			payload["customFonts"] = customFonts;
		}

		return payload;
	}

	private buildLayoutConfig(asset: CanvasRichCaptionAsset, frameWidth: number, frameHeight: number): CaptionLayoutConfig {
		const { font, style, align, padding: rawPadding } = asset;

		let padding: { top: number; right: number; bottom: number; left: number };
		if (typeof rawPadding === "number") {
			padding = { top: rawPadding, right: rawPadding, bottom: rawPadding, left: rawPadding };
		} else if (rawPadding) {
			const p = rawPadding as { top?: number; right?: number; bottom?: number; left?: number };
			padding = { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 };
		} else {
			padding = { top: 0, right: 0, bottom: 0, left: 0 };
		}

		const totalHorizontalPadding = padding.left + padding.right;
		const availableWidth = totalHorizontalPadding > 0
			? frameWidth - totalHorizontalPadding
			: frameWidth * 0.9;

		const fontSize = font?.size ?? 24;
		const lineHeight = style?.lineHeight ?? 1.2;
		const availableHeight = frameHeight - padding.top - padding.bottom;
		const maxLines = Math.max(1, Math.min(10, Math.floor(availableHeight / (fontSize * lineHeight))));

		return {
			frameWidth,
			frameHeight,
			availableWidth,
			maxLines,
			verticalAlign: align?.vertical ?? "middle",
			horizontalAlign: align?.horizontal ?? "center",
			padding,
			fontSize,
			fontFamily: font?.family ?? "Roboto",
			fontWeight: String(font?.weight ?? "400"),
			letterSpacing: style?.letterSpacing ?? 0,
			wordSpacing: typeof style?.wordSpacing === "number" ? style.wordSpacing : 0,
			lineHeight,
			textTransform: (style?.textTransform as CaptionLayoutConfig["textTransform"]) ?? "none",
			pauseThreshold: this.resolvedPauseThreshold
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

	protected override onDimensionsChanged(): void {
		if (this.words.length === 0) return;

		this.rebuildForCurrentSize();
	}

	private async rebuildForCurrentSize(): Promise<void> {
		const currentTimeMs = this.getPlaybackTime() * 1000;

		if (this.texture) {
			this.texture.destroy();
			this.texture = null;
		}
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		if (this.contentContainer.mask) {
			const { mask } = this.contentContainer;
			this.contentContainer.mask = null;
			if (mask instanceof pixi.Graphics) {
				mask.destroy();
			}
		}

		this.captionLayout = null;
		this.validatedAsset = null;
		this.generatorConfig = null;
		this.canvas = null;
		this.painter = null;

		const { width, height } = this.getSize();
		const asset = this.clipConfiguration.asset as RichCaptionAsset;

		const canvasPayload = this.buildCanvasPayload(asset, this.words);
		const canvasValidation = CanvasRichCaptionAssetSchema.safeParse(canvasPayload);
		if (!canvasValidation.success) {
			return;
		}
		this.validatedAsset = canvasValidation.data;

		this.generatorConfig = createDefaultGeneratorConfig(width, height, 1);

		this.canvas = document.createElement("canvas");
		this.canvas.width = width;
		this.canvas.height = height;
		this.painter = createWebPainter(this.canvas);

		if (!this.layoutEngine) return;

		const layoutConfig = this.buildLayoutConfig(this.validatedAsset, width, height);
		const canvasTextMeasurer = this.createCanvasTextMeasurer();
		if (canvasTextMeasurer) {
			layoutConfig.measureTextWidth = canvasTextMeasurer;
		}

		this.pendingLayoutId += 1;
		const layoutId = this.pendingLayoutId;

		const layout = await this.layoutEngine.layoutCaption(this.words, layoutConfig);

		if (layoutId !== this.pendingLayoutId) return;

		this.captionLayout = layout;

		this.renderFrameSync(currentTimeMs);
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}
}
