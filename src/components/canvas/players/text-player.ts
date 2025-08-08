import { Player } from "@canvas/players/player";
import { TextEditor } from "@canvas/text/text-editor";
import { type Size } from "@layouts/geometry";
import { type Clip } from "@schemas/clip";
import { type TextAsset } from "@schemas/text-asset";
import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

/**
 * TextPlayer renders and manages editable text elements in the canvas
 */
export class TextPlayer extends Player {
	private background: pixi.Graphics | null = null;
	private text: pixi.Text | null = null;
	private textEditor: TextEditor | null = null;

	public override async load(): Promise<void> {
		await super.load();

		const textAsset = this.clipConfiguration.asset as TextAsset;

		// Create background if specified
		this.background = new pixi.Graphics();
		if (textAsset.background) {
			this.background.fillStyle = {
				color: textAsset.background.color,
				alpha: textAsset.background.opacity
			};

			this.background.rect(0, 0, textAsset.width ?? this.edit.size.width, textAsset.height ?? this.edit.size.height);
			this.background.fill();
		}

		// Create and style text
		this.text = new pixi.Text(textAsset.text, this.createTextStyle(textAsset));

		// Position text according to alignment
		this.positionText(textAsset);

		// Apply stroke filter if specified
		if (textAsset.stroke) {
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
			width: textAsset.width ?? this.edit.size.width,
			height: textAsset.height ?? this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	private createTextStyle(textAsset: TextAsset): pixi.TextStyle {
		return new pixi.TextStyle({
			fontFamily: textAsset.font?.family ?? "Open Sans",
			fontSize: textAsset.font?.size ?? 32,
			fill: textAsset.font?.color ?? "#ffffff",
			fontWeight: (textAsset.font?.weight ?? "400").toString() as pixi.TextStyleFontWeight,
			wordWrap: true,
			wordWrapWidth: textAsset.width ?? this.edit.size.width,
			lineHeight: (textAsset.font?.lineHeight ?? 1) * (textAsset.font?.size ?? 32),
			align: textAsset.alignment?.horizontal ?? "center"
		});
	}

	private positionText(textAsset: TextAsset): void {
		if (!this.text) return;

		const textAlignmentHorizontal = textAsset.alignment?.horizontal ?? "center";
		const textAlignmentVertical = textAsset.alignment?.vertical ?? "center";
		const containerWidth = textAsset.width ?? this.edit.size.width;
		const containerHeight = textAsset.height ?? this.edit.size.height;

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

	public updateTextContent(newText: string, initialConfig: Clip): void {
		this.edit.updateTextContent(this, newText, initialConfig);
	}

	// Override the placeholder method from Player
	protected override recreateTextWithNewContainer(): void {
		const textAsset = this.clipConfiguration.asset as TextAsset;
		const originalFontSize = textAsset.font?.size ?? 32;
		this.recreateBackground(textAsset);
		this.recreateTextWithPreservedFont(textAsset, originalFontSize);
		this.positionText(textAsset);
	}

	private recreateBackground(textAsset: TextAsset): void {
		if (!this.background) return;

		// Clear existing background
		this.background.clear();

		// Recreate background with new dimensions if it exists
		if (textAsset.background) {
			this.background.fillStyle = {
				color: textAsset.background.color,
				alpha: textAsset.background.opacity
			};

			this.background.rect(0, 0, textAsset.width ?? this.edit.size.width, textAsset.height ?? this.edit.size.height);
			this.background.fill();
		}
	}

	private recreateTextWithPreservedFont(textAsset: TextAsset, originalFontSize: number): void {
		if (!this.text) return;

		// Store current text content
		const textContent = this.text.text;

		// Create new text style with updated wordWrapWidth but preserved font size
		const newStyle = new pixi.TextStyle({
			fontFamily: textAsset.font?.family ?? "Open Sans",
			fontSize: originalFontSize,
			fill: textAsset.font?.color ?? "#ffffff",
			fontWeight: (textAsset.font?.weight ?? "400").toString() as pixi.TextStyleFontWeight,
			wordWrap: true,
			wordWrapWidth: textAsset.width ?? this.edit.size.width, // 📏 Update wrap width
			lineHeight: (textAsset.font?.lineHeight ?? 1) * originalFontSize,
			align: textAsset.alignment?.horizontal ?? "center"
		});

		// Destroy old text object
		this.text.destroy();

		// Create new text object with updated style
		this.text = new pixi.Text(textContent, newStyle);

		// Reapply stroke filter if it exists
		if (textAsset.stroke) {
			const textStrokeFilter = new pixiFilters.OutlineFilter({
				thickness: textAsset.stroke.width,
				color: textAsset.stroke.color
			});
			this.text.filters = [textStrokeFilter];
		}

		// Add back to container
		this.contentContainer.addChild(this.text);

		// Update text editor reference if it exists
		if (this.textEditor) {
			this.textEditor.dispose();
			this.textEditor = new TextEditor(this, this.text, this.clipConfiguration);
		}
	}
}
