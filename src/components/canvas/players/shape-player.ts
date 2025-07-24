import type { Edit } from "@core/edit";
import { type Size } from "@layouts/geometry";
import { type Clip } from "@schemas/clip";
import { type ShapeAsset } from "@schemas/shape-asset";
import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

import { Player } from "./player";

export class ShapePlayer extends Player {
	private shape: pixi.Graphics | null;
	private shapeBackground: pixi.Graphics | null;

	constructor(timeline: Edit, clipConfiguration: Clip) {
		super(timeline, clipConfiguration);

		this.shape = null;
		this.shapeBackground = null;
	}

	public override async load(): Promise<void> {
		await super.load();

		const shapeAsset = this.clipConfiguration.asset as ShapeAsset;

		const shapeBackground = new pixi.Graphics();

		const assetWidth = shapeAsset.width ?? this.edit.size.width;
		const assetHeight = shapeAsset.height ?? this.edit.size.height;

		shapeBackground.fillStyle = { color: "transparent" };
		shapeBackground.rect(0, 0, assetWidth, assetHeight);
		shapeBackground.fill();

		const shape = new pixi.Graphics();

		switch (shapeAsset.shape) {
			case "rectangle": {
				const rectangleAsset = shapeAsset.rectangle!;

				const x = assetWidth / 2 - rectangleAsset.width / 2;
				const y = assetHeight / 2 - rectangleAsset.height / 2;
				shape.rect(x, y, rectangleAsset.width, rectangleAsset.height);

				break;
			}
			case "circle": {
				const circleAsset = shapeAsset.circle!;

				const x = assetWidth / 2;
				const y = assetHeight / 2;
				shape.circle(x, y, circleAsset.radius);

				break;
			}
			case "line": {
				const lineAsset = shapeAsset.line!;

				const x = assetWidth / 2 - lineAsset.length / 2;
				const y = assetHeight / 2 - lineAsset.thickness / 2;
				shape.rect(x, y, lineAsset.length, lineAsset.thickness);

				break;
			}
			default:
				console.warn("Unsupported shape asset type.");
				break;
		}

		shape.fillStyle = {
			color: shapeAsset.fill?.color ?? "#ffffff",
			alpha: shapeAsset.fill?.opacity ?? 1
		};
		shape.fill();

		if (shapeAsset.stroke) {
			const shapeStrokeFilter = new pixiFilters.OutlineFilter({
				thickness: shapeAsset.stroke.width,
				color: shapeAsset.stroke.color
			});
			shape.filters = [shapeStrokeFilter];
		}

		this.shapeBackground = shapeBackground;
		this.shape = shape;

		this.contentContainer.addChild(shapeBackground);
		shapeBackground.addChild(shape);
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

		this.shape?.destroy();
		this.shape = null;

		this.shapeBackground?.destroy();
		this.shapeBackground = null;
	}

	public override getSize(): Size {
		const shapeAsset = this.clipConfiguration.asset as ShapeAsset;

		return {
			width: shapeAsset.width ?? this.edit.size.width,
			height: shapeAsset.height ?? this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}
}
