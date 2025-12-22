/**
 * ClipInteractionSystem - Pure functions for clip interaction calculations
 *
 * This module provides testable functions for:
 * - Hit zone detection (edges, corners)
 * - Corner scale calculations
 * - Edge resize calculations
 * - Dimension clamping
 */

import type { Size, Vector } from "@layouts/geometry";

// ─── Constants ────────────────────────────────────────────────────────────────

export const INTERACTION_CONSTANTS = {
	/** Minimum clip dimension in pixels */
	MIN_DIMENSION: 50,
	/** Maximum clip dimension in pixels */
	MAX_DIMENSION: 3840
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScaleDirection = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export type EdgeDirection = "left" | "right" | "top" | "bottom";

/**
 * Original dimensions captured at the start of a resize operation
 */
export interface OriginalDimensions {
	width: number;
	height: number;
	offsetX: number;
	offsetY: number;
}

/**
 * Result of a resize/scale calculation
 */
export interface ResizeResult {
	width: number;
	height: number;
	offsetX: number;
	offsetY: number;
}

// ─── Edge Zone Detection ──────────────────────────────────────────────────────

/**
 * Detect if a point is within an edge resize zone.
 * Returns the edge direction or null if not in any edge zone.
 * Pure function - no side effects.
 *
 * @param point - Local position within the element
 * @param size - Element size
 * @param hitZone - Distance in pixels for edge detection
 */
export function detectEdgeZone(point: Vector, size: Size, hitZone: number): EdgeDirection | null {
	if (hitZone <= 0) return null;

	// Check if pointer is near any edge (within hit zone)
	const nearLeft = point.x >= -hitZone && point.x <= hitZone;
	const nearRight = point.x >= size.width - hitZone && point.x <= size.width + hitZone;
	const nearTop = point.y >= -hitZone && point.y <= hitZone;
	const nearBottom = point.y >= size.height - hitZone && point.y <= size.height + hitZone;

	// Determine if within vertical/horizontal range (not in corner)
	const withinVerticalRange = point.y > hitZone && point.y < size.height - hitZone;
	const withinHorizontalRange = point.x > hitZone && point.x < size.width - hitZone;

	if (nearLeft && withinVerticalRange) return "left";
	if (nearRight && withinVerticalRange) return "right";
	if (nearTop && withinHorizontalRange) return "top";
	if (nearBottom && withinHorizontalRange) return "bottom";

	return null;
}

// ─── Corner Zone Detection ────────────────────────────────────────────────────

const CORNER_NAMES: ScaleDirection[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

/**
 * Detect if a point is within a rotation zone (outside corners).
 * Returns the corner name or null if not in any rotation zone.
 * Pure function - no side effects.
 *
 * @param point - Local position within the element
 * @param corners - Array of corner positions [topLeft, topRight, bottomRight, bottomLeft]
 * @param handleRadius - Radius of scale handles (inner boundary)
 * @param rotationZone - Size of rotation detection zone (outer boundary)
 */
export function detectCornerZone(point: Vector, corners: Vector[], handleRadius: number, rotationZone: number): ScaleDirection | null {
	for (let i = 0; i < corners.length; i += 1) {
		const corner = corners[i];
		const dx = point.x - corner.x;
		const dy = point.y - corner.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		// Outside handle radius but within rotation zone
		if (distance > handleRadius && distance < handleRadius + rotationZone) {
			return CORNER_NAMES[i];
		}
	}

	return null;
}

// ─── Corner Scale Calculation ─────────────────────────────────────────────────

/**
 * Calculate new dimensions when scaling from a corner.
 * Pure function - no side effects.
 *
 * @param direction - Which corner is being dragged
 * @param delta - Movement delta from drag start
 * @param original - Original dimensions at drag start
 * @param canvasSize - Canvas size for offset normalization
 */
export function calculateCornerScale(direction: ScaleDirection, delta: Vector, original: OriginalDimensions, canvasSize: Size): ResizeResult {
	let newWidth = original.width;
	let newHeight = original.height;
	let newOffsetX = original.offsetX;
	let newOffsetY = original.offsetY;

	// Avoid division by zero
	const canvasWidth = canvasSize.width || 1;
	const canvasHeight = canvasSize.height || 1;

	switch (direction) {
		case "topLeft":
			// Decrease width, decrease height, shift offset to keep bottom-right fixed
			newWidth = original.width - delta.x;
			newHeight = original.height - delta.y;
			newOffsetX = original.offsetX + delta.x / 2 / canvasWidth;
			newOffsetY = original.offsetY - delta.y / 2 / canvasHeight;
			break;
		case "topRight":
			// Increase width, decrease height, shift offset to keep bottom-left fixed
			newWidth = original.width + delta.x;
			newHeight = original.height - delta.y;
			newOffsetX = original.offsetX + delta.x / 2 / canvasWidth;
			newOffsetY = original.offsetY - delta.y / 2 / canvasHeight;
			break;
		case "bottomLeft":
			// Decrease width, increase height, shift offset to keep top-right fixed
			newWidth = original.width - delta.x;
			newHeight = original.height + delta.y;
			newOffsetX = original.offsetX + delta.x / 2 / canvasWidth;
			newOffsetY = original.offsetY - delta.y / 2 / canvasHeight;
			break;
		case "bottomRight":
			// Increase width, increase height, shift offset to keep top-left fixed
			newWidth = original.width + delta.x;
			newHeight = original.height + delta.y;
			newOffsetX = original.offsetX + delta.x / 2 / canvasWidth;
			newOffsetY = original.offsetY - delta.y / 2 / canvasHeight;
			break;
		default:
			// All cases covered by ScaleDirection type
			break;
	}

	return { width: newWidth, height: newHeight, offsetX: newOffsetX, offsetY: newOffsetY };
}

// ─── Edge Resize Calculation ──────────────────────────────────────────────────

/**
 * Calculate new dimensions when resizing from an edge.
 * Pure function - no side effects.
 *
 * @param direction - Which edge is being dragged
 * @param delta - Movement delta from drag start
 * @param original - Original dimensions at drag start
 * @param canvasSize - Canvas size for offset normalization
 */
export function calculateEdgeResize(direction: EdgeDirection, delta: Vector, original: OriginalDimensions, canvasSize: Size): ResizeResult {
	let newWidth = original.width;
	let newHeight = original.height;
	let newOffsetX = original.offsetX;
	let newOffsetY = original.offsetY;

	// Avoid division by zero
	const canvasWidth = canvasSize.width || 1;
	const canvasHeight = canvasSize.height || 1;

	switch (direction) {
		case "left":
			// Dragging left edge: width decreases, offset shifts right to keep right edge fixed
			newWidth = original.width - delta.x;
			newOffsetX = original.offsetX + delta.x / 2 / canvasWidth;
			break;
		case "right":
			// Dragging right edge: width increases, offset shifts right to keep left edge fixed
			newWidth = original.width + delta.x;
			newOffsetX = original.offsetX + delta.x / 2 / canvasWidth;
			break;
		case "top":
			// Dragging top edge: height decreases, offset shifts up to keep bottom edge fixed
			newHeight = original.height - delta.y;
			newOffsetY = original.offsetY - delta.y / 2 / canvasHeight;
			break;
		case "bottom":
			// Dragging bottom edge: height increases, offset shifts down to keep top edge fixed
			newHeight = original.height + delta.y;
			newOffsetY = original.offsetY - delta.y / 2 / canvasHeight;
			break;
		default:
			// All cases covered by EdgeDirection type
			break;
	}

	return { width: newWidth, height: newHeight, offsetX: newOffsetX, offsetY: newOffsetY };
}

// ─── Dimension Clamping ───────────────────────────────────────────────────────

/**
 * Clamp dimensions to valid bounds.
 * Pure function - no side effects.
 */
export function clampDimensions(width: number, height: number): { width: number; height: number } {
	return {
		width: Math.max(INTERACTION_CONSTANTS.MIN_DIMENSION, Math.min(width, INTERACTION_CONSTANTS.MAX_DIMENSION)),
		height: Math.max(INTERACTION_CONSTANTS.MIN_DIMENSION, Math.min(height, INTERACTION_CONSTANTS.MAX_DIMENSION))
	};
}
