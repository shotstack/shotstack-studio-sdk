import * as pixi from "pixi.js";
import { Player } from "./player";
import { TextRenderEngine } from "../../../core/text-renderer";
import type { RichTextAsset } from "../../../core/schemas/rich-text-asset";
import type { RenderResult, AnimationFrame } from "../../../core/text-renderer/types";
import type { Size } from "../../../core/layouts/geometry";
import type { Clip } from "../../../core/schemas/clip";
import type { Edit } from "../../../core/edit";
import { Texture, Sprite } from "pixi.js";

export class RichTextPlayer extends Player {
	private textRenderEngine: TextRenderEngine | null = null;
	private sprite: pixi.Sprite | null = null;
	private animationSprites: pixi.Sprite[] = [];
	private currentFrameIndex: number = -1;
	private animationResult: RenderResult | null = null;
	private isAnimated: boolean = false;
	private animationDuration: number = 0;
	private textContent: string = "";
	private renderPromise: Promise<void> | null = null;
	private textures: pixi.Texture[] = [];
	private hasInitialized: boolean = false;
	private debugMode: boolean = true;
	private animationDurationMs: number = 0;

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

	private isRichTextAsset(asset: any): asset is RichTextAsset {
		return asset && asset.type === "rich-text";
	}

	private buildRenderConfig(asset: RichTextAsset): any {
		const font = asset.font ?? ({} as NonNullable<RichTextAsset["font"]>);
		const style = asset.style ?? ({} as NonNullable<RichTextAsset["style"]>);
		const align = asset.align ?? { horizontal: "center", vertical: "middle" }; // <-- changed default
		const bg = asset.background ?? ({} as NonNullable<RichTextAsset["background"]>);
		const anim = asset.animation;

		const lineHeight = style.lineHeight ?? 1.2;
		const letterSpacing = style.letterSpacing ?? 0;

		const verticalRaw = (align.vertical ?? "middle") as string;
		const verticalNorm = verticalRaw === "center" ? "middle" : ["top", "middle", "bottom"].includes(verticalRaw) ? verticalRaw : "middle";

		const config: any = {
			text: asset.text || "",
			width: asset.width || this.edit.size.width,
			height: asset.height || this.edit.size.height,
			pixelRatio: asset.pixelRatio || 2,

			fontFamily: font.family ?? "Roboto",
			fontSize: font.size ?? 48,
			fontWeight: font.weight ?? "400",
			fontStyle: font.style ?? "normal",
			color: font.color ?? "#ffffff",
			opacity: font.opacity ?? 1,

			lineHeight,
			letterSpacing,
			textTransform: style.textTransform ?? "none",
			textDecoration: style.textDecoration ?? "none",
			gradient: style.gradient,

			textAlign: (align.horizontal as "left" | "center" | "right") ?? "center",
			textBaseline: verticalNorm as "top" | "middle" | "bottom"
		};

		if (asset.stroke) config.stroke = asset.stroke;
		if (asset.shadow) config.shadow = asset.shadow;

		if (bg) {
			config.backgroundColor = bg.color;
			config.backgroundOpacity = bg.opacity ?? 1;
			config.borderRadius = bg.borderRadius ?? 0;
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
				direction: anim.direction
			};

			this.animationDurationMs = clampedSec * 1000;
			this.animationDuration = clampedSec;
		}

		if (asset.customFonts) config.customFonts = asset.customFonts;

		const tlFonts = (this.edit as any)?.timeline?.fonts as Array<{ src: string }> | undefined;
		if (tlFonts?.length) {
			config.timelineFonts = tlFonts.map(f => ({ src: f.src }));
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

		const pixelRatio = (this.clipConfiguration.asset as any)?.pixelRatio || 1;

		const texture = this.createTextureFromImageData(imageData);
		if (!texture) {
			console.error("Failed to create texture from ImageData");
			return;
		}

		this.textures.push(texture);

		const sprite = new Sprite(texture);
		const scale = 1 / pixelRatio;
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

		const pixelRatio = (this.clipConfiguration.asset as any)?.pixelRatio || 1;
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

	private createTextureFromImageData(imageData: ImageData): pixi.Texture | null {
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

		const texture = pixi.Texture.from(canvas);
		this.textures.push(texture);

		this.clearSprites();

		this.sprite = new pixi.Sprite(texture);
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
		const opacity = this.clipConfiguration.opacity;
		if (typeof opacity === "number") return opacity;
		if (Array.isArray(opacity) && opacity.length > 0) {
			const firstKeyframe = opacity[0];
			if (typeof firstKeyframe === "object" && "from" in firstKeyframe) return (firstKeyframe as any).from;
			if (typeof firstKeyframe === "number") return firstKeyframe;
		}
		return 1;
	}
}
