import { Edit } from "@core/edit";
import * as PIXI from "pixi.js";

import { IToolManager, ITimelineTool, ITimelineState, IFeatureManager } from "../interfaces";
import { TimelinePointerEvent, TimelineWheelEvent } from "../types";

/**
 * Manages timeline tools and delegates input events to the active tool
 */
export class ToolManager implements IToolManager {
	private tools: Map<string, ITimelineTool> = new Map();
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

	// Input event delegation
	public handlePointerDown(event: PIXI.FederatedPointerEvent): void {
		if (this.activeTool?.onPointerDown) {
			this.activeTool.onPointerDown(event);
		}
	}

	public handlePointerMove(event: PIXI.FederatedPointerEvent): void {
		if (this.activeTool?.onPointerMove) {
			this.activeTool.onPointerMove(event);
		}
	}

	public handlePointerUp(event: PIXI.FederatedPointerEvent): void {
		if (this.activeTool?.onPointerUp) {
			this.activeTool.onPointerUp(event);
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


	public setCursorElement(element: HTMLElement): void {
		this.cursorElement = element;
		// Apply current tool cursor if active
		if (this.activeTool) {
			this.updateCursor(this.activeTool.cursor);
		}
	}

	private updateCursor(cursor: string): void {
		if (this.cursorElement) {
			this.cursorElement.style.cursor = cursor;
		}
	}
}
