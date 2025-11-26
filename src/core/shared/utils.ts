/** @internal */
function isObject(item: unknown): item is Record<string, unknown> {
	return Boolean(item && typeof item === "object" && !Array.isArray(item));
}

/** @internal */
export function deepMerge<T extends Record<string, unknown>, U extends Record<string, unknown>>(target: T, source: U): T & U {
	const output = { ...target } as T & U;

	if (isObject(target) && isObject(source)) {
		Object.keys(source).forEach(key => {
			// Prevent prototype pollution
			if (key === "__proto__" || key === "constructor" || key === "prototype") {
				return;
			}

			const sourceValue = source[key];
			const targetValue = target[key];

			if (isObject(sourceValue)) {
				if (key in target && isObject(targetValue)) {
					// Both are objects, merge recursively
					(output as Record<string, unknown>)[key] = deepMerge(targetValue, sourceValue);
				} else {
					// Target is not an object or key doesn't exist
					// Clone the source object to prevent shared references
					(output as Record<string, unknown>)[key] = deepMerge({}, sourceValue);
				}
			} else {
				// Source is not an object (primitive or array), overwrite
				// Arrays and primitives are copied directly (arrays are replaced, not merged)
				(output as Record<string, unknown>)[key] = sourceValue;
			}
		});
	}

	return output;
}
