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

export type ExportIssueCode =
	"ai-pending" | "output-format" | "video-source" | "chroma-key" | "filter" | "html" | "effect" | "transition" | "font" | "too-long" | "browser";

export interface ExportIssue {
	code: ExportIssueCode;
	message: string;
	clipId?: string;
}

/**
 * Export error with context
 */
export class ExportError extends Error {
	constructor(
		message: string,
		public readonly phase: string = "unknown",
		public readonly context: Record<string, unknown> = {},
		cause?: Error,
		public readonly issues?: ExportIssue[]
	) {
		super(message);
		this.name = "ExportError";
		this.cause = cause;
	}
}
