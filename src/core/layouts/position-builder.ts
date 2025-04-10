import { type ClipAnchor } from "../schemas/clip";

import { type Size, type Vector } from "./geometry";

export class PositionBuilder {
	private containerSize: Size;

	constructor(containerSize: Size) {
		this.containerSize = containerSize;
	}

	public relativeToAbsolute(entitySize: Size, anchor: ClipAnchor, relativePosition: Vector): Vector {
		switch (anchor) {
			case "topLeft":
				return {
					x: relativePosition.x * this.containerSize.width,
					y: -relativePosition.y * this.containerSize.height
				};
			case "topRight":
				return {
					x: (relativePosition.x + 1) * this.containerSize.width - entitySize.width,
					y: -relativePosition.y * this.containerSize.height
				};
			case "bottomLeft":
				return {
					x: relativePosition.x * this.containerSize.width,
					y: (-relativePosition.y + 1) * this.containerSize.height - entitySize.height
				};
			case "bottomRight":
				return {
					x: (relativePosition.x + 1) * this.containerSize.width - entitySize.width,
					y: (-relativePosition.y + 1) * this.containerSize.height - entitySize.height
				};
			case "left":
				return {
					x: relativePosition.x * this.containerSize.width,
					y: (-relativePosition.y + 0.5) * this.containerSize.height - entitySize.height / 2
				};
			case "right":
				return {
					x: (relativePosition.x + 1) * this.containerSize.width - entitySize.width,
					y: (-relativePosition.y + 0.5) * this.containerSize.height - entitySize.height / 2
				};
			case "top":
				return {
					x: (relativePosition.x + 0.5) * this.containerSize.width - entitySize.width / 2,
					y: -relativePosition.y * this.containerSize.height
				};
			case "bottom":
				return {
					x: (relativePosition.x + 0.5) * this.containerSize.width - entitySize.width / 2,
					y: (-relativePosition.y + 1) * this.containerSize.height - entitySize.height
				};
			case "center":
			default:
				return {
					x: (relativePosition.x + 0.5) * this.containerSize.width - entitySize.width / 2,
					y: (-relativePosition.y + 0.5) * this.containerSize.height - entitySize.height / 2
				};
		}
	}

	public absoluteToRelative(entitySize: Size, anchor: ClipAnchor, absolutePosition: Vector): Vector {
		switch (anchor) {
			case "topLeft":
				return {
					x: absolutePosition.x / this.containerSize.width,
					y: -(absolutePosition.y / this.containerSize.height)
				};
			case "topRight":
				return {
					x: (absolutePosition.x + entitySize.width) / this.containerSize.width - 1,
					y: -(absolutePosition.y / this.containerSize.height)
				};
			case "bottomLeft":
				return {
					x: absolutePosition.x / this.containerSize.width,
					y: -((absolutePosition.y + entitySize.height) / this.containerSize.height - 1)
				};
			case "bottomRight":
				return {
					x: (absolutePosition.x + entitySize.width) / this.containerSize.width - 1,
					y: -((absolutePosition.y + entitySize.height) / this.containerSize.height - 1)
				};
			case "left":
				return {
					x: absolutePosition.x / this.containerSize.width,
					y: -((absolutePosition.y + entitySize.height / 2) / this.containerSize.height - 0.5)
				};
			case "right":
				return {
					x: (absolutePosition.x + entitySize.width) / this.containerSize.width - 1,
					y: -((absolutePosition.y + entitySize.height / 2) / this.containerSize.height - 0.5)
				};
			case "top":
				return {
					x: (absolutePosition.x + entitySize.width / 2) / this.containerSize.width - 0.5,
					y: -(absolutePosition.y / this.containerSize.height)
				};
			case "bottom":
				return {
					x: (absolutePosition.x + entitySize.width / 2) / this.containerSize.width - 0.5,
					y: -((absolutePosition.y + entitySize.height) / this.containerSize.height - 1)
				};
			case "center":
			default:
				return {
					x: (absolutePosition.x + entitySize.width / 2) / this.containerSize.width - 0.5,
					y: -((absolutePosition.y + entitySize.height / 2) / this.containerSize.height - 0.5)
				};
		}
	}
}
