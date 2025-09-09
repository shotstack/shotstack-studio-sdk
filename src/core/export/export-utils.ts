/**
 * Export utilities
 */

/**
 * Bounded cache - automatically evicts oldest entries when max size reached
 */
/* eslint-disable max-classes-per-file */

export class SimpleLRUCache<T> extends Map<string, T> {
	constructor(private maxSize: number) {
		super();
	}

	override get(key: string): T | undefined {
		const value = super.get(key);
		if (value !== undefined) {
			// Move to end (most recently used)
			super.delete(key);
			super.set(key, value);
			return value;
		}
		return undefined;
	}

	override set(key: string, value: T): this {
		super.delete(key); // Remove if exists to update position
		super.set(key, value);
		if (this.size > this.maxSize) {
			const firstKey = this.keys().next().value;
			if (firstKey) this.delete(firstKey);
		}
		return this;
	}
}

/**
 * Export error with context
 */
export class ExportError extends Error {
	constructor(
		message: string,
		public readonly phase: string = 'unknown',
		public readonly context: Record<string, any> = {},
		cause?: Error
	) {
		super(message);
		this.name = 'ExportError';
		this.cause = cause;
	}
}

/**
 * Browser compatibility error
 */
export class BrowserCompatibilityError extends ExportError {
	constructor(message: string, missingFeatures: string[]) {
		super(message, 'initialization', { missingFeatures });
		this.name = 'BrowserCompatibilityError';
	}
}