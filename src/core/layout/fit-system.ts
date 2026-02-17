/**
 * FitSystem - Pure functions for fit mode calculations
 *
 * This module provides testable functions for:
 * - Fit scale calculations (crop, cover, contain, none)
 * - Container scale vectors
 * - Sprite transform calculations for fixed dimensions
 */

import type { Size, Vector } from "@layouts/geometry";

// ─── Types ────────────────────────────────────────────────────────────────────

export const FIT_MODES = ["crop", "cover", "contain", "none"] as const;
export type FitMode = (typeof FIT_MODES)[number];

/**
 * Transform result for sprite positioning
 */
export interface SpriteTransform {
	scaleX: number;
	scaleY: number;
	positionX: number;
	positionY: number;
}

// ─── Fit Scale Calculation ────────────────────────────────────────────────────

/**
 * Calculate the uniform fit scale factor for content within a target size.
 * Pure function - no side effects.
 *
 * @param contentSize - Original content dimensions
 * @param targetSize - Target container dimensions
 * @param fit - Fit mode (crop, cover, contain, none)
 * @returns Uniform scale factor
 *
 * Fit modes:
 * - crop: Fill target using max ratio (overflow is cropped)
 * - cover: Same as crop for uniform scale
 * - contain: Fit within target using min ratio (may letterbox)
 * - none: No scaling (returns 1)
 */
export function calculateFitScale(contentSize: Size, targetSize: Size, fit: FitMode): number {
	const ratioX = targetSize.width / contentSize.width;
	const ratioY = targetSize.height / contentSize.height;

	switch (fit ?? "crop") {
		case "crop":
		case "cover":
			return Math.max(ratioX, ratioY);
		case "contain":
			return Math.min(ratioX, ratioY);
		case "none":
		default:
			return 1;
	}
}

// ─── Container Scale Calculation ──────────────────────────────────────────────

/**
 * Calculate the container scale vector based on fit mode.
 * Pure function - no side effects.
 *
 * @param contentSize - Original content dimensions
 * @param targetSize - Target container dimensions
 * @param fit - Fit mode (crop, cover, contain, none)
 * @param baseScale - User-specified scale multiplier
 * @param hasFixedDimensions - Whether explicit width/height are set
 * @returns Scale vector {x, y}
 *
 * When hasFixedDimensions is true, returns just baseScale (fit handled by sprite).
 * When false, calculates appropriate scale based on fit mode:
 * - contain: Uniform min scale
 * - crop: Uniform max scale
 * - cover: Non-uniform stretch (distorts content)
 * - none: No scaling
 */
export function calculateContainerScale(contentSize: Size, targetSize: Size, fit: FitMode, baseScale: number, hasFixedDimensions: boolean): Vector {
	// When explicit dimensions are set, applyFixedDimensions handles fit scaling
	if (hasFixedDimensions) {
		return { x: baseScale, y: baseScale };
	}

	// Guard against zero-size content
	if (contentSize.width === 0 || contentSize.height === 0) {
		return { x: baseScale, y: baseScale };
	}

	const ratioX = targetSize.width / contentSize.width;
	const ratioY = targetSize.height / contentSize.height;

	switch (fit ?? "crop") {
		case "contain": {
			const uniform = Math.min(ratioX, ratioY) * baseScale;
			return { x: uniform, y: uniform };
		}
		case "crop": {
			const uniform = Math.max(ratioX, ratioY) * baseScale;
			return { x: uniform, y: uniform };
		}
		case "cover": {
			// Non-uniform stretch to exactly fill
			return { x: ratioX * baseScale, y: ratioY * baseScale };
		}
		case "none":
		default:
			return { x: baseScale, y: baseScale };
	}
}

// ─── Sprite Transform Calculation ─────────────────────────────────────────────

/**
 * Calculate sprite transform for fixed dimensions mode.
 * Pure function - no side effects.
 *
 * @param nativeSize - Native sprite/texture dimensions
 * @param targetSize - Target clip dimensions (explicit width/height)
 * @param fit - Fit mode (crop, cover, contain, none)
 * @returns Transform with scale and position
 *
 * Fit modes for fixed dimensions:
 * - cover: Non-uniform stretch to exactly fill (distorts)
 * - crop: Uniform max scale (overflow masked)
 * - contain: Uniform min scale (letterbox/pillarbox)
 * - none: Native size (centered, overflow masked)
 */
export function calculateSpriteTransform(nativeSize: Size, targetSize: Size, fit: FitMode): SpriteTransform {
	const centerX = targetSize.width / 2;
	const centerY = targetSize.height / 2;

	switch (fit ?? "crop") {
		case "cover": {
			// Non-uniform stretch to exactly fill target
			const scaleX = targetSize.width / nativeSize.width;
			const scaleY = targetSize.height / nativeSize.height;
			return { scaleX, scaleY, positionX: centerX, positionY: centerY };
		}
		case "crop": {
			// Uniform max scale (fill, overflow is masked)
			const cropScale = Math.max(targetSize.width / nativeSize.width, targetSize.height / nativeSize.height);
			return { scaleX: cropScale, scaleY: cropScale, positionX: centerX, positionY: centerY };
		}
		case "contain": {
			// Uniform min scale (fit fully, may letterbox)
			const containScale = Math.min(targetSize.width / nativeSize.width, targetSize.height / nativeSize.height);
			return { scaleX: containScale, scaleY: containScale, positionX: centerX, positionY: centerY };
		}
		case "none":
		default: {
			// Native size, centered
			return { scaleX: 1, scaleY: 1, positionX: centerX, positionY: centerY };
		}
	}
}
