import type { Edit } from "@core/edit-session";
import type { ResolvedClip } from "@schemas";

import { AudioPlayer } from "./audio-player";
import { CaptionPlayer } from "./caption-player";
import { HtmlPlayer } from "./html-player";
import { ImagePlayer } from "./image-player";
import { LumaPlayer } from "./luma-player";
import type { Player } from "./player";
import { RichTextPlayer } from "./rich-text-player";
import { ShapePlayer } from "./shape-player";
import { SvgPlayer } from "./svg-player";
import { TextPlayer } from "./text-player";
import { VideoPlayer } from "./video-player";

/**
 * Factory for creating Player instances from clip configurations.
 */
export class PlayerFactory {
	static create(edit: Edit, clipConfiguration: ResolvedClip): Player {
		if (!clipConfiguration.asset?.type) {
			throw new Error("Invalid clip configuration: missing asset type");
		}

		switch (clipConfiguration.asset.type) {
			case "text":
				return new TextPlayer(edit, clipConfiguration);
			case "rich-text":
				return new RichTextPlayer(edit, clipConfiguration);
			case "shape":
				return new ShapePlayer(edit, clipConfiguration);
			case "html":
				return new HtmlPlayer(edit, clipConfiguration);
			case "image":
				return new ImagePlayer(edit, clipConfiguration);
			case "video":
				return new VideoPlayer(edit, clipConfiguration);
			case "audio":
				return new AudioPlayer(edit, clipConfiguration);
			case "luma":
				return new LumaPlayer(edit, clipConfiguration);
			case "caption":
				return new CaptionPlayer(edit, clipConfiguration);
			case "svg":
				return new SvgPlayer(edit, clipConfiguration);
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
