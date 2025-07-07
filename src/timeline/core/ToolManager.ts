import { Edit } from "@core/edit";

import { IToolManager, ITimelineTool, ITimelineState, IFeatureManager } from "../interfaces";
import { TimelinePointerEvent } from "../types";

/**
 * Manages timeline tools and delegates input events to the active tool
 */
export class ToolManager implements IToolManager {
	private tools: Map<string, ITimelineTool> = new Map();
	private activeTool: ITimelineTool | null = null;
	private state: ITimelineState;
	private edit: Edit;
	private featureManager: IFeatureManager | null = null;

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
	public handlePointerDown(event: PointerEvent): void {
		if (this.activeTool?.onPointerDown) {
			const timelineEvent = this.createTimelinePointerEvent(event);
			this.activeTool.onPointerDown(timelineEvent);
		}
	}

	public handlePointerMove(event: PointerEvent): void {
		if (this.activeTool?.onPointerMove) {
			const timelineEvent = this.createTimelinePointerEvent(event);
			this.activeTool.onPointerMove(timelineEvent);
		}
	}

	public handlePointerUp(event: PointerEvent): void {
		if (this.activeTool?.onPointerUp) {
			const timelineEvent = this.createTimelinePointerEvent(event);
			this.activeTool.onPointerUp(timelineEvent);
		}
	}

	public handleWheel(event: WheelEvent): void {
		if (this.activeTool?.onWheel) {
			this.activeTool.onWheel(event);
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

	private createTimelinePointerEvent(event: PointerEvent): TimelinePointerEvent {
		const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect() || { left: 0, top: 0 };

		return {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
			globalX: event.clientX,
			globalY: event.clientY,
			button: event.button,
			buttons: event.buttons,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			target: event.target,
			currentTarget: event.currentTarget,
			preventDefault: () => event.preventDefault(),
			stopPropagation: () => event.stopPropagation()
		};
	}
}
