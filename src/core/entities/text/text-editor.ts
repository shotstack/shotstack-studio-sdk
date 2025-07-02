import type { TextPlayer } from "@entities/players/text-player";
import { type Clip } from "@schemas/clip";
import { type TextAsset } from "@schemas/text-asset";
import * as pixi from "pixi.js";

import { TextCursor } from "./text-cursor";
import { TextInputHandler } from "./text-input-handler";

export enum HorizontalAlignment {
	LEFT = "left",
	CENTER = "center",
	RIGHT = "right"
}

export enum VerticalAlignment {
	TOP = "top",
	CENTER = "center",
	BOTTOM = "bottom"
}

export class TextEditor {
	private static readonly DOUBLE_CLICK_THRESHOLD_MS = 300;
	private static readonly EDITING_BG_PADDING_PX = 5;
	private static readonly EDITING_BG_ALPHA = 0.2;
	private static readonly CLICK_HANDLER_DELAY_MS = 100;

	private parent: TextPlayer;
	private targetText: pixi.Text;
	private clipConfig: Clip;
	private isEditing: boolean = false;
	private lastClickTime: number = 0;

	private editingContainer: pixi.Container | null = null;
	private editableText: pixi.Text | null = null;
	private textCursor: TextCursor | null = null;
	private textInputHandler: TextInputHandler | null = null;
	private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

	constructor(parent: TextPlayer, targetText: pixi.Text, clipConfig: Clip) {
		this.parent = parent;
		this.targetText = targetText;
		this.clipConfig = clipConfig;

		this.parent.getContainer().eventMode = "static";
		this.parent.getContainer().on("click", this.checkForDoubleClick);
	}

	public dispose(): void {
		this.parent.getContainer().off("click", this.checkForDoubleClick);

		this.stopEditing();

		if (this.outsideClickHandler) {
			window.removeEventListener("click", this.outsideClickHandler);
			this.outsideClickHandler = null;
		}
	}

	private startEditing(): void {
		if (this.isEditing || !this.targetText) return;

		const initialConfig = structuredClone(this.clipConfig);

		this.targetText.visible = false;

		this.createEditingEnvironment();

		this.setupOutsideClickHandler(initialConfig);

		this.isEditing = true;
	}

	private stopEditing(saveChanges = false, initialConfig?: Clip): void {
		if (!this.isEditing) return;

		let newText = "";
		if (this.editableText) {
			newText = this.editableText.text;
		}

		if (this.editingContainer) {
			this.parent.getContainer().removeChild(this.editingContainer);
			this.editingContainer.destroy();
			this.editingContainer = null;
		}

		this.editableText = null;

		if (this.textCursor) {
			this.textCursor.dispose();
			this.textCursor = null;
		}

		if (this.textInputHandler) {
			this.textInputHandler.dispose();
			this.textInputHandler = null;
		}

		this.targetText.visible = true;

		if (saveChanges && initialConfig && newText !== "") {
			this.parent.updateTextContent(newText, initialConfig);
		}

		this.isEditing = false;
	}

	private checkForDoubleClick = (_: pixi.FederatedPointerEvent): void => {
		const currentTime = Date.now();
		const isDoubleClick = currentTime - this.lastClickTime < TextEditor.DOUBLE_CLICK_THRESHOLD_MS;

		if (isDoubleClick) {
			this.startEditing();
		}

		this.lastClickTime = currentTime;
	};

	private setupOutsideClickHandler(initialConfig: Clip): void {
		this.outsideClickHandler = (e: MouseEvent) => {
			const container = this.parent.getContainer();
			const bounds = container.getBounds();
			const x = e.clientX;
			const y = e.clientY;

			if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) {
				this.stopEditing(true, initialConfig);
				if (this.outsideClickHandler) {
					window.removeEventListener("click", this.outsideClickHandler);
					this.outsideClickHandler = null;
				}
			}
		};

