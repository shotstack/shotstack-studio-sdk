/**
 * SnapSystem - Pure functions for position snapping
 *
 * This module provides pure, testable functions for snapping clip positions
 * to canvas edges, centers, and other clips. No side effects, no dependencies
 * on Edit or Player instances.
 */

import type { Size, Vector } from "@layouts/geometry";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Bounds of a clip in absolute coordinates
 */
export interface ClipBounds {
	left: number;
	right: number;
	top: number;
	bottom: number;
	centerX: number;
	centerY: number;
}

/**
 * A snap guide to be rendered
 */
export interface SnapGuide {
	axis: "x" | "y";
	position: number;
	type: "canvas" | "clip";
	/** For clip guides, the extent of the guide line */
	bounds?: { start: number; end: number };
}

/**
 * Result of a snap operation
 */
export interface SnapResult {
	/** The snapped position (may equal input if no snap occurred) */
	position: Vector;
	/** Guides to render for visual feedback */
	guides: SnapGuide[];
}

/**
 * Configuration for snap behavior
 */
export interface SnapConfig {
	/** Distance in pixels within which snapping occurs */
	threshold: number;
	/** Whether to snap to canvas edges and center */
	snapToCanvas: boolean;
	/** Whether to snap to other clips */
	snapToClips: boolean;
}

/**
 * Context needed for snapping calculations
 */
