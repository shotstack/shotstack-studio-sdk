import { Player, PlayerType } from "@canvas/players/player";
import type { Edit } from "@core/edit";
import { EditEvent } from "@core/events/edit-events";
import { type ResolvedClip } from "@schemas/clip";
import { type Cue, findActiveCue, isAliasReference, resolveTranscriptionAlias, revokeVttUrl } from "@core/captions";
import { parseFontFamily, resolveFontPath } from "@core/fonts/font-config";
import { type Size, type Vector } from "@layouts/geometry";
import { SubtitleLoadParser, type SubtitleAsset } from "@loaders/subtitle-load-parser";
import { type CaptionAsset } from "@schemas/caption-asset";
import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

/**
 * CaptionPlayer renders timed subtitle cues from SRT/VTT files.
 * Captions are shown/hidden based on the current playback time.
 * Transcription runs in the background without blocking timeline loading.
 */
export class CaptionPlayer extends Player {
	private static loadedFonts = new Set<string>();

	private cues: Cue[] = [];
	private currentCue: Cue | null = null;
	private background: pixi.Graphics | null = null;
	private text: pixi.Text | null = null;
	private vttBlobUrl: string | null = null;

	private pendingTranscription: Promise<void> | null = null;
	private isTranscribing = false;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Caption);
	}

	public override async load(): Promise<void> {
		await super.load();

		const captionAsset = this.clipConfiguration.asset as CaptionAsset;

		const fontFamily = captionAsset.font?.family ?? "Open Sans";
		await this.loadFont(fontFamily);

		if (isAliasReference(captionAsset.src)) {
			this.isTranscribing = true;
			this.pendingTranscription = this.loadTranscriptionInBackground(captionAsset.src);
		} else {
			await this.loadSubtitles(captionAsset.src);
		}

		this.background = new pixi.Graphics();
		this.contentContainer.addChild(this.background);

		this.text = new pixi.Text({ text: "", style: this.createTextStyle(captionAsset) });
		this.text.visible = false;

		if (captionAsset.stroke?.width && captionAsset.stroke.width > 0 && captionAsset.stroke.color) {
			const strokeFilter = new pixiFilters.OutlineFilter({
				thickness: captionAsset.stroke.width,
				color: captionAsset.stroke.color
			});
			this.text.filters = [strokeFilter];
		}

		this.contentContainer.addChild(this.text);
		this.configureKeyframes();
	}

	private async loadTranscriptionInBackground(src: string): Promise<void> {
		const clipAlias = this.clipConfiguration.alias ?? "";
		try {
			const originalEdit = this.edit.getOriginalEdit();
			if (!originalEdit) {
				throw new Error("Cannot resolve alias: edit not loaded");
			}
			const result = await resolveTranscriptionAlias(src, originalEdit, progress => {
				this.edit.events.emit(EditEvent.TranscriptionProgress, {
					clipAlias,
					...progress
				});
			});

			this.vttBlobUrl = result.vttUrl;

			const loadOptions: pixi.UnresolvedAsset = {
				src: result.vttUrl,
				parser: SubtitleLoadParser.Name
			};
			const subtitle = await this.edit.assetLoader.load<SubtitleAsset>(result.vttUrl, loadOptions);

			if (subtitle) {
				this.cues = subtitle.cues;
			}

			this.isTranscribing = false;

			this.edit.events.emit(EditEvent.TranscriptionComplete, {
				clipAlias,
				cueCount: this.cues.length
			});
		} catch (error) {
			this.isTranscribing = false;
			console.error("Failed to transcribe:", error);

			this.edit.events.emit(EditEvent.TranscriptionError, {
				clipAlias,
				error: error instanceof Error ? error.message : "Transcription failed"
			});
		}
	}

	public isTranscriptionPending(): boolean {
		return this.isTranscribing;
	}

	public async waitForTranscription(): Promise<void> {
		if (this.pendingTranscription) {
			await this.pendingTranscription;
		}
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (!this.text) return;

		const captionAsset = this.clipConfiguration.asset as CaptionAsset;
		const trim = captionAsset.trim ?? 0;

		const time = this.getPlaybackTime() / 1000 + trim;

		const activeCue = findActiveCue(this.cues, time);

		if (activeCue !== this.currentCue) {
			this.currentCue = activeCue;
			this.updateDisplay(activeCue, captionAsset);
		}
	}

	public override dispose(): void {
		super.dispose();

		this.background?.destroy();
		this.background = null;

		this.text?.destroy();
		this.text = null;

		if (this.vttBlobUrl) {
			revokeVttUrl(this.vttBlobUrl);
			this.vttBlobUrl = null;
		}

		this.cues = [];
		this.currentCue = null;
	}

	public override getSize(): Size {
		const captionAsset = this.clipConfiguration.asset as CaptionAsset;

		return {
			width: this.clipConfiguration.width ?? captionAsset.width ?? this.edit.size.width,
			height: this.clipConfiguration.height ?? captionAsset.height ?? this.edit.size.height
		};
	}

	protected override getFitScale(): number {
		return 1;
	}

	protected override getContainerScale(): Vector {
		const scale = this.getScale();
		return { x: scale, y: scale };
	}

	private async loadSubtitles(src: string): Promise<void> {
		try {
			const loadOptions: pixi.UnresolvedAsset = {
				src,
				parser: SubtitleLoadParser.Name
			};
			const subtitle = await this.edit.assetLoader.load<SubtitleAsset>(src, loadOptions);

			if (subtitle) {
				this.cues = subtitle.cues;
			} else {
				console.error("Failed to load subtitles");
				this.cues = [];
			}
		} catch (error) {
			console.error("Failed to load subtitles:", error);
			this.cues = [];
		}
	}

	private createTextStyle(captionAsset: CaptionAsset): pixi.TextStyle {
		const fontFamily = captionAsset.font?.family ?? "Open Sans";
		const { baseFontFamily, fontWeight } = parseFontFamily(fontFamily);
		const fontSize = captionAsset.font?.size ?? 32;
		const { width } = this.getSize();

		return new pixi.TextStyle({
			fontFamily: baseFontFamily,
			fontSize,
			fill: captionAsset.font?.color ?? "#ffffff",
			fontWeight: fontWeight.toString() as pixi.TextStyleFontWeight,
			wordWrap: true,
			wordWrapWidth: width * 0.9,
			lineHeight: (captionAsset.font?.lineHeight ?? 1.2) * fontSize,
			align: captionAsset.alignment?.horizontal ?? "center"
		});
	}

	private updateDisplay(cue: Cue | null, captionAsset: CaptionAsset): void {
		if (!this.text || !this.background) return;

		if (!cue) {
			this.text.visible = false;
			this.background.clear();
			return;
		}

		this.text.text = cue.text;
		this.text.visible = true;

		this.positionText(captionAsset);

		this.drawBackground(captionAsset);
	}

	private positionText(captionAsset: CaptionAsset): void {
		if (!this.text) return;

		const horizontalAlign = captionAsset.alignment?.horizontal ?? "center";
		const verticalAlign = captionAsset.alignment?.vertical ?? "bottom";
		const { width: containerWidth, height: containerHeight } = this.getSize();
		const padding = captionAsset.background?.padding ?? 10;

		let textX = containerWidth / 2 - this.text.width / 2;
		if (horizontalAlign === "left") {
			textX = padding;
		} else if (horizontalAlign === "right") {
			textX = containerWidth - this.text.width - padding;
		}

		let textY = containerHeight * 0.9;
		if (verticalAlign === "top") {
			textY = padding;
		} else if (verticalAlign === "center") {
			textY = containerHeight / 2 - this.text.height / 2;
		}

		this.text.position.set(textX, textY);
	}

	private drawBackground(captionAsset: CaptionAsset): void {
		if (!this.background || !this.text || !this.text.visible) {
			this.background?.clear();
			return;
		}

		const bgConfig = captionAsset.background;
		if (!bgConfig?.color) {
			this.background.clear();
			return;
		}

		const padding = bgConfig.padding ?? 10;
		const borderRadius = bgConfig.borderRadius ?? 4;

		const bgX = this.text.x - padding;
		const bgY = this.text.y - padding;
		const bgWidth = this.text.width + padding * 2;
		const bgHeight = this.text.height + padding * 2;

		this.background.clear();
		this.background.fillStyle = {
			color: bgConfig.color,
			alpha: bgConfig.opacity ?? 0.8
		};

		if (borderRadius > 0) {
			this.background.roundRect(bgX, bgY, bgWidth, bgHeight, borderRadius);
		} else {
			this.background.rect(bgX, bgY, bgWidth, bgHeight);
		}
		this.background.fill();
	}

	private async loadFont(fontFamily: string): Promise<void> {
		const { baseFontFamily, fontWeight } = parseFontFamily(fontFamily);
		const cacheKey = `${baseFontFamily}-${fontWeight}`;

		if (CaptionPlayer.loadedFonts.has(cacheKey)) {
			return;
		}

		const fontPath = resolveFontPath(fontFamily);
		if (fontPath) {
			const fontFace = new FontFace(baseFontFamily, `url(${fontPath})`, {
				weight: fontWeight.toString()
			});
			await fontFace.load();
			document.fonts.add(fontFace);
			CaptionPlayer.loadedFonts.add(cacheKey);
		}
	}
}
