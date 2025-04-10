import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

import { type Size } from "../layouts/geometry";
import { type Clip } from "../schemas/clip";
import { type TextAsset } from "../schemas/text-asset";

import type { Edit } from "./edit";
import { Player } from "./player";

/**
 * TODO: Add constants for text defaults
 */
export class TextPlayer extends Player {
	private background: pixi.Graphics | null;
	private text: pixi.Text | null;

	constructor(timeline: Edit, clipConfiguration: Clip) {
		super(timeline, clipConfiguration);

		this.background = null;
		this.text = null;
	}

	public override async load(): Promise<void> {
		await super.load();

		const textAsset = this.clipConfiguration.asset as TextAsset;

		const background = new pixi.Graphics();

		if (textAsset.background) {
			background.fillStyle = {
				color: textAsset.background.color,
				alpha: textAsset.background.opacity
			};

			background.rect(0, 0, textAsset.width ?? this.edit.size.width, textAsset.height ?? this.edit.size.height);
			background.fill();
		}

		const text = new pixi.Text();
		text.text = textAsset.text;

		const textAlignmentHorizontal = textAsset.alignment?.horizontal ?? "center";
		const textAlignmentVertical = textAsset.alignment?.vertical ?? "center";

		text.style = {
			fontFamily: textAsset.font?.family ?? "Open Sans",
			fontSize: textAsset.font?.size ?? 32,
			fill: textAsset.font?.color ?? "#ffffff",
			fontWeight: (textAsset.font?.weight ?? "400").toString() as pixi.TextStyleFontWeight,
			wordWrap: true,
			wordWrapWidth: textAsset.width ?? this.edit.size.width,
			lineHeight: (textAsset.font?.lineHeight ?? 1) * (textAsset.font?.size ?? 32),
			align: textAlignmentHorizontal
		};

		let textX = (textAsset.width ?? this.edit.size.width) / 2 - text.width / 2;
		let textY = (textAsset.height ?? this.edit.size.height) / 2 - text.height / 2;

		if (textAlignmentHorizontal === "left") {
			textX = 0;
		}

		if (textAlignmentHorizontal === "right") {
			textX = (textAsset.width ?? this.edit.size.width) - text.width;
		}

		if (textAlignmentVertical === "top") {
			textY = 0;
		}

		if (textAlignmentVertical === "bottom") {
			textY = (textAsset.height ?? this.edit.size.height) - text.height;
		}

		text.position = {
			x: textX,
			y: textY
		};

		if (textAsset.stroke) {
			const textStrokeFilter = new pixiFilters.OutlineFilter({
				thickness: textAsset.stroke.width,
				color: textAsset.stroke.color
			});
			text.filters = [textStrokeFilter];
		}

		this.background = background;
		this.text = text;

		this.getContainer().addChild(background);
		this.getContainer().addChild(text);
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
	}

	public override draw(): void {
		super.draw();
	}

	public override dispose(): void {
		super.dispose();

		this.background?.destroy();
		this.background = null;

		this.text?.destroy();
		this.text = null;
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
}
