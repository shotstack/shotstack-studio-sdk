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

/**
 * Set a nested value on an object using dot notation.
 * e.g., setNestedValue(obj, "asset.src", "value") sets obj.asset.src = "value"
 * @internal
 */
export function setNestedValue(obj: unknown, path: string, value: unknown): void {
	const parts = path.split(".");
	let current: unknown = obj;
	for (let i = 0; i < parts.length - 1; i += 1) {
		if (current === null || current === undefined || typeof current !== "object") return;
		current = (current as Record<string, unknown>)[parts[i]];
	}
	if (current !== null && current !== undefined && typeof current === "object") {
		(current as Record<string, unknown>)[parts[parts.length - 1]] = value;
	}
}

/**
 * Get a nested value from an object using dot notation.
 * e.g., getNestedValue(obj, "asset.src") returns obj.asset.src
 * @internal
 */
export function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export interface UrlValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate that a URL is accessible before attempting to load it as an asset.
 * Uses HEAD request to check CORS and availability without downloading the full asset.
 * @internal
 */
export async function validateAssetUrl(url: string): Promise<UrlValidationResult> {
	// Basic URL format validation
	try {
		// eslint-disable-next-line no-new -- URL constructor validates format
		new URL(url);
	} catch {
		return { valid: false, error: "Invalid URL format" };
	}

	// Check accessibility via HEAD request
	try {
		const response = await fetch(url, { method: "HEAD", mode: "cors" });
		if (!response.ok) {
			return { valid: false, error: `URL returned ${response.status} ${response.statusText}` };
		}
		return { valid: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "URL not accessible";
		return { valid: false, error: message };
	}
}
