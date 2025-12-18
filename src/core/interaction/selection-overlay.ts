/**
 * SelectionOverlay - Pure functions and constants for selection UI
 *
 * This module provides testable functions for:
 * - Cursor generation (rotation, resize)
 * - Cursor angle calculations
 * - Hit area calculations
 * - Selection styling constants
 */

import type { Size } from "@layouts/geometry";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SELECTION_CONSTANTS = {
	/** Radius of corner scale handles in pixels */
	SCALE_HANDLE_RADIUS: 4,
	/** Width of selection outline in pixels */
	OUTLINE_WIDTH: 1,
	/** Hit zone for edge resize detection in pixels */
	EDGE_HIT_ZONE: 8,
	/** Hit zone for rotation detection outside corners in pixels */
	ROTATION_HIT_ZONE: 15,
	/** Default selection outline color (blue) */
	DEFAULT_COLOR: 0x0d99ff,
	/** Active/hover selection color (cyan) */
	ACTIVE_COLOR: 0x00ffff
} as const;

/**
 * Base angles for cursors at each corner/edge position (before clip rotation)
 */
export const CURSOR_BASE_ANGLES: Record<string, number> = {
	// Rotation cursor angles
	topLeft: 0,
	topRight: 90,
	bottomRight: 180,
	bottomLeft: 270,
	// Resize cursor angles (NW-SE diagonal = 45°, NE-SW = -45°, horizontal = 0°, vertical = 90°)
	topLeftResize: 45,
	topRightResize: -45,
	bottomRightResize: 45,
	bottomLeftResize: -45,
	left: 0,
	right: 0,
	top: 90,
	bottom: 90
};

export const CORNER_NAMES = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
export type CornerName = (typeof CORNER_NAMES)[number];

// ─── SVG Cursor Paths ─────────────────────────────────────────────────────────

// Curved arrow for rotation cursor
const ROTATION_CURSOR_PATH =
	"M1113.142,1956.331C1008.608,1982.71 887.611,2049.487 836.035,2213.487" +
	"L891.955,2219.403L779,2396L705.496,2199.678L772.745,2206.792" +
	"C832.051,1999.958 984.143,1921.272 1110.63,1892.641L1107.952,1824.711" +
	"L1299,1911L1115.34,2012.065L1113.142,1956.331Z";

// Double-headed arrow for resize cursor
const RESIZE_CURSOR_PATH =
	"M1320,2186L1085,2421L1120,2457L975,2496L1014,2351L1050,2386L1285,2151L1250,2115L1396,2075L1356,2221L1320,2186Z";
const RESIZE_CURSOR_MATRIX = "matrix(0.807871,0.707107,-0.807871,0.707107,2111.872433,-206.020386)";

// ─── Cursor Generation ────────────────────────────────────────────────────────

/**
 * Build a rotation cursor SVG data URI for the given angle.
 * Pure function - no side effects.
 */
export function buildRotationCursor(angleDeg: number): string {
	const transform = angleDeg === 0 ? "" : `<g transform='translate(1002 2110) rotate(${angleDeg}) translate(-1002 -2110)'>`;
	const closeTag = angleDeg === 0 ? "" : "</g>";
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='680 1800 640 620'>${transform}<path d='${ROTATION_CURSOR_PATH}' fill='black' stroke='white' stroke-width='33.33'/>${closeTag}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
}

/**
 * Build a resize cursor SVG data URI for the given angle.
 * Pure function - no side effects.
 */
export function buildResizeCursor(angleDeg: number): string {
	const svg =
		`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='905 1940 640 620'>` +
		`<g transform='rotate(${angleDeg} 1225 2250)'>` +
		`<g transform='${RESIZE_CURSOR_MATRIX}'><path d='${RESIZE_CURSOR_PATH}' fill='black' stroke='white' stroke-width='33.33'/></g></g></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, auto`;
}

// ─── Cursor Angle Calculation ─────────────────────────────────────────────────

/**
 * Get the rotation cursor angle for a corner, accounting for clip rotation.
 * Pure function - no side effects.
 */
export function getRotationCursorAngle(corner: string, clipRotation: number): number {
	const baseAngle = CURSOR_BASE_ANGLES[corner] ?? 0;
	return baseAngle + clipRotation;
}

/**
 * Get the resize cursor angle for a corner or edge, accounting for clip rotation.
 * Pure function - no side effects.
 */
export function getResizeCursorAngle(cornerOrEdge: string, clipRotation: number): number {
	const baseAngle = CURSOR_BASE_ANGLES[cornerOrEdge] ?? 0;
	return baseAngle + clipRotation;
}

// ─── Hit Area Calculation ─────────────────────────────────────────────────────

/**
 * Result of hit area calculation
 */
export interface HitAreaRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Calculate the expanded hit area that includes rotation zones outside corners.
 * The margin scales inversely with UI scale so hit zones stay consistent in screen space.
 * Pure function - no side effects.
 */
export function calculateHitArea(size: Size, uiScale: number): HitAreaRect {
	const hitMargin = (SELECTION_CONSTANTS.ROTATION_HIT_ZONE + SELECTION_CONSTANTS.SCALE_HANDLE_RADIUS) / uiScale;

	return {
		x: -hitMargin,
		y: -hitMargin,
		width: size.width + hitMargin * 2,
		height: size.height + hitMargin * 2
	};
}

// ─── Selection State Types ────────────────────────────────────────────────────

/**
 * State needed to render a selection overlay
 */
export interface SelectionState {
	/** Whether the element is currently selected */
	isSelected: boolean;
	/** Whether the mouse is hovering over the element */
	isHovering: boolean;
	/** Whether the element is being dragged/transformed */
	isInteracting: boolean;
	/** Current UI scale (for handle sizing) */
	uiScale: number;
}

/**
 * Get the selection outline color based on state.
 * Pure function - no side effects.
 */
export function getSelectionColor(state: SelectionState): number {
	return state.isHovering || state.isInteracting ? SELECTION_CONSTANTS.ACTIVE_COLOR : SELECTION_CONSTANTS.DEFAULT_COLOR;
}

/**
 * Determine if selection UI should be visible.
 * Pure function - no side effects.
 */
export function shouldShowSelection(state: SelectionState, isActive: boolean, isExporting: boolean): boolean {
	if (isExporting) return false;
	if (!isActive && !state.isHovering) return false;
	if (!state.isSelected && !state.isHovering) return false;
	return true;
}

/**
 * Determine if scale handles should be visible.
 * Pure function - no side effects.
 */
export function shouldShowHandles(state: SelectionState, isActive: boolean): boolean {
	return isActive && state.isSelected;
}
