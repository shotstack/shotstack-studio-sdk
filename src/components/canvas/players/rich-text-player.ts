import { Player, PlayerType } from "@canvas/players/player";
import { EditEvent } from "@core/events/edit-events";
import { FONT_PATHS, parseFontFamily, resolveFontPath } from "@core/fonts/font-config";
import { type Size, type Vector } from "@layouts/geometry";
import { RichTextAssetSchema, type RichTextAsset } from "@schemas/rich-text-asset";
import { createTextEngine, type DrawOp } from "@shotstack/shotstack-canvas";
import * as opentype from "opentype.js";
import * as pixi from "pixi.js";

// Types for the text engine from @shotstack/shotstack-canvas
type FontDescriptor = { family: string; weight: string | number };
type TextRenderer = { render: (ops: DrawOp[]) => Promise<void> };
type TextEngine = {
	validate: (asset: unknown) => { value: ValidatedRichTextAsset; error?: unknown };
	renderFrame: (asset: ValidatedRichTextAsset, time: number) => Promise<DrawOp[]>;
	createRenderer: (canvas: HTMLCanvasElement) => TextRenderer;
	registerFontFromUrl: (url: string, desc: FontDescriptor) => Promise<void>;
	registerFontFromFile: (path: string, desc: FontDescriptor) => Promise<void>;
	destroy: () => void;
};
type ValidatedRichTextAsset = {
	type: "rich-text";
	text: string;
	width: number;
	height: number;
	font: { family: string; size: number; weight: string | number; color: string; opacity: number };
	style: {
		letterSpacing: number;
		lineHeight: number;
		textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
		textDecoration: "none" | "underline" | "line-through";
		gradient?: { type: "linear" | "radial"; angle: number; stops: { offset: number; color: string }[] };
	};
	stroke: { width: number; color: string; opacity: number };
	shadow: { offsetX: number; offsetY: number; blur: number; color: string; opacity: number };
	background: { color?: string; opacity: number };
	border: { width: number; color: string; opacity: number; radius: number };
	padding?: number | { top: number; right: number; bottom: number; left: number };
	align: { horizontal: "left" | "center" | "right"; vertical: "top" | "middle" | "bottom" };
	animation: {
		preset: "fadeIn" | "slideIn" | "typewriter" | "shift" | "ascend" | "movingLetters";
		speed: number;
		duration?: number;
		style?: "character" | "word";
		direction?: "left" | "right" | "up" | "down";
	};
	customFonts: { src: string; family: string; weight?: string | number; originalFamily?: string }[];
};

const extractFontNames = (url: string): { full: string; base: string } => {
	const filename = url.split("/").pop() || "";
	const withoutExtension = filename.replace(/\.(ttf|otf|woff|woff2)$/i, "");
	const baseFamily = withoutExtension.replace(/-(Bold|Light|Regular|Italic|Medium|SemiBold|Black|Thin|ExtraLight|ExtraBold|Heavy)$/i, "");

	return {
		full: withoutExtension,
		base: baseFamily
	};
};

export class RichTextPlayer extends Player {
	private static readonly PREVIEW_FPS = 60;
	private textEngine: TextEngine | null = null;
	private renderer: TextRenderer | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;
	private lastRenderedTime: number = -1;
	private cachedFrames = new Map<number, pixi.Texture>();
	private isRendering: boolean = false;
	private validatedAsset: ValidatedRichTextAsset | null = null;
	private fontSupportsBold: boolean = false;

	constructor(edit: any, clipConfiguration: any) {
		// Default fit to "cover" for rich-text assets if not provided
		const config = clipConfiguration.fit ? clipConfiguration : { ...clipConfiguration, fit: "cover" };
		super(edit, config, PlayerType.RichText);
	}

	private buildCanvasPayload(richTextAsset: RichTextAsset, fontInfo?: { baseFontFamily: string; fontWeight: number }): any {
		const width = this.clipConfiguration.width || this.edit.size.width;
		const height = this.clipConfiguration.height || this.edit.size.height;

		// Use provided font info or parse fresh (for reconfigure/updateTextContent calls)
		const requestedFamily = richTextAsset.font?.family;
		const { baseFontFamily, fontWeight: parsedWeight } =
			fontInfo ?? (requestedFamily ? parseFontFamily(requestedFamily) : { baseFontFamily: requestedFamily, fontWeight: 400 });

		// Use explicit font.weight if set, otherwise fall back to parsed weight from family name
		const explicitWeight = richTextAsset.font?.weight;
		let fontWeight = parsedWeight;
		if (explicitWeight) {
			fontWeight = typeof explicitWeight === "string" ? parseInt(explicitWeight, 10) || parsedWeight : explicitWeight;
		}

		// Find matching timeline font for customFonts payload
		const timelineFonts = this.edit.getTimelineFonts();
		const matchingFont = requestedFamily
			? timelineFonts.find(font => {
					const { full, base } = extractFontNames(font.src);
					const requested = requestedFamily.toLowerCase();
					return full.toLowerCase() === requested || base.toLowerCase() === requested;
				})
			: undefined;

		const customFonts = matchingFont
			? [{ src: matchingFont.src, family: baseFontFamily || requestedFamily, weight: fontWeight.toString() }]
			: undefined;

		return {
			...richTextAsset,
			width,
			height,
			font: richTextAsset.font ? { ...richTextAsset.font, family: baseFontFamily, weight: fontWeight } : undefined,
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
		try {
			const fontDesc = { family, weight: weight.toString() };
			if (source.type === "url") {
				await this.textEngine.registerFontFromUrl(source.path, fontDesc);
			} else {
				await this.textEngine.registerFontFromFile(source.path, fontDesc);
			}
			return true;
		} catch (error) {
			console.warn(`Failed to load font ${family}:`, error);
			return false;
		}
	}

	private async checkFontCapabilities(fontUrl: string): Promise<void> {
		try {
			const response = await fetch(fontUrl);
			const buffer = await response.arrayBuffer();
			const font = opentype.parse(buffer);

			// Check for fvar table (variable font) with weight axis
			const fvar = font.tables["fvar"] as { axes?: Array<{ tag: string }> } | undefined;
			if (fvar?.axes) {
				const weightAxis = fvar.axes.find(axis => axis.tag === "wght");
				this.fontSupportsBold = !!weightAxis;
			} else {
				this.fontSupportsBold = false;
			}
		} catch (error) {
			console.warn("Failed to check font capabilities:", error);
			this.fontSupportsBold = false;
		}
	}

	public supportsBold(): boolean {
		return this.fontSupportsBold;
	}

	private resolveFont(family: string): { url: string; baseFontFamily: string; fontWeight: number } | null {
		const { baseFontFamily, fontWeight } = parseFontFamily(family);
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
		const fontUrl = await this.ensureFontRegistered(richTextAsset);

		if (fontUrl) {
			await this.checkFontCapabilities(fontUrl);
			this.edit.events.emit(EditEvent.FontCapabilitiesChanged, { supportsBold: this.fontSupportsBold });
		}

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
			this.renderFrameSafe(this.getCurrentTime() / 1000);
		}
	}

