/**
 * OutputSettingsManager - Manages output configuration (size, fps, format, resolution, etc.)
 *
 * Extracted from Edit to reduce God Class complexity.
 * Handles validation, state updates, document sync, and event emission.
 */

import type { EditDocument } from "@core/edit-document";
import { EditEvent } from "@core/events/edit-events";
import type { EventEmitter } from "@core/events/event-emitter";
import type { Destination, ResolvedEdit } from "@core/schemas";
import {
	DestinationSchema,
	OutputAspectRatioSchema,
	OutputFormatSchema,
	OutputFpsSchema,
	OutputResolutionSchema,
	OutputSizeSchema
} from "@core/schemas";
import type { Size } from "@layouts/geometry";

// ─── Resolution Preset Dimensions ─────────────────────────────────────────────

/**
 * Base dimensions for each resolution preset (16:9 aspect ratio)
 */
const RESOLUTION_DIMENSIONS: Record<string, { width: number; height: number }> = {
	preview: { width: 512, height: 288 },
	mobile: { width: 640, height: 360 },
	sd: { width: 1024, height: 576 },
	hd: { width: 1280, height: 720 },
	"1080": { width: 1920, height: 1080 },
	"4k": { width: 3840, height: 2160 }
};

/**
 * Calculate output size from resolution preset and aspect ratio.
 * Resolution defines the base dimensions (16:9), aspectRatio transforms them.
 */
export function calculateSizeFromPreset(resolution: string, aspectRatio: string = "16:9"): Size {
	const base = RESOLUTION_DIMENSIONS[resolution];
	if (!base) {
		throw new Error(`Unknown resolution: ${resolution}`);
	}

	// Apply aspect ratio transformation
	// Base dimensions are 16:9, so we transform to the target aspect ratio
	switch (aspectRatio) {
		case "16:9":
			return { width: base.width, height: base.height };
		case "9:16":
			// Flip width and height for vertical orientation
			return { width: base.height, height: base.width };
		case "1:1":
			// Square - use height as base dimension
			return { width: base.height, height: base.height };
		case "4:5":
			// Short vertical - maintain height, adjust width to 4:5 ratio
			return { width: Math.round((base.height * 4) / 5), height: base.height };
		case "4:3":
			// Legacy TV - maintain height, adjust width to 4:3 ratio
			return { width: Math.round((base.height * 4) / 3), height: base.height };
		default:
			throw new Error(`Unknown aspectRatio: ${aspectRatio}`);
	}
}

// ─── Context Interface ────────────────────────────────────────────────────────

/**
 * Context interface for OutputSettingsManager dependencies.
 * Allows the manager to interact with Edit without tight coupling.
 */
export interface OutputSettingsContext {
	getEdit(): ResolvedEdit | null;
	getDocument(): EditDocument | null;
	getSize(): Size;
	setSize(size: Size): void;
	getEvents(): EventEmitter;
	updateCanvasForSize(): void;
	emitEditChanged(source: string): void;
}

// ─── OutputSettingsManager ────────────────────────────────────────────────────

export class OutputSettingsManager {
	constructor(private readonly context: OutputSettingsContext) {}

	// ─── Size ─────────────────────────────────────────────────────────────────

	/**
	 * Set output size (internal - called by SetOutputSizeCommand).
	 */
	setSize(width: number, height: number): void {
		const result = OutputSizeSchema.safeParse({ width, height });
		if (!result.success) {
			throw new Error(`Invalid size: ${result.error.issues[0]?.message}`);
		}

		const size: Size = { width, height };
		this.context.setSize(size);

		const edit = this.context.getEdit();
		if (edit) {
			edit.output = {
				...edit.output,
				size
			};
			// Clear resolution/aspectRatio (mutually exclusive with custom size)
			delete edit.output.resolution;
			delete edit.output.aspectRatio;
		}

		// Sync with document layer
		const doc = this.context.getDocument();
		doc?.setSize(size);
		doc?.clearResolution();
		doc?.clearAspectRatio();

		this.context.updateCanvasForSize();

		this.context.getEvents().emit(EditEvent.OutputResized, size);
		// Note: emitEditChanged is handled by executeCommand
	}

	getSize(): Size {
		return this.context.getSize();
	}

	// ─── FPS ──────────────────────────────────────────────────────────────────

	/**
	 * Set output FPS (internal - called by SetOutputFpsCommand).
	 */
	setFps(fps: number): void {
		const result = OutputFpsSchema.safeParse(fps);
		if (!result.success) {
			throw new Error(`Invalid fps: ${result.error.issues[0]?.message}`);
		}

		const edit = this.context.getEdit();
		if (edit) {
			edit.output = {
				...edit.output,
				fps: result.data
			};
		}

		// Sync with document layer
		this.context.getDocument()?.setFps(result.data);

		this.context.getEvents().emit(EditEvent.OutputFpsChanged, { fps });
		// Note: emitEditChanged is handled by executeCommand
	}

