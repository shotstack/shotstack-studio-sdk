import * as howler from "howler";
import * as pixi from "pixi.js";

export class AudioLoadParser implements pixi.LoaderParser<Howl | null> {
	public static readonly Name = "AudioLoadParser";

	public name: string;
	public extension: pixi.ExtensionFormat;
	private validAudioExtensions: string[];

	constructor() {
		this.name = AudioLoadParser.Name;
		this.extension = {
			type: [pixi.ExtensionType.LoadParser],
			priority: pixi.LoaderParserPriority.Normal,
			ref: null
		};
		this.validAudioExtensions = ["mp3", "mpeg", "ogg", "wav"];
	}

	public test(url: string): boolean {
		const extension = url.split("?")[0]?.split(".").pop() ?? "";
		return this.validAudioExtensions.includes(extension);
	}

	public async load(url: string, _?: pixi.ResolvedAsset<Howl>, __?: pixi.Loader): Promise<Howl | null> {
		return new Promise(resolve => {
			const loadOptions: howler.HowlOptions = { src: url };
			const howl = new Howl(loadOptions);

			howl.on("load", () => resolve(howl));
			howl.on("loaderror", () => resolve(null));
		});
	}

	public unload(asset: Howl | null): void {
		asset?.unload();
	}
}
