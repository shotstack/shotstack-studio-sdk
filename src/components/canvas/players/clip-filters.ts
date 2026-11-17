import { KeyframeBuilder } from "@animations/keyframe-builder";
import type { Size } from "@layouts/geometry";
import type { Keyframe, ResolvedClip } from "@schemas";
import * as pixi from "pixi.js";

import { ColorFilter } from "./color-filter";
import { GradeFilter } from "./grade-filter";
import { HueFilter } from "./hue-filter";
import { PixelateFilter } from "./pixelate-filter";
import { RgbSplitFilter } from "./rgb-split-filter";
import { SharpenFilter } from "./sharpen-filter";
import type { UniformFilter } from "./uniform-filter";

// pixi's Gaussian at this strength spreads as far as the render's radius-10 box blur (σ ≈ 6.06 px).
export const CLIP_BLUR_STRENGTH = 4.69;

export type ClipFilterEntry = NonNullable<ResolvedClip["filters"]>[number];

export interface BuiltClipFilter {
	filter: pixi.Filter;
	/**
	 * time is seconds into the clip; scale is screen pixels per pixel of the frame the render filters, and frame is that
	 * frame's size in render pixels, as sizeBlurs computes them.
	 */
	update(time: number, scale: number, frame: Size): void;
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

interface Reading {
	at(time: number): number;
	atNeutral: boolean;
}

const UNIT: Range = { neutral: 0, low: -1, high: 1 };

// A plain value and both ends of every tween are limited to the range before any easing, as the render does; an easing
// can still overshoot, so each reading is limited too. Anything that is neither a number nor tweens holds the neutral value.
function readField(value: unknown, { neutral, low, high }: Range): Reading {
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

function buildUniformFilter<U extends string>(
	filter: () => UniformFilter<U>,
	readings: Partial<Record<U, Reading>>,
	significant: readonly Reading[] = Object.values<Reading | undefined>(readings).filter(reading => reading !== undefined)
): BuiltClipFilter | null {
	if (significant.every(reading => reading.atNeutral)) return null;

	const built = filter();
	const uniforms = built.uniforms as Record<string, number>;
	return {
		filter: built,
		update: (time, scale, frame) => {
			Object.entries<Reading | undefined>(readings).forEach(([name, reading]) => {
				if (reading) uniforms[name] = reading.at(time);
			});
			if ("uScale" in uniforms) {
				uniforms["uScale"] = scale;
				uniforms["uFrameWidth"] = frame.width;
				uniforms["uFrameHeight"] = frame.height;
			}
		}
	};
}

function buildBlur(entry: Extract<ClipFilterEntry, { type: "blur" }>): BuiltClipFilter | null {
	const range = { neutral: 0, low: 0, high: 100 };
	const x = readField(entry.x ?? entry.value, range);
	const y = readField(entry.y ?? entry.value, range);
	if (x.atNeutral && y.atNeutral) return null;

	const filter = new pixi.BlurFilter();
	filter.repeatEdgePixels = true;
	return {
		filter,
		update: (time, scale) => {
			filter.strengthX = x.at(time) * (CLIP_BLUR_STRENGTH / 10) * scale;
			filter.strengthY = y.at(time) * (CLIP_BLUR_STRENGTH / 10) * scale;
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
		case "hue":
			return buildUniformFilter(() => new HueFilter(), { uDegrees: readField(entry.value, { neutral: 0, low: -Infinity, high: Infinity }) });
		case "grade":
			return buildUniformFilter(() => new GradeFilter(), {
				uExposure: readField(entry.exposure, { neutral: 0, low: -4, high: 4 }),
				uTemperature: readField(entry.temperature, UNIT),
				uTint: readField(entry.tint, UNIT),
				uHighlights: readField(entry.highlights, UNIT),
				uShadows: readField(entry.shadows, UNIT),
				uVibrance: readField(entry.vibrance, UNIT)
			});
		case "sharpen": {
			const amount = readField(entry.value, { neutral: 0, low: 0, high: 40 });
			const radius = readField(entry.radius, { neutral: 3, low: 0, high: 10 });
			return buildUniformFilter(() => new SharpenFilter(), { uAmount: amount, uRadius: radius }, [amount]);
		}
		case "pixelate":
			// 0.9999 is the top of the render's range; a constant 0 is skipped as the render skips it.
			return buildUniformFilter(() => new PixelateFilter(), { uValue: readField(entry.value, { neutral: 0, low: 0, high: 0.9999 }) });
		case "rgbSplit":
			return buildUniformFilter(() => new RgbSplitFilter(), { uX: readField(entry.x, UNIT), uY: readField(entry.y, UNIT) });
		case "blur":
			return buildBlur(entry);
		default:
			return null;
	}
}

export function buildClipFilters(entries: readonly ClipFilterEntry[]): BuiltClipFilter[] {
	return entries.flatMap(entry => buildClipFilter(entry) ?? []);
}
