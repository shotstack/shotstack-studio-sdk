import { Entity } from "@core/shared/entity";

import { ITimelineFeature, ITimelineRenderer, ITimelineState } from "../interfaces";
import { StateChanges } from "../types";

/**
 * Abstract base class for timeline features
 * Provides common functionality for features like snapping, guidelines, auto-scroll, etc.
 */
export abstract class TimelineFeature extends Entity implements ITimelineFeature {
	public abstract readonly name: string;
	protected isEnabled: boolean = true;
	
	protected state: ITimelineState;
	
	constructor(state: ITimelineState) {
		super();
		this.state = state;
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
	
	// Entity lifecycle
	public async load(): Promise<void> {
		// Base implementation - features can override if needed
		// Note: onEnable is called by setEnabled or during construction if enabled
	}
	
	public update(_deltaTime: number, _elapsed: number): void {
		// Base implementation - features can override if needed
	}
	
	public draw(): void {
		// Base implementation - features can override if needed
		// Note: Actual overlay rendering happens in renderOverlay
	}
	
	public dispose(): void {
		if (this.isEnabled) {
			this.onDisable();
		}
		super.dispose();
	}
	
	// Protected utility methods for derived features
	protected getState() {
		return this.state.getState();
	}
	
	protected updateState(updates: Partial<ReturnType<typeof this.getState>>) {
		this.state.update(updates);
	}
	
	// Feature configuration helpers
	protected getFeatureConfig<T = any>(): T | undefined {
		const state = this.getState();
		return (state.features as any)[this.name];
	}
	
	protected updateFeatureConfig(config: any): void {
		const currentFeatures = this.getState().features;
		this.updateState({
			features: {
				...currentFeatures,
				[this.name]: config
			}
		});
	}
}