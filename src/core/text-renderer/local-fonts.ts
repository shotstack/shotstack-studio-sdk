const localFonts = import.meta.glob("../../assets/fonts/*.{ttf,otf,woff,woff2}", {
	eager: true,
	as: "url"
}) as Record<string, string>;

export type LocalFontEntry = {
	url: string;
	fileBase: string;
	familyGuess: string;
	styleGuess: "normal" | "italic" | "oblique";
	weightGuess: string;
};

function guessFromFilename(base: string) {
	const lower = base.toLowerCase();

	const weightMap: Record<string, string> = {
		thin: "100",
		extralight: "200",
		ultralight: "200",
		light: "300",
		regular: "400",
		normal: "400",
		book: "400",
		medium: "500",
		semibold: "600",
		demibold: "600",
		bold: "700",
		extrabold: "800",
		ultrabold: "800",
		heavy: "800",
		black: "900"
	};

	let weight: string = "400";
	for (const [k, v] of Object.entries(weightMap)) {
		if (lower.includes(k)) {
			weight = v;
			break;
		}
	}

	let style: "normal" | "italic" | "oblique" = "normal";
	if (lower.includes("italic")) style = "italic";
	else if (lower.includes("oblique")) style = "oblique";

	const family = base
		.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "")
		.replace(
			/-?(thin|extralight|ultralight|light|regular|normal|book|medium|semibold|demibold|bold|extrabold|ultrabold|heavy|black|italic|oblique)$/i,
			""
		)
		.replace(/-$/, "");

	return { familyGuess: family || base, weightGuess: weight, styleGuess: style };
}

export const LOCAL_FONT_INDEX: LocalFontEntry[] = Object.entries(localFonts).map(([path, url]) => {
	const fileBase = path
		.split("/")
		.pop()!
		.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, "");
	const { familyGuess, weightGuess, styleGuess } = guessFromFilename(fileBase);
	return { url, fileBase, familyGuess, weightGuess, styleGuess };
});
