import { TimelineFeature } from "../core/TimelineFeature";
import { StateChanges } from "../types/timeline.types";

/**
 * Feature that provides snapping functionality for timeline operations
 * This is a stub implementation for future development
 */
export class SnappingFeature extends TimelineFeature {
	public readonly name = "snapping";

	public override async load(): Promise<void> {
		// Stub implementation
	}

	public onEnable(): void {
		// Stub implementation
	}

	public onDisable(): void {
		// Stub implementation
	}

	public override update(__deltaTime: number, __elapsed: number): void {
		// Stub implementation
	}

	public override draw(): void {
		// Stub implementation
	}

	public renderOverlay(__renderer: unknown): void {
		// Stub implementation
	}

	public override onToolChanged(__newTool: string, __previousTool: string | null): void {
		// Stub implementation
	}

	public override onStateChanged(__changes: StateChanges): void {
		// Stub implementation
	}

	public override dispose(): void {
		// Stub implementation
	}
}