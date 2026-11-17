import { KeyframeBuilder } from "@animations/keyframe-builder";
import type { Keyframe, ResolvedClip } from "@schemas";
import type * as pixi from "pixi.js";

import { ColorFilter } from "./color-filter";

export type ClipFilterEntry = NonNullable<ResolvedClip["filters"]>[number];

export interface BuiltClipFilter {
	filter: pixi.Filter;
	/** time is seconds into the clip; scale is the clip's on-screen scale, as sizeBlurs computes it. */
	update(time: number, scale: number): void;
}

interface Range {
	neutral: number;
	low: number;
	high: number;
}

const COLOUR_FIELDS = {
	brightness: { neutral: 0, low: -1, high: 1, property: "brightness" },
	contrast: { neutral: 1, low: 0, high: 4, property: "contrastFactor" },
	saturation: { neutral: 1, low: 0, high: 4, property: "saturation" }
} as const;

// A plain value and both ends of every tween are limited to the range before any easing, as the render does; an easing
// can still overshoot, so each reading is limited too. Anything that is neither a number nor tweens holds the neutral value.
function readField(value: unknown, { neutral, low, high }: Range): { at(time: number): number; atNeutral: boolean } {
	const limit = (n: unknown) => Math.min(high, Math.max(low, typeof n === "number" ? n : 0));

	if (Array.isArray(value) && value.length > 0) {
		const curve = new KeyframeBuilder(value.map((tween: Keyframe) => ({ ...tween, from: limit(tween.from), to: limit(tween.to) })));
		return { at: time => limit(curve.getValue(time)), atNeutral: false };
	}

	const held = typeof value === "number" ? limit(value) : neutral;
	return { at: () => held, atNeutral: held === neutral };
}

function buildColourFilter(value: unknown, field: (typeof COLOUR_FIELDS)[keyof typeof COLOUR_FIELDS]): BuiltClipFilter | null {
	const reading = readField(value, field);
	if (reading.atNeutral) return null;

	const filter = new ColorFilter({});
	return {
		filter,
		update: time => {
			filter[field.property] = reading.at(time);
		}
	};
}

function buildClipFilter(entry: ClipFilterEntry): BuiltClipFilter | null {
	switch (entry.type) {
		case "brightness":
		case "contrast":
		case "saturation":
			return buildColourFilter(entry.value, COLOUR_FIELDS[entry.type]);
		case "negative":
			return { filter: new ColorFilter({ negate: true }), update: () => undefined };
		default:
			// The colour shader doesn't cover the other types, so they draw nothing.
			return null;
	}
}

export function buildClipFilters(entries: readonly ClipFilterEntry[]): BuiltClipFilter[] {
	return entries.flatMap(entry => buildClipFilter(entry) ?? []);
}
