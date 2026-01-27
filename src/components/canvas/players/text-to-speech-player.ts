import type { Edit } from "@core/edit-session";
import { type Size } from "@layouts/geometry";
import type { ResolvedClip } from "@schemas";

import { Player, PlayerType } from "./player";

export class TextToSpeechPlayer extends Player {
	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.TextToSpeech);
	}

	public override async load(): Promise<void> {
		await super.load();
		this.configureKeyframes();
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);
		this.getContainer().alpha = 0;
	}

	public override getSize(): Size {
		return { width: 0, height: 0 };
	}
}
