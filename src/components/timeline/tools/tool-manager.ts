import { Edit } from "@core/edit";
import * as PIXI from "pixi.js";

import { TimelinePointerEvent } from "../types";
import { IToolManager, ITimelineTool, ITimelineState, IFeatureManager, IToolInterceptor } from "../types/timeline.interfaces";

/**
 * Manages timeline tools and delegates input events to the active tool
 */
export class ToolManager implements IToolManager {
	private tools: Map<string, ITimelineTool> = new Map();
	private interceptors: Map<string, IToolInterceptor> = new Map();
	private sortedInterceptors: IToolInterceptor[] = [];
	private activeTool: ITimelineTool | null = null;
	private featureManager: IFeatureManager | null = null;
	private cursorElement: HTMLElement | null = null;

	constructor(
		private state: ITimelineState,
		private edit: Edit
	) {}

	public register(tool: ITimelineTool): void {
		if (this.tools.has(tool.name)) {
			console.warn(`Tool "${tool.name}" is already registered`);
			return;
		}
		this.tools.set(tool.name, tool);
		tool.load().catch(error => console.error(`Failed to load tool "${tool.name}":`, error));
	}

	public unregister(name: string): void {
		const tool = this.tools.get(name);
		if (!tool) return;

		if (this.activeTool === tool) {
			this.activeTool.onDeactivate();
			this.activeTool = null;
		}
		tool.dispose();
		this.tools.delete(name);
	}

	public activate(name: string): void {
		const tool = this.tools.get(name);
		if (!tool) {
			console.error(`Tool "${name}" not found`);
			return;
		}

		const previousToolName = this.activeTool?.name || null;

		this.activeTool?.onDeactivate();
		this.activeTool = tool;
		tool.onActivate();
		this.updateCursor(tool.cursor);
		this.state.update({ activeTool: name });
		this.featureManager?.onToolChanged(name, previousToolName);
	}

	public getActiveTool = (): ITimelineTool | null => this.activeTool;
	public getAllTools = (): Map<string, ITimelineTool> => new Map(this.tools);

	public setFeatureManager(featureManager: IFeatureManager): void {
		this.featureManager = featureManager;
	}

	public setCursorElement(element: HTMLElement): void {
		this.cursorElement = element;
		if (this.activeTool) this.updateCursor(this.activeTool.cursor);
	}

	public registerInterceptor(interceptor: IToolInterceptor): void {
		if (this.interceptors.has(interceptor.name)) {
			console.warn(`Interceptor "${interceptor.name}" is already registered`);
			return;
		}
		this.interceptors.set(interceptor.name, interceptor);
		this.updateSortedInterceptors();
	}

	public unregisterInterceptor(name: string): void {
		if (this.interceptors.delete(name)) {
			this.updateSortedInterceptors();
		}
	}

	private updateSortedInterceptors(): void {
		this.sortedInterceptors = Array.from(this.interceptors.values()).sort((a, b) => b.priority - a.priority);
	}

	private checkInterceptors<T extends TimelinePointerEvent>(event: T, method: keyof IToolInterceptor): boolean {
		for (const interceptor of this.sortedInterceptors) {
			if ((interceptor[method] as (event: T) => boolean)?.(event)) return true;
		}
		return false;
	}

	public handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const timelineEvent: TimelinePointerEvent = event;
		if (!this.checkInterceptors(timelineEvent, "interceptPointerDown")) {
			this.activeTool?.onPointerDown?.(timelineEvent);
		}
	}

	public handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		const timelineEvent: TimelinePointerEvent = event;

		// Update cursor from first interceptor or active tool
		const cursor = this.sortedInterceptors.map(i => i.getCursor?.(timelineEvent)).find(c => c) || this.activeTool?.cursor;

		if (cursor) this.updateCursor(cursor);

		if (!this.checkInterceptors(timelineEvent, "interceptPointerMove")) {
			this.activeTool?.onPointerMove?.(timelineEvent);
		}
	}

	public handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		const timelineEvent: TimelinePointerEvent = event;
		if (!this.checkInterceptors(timelineEvent, "interceptPointerUp")) {
			this.activeTool?.onPointerUp?.(timelineEvent);
		}
	}

	public handleWheel(event: WheelEvent): void {
		if (!this.activeTool?.onWheel) return;

		const { deltaX, deltaY, deltaMode, ctrlKey, shiftKey, altKey, metaKey } = event;
		this.activeTool.onWheel({
			deltaX,
			deltaY,
			deltaMode,
			ctrlKey,
			shiftKey,
			altKey,
			metaKey,
			preventDefault: () => event.preventDefault()
		});
	}

	public handleKeyDown = (event: KeyboardEvent): void => this.activeTool?.onKeyDown?.(event);
	public handleKeyUp = (event: KeyboardEvent): void => this.activeTool?.onKeyUp?.(event);

	private updateCursor = (cursor: string): void => this.cursorElement?.style.setProperty("cursor", cursor);
}
