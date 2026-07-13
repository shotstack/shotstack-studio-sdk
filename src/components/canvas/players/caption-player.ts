import { Player, PlayerType } from "@canvas/players/player";
import { type Cue, findActiveCue } from "@core/captions";
import type { Edit } from "@core/edit-session";
import { parseFontFamily, resolveFontPath } from "@core/fonts/font-config";
import { isAliasReference, sec, type Seconds } from "@core/timing/types";
import { type Size, type Vector } from "@layouts/geometry";
import { SubtitleLoadParser, type SubtitleAsset } from "@loaders/subtitle-load-parser";
import { type ExtendedCaptionAsset, type ResolvedClip } from "@schemas";
import * as pixiFilters from "pixi-filters";
import * as pixi from "pixi.js";

const PLACEHOLDER_TEXT = "Captions will appear here";

type CaptionState = { readonly kind: "loaded"; readonly cues: Cue[] } | { readonly kind: "placeholder" };
type CaptionLoadResult = { readonly state: CaptionState; readonly retainedIdentifier: string | null };

/**
 * CaptionPlayer renders timed subtitle cues from SRT/VTT files.
 * Captions are shown/hidden based on the current playback time.
 */
export class CaptionPlayer extends Player {
	private static loadedFonts = new Set<string>();

	private state: CaptionState = { kind: "loaded", cues: [] };
	private currentCue: Cue | null = null;
	private background: pixi.Graphics | null = null;
	private text: pixi.Text | null = null;
	private loadedSubtitleIdentifier: string | null = null;

	constructor(edit: Edit, clipConfiguration: ResolvedClip) {
		super(edit, clipConfiguration, PlayerType.Caption);
	}

	public override async load(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		await super.load();
		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;

		const captionAsset = this.clipConfiguration.asset as ExtendedCaptionAsset;
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

		try {
			const fontFamily = captionAsset.font?.family ?? "Open Sans";
			await this.loadFont(fontFamily);

			const result = isAliasReference(captionAsset.src)
				? { state: { kind: "placeholder" as const }, retainedIdentifier: null }
				: await this.loadSubtitles(captionAsset.src);
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
				this.releaseSubtitle(result.retainedIdentifier);
				return;
			}
			this.replaceLoadedSubtitle(result.retainedIdentifier);
			this.state = result.state;
			this.completeMediaTimingLoad(mediaTimingRevision, this.getCaptionDuration(result.state));

			if (this.state.kind === "placeholder") {
				this.showPlaceholder(captionAsset);
			} else {
				this.updateDisplay(null, captionAsset);
			}
		} catch (error) {
			if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) return;
			this.completeMediaTimingLoad(mediaTimingRevision, null);
			throw error;
		}
	}

	public override async reloadAsset(): Promise<void> {
		const mediaTimingRevision = this.beginMediaTimingLoad();
		const captionAsset = this.clipConfiguration.asset as ExtendedCaptionAsset;
		const result = isAliasReference(captionAsset.src)
			? { state: { kind: "placeholder" as const }, retainedIdentifier: null }
			: await this.loadSubtitles(captionAsset.src);

		if (!this.isMediaTimingLoadCurrent(mediaTimingRevision)) {
			this.releaseSubtitle(result.retainedIdentifier);
			return;
		}
		this.replaceLoadedSubtitle(result.retainedIdentifier);
		this.state = result.state;
		this.currentCue = null;
		this.completeMediaTimingLoad(mediaTimingRevision, this.getCaptionDuration(result.state));

		if (result.state.kind === "placeholder") {
			this.showPlaceholder(captionAsset);
		} else {
			this.updateDisplay(null, captionAsset);
		}
	}

	public override update(deltaTime: number, elapsed: number): void {
		super.update(deltaTime, elapsed);

		if (!this.text || this.state.kind === "placeholder") return;

		const captionAsset = this.clipConfiguration.asset as ExtendedCaptionAsset;
		const trim = captionAsset.trim ?? 0;

		// getPlaybackTime() already returns seconds
		const time = this.getPlaybackTime() + trim;

		const activeCue = findActiveCue(this.state.cues, time);

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

		this.state = { kind: "loaded", cues: [] };
		this.currentCue = null;
	}

	public override getLoadedResourceIdentifier(): string | null {
		return this.loadedSubtitleIdentifier;
	}

	public override getSize(): Size {
		const captionAsset = this.clipConfiguration.asset as ExtendedCaptionAsset;

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

	private async loadSubtitles(src: string): Promise<CaptionLoadResult> {
		try {
			const loadOptions: pixi.UnresolvedAsset = {
				src,
				parser: SubtitleLoadParser.Name
			};
			const subtitle = await this.edit.assetLoader.load<SubtitleAsset>(src, loadOptions);

			if (subtitle) {
				return { state: { kind: "loaded", cues: subtitle.cues }, retainedIdentifier: src };
			}

			console.warn("Failed to load subtitles");
			return { state: { kind: "placeholder" }, retainedIdentifier: null };
		} catch (error) {
			console.warn("Failed to load subtitles:", error);
			return { state: { kind: "placeholder" }, retainedIdentifier: null };
		}
	}

	private getCaptionDuration(state: CaptionState): Seconds | null {
		if (state.kind !== "loaded" || state.cues.length === 0) return null;
		let maxEnd = Number.NEGATIVE_INFINITY;
		for (const cue of state.cues) {
			if (Number.isFinite(cue.end)) maxEnd = Math.max(maxEnd, cue.end);
		}
		return Number.isFinite(maxEnd) ? sec(maxEnd) : null;
	}

	private replaceLoadedSubtitle(identifier: string | null): void {
		const previousIdentifier = this.loadedSubtitleIdentifier;
		this.loadedSubtitleIdentifier = identifier;
		this.releaseSubtitle(previousIdentifier);
	}

	private releaseSubtitle(identifier: string | null): void {
		if (identifier) this.edit.assetLoader.release(identifier);
	}

	private showPlaceholder(captionAsset: ExtendedCaptionAsset): void {
		const placeholderCue: Cue = { start: 0, end: Infinity, text: PLACEHOLDER_TEXT };
		this.updateDisplay(placeholderCue, captionAsset);
	}

	private createTextStyle(captionAsset: ExtendedCaptionAsset): pixi.TextStyle {
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

	private updateDisplay(cue: Cue | null, captionAsset: ExtendedCaptionAsset): void {
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

	private positionText(captionAsset: ExtendedCaptionAsset): void {
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

	private drawBackground(captionAsset: ExtendedCaptionAsset): void {
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
