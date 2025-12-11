/**
 * Base class for HTML-based timeline components.
 * Mirrors the Entity pattern used by PixiJS components (load/update/draw/dispose lifecycle).
 */
export abstract class TimelineEntity {
	public readonly element: HTMLElement;
	protected children: TimelineEntity[] = [];

	constructor(tagName: keyof HTMLElementTagNameMap = "div", className?: string) {
		this.element = document.createElement(tagName);
		if (className) {
			this.element.className = className;
		}
	}

	/** Initialize the component and its children */
	public abstract load(): Promise<void>;

	/** Update component state (called each frame during active rendering) */
	public abstract update(deltaTime: number, elapsed: number): void;

	/** Render/draw component to DOM (called each frame after update) */
	public abstract draw(): void;

	/** Clean up resources and remove from DOM */
	public abstract dispose(): void;

	/** Add a child entity */
	protected addChild(child: TimelineEntity): void {
		this.children.push(child);
		this.element.appendChild(child.element);
	}

	/** Remove a child entity */
	protected removeChild(child: TimelineEntity): void {
		const index = this.children.indexOf(child);
		if (index !== -1) {
			this.children.splice(index, 1);
			child.dispose();
		}
	}

	/** Remove all children */
	protected removeAllChildren(): void {
		for (const child of this.children) {
			child.dispose();
		}
		this.children = [];
	}

	/** Load all children */
	protected async loadChildren(): Promise<void> {
		await Promise.all(this.children.map(child => child.load()));
	}

	/** Update all children */
	protected updateChildren(deltaTime: number, elapsed: number): void {
		for (const child of this.children) {
			child.update(deltaTime, elapsed);
		}
	}

	/** Draw all children */
	protected drawChildren(): void {
		for (const child of this.children) {
			child.draw();
		}
	}

	/** Dispose all children */
	protected disposeChildren(): void {
		for (const child of this.children) {
			child.dispose();
		}
		this.children = [];
	}
}