	getFps(): number {
		return this.context.getEdit()?.output?.fps ?? 30;
	}

	// ─── Format ───────────────────────────────────────────────────────────────

	setFormat(format: string): void {
		const result = OutputFormatSchema.safeParse(format);
		if (!result.success) {
			throw new Error(`Invalid format: ${result.error.issues[0]?.message}`);
		}

		const edit = this.context.getEdit();
		if (edit) {
			edit.output = {
				...edit.output,
				format: result.data
			};
		}

		// Sync with document layer
		this.context.getDocument()?.setFormat(result.data);

		this.context.getEvents().emit(EditEvent.OutputFormatChanged, { format: result.data });
		this.context.emitEditChanged("output:format");
	}

	getFormat(): string {
		return this.context.getEdit()?.output?.format ?? "mp4";
	}

	// ─── Destinations ─────────────────────────────────────────────────────────

	setDestinations(destinations: Destination[]): void {
		const result = DestinationSchema.array().safeParse(destinations);
		if (!result.success) {
			throw new Error(`Invalid destinations: ${result.error.message}`);
		}

		const edit = this.context.getEdit();
		if (edit) {
			edit.output = {
				...edit.output,
				destinations: result.data
			};
		}

		this.context.getEvents().emit(EditEvent.OutputDestinationsChanged, { destinations: result.data });
		this.context.emitEditChanged("output:destinations");
	}

	getDestinations(): Destination[] {
		return this.context.getEdit()?.output?.destinations ?? [];
	}

	// ─── Resolution ───────────────────────────────────────────────────────────

	setResolution(resolution: string): void {
		const result = OutputResolutionSchema.safeParse(resolution);
		if (!result.success || !result.data) {
			throw new Error(`Invalid resolution: ${result.success ? "resolution is required" : result.error.issues[0]?.message}`);
		}

		const validatedResolution = result.data;
		const edit = this.context.getEdit();
		const aspectRatio = edit?.output?.aspectRatio ?? "16:9";
		const newSize = calculateSizeFromPreset(validatedResolution, aspectRatio);

		// Update runtime state
		this.context.setSize(newSize);

		if (edit) {
			edit.output = {
				...edit.output,
				resolution: validatedResolution
			};
			// Clear custom size (mutually exclusive with resolution/aspectRatio)
			delete edit.output.size;
		}

		// Sync with document layer (size is cleared for mutual exclusivity)
		const doc = this.context.getDocument();
		doc?.setResolution(validatedResolution);
		doc?.clearSize();

		this.context.updateCanvasForSize();

		const events = this.context.getEvents();
		events.emit(EditEvent.OutputResolutionChanged, { resolution: validatedResolution });
		events.emit(EditEvent.OutputResized, { width: newSize.width, height: newSize.height });
		this.context.emitEditChanged("output:resolution");
	}

	getResolution(): string | undefined {
		return this.context.getEdit()?.output?.resolution;
	}

	// ─── Aspect Ratio ─────────────────────────────────────────────────────────

	setAspectRatio(aspectRatio: string): void {
		const result = OutputAspectRatioSchema.safeParse(aspectRatio);
		if (!result.success || !result.data) {
			throw new Error(`Invalid aspectRatio: ${result.success ? "aspectRatio is required" : result.error.issues[0]?.message}`);
		}

		const validatedAspectRatio = result.data;
		const edit = this.context.getEdit();
		const resolution = edit?.output?.resolution;

		if (!resolution) {
			// If no resolution is set, just store the aspectRatio without recalculating size
			if (edit) {
				edit.output = {
					...edit.output,
					aspectRatio: validatedAspectRatio
				};
			}
			this.context.getDocument()?.setAspectRatio(validatedAspectRatio);
			this.context.getEvents().emit(EditEvent.OutputAspectRatioChanged, { aspectRatio: validatedAspectRatio });
			this.context.emitEditChanged("output:aspectRatio");
			return;
		}

		// Recalculate size based on current resolution and new aspectRatio
		const newSize = calculateSizeFromPreset(resolution, validatedAspectRatio);

		// Update runtime state
		this.context.setSize(newSize);

		if (edit) {
			edit.output = {
				...edit.output,
				aspectRatio: validatedAspectRatio
			};
			// Clear custom size (mutually exclusive with resolution/aspectRatio)
			delete edit.output.size;
		}

		// Sync with document layer (size is cleared for mutual exclusivity)
		const doc = this.context.getDocument();
		doc?.setAspectRatio(validatedAspectRatio);
		doc?.clearSize();

		this.context.updateCanvasForSize();

		const events = this.context.getEvents();
		events.emit(EditEvent.OutputAspectRatioChanged, { aspectRatio: validatedAspectRatio });
		events.emit(EditEvent.OutputResized, { width: newSize.width, height: newSize.height });
		this.context.emitEditChanged("output:aspectRatio");
	}

	getAspectRatio(): string | undefined {
		return this.context.getEdit()?.output?.aspectRatio;
	}
}
