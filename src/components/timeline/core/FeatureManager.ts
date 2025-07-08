import { IFeatureManager, ITimelineFeature, ITimelineState, ITimelineRenderer } from "../interfaces";
import { StateChanges, TimelineState, TimelineWheelEvent } from "../types";

/**
 * Manages timeline features and coordinates their lifecycle
 */
export class FeatureManager implements IFeatureManager {
	private features: Map<string, ITimelineFeature> = new Map();
	private state: ITimelineState;

	constructor(state: ITimelineState) {
		this.state = state;

		// Subscribe to state changes
		this.state.subscribe(this.handleStateChange.bind(this));
	}

	public register(feature: ITimelineFeature): void {
		if (this.features.has(feature.name)) {
			console.warn(`Feature "${feature.name}" is already registered`);
			return;
		}

		this.features.set(feature.name, feature);
		feature.load().catch(error => {
			console.error(`Failed to load feature "${feature.name}":`, error);
		});
	}

	public unregister(name: string): void {
		const feature = this.features.get(name);
		if (feature) {
			if (feature.enabled) {
				feature.onDisable();
			}
			feature.dispose();
			this.features.delete(name);
		}
	}

	public enable(name: string): void {
		const feature = this.features.get(name);
		if (feature) {
			feature.setEnabled(true);
		}
	}

	public disable(name: string): void {
		const feature = this.features.get(name);
		if (feature) {
			feature.setEnabled(false);
		}
	}

	public getFeature(name: string): ITimelineFeature | null {
		return this.features.get(name) || null;
	}

	public getAllFeatures(): Map<string, ITimelineFeature> {
		return new Map(this.features);
	}

	public onToolChanged(toolName: string, previousTool: string | null): void {
		// Notify all features about tool change
		this.features.forEach(feature => {
			if (feature.enabled && feature.onToolChanged) {
				try {
					feature.onToolChanged(toolName, previousTool);
				} catch (error) {
					console.error(`Error in feature "${feature.name}" onToolChanged:`, error);
				}
			}
		});
	}

	public onStateChanged(changes: StateChanges): void {
		// Notify all features about state changes
		this.features.forEach(feature => {
			if (feature.enabled && feature.onStateChanged) {
				try {
					feature.onStateChanged(changes);
				} catch (error) {
					console.error(`Error in feature "${feature.name}" onStateChanged:`, error);
				}
			}
		});
	}

	public renderOverlays(renderer: ITimelineRenderer): void {
		// Let each enabled feature render its overlay
		this.features.forEach(feature => {
			if (feature.enabled) {
				try {
					feature.renderOverlay(renderer);
				} catch (error) {
					console.error(`Error rendering overlay for feature "${feature.name}":`, error);
				}
			}
		});
	}

	private handleStateChange(_state: TimelineState, changes: StateChanges): void {
		// Forward state changes to features
		this.onStateChanged(changes);
	}

	// Event handling methods
	public handleWheel(event: TimelineWheelEvent): boolean {
		// Check each enabled feature for wheel handling
		for (const feature of this.features.values()) {
			if (feature.enabled && 'handleWheel' in feature) {
				const handled = (feature as any).handleWheel(event);
				if (handled !== false) {
					return true; // Event was handled
				}
			}
		}
		return false;
	}

	public handleKeyDown(event: KeyboardEvent): boolean {
		// Check each enabled feature for key down handling
		for (const feature of this.features.values()) {
			if (feature.enabled && 'handleKeyDown' in feature) {
				const handled = (feature as any).handleKeyDown(event);
				if (handled !== false) {
					return true; // Event was handled
				}
			}
		}
		return false;
	}

	public handleKeyUp(event: KeyboardEvent): boolean {
		// Check each enabled feature for key up handling
		for (const feature of this.features.values()) {
			if (feature.enabled && 'handleKeyUp' in feature) {
				const handled = (feature as any).handleKeyUp(event);
				if (handled !== false) {
					return true; // Event was handled
				}
			}
		}
		return false;
	}
}
