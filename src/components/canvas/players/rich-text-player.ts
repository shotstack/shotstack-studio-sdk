import { Player } from "@canvas/players/player";
import { type Size } from "@layouts/geometry";
import { RichTextAssetSchema, type RichTextAsset } from "@schemas/rich-text-asset";
import { createTextEngine } from "@shotstack/shotstack-canvas";
import { TextEngine, TextRenderer, ValidatedRichTextAsset } from "@timeline/types";
import * as pixi from "pixi.js";

interface CanvasRichTextPayload extends RichTextAsset {
	width: number;
	height: number;
	customFonts?: Array<{ src: string; family: string; weight: string }>;
}

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
	private textEngine: TextEngine | null = null;
	private renderer: TextRenderer | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private texture: pixi.Texture | null = null;
	private sprite: pixi.Sprite | null = null;
	private lastRenderedTime: number = -1;
	private cachedFrames = new Map<number, pixi.Texture>();
	private isRendering: boolean = false;
	private targetFPS: number = 30;
	private validatedAsset: ValidatedRichTextAsset | null = null;

	private getResolvedDimensions(): Size {
		const editData = this.edit.getEdit();
		return {
			width: this.clipConfiguration.width || editData?.output?.size?.width || this.edit.size.width,
			height: this.clipConfiguration.height || editData?.output?.size?.height || this.edit.size.height
		};
	}

	private buildCanvasPayload(richTextAsset: RichTextAsset): CanvasRichTextPayload {
		const { width, height } = this.getResolvedDimensions();
		const editData = this.edit.getEdit();

		// Build customFonts array internally
		let customFonts: Array<{ src: string; family: string; weight: string }> | undefined;
		if (Array.isArray(editData?.timeline?.fonts) && editData.timeline.fonts.length > 0) {
			const requestedFamily = richTextAsset.font?.family;
			if (requestedFamily) {
				const matchingFont = editData.timeline.fonts?.find(font => {
					const { full, base } = extractFontNames(font.src);
					const requested = requestedFamily.toLowerCase();
					return full.toLowerCase() === requested || base.toLowerCase() === requested;
				});

				if (matchingFont) {
					customFonts = [
						{
							src: matchingFont.src,
							family: requestedFamily,
							weight: richTextAsset.font?.weight?.toString() || "400"
						}
					];
				}
			}
		}

		return {
			...richTextAsset,
			width,
			height,
			...(customFonts && { customFonts })
		};
	}

	private createFontMapping(): Map<string, string> {
		const fontMap = new Map<string, string>();

		fontMap.set("Arapey", "/assets/fonts/Arapey-Regular.ttf");
		fontMap.set("ClearSans", "/assets/fonts/ClearSans-Regular.ttf");
		fontMap.set("Clear Sans", "/assets/fonts/ClearSans-Regular.ttf");
		fontMap.set("DidactGothic", "/assets/fonts/DidactGothic-Regular.ttf");
		fontMap.set("Didact Gothic", "/assets/fonts/DidactGothic-Regular.ttf");
		fontMap.set("Montserrat", "/assets/fonts/Montserrat-SemiBold.ttf");
		fontMap.set("MovLette", "/assets/fonts/MovLette.ttf");
		fontMap.set("OpenSans", "/assets/fonts/OpenSans-Bold.ttf");
		fontMap.set("Open Sans", "/assets/fonts/OpenSans-Bold.ttf");
		fontMap.set("PermanentMarker", "/assets/fonts/PermanentMarker-Regular.ttf");
		fontMap.set("Permanent Marker", "/assets/fonts/PermanentMarker-Regular.ttf");
		fontMap.set("Roboto", "/assets/fonts/Roboto-BlackItalic.ttf");
		fontMap.set("SueEllenFrancisco", "/assets/fonts/SueEllenFrancisco.ttf");
		fontMap.set("Sue Ellen Francisco", "/assets/fonts/SueEllenFrancisco.ttf");
		fontMap.set("UniNeue", "/assets/fonts/UniNeue-Bold.otf");
		fontMap.set("Uni Neue", "/assets/fonts/UniNeue-Bold.otf");
		fontMap.set("WorkSans", "/assets/fonts/WorkSans-Light.ttf");
		fontMap.set("Work Sans", "/assets/fonts/WorkSans-Light.ttf");

		return fontMap;
	}

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();

		for (const texture of this.cachedFrames.values()) {
			texture.destroy();
		}
		this.cachedFrames.clear();
		this.lastRenderedTime = -1;

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;
		if (this.textEngine) {
			const canvasPayload = this.buildCanvasPayload(richTextAsset);
			const { value: validated } = this.textEngine.validate(canvasPayload);
			this.validatedAsset = validated;
		}

		if (this.textEngine && this.renderer) {
			this.renderFrameSafe(this.getCurrentTime() / 1000);
		}
	}

	public override async load(): Promise<void> {
		await super.load();

		const richTextAsset = this.clipConfiguration.asset as RichTextAsset;

		try {
			const editData = this.edit.getEdit();
			this.targetFPS = editData?.output?.fps || 30;

			// Validate the rich-text asset schema (without width, height, customFonts)
			const validationResult = RichTextAssetSchema.safeParse(richTextAsset);
			if (!validationResult.success) {
				console.error("Rich-text asset validation failed:", validationResult.error);
				this.createFallbackText(richTextAsset);
				return;
			}

			// Build canvas payload with dimensions and customFonts
			const canvasPayload = this.buildCanvasPayload(richTextAsset);

			this.textEngine = (await createTextEngine({
				width: canvasPayload.width,
				height: canvasPayload.height,
				fps: this.targetFPS
			})) as TextEngine;

			const { value: validated } = this.textEngine!.validate(canvasPayload);
			this.validatedAsset = validated;

			const fontMap = this.createFontMapping();

			this.canvas = document.createElement("canvas");
			this.canvas.width = canvasPayload.width;
			this.canvas.height = canvasPayload.height;

			this.renderer = this.textEngine!.createRenderer(this.canvas);

			const timelineFonts = editData?.timeline?.fonts || [];

			if (timelineFonts.length > 0) {
				const requestedFamily = richTextAsset.font?.family;
				if (requestedFamily) {
					const matchingFont = timelineFonts.find(font => {
						const { full, base } = extractFontNames(font.src);
						const requested = requestedFamily.toLowerCase();
						return full.toLowerCase() === requested || base.toLowerCase() === requested;
					});

					if (matchingFont) {
						try {
							const fontDesc = {
								family: requestedFamily,
								weight: richTextAsset.font?.weight?.toString() || "400"
							};
							await this.textEngine!.registerFontFromUrl(matchingFont.src, fontDesc);
						} catch (error) {
							console.warn(`Failed to load font ${requestedFamily}:`, error);
						}
					}
				}
			} else if (richTextAsset.font?.family) {
				const fontFamily = richTextAsset.font.family;
				const fontPath = fontMap.get(fontFamily);

				if (fontPath) {
					try {
						const fontDesc = {
							family: richTextAsset.font.family,
							weight: richTextAsset.font.weight || "400"
						};
						await this.textEngine!.registerFontFromFile(fontPath, fontDesc);
					} catch (error) {
						console.warn(`Failed to load local font: ${fontFamily}`, error);
					}
				} else {
					console.warn(`Font ${fontFamily} not found in local assets. Available fonts:`, Array.from(fontMap.keys()));
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

		const cacheKey = Math.floor(timeSeconds * this.targetFPS);

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
		const { width: containerWidth, height: containerHeight } = this.getResolvedDimensions();

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
		if (this.isRendering) return;

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

		if (this.textEngine && this.renderer && !this.isRendering) {
			const currentTimeSeconds = this.getCurrentTime() / 1000;
			const editData = this.edit.getEdit();
			const targetFPS = editData?.output?.fps || 30;
			const frameInterval = 1 / targetFPS;

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

		if (this.texture && !this.cachedFrames.has(Math.floor(this.lastRenderedTime * this.targetFPS))) {
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
		return this.getResolvedDimensions();
	}

	protected override getFitScale(): number {
		return 1;
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
		return this.edit.playbackTime;
	}
}
