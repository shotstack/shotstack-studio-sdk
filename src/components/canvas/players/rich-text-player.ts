import * as pixi from "pixi.js";
import { Player } from "./player";
import { TextRenderEngine } from "../../../core/text-renderer";
import type { RichTextAsset } from "../../../core/schemas/rich-text-asset";
import type { RenderResult, AnimationFrame, CanvasConfig } from "../../../core/text-renderer/types";
import type { Size } from "../../../core/layouts/geometry";
import type { Clip } from "../../../core/schemas/clip";
import type { Edit } from "../../../core/edit";
import { Texture, Sprite } from "pixi.js";
import type { Texture as PixiTexture, Sprite as PixiSprite } from "pixi.js";

type CanvasConfigInput = Partial<CanvasConfig> & {
	background?: { color: string; opacity?: number; borderRadius?: number };
};
export class RichTextPlayer extends Player {
	private textRenderEngine: TextRenderEngine | null = null;
	private currentFrameIndex: number = -1;
	private animationResult: RenderResult | null = null;
	private isAnimated: boolean = false;
	private animationDuration: number = 0;
	private textContent: string = "";
	private renderPromise: Promise<void> | null = null;
	private hasInitialized: boolean = false;
	private debugMode: boolean = true;
	private animationDurationMs: number = 0;
	private sprite: PixiSprite | null = null;
	private animationSprites: PixiSprite[] = [];
	private textures: PixiTexture[] = [];

	constructor(edit: Edit, clipConfiguration: Clip) {
		super(edit, clipConfiguration);
	}

	override async load(): Promise<void> {
		await super.load();

		const asset = this.clipConfiguration.asset;
		if (!this.isRichTextAsset(asset)) throw new Error("Invalid rich-text asset");

		this.textContent = asset.text || "";
		this.isAnimated = !!asset.animation?.preset;

		if (this.debugMode) {
			console.log(`🎬 Loading RichTextPlayer - isAnimated: ${this.isAnimated}, text: "${this.textContent.substring(0, 50)}..."`);
		}

		this.contentContainer.label = "rich-text-content";
		this.contentContainer.visible = true;
		this.contentContainer.alpha = 1;

		this.getContainer().visible = true;
		this.getContainer().alpha = 1;

		this.textRenderEngine = new TextRenderEngine();

		const config = this.buildRenderConfig(asset);
		await this.textRenderEngine.initialize(config);

		this.renderPromise = this.renderText();
		await this.renderPromise;

		this.hasInitialized = true;

		if (this.debugMode) {
			console.log(
				`✅ Load complete - isAnimated: ${this.isAnimated}, sprites: ${this.animationSprites.length}, container visible: ${
					this.getContainer().visible
				}`
			);
		}
	}

	private isRichTextAsset(asset: unknown): asset is RichTextAsset {
		return !!asset && typeof (asset as { type?: string }).type === "string" && (asset as { type: string }).type === "rich-text";
	}

