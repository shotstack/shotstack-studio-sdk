import { Player, PlayerType } from "@canvas/players/player";
import { TextEditor } from "@canvas/text/text-editor";
import type { Edit } from "@core/edit-session";
import { parseFontFamily, resolveFontPath } from "@core/fonts/font-config";
import { type Size, type Vector } from "@layouts/geometry";
import { type ResolvedClip } from "@schemas/clip";
import { type TextAsset } from "@schemas/text-asset";
import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

/**
 * TextPlayer renders and manages editable text elements in the canvas
 */
export class TextPlayer extends Player {
	private static loadedFonts = new Set<string>();

	private background: pixi.Graphics | null = null;
	private text: pixi.Text | null = null;
	private textEditor: TextEditor | null = null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Text);
	}

	public override async load(): Promise<void> {
		await super.load();

		const textAsset = this.clipConfiguration.asset as TextAsset;

		// Load the font before rendering
		const fontFamily = textAsset.font?.family ?? "Open Sans";
		await this.loadFont(fontFamily);

		this.background = new pixi.Graphics();
		this.drawBackground();

		// Create and style text
		this.text = new pixi.Text(textAsset.text, this.createTextStyle(textAsset));

		// Position text according to alignment
		this.positionText(textAsset);

		// Apply stroke filter if specified with a positive width and color
		if (textAsset.stroke?.width && textAsset.stroke.width > 0 && textAsset.stroke.color) {
			const textStrokeFilter = new pixiFilters.OutlineFilter({
				thickness: textAsset.stroke.width,
				color: textAsset.stroke.color
			});
			this.text.filters = [textStrokeFilter];
		}

		// Add elements to container
		this.contentContainer.addChild(this.background);
		this.contentContainer.addChild(this.text);
		this.configureKeyframes();

		// Initialize text editor
		this.textEditor = new TextEditor(this, this.text, this.clipConfiguration);
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
	}

	public override reconfigureAfterRestore(): void {
		super.reconfigureAfterRestore();
		this.reconfigure();
	}

	private async reconfigure(): Promise<void> {
		const textAsset = this.clipConfiguration.asset as TextAsset;

		// Load font if changed
		const fontFamily = textAsset.font?.family ?? "Open Sans";
		await this.loadFont(fontFamily);

		// Update background
		this.drawBackground();

		// Update text content and style
		if (this.text) {
			this.text.text = textAsset.text ?? "";
			this.text.style = this.createTextStyle(textAsset);

			// Update stroke filter
			if (textAsset.stroke?.width && textAsset.stroke.width > 0 && textAsset.stroke.color) {
				const textStrokeFilter = new pixiFilters.OutlineFilter({
					thickness: textAsset.stroke.width,
					color: textAsset.stroke.color
				});
				this.text.filters = [textStrokeFilter];
			} else {
				this.text.filters = [];
			}

			// Reposition text based on alignment
			this.positionText(textAsset);
		}
	}

	public override dispose(): void {
		super.dispose();

		this.background?.destroy();
		this.background = null;

		this.text?.destroy();
		this.text = null;

		this.textEditor?.dispose();
		this.textEditor = null;
	}

	public override getSize(): Size {
		const textAsset = this.clipConfiguration.asset as TextAsset;

		return {
			width: this.clipConfiguration.width ?? textAsset.width ?? this.edit.size.width,
			height: this.clipConfiguration.height ?? textAsset.height ?? this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	protected override getContainerScale(): Vector {
		// Text should not be fit-scaled - use only the user-defined scale
		// getScale() returns keyframe scale * getFitScale(), and we override getFitScale() to return 1
		const scale = this.getScale();
		return { x: scale, y: scale };
	}

	protected override supportsEdgeResize(): boolean {
		return true;
	}

	protected override onDimensionsChanged(): void {
		this.drawBackground();

		if (this.text) {
			const textAsset = this.clipConfiguration.asset as TextAsset;
			this.text.style.wordWrapWidth = this.getSize().width;
			this.positionText(textAsset);
		}
	}

	protected override applyFixedDimensions(): void {
		// No-op: base implementation expects a Sprite with texture for fit/crop.
		// Text uses Graphics + Text objects that size themselves via getSize().
	}

	private createTextStyle(textAsset: TextAsset): pixi.TextStyle {
		const fontFamily = textAsset.font?.family ?? "Open Sans";
		const { baseFontFamily, fontWeight } = parseFontFamily(fontFamily);
		const { width } = this.getSize();

		return new pixi.TextStyle({
			fontFamily: baseFontFamily,
			fontSize: textAsset.font?.size ?? 32,
			fill: textAsset.font?.color ?? "#ffffff",
			fontWeight: fontWeight.toString() as pixi.TextStyleFontWeight,
			wordWrap: true,
			wordWrapWidth: width,
			lineHeight: (textAsset.font?.lineHeight ?? 1) * (textAsset.font?.size ?? 32),
			align: textAsset.alignment?.horizontal ?? "center"
		});
	}

	private positionText(textAsset: TextAsset): void {
		if (!this.text) return;

		const textAlignmentHorizontal = textAsset.alignment?.horizontal ?? "center";
		const textAlignmentVertical = textAsset.alignment?.vertical ?? "center";
		const { width: containerWidth, height: containerHeight } = this.getSize();

		let textX = containerWidth / 2 - this.text.width / 2;
		let textY = containerHeight / 2 - this.text.height / 2;

		if (textAlignmentHorizontal === "left") {
			textX = 0;
		} else if (textAlignmentHorizontal === "right") {
			textX = containerWidth - this.text.width;
		}

		if (textAlignmentVertical === "top") {
			textY = 0;
		} else if (textAlignmentVertical === "bottom") {
			textY = containerHeight - this.text.height;
		}

		this.text.position.set(textX, textY);
	}

	private drawBackground(): void {
		const textAsset = this.clipConfiguration.asset as TextAsset;
		if (!this.background || !textAsset.background || !textAsset.background.color) return;

		const { width, height } = this.getSize();
		this.background.clear();
		this.background.fillStyle = {
			color: textAsset.background.color,
			alpha: textAsset.background.opacity
		};
		this.background.rect(0, 0, width, height);
		this.background.fill();
	}

	public updateTextContent(newText: string, initialConfig: ResolvedClip): void {
		this.edit.updateTextContent(this, newText, initialConfig);
	}

	private async loadFont(fontFamily: string): Promise<void> {
		const { baseFontFamily, fontWeight } = parseFontFamily(fontFamily);
		const cacheKey = `${baseFontFamily}-${fontWeight}`;

		if (TextPlayer.loadedFonts.has(cacheKey)) {
			return;
		}

		const fontPath = resolveFontPath(fontFamily);
		if (fontPath) {
			const fontFace = new FontFace(baseFontFamily, `url(${fontPath})`, {
				weight: fontWeight.toString()
			});
			await fontFace.load();
			document.fonts.add(fontFace);
			TextPlayer.loadedFonts.add(cacheKey);
		}
	}

	public static resetFontCache(): void {
		TextPlayer.loadedFonts.clear();
	}
}
