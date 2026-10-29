/** A pass's frames from the anchor on, then those before it. Pages only seek forward, so each segment needs a fresh page. */
export function passSegments(indices: readonly number[], anchor: number): number[][] {
	return [indices.filter(i => i >= anchor), indices.filter(i => i < anchor)].filter(segment => segment.length > 0);
}
