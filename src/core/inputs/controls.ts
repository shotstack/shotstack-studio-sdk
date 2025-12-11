import { Edit } from "@core/edit";

export class Controls {
	private edit: Edit;
	private seekDistance: number = 50;
	private seekDistanceLarge: number = 500;
	private frameTime: number = 16.67;

	constructor(timeline: Edit) {
		this.edit = timeline;
	}

	public async load(): Promise<void> {
		document.addEventListener("keydown", this.handleKeyDown);
		document.addEventListener("keyup", this.handleKeyUp);
	}

	/** @internal */
	public dispose(): void {
		document.removeEventListener("keydown", this.handleKeyDown);
		document.removeEventListener("keyup", this.handleKeyUp);
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (event.code) {
			case "Space": {
				event.preventDefault();
				if (!this.edit.isPlaying) {
					this.edit.play();
				} else {
					this.edit.pause();
				}
				break;
			}
			case "ArrowLeft": {
				if (event.metaKey) {
					this.edit.seek(0);
				} else {
					const seekAmount = event.shiftKey ? this.seekDistanceLarge : this.seekDistance;
					this.edit.seek(this.edit.playbackTime - seekAmount);
				}
				break;
			}
			case "ArrowRight": {
				if (event.metaKey) {
					this.edit.seek(this.edit.getTotalDuration());
				} else {
					const seekAmount = event.shiftKey ? this.seekDistanceLarge : this.seekDistance;
					this.edit.seek(this.edit.playbackTime + seekAmount);
				}
				break;
			}
			case "KeyJ": {
				this.edit.stop();
				break;
			}
			case "KeyK": {
				this.edit.pause();
				break;
			}
			case "KeyL": {
				this.edit.play();
				break;
			}
			case "Comma": {
				// Frame step backward
				this.edit.seek(this.edit.playbackTime - this.frameTime);
				break;
			}
			case "Period": {
				// Frame step forward
				this.edit.seek(this.edit.playbackTime + this.frameTime);
				break;
			}
			case "KeyZ": {
				if (event.metaKey || event.ctrlKey) {
					event.preventDefault();
					if (event.shiftKey) {
						this.edit.redo();
					} else {
						this.edit.undo();
					}
				}
				break;
			}
			case "Delete":
			case "Backspace": {
				const selected = this.edit.getSelectedClipInfo();
				if (selected) {
					event.preventDefault();
					this.edit.deleteClip(selected.trackIndex, selected.clipIndex);
				}
				break;
			}
			case "KeyC": {
				if (event.metaKey || event.ctrlKey) {
					event.preventDefault();
					const selected = this.edit.getSelectedClipInfo();
					if (selected) {
						this.edit.copyClip(selected.trackIndex, selected.clipIndex);
					}
				}
				break;
			}
			case "KeyV": {
				if (event.metaKey || event.ctrlKey) {
					event.preventDefault();
					this.edit.pasteClip();
				}
				break;
			}
			default: {
				break;
			}
		}
	};

	private handleKeyUp = (event: KeyboardEvent): void => {
		// Skip if inside input elements
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (event.code) {
			case "KeyI":
				console.log(this.edit.getEdit());
				break;
			default:
				break;
		}
	};
}
