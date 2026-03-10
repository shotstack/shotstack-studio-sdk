import { type ClipAnchor } from "@schemas";

import { type Size, type Vector } from "./geometry";

export function relativeToAbsolute(containerSize: Size, entitySize: Size, anchor: ClipAnchor, relativePosition: Vector): Vector {
	switch (anchor) {
		case "topLeft":
			return {
				x: relativePosition.x * containerSize.width,
				y: -relativePosition.y * containerSize.height
			};
		case "topRight":
			return {
				x: (relativePosition.x + 1) * containerSize.width - entitySize.width,
				y: -relativePosition.y * containerSize.height
			};
		case "bottomLeft":
			return {
				x: relativePosition.x * containerSize.width,
				y: (-relativePosition.y + 1) * containerSize.height - entitySize.height
			};
		case "bottomRight":
			return {
				x: (relativePosition.x + 1) * containerSize.width - entitySize.width,
				y: (-relativePosition.y + 1) * containerSize.height - entitySize.height
			};
		case "left":
			return {
				x: relativePosition.x * containerSize.width,
				y: (-relativePosition.y + 0.5) * containerSize.height - entitySize.height / 2
			};
		case "right":
			return {
				x: (relativePosition.x + 1) * containerSize.width - entitySize.width,
				y: (-relativePosition.y + 0.5) * containerSize.height - entitySize.height / 2
			};
		case "top":
			return {
				x: (relativePosition.x + 0.5) * containerSize.width - entitySize.width / 2,
				y: -relativePosition.y * containerSize.height
			};
		case "bottom":
			return {
				x: (relativePosition.x + 0.5) * containerSize.width - entitySize.width / 2,
				y: (-relativePosition.y + 1) * containerSize.height - entitySize.height
			};
		case "center":
		default:
			return {
				x: (relativePosition.x + 0.5) * containerSize.width - entitySize.width / 2,
				y: (-relativePosition.y + 0.5) * containerSize.height - entitySize.height / 2
			};
	}
}

export function absoluteToRelative(containerSize: Size, entitySize: Size, anchor: ClipAnchor, absolutePosition: Vector): Vector {
	switch (anchor) {
		case "topLeft":
			return {
				x: absolutePosition.x / containerSize.width,
				y: -(absolutePosition.y / containerSize.height)
			};
		case "topRight":
			return {
				x: (absolutePosition.x + entitySize.width) / containerSize.width - 1,
				y: -(absolutePosition.y / containerSize.height)
			};
		case "bottomLeft":
			return {
				x: absolutePosition.x / containerSize.width,
				y: -((absolutePosition.y + entitySize.height) / containerSize.height - 1)
			};
		case "bottomRight":
			return {
				x: (absolutePosition.x + entitySize.width) / containerSize.width - 1,
				y: -((absolutePosition.y + entitySize.height) / containerSize.height - 1)
			};
		case "left":
			return {
				x: absolutePosition.x / containerSize.width,
				y: -((absolutePosition.y + entitySize.height / 2) / containerSize.height - 0.5)
			};
		case "right":
			return {
				x: (absolutePosition.x + entitySize.width) / containerSize.width - 1,
				y: -((absolutePosition.y + entitySize.height / 2) / containerSize.height - 0.5)
			};
		case "top":
			return {
				x: (absolutePosition.x + entitySize.width / 2) / containerSize.width - 0.5,
				y: -(absolutePosition.y / containerSize.height)
			};
		case "bottom":
			return {
				x: (absolutePosition.x + entitySize.width / 2) / containerSize.width - 0.5,
				y: -((absolutePosition.y + entitySize.height) / containerSize.height - 1)
			};
		case "center":
		default:
			return {
				x: (absolutePosition.x + entitySize.width / 2) / containerSize.width - 0.5,
				y: -((absolutePosition.y + entitySize.height / 2) / containerSize.height - 0.5)
			};
	}
}
