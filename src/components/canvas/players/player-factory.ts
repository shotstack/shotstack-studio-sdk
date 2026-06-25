import type { Edit } from "@core/edit-session";
import { isPendingAiAsset } from "@core/shared/ai-asset-utils";
import type { ResolvedClip } from "@schemas";

import { AudioPlayer } from "./audio-player";
import { CaptionPlayer } from "./caption-player";
import { HtmlPlayer } from "./html-player";
import { Html5Player } from "./html5-player";
import { ImagePlayer } from "./image-player";
import { ImageToVideoPlayer } from "./image-to-video-player";
import { LumaPlayer } from "./luma-player";
import type { Player } from "./player";
import { RichCaptionPlayer } from "./rich-caption-player";
import { RichTextPlayer } from "./rich-text-player";
import { ShapePlayer } from "./shape-player";
import { SvgPlayer } from "./svg-player";
import { TextPlayer } from "./text-player";
import { TextToImagePlayer } from "./text-to-image-player";
import { TextToSpeechPlayer } from "./text-to-speech-player";
import { VideoPlayer } from "./video-player";

/**
 * Factory for creating Player instances from clip configurations.
 */
export class PlayerFactory {
	static create(edit: Edit, clipConfiguration: ResolvedClip): Player {
		if (!clipConfiguration.asset?.type) {
			throw new Error("Invalid clip configuration: missing asset type");
		}

		// Prompt-bearing media assets awaiting generation (no src yet) render as
		// pending placeholders; once realisation fills src the reconciler
		// recreates them as regular media players.
		const pending = isPendingAiAsset(clipConfiguration.asset);

		switch (clipConfiguration.asset.type) {
			case "text":
				return new TextPlayer(edit, clipConfiguration);
			case "rich-text":
				return new RichTextPlayer(edit, clipConfiguration);
			case "shape":
				return new ShapePlayer(edit, clipConfiguration);
			case "html":
				return new HtmlPlayer(edit, clipConfiguration);
			case "html5":
				return new Html5Player(edit, clipConfiguration);
			case "image":
				return pending ? new TextToImagePlayer(edit, clipConfiguration) : new ImagePlayer(edit, clipConfiguration);
			case "video":
				return pending ? new ImageToVideoPlayer(edit, clipConfiguration) : new VideoPlayer(edit, clipConfiguration);
			case "audio":
				return pending ? new TextToSpeechPlayer(edit, clipConfiguration) : new AudioPlayer(edit, clipConfiguration);
			case "luma":
				return new LumaPlayer(edit, clipConfiguration);
			case "caption":
				return new CaptionPlayer(edit, clipConfiguration);
			case "rich-caption":
				return new RichCaptionPlayer(edit, clipConfiguration);
			case "svg":
				return new SvgPlayer(edit, clipConfiguration);
			case "text-to-image":
				return new TextToImagePlayer(edit, clipConfiguration);
			case "image-to-video":
				return new ImageToVideoPlayer(edit, clipConfiguration);
			case "text-to-speech":
				return new TextToSpeechPlayer(edit, clipConfiguration);
			default:
				throw new Error(`Unsupported asset type: ${(clipConfiguration.asset as { type: string }).type}`);
		}
	}

	/**
	 * Reset static caches used by players.
	 */
	static cleanup(): void {
		TextPlayer.resetFontCache();
	}
}
