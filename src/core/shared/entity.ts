import * as pixi from "pixi.js";

export abstract class Entity {
	private readonly container: pixi.Container;

	constructor() {
		this.container = new pixi.Container();
	}

	public abstract load(): Promise<void>;

	/** @internal */
	public abstract update(deltaTime: number, elapsed: number): void;

	/** @internal */
	public abstract draw(): void;

	/** @internal */
	public abstract dispose(): void;

	/** @internal */
	public getContainer(): pixi.Container {
		return this.container;
	}
}
