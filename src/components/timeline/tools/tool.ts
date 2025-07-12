import { EditCommand } from "@core/commands/types";
import { Entity } from "@core/shared/entity";

import { TimelineState, TimelinePointerEvent, TimelineWheelEvent } from "../types";
import { ITimelineTool, ITimelineState, ITimelineToolContext } from "../types/timeline.interfaces";

/**
 * Abstract base class for timeline tools
 */
export abstract class TimelineTool extends Entity implements ITimelineTool {
	public abstract readonly name: string;
	public abstract readonly cursor: string;

	constructor(
		protected state: ITimelineState,
		protected context: ITimelineToolContext
	) {
		super();
	}

	// Required lifecycle methods
	public abstract onActivate(): void;
	public abstract onDeactivate(): void;

	// Optional input handlers
	public onPointerDown?(event: TimelinePointerEvent): void;
	public onPointerMove?(event: TimelinePointerEvent): void;
	public onPointerUp?(event: TimelinePointerEvent): void;
	public onWheel?(event: TimelineWheelEvent): void;
	public onKeyDown?(event: KeyboardEvent): void;
	public onKeyUp?(event: KeyboardEvent): void;

	// Entity lifecycle - override if needed
	public async load(): Promise<void> {
		// Override if needed
	}
	public update(): void {}
	public draw(): void {}
	public dispose(): void {}

	// State management
	public updateState = (updates: Partial<TimelineState>): void => this.state.update(updates);

	public executeCommand = (command: EditCommand | { type: string }): void => this.context.executeCommand(command);

	protected getState = (): TimelineState => this.state.getState();

	// Tool state persistence
	protected saveToolState<T = Record<string, unknown>>(state: T): void {
		const { toolStates } = this.getState();
		this.updateState({
			toolStates: new Map(toolStates).set(this.name, state)
		});
	}

	protected loadToolState<T = Record<string, unknown>>(): T | undefined {
		return this.getState().toolStates.get(this.name) as T | undefined;
	}
}
