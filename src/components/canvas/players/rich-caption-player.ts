import { Player, PlayerType } from "@canvas/players/player";
import { Edit } from "@core/edit-session";
import { parseFontFamily, resolveFontPath, getFontDisplayName } from "@core/fonts/font-config";
import { extractFontNames, isGoogleFontUrl } from "@core/fonts/font-utils";
import { isAliasReference, sec, type Seconds } from "@core/timing/types";
import { type Size, type Vector } from "@layouts/geometry";
import { RichCaptionAssetSchema, type RichCaptionAsset, type ResolvedClip } from "@schemas";
import {
	FontRegistry,
	CaptionLayoutEngine,
	generateRichCaptionFrame,
	createDefaultGeneratorConfig,
	createWebPainter,
	buildCaptionLayoutConfig,
	resolveCaptionFonts,
	parseSubtitleToWords,
	CanvasRichCaptionAssetSchema,
	type CanvasRichCaptionAsset,
	type CaptionLayout,
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
	private currentRender: Promise<void> | null = null; // serialises the async paint so captures await a finished frame
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;
	private fallbackText: pixi.Text | null = null;

	private words: WordTiming[] = [];
	private loadComplete: boolean = false;
	private isPlaceholder = false;

	private readonly fontRegistrationCache = new Map<string, Promise<boolean>>();
	private pendingLayoutId: number = 0;
	private resolvedPauseThreshold: number = 500;
	private assetLoadInProgress = false;
	private renderConfigurationKey: string | null = null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		const { fit, ...configWithoutFit } = clipConfiguration;
		super(edit, configWithoutFit, PlayerType.RichCaption);
	}

	private static createPlaceholderWords(clipLengthMs: number): WordTiming[] {
		const phrase = ["Your", "captions", "will", "appear", "here"];
		const msPerWord = 400;
		const phraseGapMs = 600;
		const phraseDurationMs = phrase.length * msPerWord + phraseGapMs;
		const spokenDurationMs = phrase.length * msPerWord;
		const totalPhrases = Math.max(1, Math.ceil((clipLengthMs - spokenDurationMs) / phraseDurationMs) + 1);
		const words: WordTiming[] = [];

		for (let p = 0; p < totalPhrases; p += 1) {
			const phraseStart = p * phraseDurationMs;
			for (let w = 0; w < phrase.length; w += 1) {
				const start = phraseStart + w * msPerWord;
				words.push({
					text: phrase[w],
					start: Math.round(start),
					end: Math.round(start + msPerWord),
					confidence: 1
				});
			}
		}

		return words;
	}

	private static getWordsDuration(words: WordTiming[]): Seconds | null {
		let maxEnd = Number.NEGATIVE_INFINITY;
		for (const word of words) {
			const end = Number(word.end);
			if (Number.isFinite(end)) maxEnd = Math.max(maxEnd, end);
		}
		return Number.isFinite(maxEnd) ? sec((maxEnd + 500) / 1000) : null;
	}

	public override async load(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		await super.load();
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
		await this.loadCurrentAsset(false, mediaTimingRevision);
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (!this.isActive() || !this.loadComplete) {
			return;
		}

		const currentTimeMs = this.getPlaybackTime() * 1000;
		this.renderFrameSync(currentTimeMs);
	}

	/**
	 * Render the exact playhead frame to completion for an off-playback capture. The web painter is
	 * async, so this awaits {@link renderFrame} (which awaits the paint) before captureFrame extracts —
	 * otherwise the snapshot is a half-drawn caption. Asset loading is awaited by the caller.
	 * @internal
	 */
	public override async prepareStaticRender(): Promise<void> {
		if (this.loadComplete) await this.renderFrame(this.getPlaybackTime() * 1000);
	}

	public override async reloadAsset(): Promise<void> {
		await this.loadCurrentAsset(true);
	}

	private async loadCurrentAsset(propagateError: boolean, mediaTimingRevision = this.beginMediaTimingLoad()): Promise<void> {
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
		const pipelineRevision = this.beginPipelineBuild();
		const asset = this.clipConfiguration.asset as RichCaptionAsset;

		// Re-loading the same unresolved alias only needs to publish its new base identity.
		// Styling and length changes use reconfigure(), which preserves the placeholder pipeline.
		if (asset.src && isAliasReference(asset.src) && this.loadComplete && this.isPlaceholder) {
			this.assetLoadInProgress = false;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			return;
		}

		this.assetLoadInProgress = true;
		let timingPublished = false;

		try {
			const validationResult = RichCaptionAssetSchema.safeParse(asset);
			if (!validationResult.success) {
				this.completeMediaTimingLoad(mediaTimingRevision, null);
				this.replacePipelineWithFallback("Invalid caption asset");
				return;
			}

			const isPlaceholder = Boolean(asset.src && isAliasReference(asset.src));
			const pauseThreshold = asset.src && !isPlaceholder ? 5 : 500;
			let words: WordTiming[];
			if (isPlaceholder) {
				words = RichCaptionPlayer.createPlaceholderWords(this.getLength() * 1000);
			} else if (asset.src) {
				words = await this.fetchAndParseSubtitle(asset.src);
			} else {
				words = ((asset as RichCaptionAsset & { words?: WordTiming[] }).words ?? []).map(word => ({ ...word }));
			}

			if (!this.isPipelineBuildCurrent(pipelineRevision, mediaTimingRevision)) return;

			if (words.length === 0) {
				this.completeMediaTimingLoad(mediaTimingRevision, null);
				this.replacePipelineWithFallback("No caption words found");
				return;
			}
			if (words.length > HARD_WORD_LIMIT) {
				this.completeMediaTimingLoad(mediaTimingRevision, null);
				this.replacePipelineWithFallback(`Word count (${words.length}) exceeds limit of ${HARD_WORD_LIMIT}`);
				return;
			}
			if (words.length > SOFT_WORD_LIMIT) {
				console.warn(`RichCaptionPlayer: ${words.length} words exceeds soft limit of ${SOFT_WORD_LIMIT}. Performance may degrade.`);
			}

			this.completeMediaTimingLoad(mediaTimingRevision, isPlaceholder ? null : RichCaptionPlayer.getWordsDuration(words));
			timingPublished = true;
			await this.buildRenderPipeline(asset, words, {
				pipelineRevision,
				mediaTimingRevision,
				isPlaceholder,
				needsResolution: isPlaceholder,
				pauseThreshold,
				renderTimeMs: 0
			});
		} catch (error) {
			if (!this.isPipelineBuildCurrent(pipelineRevision, mediaTimingRevision)) return;
			if (!timingPublished) this.completeMediaTimingLoad(mediaTimingRevision, null);
			this.replacePipelineWithFallback("Failed to load caption");
			if (propagateError) throw error;
			console.error("RichCaptionPlayer load failed:", error);
		} finally {
			if (this.isMediaTimingLoadCurrent(mediaTimingRevision)) this.assetLoadInProgress = false;
		}
	}

	private beginPipelineBuild(): number {
		this.pendingLayoutId += 1;
		return this.pendingLayoutId;
	}

	private isPipelineBuildCurrent(pipelineRevision: number, mediaTimingRevision?: number): boolean {
		return pipelineRevision === this.pendingLayoutId && (mediaTimingRevision === undefined || this.isMediaTimingLoadCurrent(mediaTimingRevision));
	}

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();
		if (this.loadComplete && this.renderConfigurationKey === this.getRenderConfigurationKey()) return;
		this.reconfigure();
	}

	private getRenderConfigurationKey(): string {
		const { width, height } = this.getSize();
		return JSON.stringify([this.clipConfiguration.asset, width, height, this.isPlaceholder ? this.getLength() : null]);
	}

	private async reconfigure(): Promise<void> {
		if (this.assetLoadInProgress || !this.loadComplete || !this.layoutEngine || !this.canvas || !this.painter) {
			return;
		}

		const pipelineRevision = this.beginPipelineBuild();
		try {
			const asset = this.clipConfiguration.asset as RichCaptionAsset;
			const words = this.isPlaceholder ? RichCaptionPlayer.createPlaceholderWords(this.getLength() * 1000) : this.words.map(word => ({ ...word }));
			await this.buildRenderPipeline(asset, words, {
				pipelineRevision,
				isPlaceholder: this.isPlaceholder,
				needsResolution: this.needsResolution,
				pauseThreshold: this.resolvedPauseThreshold,
				renderTimeMs: this.getPlaybackTime() * 1000
			});
		} catch (error) {
			if (this.isPipelineBuildCurrent(pipelineRevision)) {
				console.error("RichCaptionPlayer reconfigure failed:", error);
			}
		}
	}

	private async buildRenderPipeline(
		asset: RichCaptionAsset,
		words: WordTiming[],
		options: {
			pipelineRevision: number;
			mediaTimingRevision?: number;
			isPlaceholder: boolean;
			needsResolution: boolean;
			pauseThreshold: number;
			renderTimeMs: number;
		}
	): Promise<void> {
		if (!this.isPipelineBuildCurrent(options.pipelineRevision, options.mediaTimingRevision)) return;
		const { width, height } = this.getSize();
		const canvasPayload = this.buildCanvasPayload(asset, words, options.pauseThreshold, { width, height });
		const canvasValidation = CanvasRichCaptionAssetSchema.safeParse(canvasPayload);
		if (!canvasValidation.success) {
			if (this.isPipelineBuildCurrent(options.pipelineRevision, options.mediaTimingRevision)) {
				console.error("Canvas caption validation failed:", canvasValidation.error?.issues ?? canvasValidation.error);
				this.replacePipelineWithFallback("Caption validation failed");
			}
			return;
		}

		let fontRegistry: FontRegistry | null = null;
		let committed = false;
		try {
			fontRegistry = await FontRegistry.getSharedInstance();
			if (!this.isPipelineBuildCurrent(options.pipelineRevision, options.mediaTimingRevision)) return;

			await this.registerFonts(asset, fontRegistry);
			if (!this.isPipelineBuildCurrent(options.pipelineRevision, options.mediaTimingRevision)) return;

			const layoutEngine = new CaptionLayoutEngine(fontRegistry);
			const layoutConfig = buildCaptionLayoutConfig(canvasValidation.data, width, height);
			const captionLayout = await layoutEngine.layoutCaption(words, layoutConfig);
			if (!this.isPipelineBuildCurrent(options.pipelineRevision, options.mediaTimingRevision)) return;

			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const painter = createWebPainter(canvas);

			this.destroyRenderedOutput();
			const previousRegistry = this.fontRegistry;
			this.fontRegistry = fontRegistry;
			this.layoutEngine = layoutEngine;
			this.captionLayout = captionLayout;
			this.validatedAsset = canvasValidation.data;
			this.generatorConfig = createDefaultGeneratorConfig(width, height, 1);
			this.canvas = canvas;
			this.painter = painter;
			this.words = words;
			this.isPlaceholder = options.isPlaceholder;
			this.needsResolution = options.needsResolution;
			this.resolvedPauseThreshold = options.pauseThreshold;
			this.loadComplete = true;
			this.renderConfigurationKey = this.getRenderConfigurationKey();
			committed = true;
			this.releaseFontRegistry(previousRegistry);

			this.renderFrameSync(options.renderTimeMs);
			this.configureKeyframes();
		} finally {
			if (fontRegistry && !committed) this.releaseFontRegistry(fontRegistry);
		}
	}

	/**
	 * Render the caption at `timeMs`, serialised so the shared canvas isn't cleared mid-paint.
	 * Awaited by {@link prepareStaticRender} for off-playback captures.
	 */
	private async renderFrame(timeMs: number): Promise<void> {
		while (this.currentRender) {
			await this.currentRender;
		}
		const pipelineRevision = this.pendingLayoutId;
		const render = this.paintFrame(timeMs, pipelineRevision).finally(() => {
			if (this.currentRender === render) this.currentRender = null;
		});
		this.currentRender = render;
		await render;
	}

	/** Fire-and-forget render for the live tick and lifecycle hooks; the texture updates when the paint settles. */
	private renderFrameSync(timeMs: number): void {
		this.renderFrame(timeMs).catch(() => {});
	}

	/**
	 * Paint the caption frame to completion. The web painter is async (glyph fills resolve
	 * asynchronously), so the Pixi texture is only updated once the paint has finished — otherwise a
	 * snapshot captures a half-drawn canvas (a single glyph).
	 */
	private async paintFrame(timeMs: number, pipelineRevision: number): Promise<void> {
		if (!this.isPipelineBuildCurrent(pipelineRevision)) return;
		if (!this.layoutEngine || !this.captionLayout || !this.canvas || !this.painter || !this.validatedAsset || !this.generatorConfig) {
			return;
		}
		const { layoutEngine, captionLayout, canvas, painter, validatedAsset, generatorConfig } = this;

		try {
			const { ops } = generateRichCaptionFrame(validatedAsset, captionLayout, timeMs, layoutEngine, generatorConfig);

			if (ops.length === 0 && this.sprite) {
				if (this.isPipelineBuildCurrent(pipelineRevision)) this.sprite.visible = false;
				return;
			}

			const ctx = canvas.getContext("2d");
			if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

			await painter.render(ops);
			if (!this.isPipelineBuildCurrent(pipelineRevision)) return;

			if (!this.texture) {
				this.texture = pixi.Texture.from(canvas);
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

	// Shared font resolution used by both registration and the render payload, so the registered
	// face and the rendered family are always the same. Delegates to the canvas resolver.
	private resolveFontsForAsset(asset: RichCaptionAsset) {
		const family = asset.font?.family ?? "Roboto";
		const weight = asset.font?.weight ? parseInt(String(asset.font.weight), 10) || 400 : 400;
		const fontNameMap = new Map<string, string>();
		for (const [src, meta] of this.edit.getFontMetadata()) fontNameMap.set(src, meta.baseFamilyName);
		const activeFamily = asset.active?.font?.family;
		const activeWeight = asset.active?.font?.weight;
		return resolveCaptionFonts({
			family,
			weight,
			timelineFonts: this.edit.getTimelineFonts(),
			fontNameMap,
			...(activeFamily ? { activeFamily } : {}),
			...(activeWeight != null ? { activeWeight: activeWeight as string | number } : {})
		});
	}

	private async registerFonts(asset: RichCaptionAsset, fontRegistry: FontRegistry): Promise<void> {
		const family = asset.font?.family ?? "Roboto";
		const assetWeight = asset.font?.weight ? parseInt(String(asset.font.weight), 10) || 400 : 400;

		// Registration and the render payload (buildCanvasPayload) share this one resolution, so the
		// render looks up exactly the face that was registered.
		const resolution = this.resolveFontsForAsset(asset);

		if (resolution.matched) {
			for (const font of resolution.fonts) {
				if (font.src) await this.registerFontFromUrl(fontRegistry, font.src, font.family, parseInt(font.weight, 10) || 400);
			}
			return;
		}

		const resolved = this.resolveFontWithWeight(family, assetWeight);
		if (resolved) {
			await this.registerFontFromUrl(fontRegistry, resolved.url, resolved.baseFontFamily, resolved.fontWeight);
		}
	}

	private async registerFontFromUrl(fontRegistry: FontRegistry, url: string, family: string, weight: number): Promise<boolean> {
		const cacheKey = `${url}|${family}|${weight}`;
		const cached = this.fontRegistrationCache.get(cacheKey);
		if (cached) return cached;

		const registrationPromise = (async (): Promise<boolean> => {
			try {
				const response = await fetch(url);
				if (!response.ok) return false;
				const bytes = await response.arrayBuffer();
				await fontRegistry.registerFromBytes(bytes, { family, weight: weight.toString() });

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

	private buildCanvasPayload(
		asset: RichCaptionAsset,
		words: WordTiming[],
		pauseThreshold: number,
		size: { width: number; height: number }
	): Record<string, unknown> {
		const { width, height } = size;
		// Use the same resolution as registration, so the rendered family matches the registered face.
		const resolution = this.resolveFontsForAsset(asset);
		const resolvedFamily = resolution.matched ? resolution.resolvedFamily : getFontDisplayName(asset.font?.family ?? "Roboto");
		const customFonts = resolution.matched
			? resolution.fonts.filter(f => f.src).map(f => ({ src: f.src as string, family: f.family, weight: f.weight }))
			: this.buildCustomFontsFromTimeline(asset);

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
			animation: asset.animation,
			align: asset.align,
			pauseThreshold
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

		this.fallbackText = new pixi.Text(message, style);
		this.fallbackText.anchor.set(0.5, 0.5);
		this.fallbackText.x = width / 2;
		this.fallbackText.y = height / 2;

		this.contentContainer.addChild(this.fallbackText);
	}

	private destroyRenderedOutput(): void {
		if (this.sprite) {
			this.contentContainer.removeChild(this.sprite);
			this.sprite.destroy();
			this.sprite = null;
		}
		this.texture?.destroy();
		this.texture = null;

		if (this.fallbackText) {
			this.contentContainer.removeChild(this.fallbackText);
			this.fallbackText.destroy();
			this.fallbackText = null;
		}
	}

	private replacePipelineWithFallback(message: string): void {
		this.beginPipelineBuild();
		this.loadComplete = false;
		this.destroyRenderedOutput();
		this.cleanupResources();
		this.words = [];
		this.isPlaceholder = false;
		this.needsResolution = false;
		this.createFallbackGraphic(message);
	}

	private releaseFontRegistry(fontRegistry: FontRegistry | null): void {
		if (!fontRegistry) return;
		try {
			fontRegistry.release();
		} catch (error) {
			console.warn("Error releasing font registry:", error);
		}
	}

	private cleanupResources(): void {
		this.releaseFontRegistry(this.fontRegistry);
		this.fontRegistry = null;
		this.fontRegistrationCache.clear();

		this.layoutEngine = null;
		this.captionLayout = null;
		this.validatedAsset = null;
		this.generatorConfig = null;
		this.canvas = null;
		this.painter = null;
		this.renderConfigurationKey = null;
	}

	public override dispose(): void {
		this.beginPipelineBuild();
		this.loadComplete = false;
		this.assetLoadInProgress = false;
		this.destroyRenderedOutput();
		this.cleanupResources();
		super.dispose();
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

		this.reconfigure();
	}

	public override supportsEdgeResize(): boolean {
		return true;
	}
}