		setTimeout(() => {
			if (this.outsideClickHandler) {
				window.addEventListener("click", this.outsideClickHandler);
			}
		}, TextEditor.CLICK_HANDLER_DELAY_MS);
	}

	private createEditingEnvironment(): void {
		this.setupEditingContainer();

		if (this.editingContainer && this.editableText) {
			this.textCursor = new TextCursor(this.editingContainer, this.editableText, this.clipConfig);

			this.textCursor.updatePosition(this.targetText.text.length);
			this.textCursor.startBlinking();
		}

		this.setupTextInputHandler();

		this.updateTextAlignment();
	}

	private setupEditingContainer(): void {
		this.editingContainer = new pixi.Container();
		this.parent.getContainer().addChild(this.editingContainer);

		const editBg = new pixi.Graphics();
		editBg.fillStyle = { color: 0x000000, alpha: TextEditor.EDITING_BG_ALPHA };
		editBg.rect(
			-TextEditor.EDITING_BG_PADDING_PX,
			-TextEditor.EDITING_BG_PADDING_PX,
			this.targetText.width + 2 * TextEditor.EDITING_BG_PADDING_PX,
			this.targetText.height + 2 * TextEditor.EDITING_BG_PADDING_PX
		);
		editBg.fill();
		this.editingContainer.addChild(editBg);

		this.editableText = new pixi.Text(this.targetText.text, this.targetText.style as pixi.TextStyle);
		this.editableText.eventMode = "static";
		this.editableText.cursor = "text";
		this.editingContainer.addChild(this.editableText);
	}

	private setupTextInputHandler(): void {
		this.textInputHandler = new TextInputHandler();

		this.textInputHandler.setTextInputHandler((text: string, cursorPosition: number) => {
			if (this.editableText) {
				this.editableText.text = text;
				this.updateTextAlignment();
			}

			this.textCursor?.updatePosition(cursorPosition);
		});

		this.textInputHandler.setEventHandlers({
			onEscape: _ => this.stopEditing(false),
			onTabNavigation: _ => this.stopEditing(true)
		});

		this.textInputHandler.setupInput(this.targetText.text, { autoFocus: true });
	}

	private updateTextAlignment(): void {
		if (!this.editableText || !this.editingContainer) return;

		const containerDimensions = this.getContainerDimensions();
		const alignment = this.getAlignmentSettings();

		const textX = this.calculateHorizontalPosition({ width: this.editableText.width }, containerDimensions, alignment.horizontal);

		const textY = this.calculateVerticalPosition({ height: this.editableText.height }, containerDimensions, alignment.vertical);

		this.editingContainer.position.set(textX, textY);

		if (this.editingContainer.children.length > 0) {
			const background = this.editingContainer.getChildAt(0) as pixi.Graphics;
			if (background instanceof pixi.Graphics) {
				background.clear();
				background.fillStyle = { color: 0x000000, alpha: TextEditor.EDITING_BG_ALPHA };
				background.rect(
					-TextEditor.EDITING_BG_PADDING_PX,
					-TextEditor.EDITING_BG_PADDING_PX,
					this.editableText.width + 2 * TextEditor.EDITING_BG_PADDING_PX,
					this.editableText.height + 2 * TextEditor.EDITING_BG_PADDING_PX
				);
				background.fill();
			}
		}
	}

	private calculateHorizontalPosition(
		content: { width: number },
		container: { width: number },
		alignment: HorizontalAlignment = HorizontalAlignment.CENTER
	): number {
		switch (alignment) {
			case HorizontalAlignment.CENTER:
				return container.width / 2 - content.width / 2;
			case HorizontalAlignment.RIGHT:
				return container.width - content.width;
			case HorizontalAlignment.LEFT:
			default:
				return 0;
		}
	}

	private calculateVerticalPosition(
		content: { height: number },
		container: { height: number },
		alignment: VerticalAlignment = VerticalAlignment.CENTER
	): number {
		switch (alignment) {
			case VerticalAlignment.CENTER:
				return container.height / 2 - content.height / 2;
			case VerticalAlignment.BOTTOM:
				return container.height - content.height;
			case VerticalAlignment.TOP:
			default:
				return 0;
		}
	}

	private getContainerDimensions(): { width: number; height: number } {
		const textAsset = this.clipConfig.asset as TextAsset;
		return {
			width: textAsset.width ?? this.parent.getSize().width,
			height: textAsset.height ?? this.parent.getSize().height
		};
	}

	private getAlignmentSettings(): { horizontal: HorizontalAlignment; vertical: VerticalAlignment } {
		const textAsset = this.clipConfig.asset as TextAsset;
		return {
			horizontal: (textAsset.alignment?.horizontal ?? HorizontalAlignment.CENTER) as HorizontalAlignment,
			vertical: (textAsset.alignment?.vertical ?? VerticalAlignment.CENTER) as VerticalAlignment
		};
	}
}
