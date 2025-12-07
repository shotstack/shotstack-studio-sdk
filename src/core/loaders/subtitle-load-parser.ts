import * as pixi from "pixi.js";

import { type Cue, parseSubtitle } from "@core/captions";

export interface SubtitleAsset {
	content: string;
	cues: Cue[];
}

export class SubtitleLoadParser implements pixi.LoaderParser<SubtitleAsset | null> {
	public static readonly Name = "SubtitleLoadParser";

	public id: string;
	public name: string;
	public extension: pixi.ExtensionFormat;
	private validExtensions: string[];

	constructor() {
		this.id = SubtitleLoadParser.Name;
		this.name = SubtitleLoadParser.Name;
		this.extension = {
			type: [pixi.ExtensionType.LoadParser],
			priority: pixi.LoaderParserPriority.Normal,
			ref: null
		};
		this.validExtensions = ["srt", "vtt"];
	}

	public test(url: string): boolean {
		const extension = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
		return this.validExtensions.includes(extension);
	}

	public async load(url: string): Promise<SubtitleAsset | null> {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				return null;
			}
			const content = await response.text();
			return {
				content,
				cues: parseSubtitle(content)
			};
		} catch {
			return null;
		}
	}

	public unload(_asset: SubtitleAsset | null): void {
		// No cleanup needed for text content
	}
}
