import { Edit } from "@core/edit";
import * as PIXI from "pixi.js";

import { IToolManager, ITimelineTool, ITimelineState, IFeatureManager, IToolInterceptor } from "../interfaces";
import { TimelineWheelEvent, TimelinePointerEvent } from "../types";

/**
 * Manages timeline tools and delegates input events to the active tool
 */
export class ToolManager implements IToolManager {
	private tools: Map<string, ITimelineTool> = new Map();
	private interceptors: Map<string, IToolInterceptor> = new Map();
	private sortedInterceptors: IToolInterceptor[] = [];
	private activeTool: ITimelineTool | null = null;
	private state: ITimelineState;
	private edit: Edit;
	private featureManager: IFeatureManager | null = null;
	private cursorElement: HTMLElement | null = null;

	constructor(state: ITimelineState, edit: Edit) {
		this.state = state;
		this.edit = edit;
	}

	public register(tool: ITimelineTool): void {
		if (this.tools.has(tool.name)) {
			console.warn(`Tool "${tool.name}" is already registered`);
			return;
		}

		this.tools.set(tool.name, tool);
		tool.load().catch(error => {
			console.error(`Failed to load tool "${tool.name}":`, error);
		});
	}

	public unregister(name: string): void {
		const tool = this.tools.get(name);
		if (tool) {
			if (this.activeTool === tool) {
				this.activeTool.onDeactivate();
				this.activeTool = null;
			}
			tool.dispose();
			this.tools.delete(name);
		}
	}

	public activate(name: string): void {
		const tool = this.tools.get(name);
		if (!tool) {
			console.error(`Tool "${name}" not found`);
			return;
		}

		const previousToolName = this.activeTool?.name || null;

		// Deactivate current tool
		if (this.activeTool) {
			this.activeTool.onDeactivate();
		}

		// Activate new tool
		this.activeTool = tool;
		tool.onActivate();

		// Update cursor
		this.updateCursor(tool.cursor);

		// Update state
		this.state.update({ activeTool: name });

		// Notify features
		if (this.featureManager) {
			this.featureManager.onToolChanged(name, previousToolName);
		}
	}

	public getActiveTool(): ITimelineTool | null {
		return this.activeTool;
	}

	public getAllTools(): Map<string, ITimelineTool> {
		return new Map(this.tools);
	}

	public setFeatureManager(featureManager: IFeatureManager): void {
		this.featureManager = featureManager;
	}

	public setCursorElement(element: HTMLElement): void {
		this.cursorElement = element;
		// Apply current tool cursor if active
		if (this.activeTool) {
			this.updateCursor(this.activeTool.cursor);
		}
	}

	// Interceptor management
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
		// Sort interceptors by priority (higher priority first)
		this.sortedInterceptors = Array.from(this.interceptors.values()).sort((a, b) => b.priority - a.priority);
	}

	// Input event delegation
	public handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		const timelineEvent: TimelinePointerEvent = event;

		// Check interceptors first (in priority order)
		for (const interceptor of this.sortedInterceptors) {
			if (interceptor.interceptPointerDown?.(timelineEvent)) {
				// Event was handled by interceptor
				return;
			}
		}

		// If no interceptor handled it, pass to active tool
		if (this.activeTool?.onPointerDown) {
			this.activeTool.onPointerDown(timelineEvent);
		}
	}

	public handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		const timelineEvent: TimelinePointerEvent = event;

		// Update cursor based on interceptors
		let cursor: string | null = null;
		for (const interceptor of this.sortedInterceptors) {
			cursor = interceptor.getCursor?.(timelineEvent) || null;
			if (cursor) {
				this.updateCursor(cursor);
				break;
			}
		}

		// If no interceptor provided cursor, use active tool's cursor
		if (!cursor && this.activeTool) {
			this.updateCursor(this.activeTool.cursor);
		}

		// Check interceptors for handling
		for (const interceptor of this.sortedInterceptors) {
			if (interceptor.interceptPointerMove?.(timelineEvent)) {
				// Event was handled by interceptor
				return;
			}
		}

		// If no interceptor handled it, pass to active tool
		if (this.activeTool?.onPointerMove) {
			this.activeTool.onPointerMove(timelineEvent);
		}
	}

	public handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		const timelineEvent: TimelinePointerEvent = event;

		// Check interceptors first (in priority order)
		for (const interceptor of this.sortedInterceptors) {
			if (interceptor.interceptPointerUp?.(timelineEvent)) {
				// Event was handled by interceptor
				return;
			}
		}

		// If no interceptor handled it, pass to active tool
		if (this.activeTool?.onPointerUp) {
			this.activeTool.onPointerUp(timelineEvent);
		}
	}

	public handleWheel(event: WheelEvent): void {
		if (this.activeTool?.onWheel) {
			const timelineEvent: TimelineWheelEvent = {
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaMode: event.deltaMode,
				ctrlKey: event.ctrlKey,
				shiftKey: event.shiftKey,
				altKey: event.altKey,
				metaKey: event.metaKey,
				preventDefault: () => event.preventDefault()
			};
			this.activeTool.onWheel(timelineEvent);
		}
	}

	public handleKeyDown(event: KeyboardEvent): void {
		if (this.activeTool?.onKeyDown) {
			this.activeTool.onKeyDown(event);
		}
	}

	public handleKeyUp(event: KeyboardEvent): void {
		if (this.activeTool?.onKeyUp) {
			this.activeTool.onKeyUp(event);
		}
	}

	private updateCursor(cursor: string): void {
		if (this.cursorElement) {
			this.cursorElement.style.cursor = cursor;
		}
	}
}
