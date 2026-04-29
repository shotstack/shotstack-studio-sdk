import { tryParseClipJson, tryParseTracksJson } from "@core/clipboard/clip-json";
import { readSvgFromClipboardItems, looksLikeSvg } from "@core/clipboard/svg-clipboard";
import { readSystemClipboardText } from "@core/clipboard/system-clipboard";
import { Edit } from "@core/edit-session";
import { sec, type Seconds } from "@core/timing/types";

export class Controls {
	private edit: Edit;
	private seekDistance: number = 0.05; // 50ms in seconds
	private seekDistanceLarge: number = 0.5; // 500ms in seconds
	private frameTime: number = 1 / 60; // ~16.67ms in seconds
	private pendingPaste: Promise<void> | null = null;

	constructor(edit: Edit) {
		this.edit = edit;
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

	private shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
		const target = event.target as HTMLElement;

		if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
			return true;
		}

		if (target.isContentEditable) {
			return true;
		}

		if (target.getAttribute?.("role") === "textbox") {
			return true;
		}

		return false;
	}

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (this.shouldIgnoreKeyboardEvent(event)) {
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
				const selected = this.edit.getSelectedClipInfo();
				if (selected) {
					event.preventDefault();
					const delta = event.shiftKey ? 10 : 1;
					this.edit.moveSelectedClip(-delta, 0);
				} else {
					const seekAmount = event.shiftKey ? this.seekDistanceLarge : this.seekDistance;
					this.edit.seek(sec(this.edit.playbackTime - seekAmount));
				}
				break;
			}
			case "ArrowRight": {
				const selected = this.edit.getSelectedClipInfo();
				if (selected) {
					event.preventDefault();
					const delta = event.shiftKey ? 10 : 1;
					this.edit.moveSelectedClip(delta, 0);
				} else {
					const seekAmount = event.shiftKey ? this.seekDistanceLarge : this.seekDistance;
					this.edit.seek(sec(this.edit.playbackTime + seekAmount));
				}
				break;
			}
			case "ArrowUp": {
				const selected = this.edit.getSelectedClipInfo();
				if (selected) {
					event.preventDefault();
					const delta = event.shiftKey ? 10 : 1;
					this.edit.moveSelectedClip(0, -delta);
				}
				break;
			}
			case "ArrowDown": {
				const selected = this.edit.getSelectedClipInfo();
				if (selected) {
					event.preventDefault();
					const delta = event.shiftKey ? 10 : 1;
					this.edit.moveSelectedClip(0, delta);
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
				this.edit.seek(sec(this.edit.playbackTime - this.frameTime));
				break;
			}
			case "Period": {
				// Frame step forward
				this.edit.seek(sec(this.edit.playbackTime + this.frameTime));
				break;
			}
			case "Home": {
				event.preventDefault();
				const selected = this.edit.getSelectedClipInfo();
				if (event.shiftKey && selected) {
					// Go to selected clip start
					this.edit.seek(sec(selected.player.getStart()));
				} else {
					// Go to timeline start
					this.edit.seek(sec(0));
				}
				break;
			}
			case "End": {
				event.preventDefault();
				const selected = this.edit.getSelectedClipInfo();
				if (event.shiftKey && selected) {
					// Go to selected clip end
					this.edit.seek(sec(selected.player.getEnd()));
				} else {
					// Go to timeline end
					this.edit.seek(this.edit.totalDuration);
				}
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
					this.handlePaste();
				}
				break;
			}
			default: {
				break;
			}
		}
	};

	private handlePaste(): void {
		if (this.pendingPaste) return;
		this.pendingPaste = this.dispatchPaste().finally(() => {
			this.pendingPaste = null;
		});
	}

	/** Resolve Ctrl/Cmd+V across all paste sources. */
	private async dispatchPaste(): Promise<void> {
		const svgFromMime = await readSvgFromClipboardItems();
		if (svgFromMime) {
			await this.tryAddSvgClip(svgFromMime);
			return;
		}

		const text = await readSystemClipboardText();
		if (text) {
			const clip = tryParseClipJson(text);
			if (clip) {
				try {
					await this.edit.addClipFromJson(clip, { start: this.edit.playbackTime as Seconds });
				} catch (err) {
					console.warn("[shotstack-studio:controls] clip JSON paste failed", err);
				}
				return;
			}

			const tracks = tryParseTracksJson(text);
			if (tracks) {
				try {
					await this.edit.addTracksFromJson(tracks, { start: this.edit.playbackTime as Seconds });
				} catch (err) {
					console.warn("[shotstack-studio:controls] tracks JSON paste failed", err);
				}
				return;
			}

			if (looksLikeSvg(text)) {
				await this.tryAddSvgClip(text);
				return;
			}
		}

		this.edit.pasteClip();
	}

	private async tryAddSvgClip(svg: string): Promise<void> {
		try {
			await this.edit.addSvgClip(svg);
		} catch (err) {
			console.warn("[shotstack-studio:controls] SVG paste failed", err);
		}
	}

	private handleKeyUp = (event: KeyboardEvent): void => {
		if (this.shouldIgnoreKeyboardEvent(event)) {
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