	private async ensureFontRegistered(richTextAsset: RichTextAsset): Promise<string | null> {
		if (!this.textEngine) return null;

		const family = richTextAsset.font?.family;
		if (!family) return null;

		const resolved = this.resolveFont(family);
		if (!resolved) return null;

		// Use explicit weight from asset if set, otherwise use parsed weight from family name
		const explicitWeight = richTextAsset.font?.weight;
		let { fontWeight } = resolved;
		if (explicitWeight) {
			fontWeight = typeof explicitWeight === "string" ? parseInt(explicitWeight, 10) || resolved.fontWeight : explicitWeight;
		}

		await this.registerFont(resolved.baseFontFamily, fontWeight, { type: "url", path: resolved.url });
		return resolved.url;
	}

	public override async load(): Promise<void> {
		await super.load();

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;

		try {
			const validationResult = RichTextAssetSchema.safeParse(richTextAsset);
			if (!validationResult.success) {
				console.error("Rich-text asset validation failed:", validationResult.error);
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

			// Register font and check capabilities
			if (requestedFamily) {
				const resolved = this.resolveFont(requestedFamily);
				if (resolved) {
					// Use explicit weight from asset if set, otherwise use parsed weight from family name
					const explicitWeight = richTextAsset.font?.weight;
					let { fontWeight } = resolved;
					if (explicitWeight) {
						fontWeight = typeof explicitWeight === "string" ? parseInt(explicitWeight, 10) || resolved.fontWeight : explicitWeight;
					}
					await this.registerFont(resolved.baseFontFamily, fontWeight, { type: "url", path: resolved.url });
					await this.checkFontCapabilities(resolved.url);
				} else {
					console.warn(`Font ${requestedFamily} not found. Available:`, Object.keys(FONT_PATHS));
				}
			}

			await this.renderFrame(0);
			this.configureKeyframes();
		} catch (error) {
			console.error("Failed to initialize rich text player:", error);
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
			const ops = await this.textEngine.renderFrame(this.validatedAsset, timeSeconds);

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
	}
	private renderFrameSafe(timeSeconds: number): void {
		if (this.isRendering) {
			// Show nearest cached frame instead of skipping entirely
			const cacheKey = Math.floor(timeSeconds * RichTextPlayer.PREVIEW_FPS);
			const cachedTexture = this.cachedFrames.get(cacheKey);
			if (cachedTexture && this.sprite && this.sprite.texture !== cachedTexture) {
				this.sprite.texture = cachedTexture;
			}
			return;
		}

		this.isRendering = true;
		this.renderFrame(timeSeconds)
			.catch(err => console.error("Failed to render rich text frame:", err))
			.finally(() => {
				this.isRendering = false;
			});
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		// Reset render state on seek to prevent race conditions
		if (elapsed === 101) {
			this.isRendering = false;
			this.lastRenderedTime = -1;
		}

		if (!this.isActive()) {
			return;
		}

		if (this.textEngine && this.renderer && !this.isRendering) {
			const currentTimeSeconds = this.getCurrentTime() / 1000;
			const frameInterval = 1 / 60; // Always render at 60fps for smooth preview

			if (Math.abs(currentTimeSeconds - this.lastRenderedTime) > frameInterval) {
				this.renderFrameSafe(currentTimeSeconds);
			}
		}
	}

	public override dispose(): void {
		super.dispose();

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

	protected override getFitScale(): number {
		return 1;
	}

	protected override getContainerScale(): Vector {
		// Rich text should not be fit-scaled - use only the user-defined scale
		const scale = this.getScale();
		return { x: scale, y: scale };
	}

	protected override supportsEdgeResize(): boolean {
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

		this.renderFrameSafe(this.getCurrentTime() / 1000);
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
			this.renderFrameSafe(this.getCurrentTime() / 1000);
		}
	}

	private getCurrentTime(): number {
		return this.edit.playbackTime - this.getStart();
	}

	public getCacheSize(): number {
		return this.cachedFrames.size;
	}
}
