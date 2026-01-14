/**
 * Base class for HTML-based timeline components.
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

	public abstract load(): Promise<void>;
	public abstract update(deltaTime: number, elapsed: number): void;
	public abstract draw(): void;
	public abstract dispose(): void;

	protected addChild(child: TimelineEntity): void {
		this.children.push(child);
		this.element.appendChild(child.element);
	}

	protected removeChild(child: TimelineEntity): void {
		const index = this.children.indexOf(child);
		if (index !== -1) {
			this.children.splice(index, 1);
			child.dispose();
		}
	}

	protected removeAllChildren(): void {
		for (const child of this.children) {
			child.dispose();
		}
		this.children = [];
	}

	protected async loadChildren(): Promise<void> {
		await Promise.all(this.children.map(child => child.load()));
	}

	protected updateChildren(deltaTime: number, elapsed: number): void {
		for (const child of this.children) {
			child.update(deltaTime, elapsed);
		}
	}

	protected drawChildren(): void {
		for (const child of this.children) {
			child.draw();
		}
	}

	protected disposeChildren(): void {
		for (const child of this.children) {
			child.dispose();
		}
		this.children = [];
	}
}