export interface SnapContext {
	/** Size of the clip being dragged */
	clipSize: Size;
	/** Size of the canvas */
	canvasSize: Size;
	/** Bounds of other clips to snap to */
	otherClips: ClipBounds[];
	/** Snap configuration */
	config: SnapConfig;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_SNAP_THRESHOLD = 20;

export const DEFAULT_SNAP_CONFIG: SnapConfig = {
	threshold: DEFAULT_SNAP_THRESHOLD,
	snapToCanvas: true,
	snapToClips: true
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Calculate the snap points for a clip at a given position
 */
export function getClipSnapPoints(position: Vector, size: Size): { x: number[]; y: number[] } {
	const left = position.x;
	const right = position.x + size.width;
	const centerX = position.x + size.width / 2;
	const top = position.y;
	const bottom = position.y + size.height;
	const centerY = position.y + size.height / 2;

	return {
		x: [left, centerX, right],
		y: [top, centerY, bottom]
	};
}

/**
 * Calculate snap points for the canvas (edges + center)
 */
export function getCanvasSnapPoints(canvasSize: Size): { x: number[]; y: number[] } {
	return {
		x: [0, canvasSize.width / 2, canvasSize.width],
		y: [0, canvasSize.height / 2, canvasSize.height]
	};
}

/**
 * Convert a ClipBounds to snap points
 */
export function boundsToSnapPoints(bounds: ClipBounds): { x: number[]; y: number[] } {
	return {
		x: [bounds.left, bounds.centerX, bounds.right],
		y: [bounds.top, bounds.centerY, bounds.bottom]
	};
}

// ─── Core Snap Functions ─────────────────────────────────────────────────────

/**
 * Snap a position to canvas edges and center.
 * Pure function - no side effects.
 */
export function snapToCanvas(
	position: Vector,
	clipSize: Size,
	canvasSize: Size,
	threshold: number
): SnapResult {
	const guides: SnapGuide[] = [];
	const snapped = { ...position };

	const clipPoints = getClipSnapPoints(position, clipSize);
	const canvasPoints = getCanvasSnapPoints(canvasSize);

	let closestDistanceX = threshold;
	let closestDistanceY = threshold;

	// Check X-axis snapping
	for (const clipX of clipPoints.x) {
		for (const canvasX of canvasPoints.x) {
			const distance = Math.abs(clipX - canvasX);
			if (distance < closestDistanceX) {
				closestDistanceX = distance;
				snapped.x = position.x + (canvasX - clipX);
				// Remove previous X guide if any
				const existingXIdx = guides.findIndex(g => g.axis === "x");
				if (existingXIdx >= 0) guides.splice(existingXIdx, 1);
				guides.push({ axis: "x", position: canvasX, type: "canvas" });
			}
		}
	}

	// Check Y-axis snapping
	for (const clipY of clipPoints.y) {
		for (const canvasY of canvasPoints.y) {
			const distance = Math.abs(clipY - canvasY);
			if (distance < closestDistanceY) {
				closestDistanceY = distance;
				snapped.y = position.y + (canvasY - clipY);
				// Remove previous Y guide if any
				const existingYIdx = guides.findIndex(g => g.axis === "y");
				if (existingYIdx >= 0) guides.splice(existingYIdx, 1);
				guides.push({ axis: "y", position: canvasY, type: "canvas" });
			}
		}
	}

	return { position: snapped, guides };
}

/**
 * Snap a position to other clips.
 * Pure function - no side effects.
 */
export function snapToClips(
	position: Vector,
	clipSize: Size,
	otherClips: ClipBounds[],
	threshold: number
): SnapResult {
	const guides: SnapGuide[] = [];
	const snapped = { ...position };

	if (otherClips.length === 0) {
		return { position: snapped, guides };
	}

	const clipPoints = getClipSnapPoints(position, clipSize);
	const myTop = position.y;
	const myBottom = position.y + clipSize.height;
	const myLeft = position.x;
	const myRight = position.x + clipSize.width;

	let closestDistanceX = threshold;
	let closestDistanceY = threshold;

	for (const other of otherClips) {
		const otherPoints = boundsToSnapPoints(other);

		// Check X-axis snapping
		for (const clipX of clipPoints.x) {
			for (const targetX of otherPoints.x) {
				const distance = Math.abs(clipX - targetX);
				if (distance < closestDistanceX) {
					closestDistanceX = distance;
					snapped.x = position.x + (targetX - clipX);

					// Calculate guide bounds (vertical line spanning both clips)
					const minY = Math.min(myTop, other.top);
					const maxY = Math.max(myBottom, other.bottom);

					// Remove previous X guide if any
					const existingXIdx = guides.findIndex(g => g.axis === "x");
					if (existingXIdx >= 0) guides.splice(existingXIdx, 1);

					guides.push({
						axis: "x",
						position: targetX,
						type: "clip",
						bounds: { start: minY, end: maxY }
					});
				}
			}
		}

		// Check Y-axis snapping
		for (const clipY of clipPoints.y) {
			for (const targetY of otherPoints.y) {
				const distance = Math.abs(clipY - targetY);
				if (distance < closestDistanceY) {
					closestDistanceY = distance;
					snapped.y = position.y + (targetY - clipY);

					// Calculate guide bounds (horizontal line spanning both clips)
					const minX = Math.min(myLeft, other.left);
					const maxX = Math.max(myRight, other.right);

					// Remove previous Y guide if any
					const existingYIdx = guides.findIndex(g => g.axis === "y");
					if (existingYIdx >= 0) guides.splice(existingYIdx, 1);

					guides.push({
						axis: "y",
						position: targetY,
						type: "clip",
						bounds: { start: minX, end: maxX }
					});
				}
			}
		}
	}

	return { position: snapped, guides };
}

/**
 * Combined snap function that checks both canvas and clips.
 * Clip snapping takes priority over canvas snapping when both are within threshold.
 * Pure function - no side effects.
 */
export function snap(position: Vector, context: SnapContext): SnapResult {
	const { clipSize, canvasSize, otherClips, config } = context;
	const { threshold, snapToCanvas: doSnapToCanvas, snapToClips: doSnapToClips } = config;

	let result: SnapResult = { position: { ...position }, guides: [] };

	// First apply canvas snapping
	if (doSnapToCanvas) {
		result = snapToCanvas(result.position, clipSize, canvasSize, threshold);
	}

	// Then apply clip snapping (takes priority - will override canvas snap if closer)
	if (doSnapToClips && otherClips.length > 0) {
		const clipResult = snapToClips(result.position, clipSize, otherClips, threshold);

		// Merge results - clip snaps take priority
		const hasClipSnapX = clipResult.guides.some(g => g.axis === "x");
		const hasClipSnapY = clipResult.guides.some(g => g.axis === "y");

		if (hasClipSnapX) {
			result.position.x = clipResult.position.x;
			// Replace canvas X guide with clip X guide
			result.guides = result.guides.filter(g => g.axis !== "x");
		}
		if (hasClipSnapY) {
			result.position.y = clipResult.position.y;
			// Replace canvas Y guide with clip Y guide
			result.guides = result.guides.filter(g => g.axis !== "y");
		}

		// Add clip guides
		result.guides.push(...clipResult.guides);
	}

	return result;
}

// ─── Rotation Snapping ───────────────────────────────────────────────────────

/**
 * Default angles to snap to during rotation (in degrees)
 */
export const DEFAULT_ROTATION_SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
export const DEFAULT_ROTATION_SNAP_THRESHOLD = 5; // degrees

/**
 * Snap a rotation angle to predefined angles.
 * Pure function - no side effects.
 */
export function snapRotation(
	angle: number,
	snapAngles: number[] = DEFAULT_ROTATION_SNAP_ANGLES,
	threshold: number = DEFAULT_ROTATION_SNAP_THRESHOLD
): { angle: number; snapped: boolean } {
	// Normalize angle to 0-360 range for comparison
	const normalizedAngle = ((angle % 360) + 360) % 360;

	for (const snapAngle of snapAngles) {
		const distance = Math.abs(normalizedAngle - snapAngle);
		const wrappedDistance = Math.min(distance, 360 - distance);

		if (wrappedDistance < threshold) {
			// Preserve full rotations (e.g., 720 degrees stays as 720, not 0)
			const fullRotations = Math.round(angle / 360) * 360;
			return { angle: fullRotations + snapAngle, snapped: true };
		}
	}

	return { angle, snapped: false };
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Create ClipBounds from a position and size
 */
export function createClipBounds(position: Vector, size: Size): ClipBounds {
	return {
		left: position.x,
		right: position.x + size.width,
		top: position.y,
		bottom: position.y + size.height,
		centerX: position.x + size.width / 2,
		centerY: position.y + size.height / 2
	};
}

/**
 * Create a SnapContext with default config
 */
export function createSnapContext(
	clipSize: Size,
	canvasSize: Size,
	otherClips: ClipBounds[] = [],
	configOverrides: Partial<SnapConfig> = {}
): SnapContext {
	return {
		clipSize,
		canvasSize,
		otherClips,
		config: { ...DEFAULT_SNAP_CONFIG, ...configOverrides }
	};
}
