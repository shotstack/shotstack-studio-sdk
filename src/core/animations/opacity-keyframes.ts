import type { Clip, Tween } from "@schemas";

import { KeyframeBuilder } from "./keyframe-builder";

const TIME_EPSILON = 1e-6;

export type OpacityPoint = {
	time: number;
	value: number;
};

function isOpacityValue(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function segmentEnd(tween: Tween): number {
	return (tween.start as number) + (tween.length as number);
}

/** Decode only the linear Tween shape authored by Studio. Other shapes stay read-only. */
export function decodeOpacityPoints(value: Tween[], clipLength: number): OpacityPoint[] | null {
	if (value.length === 0 || !Number.isFinite(clipLength) || clipLength < 0) return null;

	for (let index = 0; index < value.length; index += 1) {
		const tween = value[index];
		const interpolation = tween.interpolation ?? "linear";
		if (
			!isOpacityValue(tween.from) ||
			!isOpacityValue(tween.to) ||
			typeof tween.start !== "number" ||
			!Number.isFinite(tween.start) ||
			tween.start < 0 ||
			typeof tween.length !== "number" ||
			!Number.isFinite(tween.length) ||
			tween.length <= TIME_EPSILON ||
			(interpolation !== "linear" && interpolation !== "constant") ||
			tween.easing !== undefined
		) {
			return null;
		}

		if (index === 0 && Math.abs(tween.start) > TIME_EPSILON) return null;

		const next = value[index + 1];
		if (next) {
			if (typeof next.start !== "number" || Math.abs(segmentEnd(tween) - next.start) > TIME_EPSILON || tween.to !== next.from) return null;
		}
	}

	const firstLinear = value.findIndex(tween => (tween.interpolation ?? "linear") === "linear");
	if (firstLinear === -1) return null;
	const lastLinear = value.findLastIndex(tween => (tween.interpolation ?? "linear") === "linear");

	for (let index = 0; index < value.length; index += 1) {
		const tween = value[index];
		const interpolation = tween.interpolation ?? "linear";
		if (interpolation === "constant") {
			if ((index !== 0 && index !== value.length - 1) || tween.from !== tween.to) return null;
		} else if (index < firstLinear || index > lastLinear) {
			return null;
		}
	}

	const linearTweens = value.slice(firstLinear, lastLinear + 1);
	if (linearTweens.some(tween => (tween.interpolation ?? "linear") !== "linear")) return null;
	const first = linearTweens[0];
	const points: OpacityPoint[] = [{ time: first.start as number, value: first.from as number }];
	for (const tween of linearTweens) {
		points.push({ time: segmentEnd(tween), value: tween.to as number });
	}
	return points;
}

export function encodeOpacityPoints(points: readonly OpacityPoint[], clipLength: number): Tween[] | null {
	if (points.length < 2 || !Number.isFinite(clipLength) || clipLength < 0) return null;

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index];
		if (!Number.isFinite(point.time) || point.time < 0 || !isOpacityValue(point.value)) return null;
		if (index > 0 && point.time - points[index - 1].time <= TIME_EPSILON) return null;
	}

	const tweens: Tween[] = [];
	const first = points[0];
	if (first.time > TIME_EPSILON) {
		tweens.push({ from: first.value, to: first.value, start: 0, length: first.time, interpolation: "constant" });
	}

	for (let index = 0; index < points.length - 1; index += 1) {
		const from = points[index];
		const to = points[index + 1];
		tweens.push({ from: from.value, to: to.value, start: from.time, length: to.time - from.time, interpolation: "linear" });
	}

	const last = points[points.length - 1];
	const end = Math.max(clipLength, last.time);
	if (end - last.time > TIME_EPSILON) {
		tweens.push({ from: last.value, to: last.value, start: last.time, length: end - last.time, interpolation: "constant" });
	}

	return tweens;
}

export function evaluateOpacity(value: Clip["opacity"], localTime: number, clipLength: number): number | null {
	try {
		const evaluated = new KeyframeBuilder(value ?? 1, clipLength, 1).getValue(Math.max(0, Math.min(localTime, clipLength)));
		return Number.isFinite(evaluated) ? Math.max(0, Math.min(1, evaluated)) : null;
	} catch {
		return null;
	}
}

export function snapOpacityTime(localTime: number, clipLength: number, fps: number): number {
	const clamped = Math.max(0, Math.min(localTime, clipLength));
	if (clamped <= TIME_EPSILON) return 0;
	if (clipLength - clamped <= TIME_EPSILON) return clipLength;
	if (!Number.isFinite(fps) || fps <= 0) return clamped;
	return Math.max(0, Math.min(clipLength, Math.round(clamped * fps) / fps));
}

export function findOpacityPoint(
	points: readonly OpacityPoint[],
	localTime: number,
	fps: number,
	direction: -1 | 0 | 1 = 0
): OpacityPoint | undefined {
	const tolerance = Number.isFinite(fps) && fps > 0 ? 0.5 / fps + TIME_EPSILON : TIME_EPSILON;
	if (direction !== 0) {
		const current = findOpacityPoint(points, localTime, fps);
		const referenceTime = current?.time ?? localTime;
		if (direction < 0) return points.findLast(point => point.time < referenceTime - TIME_EPSILON);
		return points.find(point => point.time > referenceTime + TIME_EPSILON);
	}

	let closest: OpacityPoint | undefined;
	let closestDistance = Number.POSITIVE_INFINITY;
	for (const point of points) {
		const distance = Math.abs(point.time - localTime);
		if (distance <= tolerance && distance < closestDistance) {
			closest = point;
			closestDistance = distance;
		}
	}
	return closest;
}

export function upsertOpacityPoint(
	points: readonly OpacityPoint[],
	localTime: number,
	value: number,
	clipLength: number,
	fps: number
): OpacityPoint[] {
	const time = snapOpacityTime(localTime, clipLength, fps);
	const existing = findOpacityPoint(points, time, fps);
	const next = existing ? points.map(point => (point === existing ? { time: point.time, value } : point)) : [...points, { time, value }];
	return next.toSorted((a, b) => a.time - b.time);
}

export function removeOpacityPoint(points: readonly OpacityPoint[], localTime: number, fps: number): OpacityPoint[] {
	const existing = findOpacityPoint(points, localTime, fps);
	return existing ? points.filter(point => point !== existing) : [...points];
}
