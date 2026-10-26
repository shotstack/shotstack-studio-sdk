import { type AnimationKeyframe } from "@schemas";

import { KeyframeBuilder } from "./keyframe-builder";

type CompositionMode = "additive" | "multiplicative";

/**
 * Composes multiple keyframe layers into a single value using additive or multiplicative blending.
 *
 * - **Additive mode**: `base + Σ(layer deltas)` - used for offset and rotation
 * - **Multiplicative mode**: `base × Π(layer factors)` - used for scale and opacity
 *
 * This enables effects and transitions to run simultaneously without conflicts.
 */
export class ComposedKeyframeBuilder {
	private readonly baseValue: number;
	private readonly mode: CompositionMode;
	private readonly layers: KeyframeBuilder[] = [];
	private readonly clampRange?: { min: number; max: number };

	constructor(baseValue: number, mode: CompositionMode, clampRange?: { min: number; max: number }) {
		this.baseValue = baseValue;
		this.mode = mode;
		this.clampRange = clampRange;
	}

	/**
	 * Add a keyframe layer to the composition.
	 * For additive mode, keyframes should represent deltas (e.g., 0 → 0.1 means "move by 0.1")
	 * For multiplicative mode, keyframes should represent factors (e.g., 1 → 1.3 means "scale by 1.3x")
	 */
	addLayer(keyframes: AnimationKeyframe[]): void {
		if (keyframes.length === 0) return;

		this.layers.push(new KeyframeBuilder(keyframes));
	}

	/**
	 * Get the composed value at a specific time.
	 * Combines base value with all layer values using the composition mode.
	 */
	getValue(time: number): number {
		if (this.layers.length === 0) {
			return this.baseValue;
		}

		if (this.mode === "additive") {
			let result = this.baseValue;
			for (const layer of this.layers) {
				result += layer.getValue(time);
			}
			return result;
		}
		let result = this.baseValue;
		for (const layer of this.layers) {
			result *= layer.getValue(time);
		}
		// Clamp to range if specified (e.g., [0, 1] for opacity)
		if (this.clampRange) {
			result = Math.max(this.clampRange.min, Math.min(this.clampRange.max, result));
		}
		return result;
	}
}
