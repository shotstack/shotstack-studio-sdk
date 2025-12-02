import * as pixi from "pixi.js";

type Woff2Decompressor = {
	decompress: (buffer: ArrayBuffer) => ArrayBuffer;
	onRuntimeInitialized: (value: unknown) => void;
};

export class FontLoadParser implements pixi.LoaderParser<FontFace | null> {
	public static readonly Name = "FontLoadParser";

	public id: string;
	public name: string;
	public extension: pixi.ExtensionFormat;
	private validFontExtensions: string[];

	private woff2Decompressor: Woff2Decompressor | null;

	constructor() {
		this.id = FontLoadParser.Name;
		this.name = FontLoadParser.Name;
		this.extension = {
			type: [pixi.ExtensionType.LoadParser],
			priority: pixi.LoaderParserPriority.High,
			ref: null
		};
		this.validFontExtensions = ["ttf", "otf", "woff", "woff2"];
		this.woff2Decompressor = null;
	}

	public test(url: string): boolean {
		const extension = url.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
		return this.validFontExtensions.includes(extension);
	}

	public async load(url: string, _?: pixi.ResolvedAsset<FontFace>, __?: pixi.Loader): Promise<FontFace | null> {
		const urlWithoutQuery = url.split("?")[0] ?? "";
		const extension = urlWithoutQuery.split(".").pop()?.toLowerCase() ?? "";

		const filename = urlWithoutQuery.split("/").pop() || "";
		const familyName = filename.replace(/\.(ttf|otf|woff|woff2)$/i, "");

		if (extension !== "woff2") {
			const fontFace = new FontFace(familyName, `url(${url})`);
			await fontFace.load();

			document.fonts.add(fontFace);
			return fontFace;
		}

		const buffer = await fetch(url).then(res => res.arrayBuffer());

		await this.loadWoff2Decompressor();
		if (!this.woff2Decompressor) {
			throw new Error("Cannot initialize Woff2 decompressor.");
		}

		const decompressed = this.woff2Decompressor.decompress(buffer);

		const blob = new Blob([decompressed], { type: "font/ttf" });
		const blobUrl = URL.createObjectURL(blob);

		const fontFace = new FontFace(familyName, `url(${blobUrl})`);
		await fontFace.load();

		document.fonts.add(fontFace);
		return fontFace;
	}

	private async loadWoff2Decompressor(): Promise<void> {
		if (this.woff2Decompressor) {
			return;
		}

		const bindingsSource = "https://unpkg.com/wawoff2@2.0.1/build/decompress_binding.js";
		const bindingsScript = `${await fetch(bindingsSource).then(res => res.text())}; return Module`;

		this.woff2Decompressor = new Function(bindingsScript)();
		await new Promise(resolve => {
			this.woff2Decompressor!.onRuntimeInitialized = resolve;
		});
	}

	public unload(asset: FontFace | null): void {
		if (!asset) {
			return;
		}

		document.fonts.delete(asset);
	}
}
