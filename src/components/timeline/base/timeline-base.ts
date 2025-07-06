import { Edit } from "@core/edit";
import * as pixi from "pixi.js";

export abstract class TimelineBase {
	protected edit: Edit;
	private container: pixi.Container;

	constructor(edit: Edit) {
		this.edit = edit;
		this.container = new pixi.Container();
	}

	abstract load(): Promise<void>;
	abstract dispose(): void;
	abstract update(deltaTime: number, deltaMs: number): void;
	abstract draw(): void;

	protected getContainer(): pixi.Container {
		return this.container;
	}

	protected bindEvent(event: string, handler: (data: any) => void): void {
		this.edit.events.on(event, handler);
	}
}
