import { TimelineV2Tool } from "../types";

export class ToolManager {
	private activeTool?: TimelineV2Tool;
	private availableTools: Map<string, TimelineV2Tool> = new Map();

	/**
	 * Register a tool with the manager
	 */
	public registerTool(tool: TimelineV2Tool): void {
		this.availableTools.set(tool.name, tool);
	}

	/**
	 * Activate a tool by name, deactivating the current tool if any
	 */
	public activateTool(toolName: string): boolean {
		const tool = this.availableTools.get(toolName);
		if (!tool) {
			console.warn(`Tool '${toolName}' not found`);
			return false;
		}

		// Deactivate current tool if any
		if (this.activeTool) {
			this.activeTool.onDeactivate();
		}

		// Activate new tool
		this.activeTool = tool;
		this.activeTool.onActivate();
		
		return true;
	}

	/**
	 * Get the currently active tool
	 */
	public getActiveTool(): TimelineV2Tool | undefined {
		return this.activeTool;
	}

	/**
	 * Get the name of the currently active tool
	 */
	public getActiveToolName(): string | undefined {
		return this.activeTool?.name;
	}

	/**
	 * Get all available tool names
	 */
	public getAvailableToolNames(): string[] {
		return Array.from(this.availableTools.keys());
	}

	/**
	 * Get a tool by name
	 */
	public getTool(toolName: string): TimelineV2Tool | undefined {
		return this.availableTools.get(toolName);
	}

	/**
	 * Check if a tool is registered
	 */
	public hasTool(toolName: string): boolean {
		return this.availableTools.has(toolName);
	}

	/**
	 * Deactivate the current tool without activating a new one
	 */
	public deactivateCurrentTool(): void {
		if (this.activeTool) {
			this.activeTool.onDeactivate();
			this.activeTool = undefined;
		}
	}

	/**
	 * Clean up all tools and clear the manager
	 */
	public dispose(): void {
		this.deactivateCurrentTool();
		this.availableTools.clear();
	}
}