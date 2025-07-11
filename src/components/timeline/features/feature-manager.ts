import { IFeatureManager, ITimelineFeature, ITimelineState, ITimelineRenderer } from "../interfaces";
import { StateChanges, TimelineState, TimelineWheelEvent, TimelinePointerEvent } from "../types";

/**
 * Manages timeline features and coordinates their lifecycle
 */
export class FeatureManager implements IFeatureManager {
	private features: Map<string, ITimelineFeature> = new Map();
	private state: ITimelineState;

	constructor(state: ITimelineState) {
		this.state = state;
		this.state.subscribe((_state, changes) => this.onStateChanged(changes));
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

	public enable = (name: string): void => this.features.get(name)?.setEnabled(true);
	public disable = (name: string): void => this.features.get(name)?.setEnabled(false);
	public getFeature = (name: string): ITimelineFeature | null => this.features.get(name) || null;
	public getAllFeatures = (): Map<string, ITimelineFeature> => new Map(this.features);

	private forEachEnabledFeature(callback: (feature: ITimelineFeature) => void, errorContext: string): void {
		this.features.forEach(feature => {
			if (feature.enabled) {
				try {
					callback(feature);
				} catch (error) {
					console.error(`Error in feature "${feature.name}" ${errorContext}:`, error);
				}
			}
		});
	}

	public onToolChanged(toolName: string, previousTool: string | null): void {
		this.forEachEnabledFeature(feature => feature.onToolChanged?.(toolName, previousTool), "onToolChanged");
	}

	public onStateChanged(changes: StateChanges): void {
		this.forEachEnabledFeature(feature => feature.onStateChanged?.(changes), "onStateChanged");
	}

	public renderOverlays(renderer: ITimelineRenderer): void {
		this.forEachEnabledFeature(feature => feature.renderOverlay(renderer), "renderOverlay");
	}

	private handleEvent<T>(event: T, handlerName: string): boolean {
		for (const feature of this.features.values()) {
			if (feature.enabled && handlerName in feature) {
				const handled = (feature as any)[handlerName](event);
				if (handled !== false) {
					return true;
				}
			}
		}
		return false;
	}

	public handleWheel = (event: TimelineWheelEvent): boolean => this.handleEvent(event, "handleWheel");

	public handleKeyDown = (event: KeyboardEvent): boolean => this.handleEvent(event, "handleKeyDown");

	public handleKeyUp = (event: KeyboardEvent): boolean => this.handleEvent(event, "handleKeyUp");

	public handlePointerDown = (event: TimelinePointerEvent): boolean => this.handleEvent(event, "handlePointerDown");

	public handlePointerMove = (event: TimelinePointerEvent): boolean => this.handleEvent(event, "handlePointerMove");

	public handlePointerUp = (event: TimelinePointerEvent): boolean => this.handleEvent(event, "handlePointerUp");
}