	private buildRenderConfig(asset: RichTextAsset): CanvasConfigInput {
		const font = asset.font ?? ({} as NonNullable<RichTextAsset["font"]>);
		const style = asset.style ?? ({} as NonNullable<RichTextAsset["style"]>);
		const align = asset.align ?? { horizontal: "center", vertical: "middle" };
		const bg = asset.background;
		const anim = asset.animation;

		const lineHeight = style.lineHeight ?? 1.2;
		const letterSpacing = style.letterSpacing ?? 0;

		const verticalRaw = (align.vertical ?? "middle") as string;
		const verticalNorm =
			verticalRaw === "center"
				? "middle"
				: (["top", "middle", "bottom"] as const).includes(verticalRaw as any)
					? (verticalRaw as "top" | "middle" | "bottom")
					: "middle";

		const width = asset.width ?? this.edit.size.width;
		const height = asset.height ?? this.edit.size.height;
		const pixelRatio = asset.pixelRatio ?? 2;

		const config: CanvasConfigInput = {
			text: asset.text || "",
			width,
			height,
			pixelRatio,

			fontFamily: font.family ?? "Roboto",
			fontSize: font.size ?? 48,
			fontWeight: font.weight ?? "400",
			fontStyle: (font.style ?? "normal") as CanvasConfig["fontStyle"],
			color: font.color ?? "#ffffff",
			opacity: font.opacity ?? 1,

			lineHeight,
			letterSpacing,
			textTransform: (style.textTransform ?? "none") as CanvasConfig["textTransform"],
			textDecoration: (style.textDecoration ?? "none") as CanvasConfig["textDecoration"],
			gradient: style.gradient,

			textAlign: (align.horizontal as "left" | "center" | "right") ?? "center",
			textBaseline: verticalNorm as CanvasConfig["textBaseline"]
		};

		if (asset.stroke) config.stroke = asset.stroke;
		if (asset.shadow) config.shadow = asset.shadow;

		if (bg?.color) {
			config.background = {
				color: bg.color,
				opacity: bg.opacity,
				borderRadius: bg.borderRadius
			};
		}

		if (anim?.preset) {
			const desiredSec = anim.duration ?? this.clipConfiguration.length;
			const clipLenSec = this.clipConfiguration.length >= 1000 ? this.clipConfiguration.length / 1000 : this.clipConfiguration.length;
			const clampedSec = Math.max(0.001, Math.min(typeof desiredSec === "number" ? desiredSec : clipLenSec, clipLenSec));

			config.animation = {
				preset: anim.preset,
				speed: anim.speed ?? 1,
				duration: clampedSec,
				style: anim.style,
				direction: anim.direction as CanvasConfig["animation"] extends infer A ? (A extends { direction?: infer D } ? D : never) : never
			};

			this.animationDurationMs = clampedSec * 1000;
			this.animationDuration = clampedSec;
		}

		if (asset.customFonts) config.customFonts = asset.customFonts;

		const tlFonts = (
			this.edit as {
				timeline?: {
					fonts?: Array<{
						src: string;
						family?: string;
						weight?: string | number;
						style?: "normal" | "italic" | "oblique";
					}>;
				};
			}
		).timeline?.fonts;

		if (tlFonts?.length) {
			config.timelineFonts = tlFonts.map(f => ({
				src: f.src,
				family: f.family,
				weight: f.weight,
				style: f.style
			}));
		}

		return config;
	}

	private async renderText(): Promise<void> {
		if (!this.textRenderEngine) return;

		try {
			const result = await this.textRenderEngine.render(this.textContent);
			this.animationResult = result;

			if (result.type === "animation" && Array.isArray(result.data)) {
				this.isAnimated = true;
				const clipLenSec = this.clipConfiguration.length >= 1000 ? this.clipConfiguration.length / 1000 : this.clipConfiguration.length;

				const metaSec = (result.metadata?.duration ?? clipLenSec) as number;
				const clampedSec = Math.max(0.001, Math.min(metaSec, clipLenSec));

				this.animationDuration = clampedSec;
				this.animationDurationMs = clampedSec * 1000;

				if (this.debugMode) {
					console.log(`📽️ Animation rendered - ${(result.data as AnimationFrame[]).length} frames, duration: ${this.animationDuration}s`);
				}

				await this.setupAnimation(result.data as AnimationFrame[]);
			} else {
				this.isAnimated = false;
				if (this.debugMode) console.log(`📄 Static text rendered`);
				const imageData = result.data as ImageData;
				await this.setupStaticText(imageData);
			}
		} catch (error) {
			console.error("Failed to render rich text:", error);
			this.setupErrorDisplay();
		}
	}

