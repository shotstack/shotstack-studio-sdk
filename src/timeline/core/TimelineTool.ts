import { Entity } from "@core/shared/entity";

import { ITimelineTool, ITimelineState, ITimelineToolContext } from "../interfaces";
import { TimelineState, TimelinePointerEvent, TimelineWheelEvent } from "../types";

/**
 * Abstract base class for timeline tools
 * Provides common functionality and enforces tool interface
 */
export abstract class TimelineTool extends Entity implements ITimelineTool {
	public abstract readonly name: string;
	public abstract readonly cursor: string;
	
	protected state: ITimelineState;
	protected context: ITimelineToolContext;
	
	constructor(state: ITimelineState, context: ITimelineToolContext) {
		super();
		this.state = state;
		this.context = context;
	}
	
	// Lifecycle methods
	public abstract onActivate(): void;
	public abstract onDeactivate(): void;
	
	// Input handling methods (optional override)
	public onPointerDown?(event: TimelinePointerEvent): void;
	public onPointerMove?(event: TimelinePointerEvent): void;
	public onPointerUp?(event: TimelinePointerEvent): void;
	public onWheel?(event: TimelineWheelEvent): void;
	public onKeyDown?(event: KeyboardEvent): void;
	public onKeyUp?(event: KeyboardEvent): void;
	
	// State management
	public updateState(updates: Partial<TimelineState>): void {
		this.state.update(updates);
	}
	
	public executeCommand(command: any): void {
		this.context.executeCommand(command);
	}
	
	// Entity lifecycle
	public async load(): Promise<void> {
		// Base implementation - tools can override if needed
	}
	
	public update(_deltaTime: number, _elapsed: number): void {
		// Base implementation - tools can override if needed
	}
	
	public draw(): void {
		// Base implementation - tools can override if needed
	}
	
	public dispose(): void {
		super.dispose();
	}
	
	// Protected utility methods for derived tools
	protected getState(): TimelineState {
		return this.state.getState();
	}
	
	protected setCursor(cursor: string): void {
		// This would typically update the cursor through the renderer
		// For now, just store it as the cursor property
		(this as any).cursor = cursor;
	}
	
	// Tool state persistence
	protected saveToolState(state: any): void {
		const currentState = this.state.getState();
		const toolStates = new Map(currentState.toolStates);
		toolStates.set(this.name, state);
		this.state.update({ toolStates });
	}
	
	protected loadToolState(): any {
		const currentState = this.state.getState();
		return currentState.toolStates.get(this.name);
	}
}