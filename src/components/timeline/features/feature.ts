import { Entity } from "@core/shared/entity";

import { ITimelineFeature, ITimelineRenderer, ITimelineState, ITimelineFeatureContext } from "../types/timeline.interfaces";
import { StateChanges } from "../types/timeline.types";

/**
 * Abstract base class for timeline features
 * Provides common functionality for features like snapping, guidelines, auto-scroll, etc.
 */
export abstract class TimelineFeature extends Entity implements ITimelineFeature {
	public abstract readonly name: string;
	protected isEnabled = false;

	constructor(protected state: ITimelineState, protected context: ITimelineFeatureContext) {
		super();
	}

	public get enabled(): boolean {
		return this.isEnabled;
	}

	public setEnabled(enabled: boolean): void {
		if (this.isEnabled === enabled) return;
		this.isEnabled = enabled;
		if (enabled) {
			this.onEnable();
		} else {
			this.onDisable();
		}
	}

	// Lifecycle methods
	public abstract onEnable(): void;
	public abstract onDisable(): void;

	// Feature-specific rendering
	public abstract renderOverlay(renderer: ITimelineRenderer): void;

	// Coordination methods (optional override)
	public onToolChanged?(newTool: string, previousTool: string | null): void;
	public onStateChanged?(changes: StateChanges): void;

	// Entity lifecycle - keep empty implementations for Entity interface
	public async load(): Promise<void> {
		// Base implementation - features can override if needed
	}
	public update(__deltaTime: number, __elapsed: number): void {}
	public draw(): void {}

	public dispose(): void {
		if (this.isEnabled) this.onDisable();
	}

	// Protected utility methods for derived features
	protected getState() {
		return this.state.getState();
	}

	protected updateState(updates: Partial<ReturnType<typeof this.getState>>) {
		this.state.update(updates);
	}

	// Feature configuration helper - combines get/set operations
	protected featureConfig<T = Record<string, unknown>>(update?: Partial<T>): T | undefined {
		const state = this.getState();
		const currentConfig = (state.features as Record<string, unknown>)[this.name] as T | undefined;

		if (update) {
			this.updateState({
				features: {
					...state.features,
					[this.name]: { ...currentConfig, ...update }
				}
			});
			return { ...currentConfig, ...update } as T;
		}

		return currentConfig;
	}
}
