import { type Size } from "@layouts/geometry";
import { type ResolvedClip } from "@schemas/clip";
import { type HtmlAsset, HtmlAssetPosition } from "@schemas/html-asset";
import type { Edit } from "core/edit";
import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

import { Player, PlayerType } from "./player";

type HtmlDocumentFont = {
	color?: string;
	family?: string;
	size?: number;
	weight?: number;
	lineHeight?: number;
};

type HtmlDocumentAlignmentHorizontal = "left" | "center" | "right";
type HtmlDocumentAlignmentVertical = "top" | "center" | "bottom";

type HtmlDocumentAlignment = {
	horizontal?: HtmlDocumentAlignmentHorizontal;
	vertical?: HtmlDocumentAlignmentVertical;
};

type HtmlDocumentBackground = {
	color?: string;
	opacity?: number;
};

type HtmlDocumentStroke = {
	width?: number;
	color?: string;
};

type HtmlDocumentParseResult = {
	text: string;
	font: HtmlDocumentFont;
	alignment: HtmlDocumentAlignment;
	background: HtmlDocumentBackground;
	stroke: HtmlDocumentStroke;
};

export class HtmlPlayer extends Player {
	private background: pixi.Graphics | null;
	private text: pixi.Text | null;

	constructor(timeline: Edit, clipConfiguration: ResolvedClip) {
		super(timeline, clipConfiguration, PlayerType.Html);

		this.background = null;
		this.text = null;
	}

	public override async load(): Promise<void> {
		await super.load();

		const htmlAsset = this.clipConfiguration.asset as HtmlAsset;

		const document = await this.parseDocument();
		if (!document) {
			return;
		}

		const background = new pixi.Graphics();

		if (document.background.color) {
			background.fillStyle = {
				color: document.background.color,
				alpha: document.background.opacity ?? 1
			};

			background.rect(0, 0, htmlAsset.width ?? this.edit.size.width, htmlAsset.height ?? this.edit.size.height);
			background.fill();
		}

		const text = new pixi.Text();
		text.text = document.text;

		const { horizontal: textAlignmentHorizontal, vertical: textAlignmentVertical } = document.alignment;

		text.style = {
			fontFamily: document.font?.family ?? "Open Sans",
			fontSize: document.font?.size ?? 32,
			fill: document.font?.color ?? "#ffffff",
			fontWeight: (document.font?.weight ?? "400").toString() as pixi.TextStyleFontWeight,
			wordWrap: true,
			wordWrapWidth: htmlAsset.width ?? this.edit.size.width,
			lineHeight: (document.font?.lineHeight ?? 1) * (document.font?.size ?? 32),
			align: textAlignmentHorizontal
		};

		let textX = (htmlAsset.width ?? this.edit.size.width) / 2 - text.width / 2;
		let textY = (htmlAsset.height ?? this.edit.size.height) / 2 - text.height / 2;

		if (textAlignmentHorizontal === "left") {
			textX = 0;
		}

		if (textAlignmentHorizontal === "right") {
			textX = (htmlAsset.width ?? this.edit.size.width) - text.width;
		}

		if (textAlignmentVertical === "top") {
			textY = 0;
		}

		if (textAlignmentVertical === "bottom") {
			textY = (htmlAsset.height ?? this.edit.size.height) - text.height;
		}

		text.position = {
			x: textX,
			y: textY
		};

		if (document.stroke.color && document.stroke.width) {
			const textStrokeFilter = new pixiFilters.OutlineFilter({
				thickness: document.stroke.width,
				color: document.stroke.color
			});
			text.filters = [textStrokeFilter];
		}

		this.background = background;
		this.text = text;

		this.contentContainer.addChild(background);
		this.contentContainer.addChild(text);
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
		const htmlAsset = this.clipConfiguration.asset as HtmlAsset;

		return {
			width: htmlAsset.width ?? this.edit.size.width,
			height: htmlAsset.height ?? this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	private async parseDocument(): Promise<HtmlDocumentParseResult | null> {
		const htmlAsset = this.clipConfiguration.asset as HtmlAsset;
		const { html, css, position } = htmlAsset;

		if (!html.includes('data-html-type="text"')) {
			console.warn("Unsupported html format.");
			return null;
		}

		const domParser = new DOMParser();
		const text = domParser.parseFromString(html, "text/html").body.textContent ?? "";

		const cssParser = new CSSStyleSheet();
		const cssRule = (await cssParser.replace(css)).cssRules[0];

		const htmlDocumentParseResult: HtmlDocumentParseResult = { text, font: {}, alignment: {}, background: {}, stroke: {} };

		if (cssRule?.constructor.name !== "CSSStyleRule" || !("style" in cssRule)) {
			console.warn("Unsupported css format.");
			return htmlDocumentParseResult;
		}

		const cssStyle = cssRule.style as CSSStyleDeclaration;
		const alignment = this.parseAlignment(position ?? "center");

		htmlDocumentParseResult.font = {
			color: cssStyle.color.length ? cssStyle.color : undefined,
			family: cssStyle.fontFamily.length ? cssStyle.fontFamily : undefined,
			size: cssStyle.fontSize.length ? parseInt(cssStyle.fontSize, 10) : undefined,
			weight: cssStyle.fontWeight.length ? parseInt(cssStyle.fontWeight, 10) : undefined,
			lineHeight: cssStyle.lineHeight.length ? parseInt(cssStyle.lineHeight, 10) : undefined
		};

		htmlDocumentParseResult.alignment = alignment;

		let background = "";

		if (cssStyle.background.length) {
			background = cssStyle.background;
		}
		if (cssStyle.backgroundColor.length) {
			background = cssStyle.backgroundColor;
		}

		htmlDocumentParseResult.background = {
			color: background.length ? background : undefined,
			opacity: cssStyle.opacity.length ? parseInt(cssStyle.opacity, 10) : undefined
		};

		htmlDocumentParseResult.stroke = {
			width: cssStyle.strokeWidth.length ? parseInt(cssStyle.strokeWidth, 10) : undefined,
			color: cssStyle.stroke.length ? cssStyle.stroke : undefined
		};

		return htmlDocumentParseResult;
	}

	private parseAlignment(position: HtmlAssetPosition): HtmlDocumentAlignment {
		switch (position) {
			case "topLeft":
				return { horizontal: "left", vertical: "top" };
			case "top":
				return { horizontal: "center", vertical: "top" };
			case "topRight":
				return { horizontal: "right", vertical: "top" };
			case "left":
				return { horizontal: "left", vertical: "center" };
			case "right":
				return { horizontal: "right", vertical: "center" };
			case "bottomLeft":
				return { horizontal: "left", vertical: "bottom" };
			case "bottom":
				return { horizontal: "center", vertical: "bottom" };
			case "bottomRight":
				return { horizontal: "right", vertical: "bottom" };
			case "center":
			default:
				return { horizontal: "center", vertical: "center" };
		}
	}
}