	private async setupStaticText(imageData: ImageData): Promise<void> {
		this.clearSprites();

		const asset = this.clipConfiguration.asset;
		const pixelRatio = this.isRichTextAsset(asset) ? (asset.pixelRatio ?? 1) : 1;
		const scale = 1 / pixelRatio;

		const texture = this.createTextureFromImageData(imageData);
		if (!texture) {
			console.error("Failed to create texture from ImageData");
			return;
		}

		this.textures.push(texture);

		const sprite = new Sprite(texture);
		sprite.scale.set(scale, scale);
		sprite.x = 0;
		sprite.y = 0;
		sprite.alpha = 1;
		sprite.visible = true;

		this.contentContainer.addChild(sprite);
		this.sprite = sprite;

		this.contentContainer.visible = true;
		this.contentContainer.alpha = 1;
		this.getContainer().visible = true;

		if (this.debugMode) console.log(`✅ Static text setup complete`);
	}

	private async setupAnimation(frames: AnimationFrame[]): Promise<void> {
		if (this.debugMode) console.log(`🎬 Setting up animation with ${frames.length} frames`);

		this.clearSprites();

		const asset = this.clipConfiguration.asset;
		const pixelRatio = this.isRichTextAsset(asset) ? (asset.pixelRatio ?? 1) : 1;
		const scale = 1 / pixelRatio;

		for (let i = 0; i < frames.length; i++) {
			const imageData = frames[i].imageData as ImageData;

			const texture = this.createTextureFromImageData(imageData);
			if (!texture) {
				console.error(`Failed to create texture for frame ${i}`);
				continue;
			}

			this.textures.push(texture);

			const sprite = new Sprite(texture);
			sprite.scale.set(scale, scale);
			sprite.x = 0;
			sprite.y = 0;
			sprite.visible = false;
			sprite.alpha = 1;

			this.animationSprites.push(sprite);
			this.contentContainer.addChild(sprite);
		}

		if (this.animationSprites.length > 0) {
			this.animationSprites[0].visible = true;
			this.currentFrameIndex = 0;

			this.contentContainer.visible = true;
			this.contentContainer.alpha = 1;
			this.getContainer().visible = true;

			if (this.debugMode) {
				console.log(`✅ Animation setup complete - ${this.animationSprites.length} frames loaded, first frame visible`);
			}
		}
	}

	private createTextureFromImageData(imageData: ImageData): Texture | null {
		try {
			const canvas = document.createElement("canvas");
			canvas.width = imageData.width;
			canvas.height = imageData.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;

			ctx.putImageData(imageData, 0, 0);
			return Texture.from(canvas);
		} catch (error) {
			console.error("Failed to create texture:", error);
			return null;
		}
	}

	override update(deltaTime: number, elapsed: number): void {
		const wasVisible = this.getContainer().visible;
		super.update(deltaTime, elapsed);
		if (!this.hasInitialized) return;

		const s = this.clipConfiguration.start;
		const l = this.clipConfiguration.length;
		const clipStart = s < 1000 ? s * 1000 : s;
		const clipEnd = clipStart + (l < 1000 ? l * 1000 : l);

		const currentTime = this.edit.playbackTime;
		const isWithinClip = currentTime >= clipStart && currentTime <= clipEnd;

		if (!this.isAnimated) {
			if (this.sprite && this.contentContainer) {
				this.getContainer().visible = true;
				this.getContainer().alpha = isWithinClip ? this.getCurrentOpacity() : 0;
				this.contentContainer.visible = true;
				this.contentContainer.alpha = 1;
			}
			return;
		}

		if (this.animationSprites.length === 0 || !this.contentContainer) return;

		if (!isWithinClip) {
			this.getContainer().visible = true;
			this.getContainer().alpha = 0;
			return;
		}

		this.getContainer().visible = true;
		this.getContainer().alpha = this.getCurrentOpacity();
		this.contentContainer.visible = true;
		this.contentContainer.alpha = 1;

		const localTime = currentTime - clipStart;
		const progress = Math.min(Math.max(localTime / this.animationDurationMs, 0), 1);

		let targetFrame = Math.floor(progress * this.animationSprites.length);
		targetFrame = Math.min(Math.max(targetFrame, 0), this.animationSprites.length - 1);

		if (targetFrame !== this.currentFrameIndex) {
			if (this.currentFrameIndex >= 0 && this.currentFrameIndex < this.animationSprites.length) {
				this.animationSprites[this.currentFrameIndex].visible = false;
			}
			if (targetFrame >= 0 && targetFrame < this.animationSprites.length) {
				this.animationSprites[targetFrame].visible = true;
				this.currentFrameIndex = targetFrame;
			}
		}
	}

