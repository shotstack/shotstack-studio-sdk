/** Pure timing math for export. */
export function videoSourceTime(timestamp: number, clipStart: number, trim: number): number {
	return timestamp - clipStart + trim;
}

/** A linear volume segment, clip-local seconds. */
export interface VolumeTween {
	from: number;
	to: number;
	start?: number;
	length?: number;
}

/** A volume automation point, clip-local. `time` seconds from the clip's start. */
export interface VolumePoint {
	time: number;
	value: number;
}

/**
 * Resolve a clip's volume into linear automation points, mirroring the player model:
 * a volume tween array wins; otherwise a scalar with an optional fade of min(2, length/2)s.
 * Apply as setValueAtTime(points[0]) then linearRampToValueAtTime for the rest.
 */
export function buildVolumeAutomation(volume: number | VolumeTween[] | undefined, effect: string | undefined, length: number): VolumePoint[] {
	const clamp = (t: number): number => Math.min(length, Math.max(0, t));

	if (Array.isArray(volume)) {
		const points: VolumePoint[] = [];
		for (const tween of volume) {
			const start = clamp(tween.start ?? 0);
			const end = clamp(start + (tween.length ?? length - start));
			points.push({ time: start, value: tween.from });
			points.push({ time: end, value: tween.to });
		}
		return points.length ? points : [{ time: 0, value: 1 }];
	}

	const base = typeof volume === "number" ? volume : 1;
	const fade = Math.min(2, length / 2);

	if (effect === "fadeIn") {
		return [
			{ time: 0, value: 0 },
			{ time: clamp(fade), value: base },
			{ time: length, value: base }
		];
	}
	if (effect === "fadeOut") {
		return [
			{ time: 0, value: base },
			{ time: clamp(length - fade), value: base },
			{ time: length, value: 0 }
		];
	}
	if (effect === "fadeInFadeOut") {
		return [
			{ time: 0, value: 0 },
			{ time: clamp(fade), value: base },
			{ time: clamp(length - fade), value: base },
			{ time: length, value: 0 }
		];
	}
	return [{ time: 0, value: base }];
}
