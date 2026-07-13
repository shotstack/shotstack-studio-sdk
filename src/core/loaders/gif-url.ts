const GIF_DATA_URL_PATTERN = /^data:image\/gif(?:;|,)/i;

export function getUrlExtension(src: string): string | null {
	if (src.startsWith("data:")) return null;

	try {
		const { pathname } = new URL(src, typeof window === "undefined" ? "http://localhost" : window.location.origin);
		// eslint-disable-next-line prefer-destructuring -- The final path segment is required, not the first.
		const filename = pathname.split("/").at(-1) ?? "";
		const extensionStart = filename.lastIndexOf(".");
		return extensionStart >= 0 ? filename.slice(extensionStart).toLowerCase() : null;
	} catch {
		return null;
	}
}

export function isGifUrl(src: string): boolean {
	return GIF_DATA_URL_PATTERN.test(src) || getUrlExtension(src) === ".gif";
}

export function appendCorsQuery(src: string): string {
	if (!/^https?:\/\//i.test(src)) return src;
	return `${src}${src.includes("?") ? "&" : "?"}x-cors=1`;
}