	private clearSprites(): void {
		if (this.sprite) {
			if (this.sprite.parent) this.sprite.parent.removeChild(this.sprite);
			this.sprite.destroy({ children: true, texture: false });
			this.sprite = null;
		}

		this.animationSprites.forEach(sprite => {
			if (sprite.parent) sprite.parent.removeChild(sprite);
			sprite.destroy({ children: true, texture: false });
		});
		this.animationSprites = [];
		this.currentFrameIndex = -1;
	}

	private setupErrorDisplay(): void {
		if (!this.contentContainer) return;

		const size = this.getSize();
		const canvas = document.createElement("canvas");
		canvas.width = size.width;
		canvas.height = size.height;

		const ctx = canvas.getContext("2d");
		if (ctx) {
			ctx.fillStyle = "#333333";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = "#ff0000";
			ctx.font = "24px Arial";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText("Text Render Error", canvas.width / 2, canvas.height / 2);
		}

		const texture = Texture.from(canvas);
		this.textures.push(texture);

		this.clearSprites();

		this.sprite = new Sprite(texture);
		this.sprite.width = size.width;
		this.sprite.height = size.height;
		this.contentContainer.addChild(this.sprite);
		this.contentContainer.visible = true;
		this.getContainer().visible = true;
	}

	public async updateTextContent(newText: string, initialConfig?: Clip): Promise<void> {
		if (this.textContent === newText) return;
		this.textContent = newText;

		if (this.textRenderEngine && this.contentContainer) {
			if (this.renderPromise) await this.renderPromise;
			this.clearSprites();
			this.renderPromise = this.renderText();
			await this.renderPromise;

			if (initialConfig) {
				this.edit.events.emit("clip:updated", { clip: this.clipConfiguration, initialConfig });
			}
		}
	}

	public async updateStyle(styleUpdates: Partial<RichTextAsset>): Promise<void> {
		const asset = this.clipConfiguration.asset;
		if (!this.isRichTextAsset(asset)) return;

		Object.assign(asset, styleUpdates);

		if (this.textRenderEngine && this.contentContainer) {
			const config = this.buildRenderConfig(asset);
			this.textRenderEngine.updateConfig(config);

			if (this.renderPromise) await this.renderPromise;
			this.clearSprites();
			this.renderPromise = this.renderText();
			await this.renderPromise;
		}
	}

	override dispose(): void {
		this.clearSprites();

		if (this.contentContainer) this.contentContainer.removeChildren();
		this.textures.forEach(texture => texture.destroy(true));
		this.textures = [];

		if (this.textRenderEngine) {
			this.textRenderEngine.cleanup();
			this.textRenderEngine = null;
		}

		this.animationResult = null;
		this.hasInitialized = false;
		super.dispose();
	}

	override getSize(): Size {
		const asset = this.clipConfiguration.asset;
		if (this.isRichTextAsset(asset)) {
			return { width: asset.width || this.edit.size.width, height: asset.height || this.edit.size.height };
		}
		return this.edit.size;
	}

	private getCurrentOpacity(): number {
		const { opacity } = this.clipConfiguration;

		if (typeof opacity === "number") return opacity;

		if (Array.isArray(opacity) && opacity.length > 0) {
			const first = opacity[0];
			if (typeof first === "number") return first;

			if (first && typeof first === "object") {
				if ("from" in first && typeof (first as { from?: number }).from === "number") {
					return (first as { from: number }).from;
				}
				if ("value" in first && typeof (first as { value?: number }).value === "number") {
					return (first as { value: number }).value;
				}
			}
		}

		return 1;
	}
}
