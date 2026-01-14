import type { ClipRef, CollisionResult, DragTarget } from "./interaction-calculations";

export type { ClipRef, SnapPoint, CollisionResult, DragTarget, DragBehavior, DetermineDragBehaviorInput } from "./interaction-calculations";

// ─── Point ─────────────────────────────────────────────────────────────────

export interface Point {
	readonly x: number;
	readonly y: number;
}

// ─── Clip Original Styles ──────────────────────────────────────────────────

export interface ClipOriginalStyles {
	readonly position: string;
	readonly left: string;
	readonly top: string;
	readonly zIndex: string;
	readonly pointerEvents: string;
}

// ─── State Machine ─────────────────────────────────────────────────────────

export type InteractionState = IdleState | PendingState | DraggingState | ResizingState;

export interface IdleState {
	readonly type: "idle";
}

export interface PendingState {
	readonly type: "pending";
	readonly startPoint: Point;
	readonly clipRef: ClipRef;
	readonly originalTime: number;
}

export interface DraggingState {
	readonly type: "dragging";
	readonly clipRef: ClipRef;
	readonly clipElement: HTMLElement;
	readonly ghost: HTMLElement;
	readonly startTime: number;
	readonly originalTrack: number;
	readonly dragOffsetX: number;
	readonly dragOffsetY: number;
	readonly originalStyles: ClipOriginalStyles;
	readonly draggedClipLength: number;
	// Ephemeral drag state (updated each frame)
	readonly dragTarget: DragTarget;
	readonly collisionResult: CollisionResult;
	readonly altKeyHeld: boolean;
}

export interface ResizingState {
	readonly type: "resizing";
	readonly clipRef: ClipRef;
	readonly clipElement: HTMLElement;
	readonly edge: "left" | "right";
	readonly originalStart: number;
	readonly originalLength: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const IDLE_STATE: IdleState = { type: "idle" };

// ─── State Factory Functions ───────────────────────────────────────────────

export function createPendingState(startPoint: Point, clipRef: ClipRef, originalTime: number): PendingState {
	return { type: "pending", startPoint, clipRef, originalTime };
}

export function createDraggingState(
	pending: PendingState,
	clipElement: HTMLElement,
	ghost: HTMLElement,
	dragOffsetX: number,
	dragOffsetY: number,
	originalStyles: ClipOriginalStyles,
	clipLength: number,
	altKeyHeld: boolean
): DraggingState {
	return {
		type: "dragging",
		clipRef: pending.clipRef,
		clipElement,
		ghost,
		startTime: pending.originalTime,
		originalTrack: pending.clipRef.trackIndex,
		dragOffsetX,
		dragOffsetY,
		originalStyles,
		draggedClipLength: clipLength,
		// Initial ephemeral state
		dragTarget: { type: "track", trackIndex: pending.clipRef.trackIndex },
		collisionResult: { newStartTime: pending.originalTime, pushOffset: 0 },
		altKeyHeld
	};
}

export function createResizingState(
	clipRef: ClipRef,
	clipElement: HTMLElement,
	edge: "left" | "right",
	originalStart: number,
	originalLength: number
): ResizingState {
	return { type: "resizing", clipRef, clipElement, edge, originalStart, originalLength };
}

// ─── State Update Functions ────────────────────────────────────────────────

export interface DragStateUpdates {
	readonly dragTarget?: DragTarget;
	readonly collisionResult?: CollisionResult;
	readonly altKeyHeld?: boolean;
}

export function updateDragState(state: DraggingState, updates: DragStateUpdates): DraggingState {
	return {
		...state,
		dragTarget: updates.dragTarget ?? state.dragTarget,
		collisionResult: updates.collisionResult ?? state.collisionResult,
		altKeyHeld: updates.altKeyHeld ?? state.altKeyHeld
	};
}

// ─── Type Guards ───────────────────────────────────────────────────────────

export function isIdle(state: InteractionState): state is IdleState {
	return state.type === "idle";
}

export function isPending(state: InteractionState): state is PendingState {
	return state.type === "pending";
}

export function isDragging(state: InteractionState): state is DraggingState {
	return state.type === "dragging";
}

export function isResizing(state: InteractionState): state is ResizingState {
	return state.type === "resizing";
}

export function isActive(state: InteractionState): state is DraggingState | ResizingState {
	return state.type === "dragging" || state.type === "resizing";
}
