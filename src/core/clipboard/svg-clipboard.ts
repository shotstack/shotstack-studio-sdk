/**
 * Read SVG markup from the system clipboard, sanitise it, and parse intrinsic size.
 */

const LOG_PREFIX = "[shotstack-studio:svg-clipboard]";

const SVG_MIME = "image/svg+xml";
const SVG_HEAD = /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i;

export async function readSvgFromClipboard(): Promise<string | null> {
	if (typeof navigator === "undefined" || !navigator.clipboard) return null;

	if (typeof navigator.clipboard.read === "function") {
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				if (item.types.includes(SVG_MIME)) {
					const blob = await item.getType(SVG_MIME);
					const text = await blob.text();
					if (SVG_HEAD.test(text)) return text;
				}
			}
		} catch (error) {
			console.warn(`${LOG_PREFIX} clipboard.read() failed, falling back to readText`, error);
		}
	}

	if (typeof navigator.clipboard.readText === "function") {
		try {
			const text = await navigator.clipboard.readText();
			if (SVG_HEAD.test(text)) return text;
		} catch (err) {
			console.warn(`${LOG_PREFIX} clipboard.readText() failed`, err);
		}
	}

	return null;
}

const DANGEROUS_TAGS = ["script", "foreignObject"] as const;
const EVENT_HANDLER_ATTR = /^on/i;
const JS_URL = /^\s*javascript:/i;

/**
 * Sanitise SVG markup before it enters the edit.
 */
export function sanitiseSvg(markup: string): string {
	if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
		throw new Error(`${LOG_PREFIX} sanitiseSvg requires DOMParser/XMLSerializer; call this only in a browser context`);
	}

	const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
	if (doc.querySelector("parsererror")) {
		console.warn(`${LOG_PREFIX} sanitiseSvg: parser error, returning input unchanged`);
		return markup;
	}

	for (const tag of DANGEROUS_TAGS) {
		doc.querySelectorAll(tag).forEach(el => el.remove());
	}

	doc.querySelectorAll("*").forEach(el => {
		for (const attr of Array.from(el.attributes)) {
			if (EVENT_HANDLER_ATTR.test(attr.name)) {
				el.removeAttribute(attr.name);
			} else if ((attr.name === "href" || attr.name === "xlink:href") && JS_URL.test(attr.value)) {
				el.removeAttribute(attr.name);
			}
		}
	});

	return new XMLSerializer().serializeToString(doc);
}

export interface SvgIntrinsicSize {
	width?: number;
	height?: number;
}

/**
 * Pull width/height from an SVG, falling back to viewBox dimensions.
 */
export function parseSvgIntrinsicSize(markup: string): SvgIntrinsicSize {
	if (typeof DOMParser === "undefined") return {};

	const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
	if (doc.querySelector("parsererror")) return {};

	const svgEl = doc.querySelector("svg");
	if (!svgEl) return {};

	const parseLen = (val: string | null): number | undefined => {
		if (!val) return undefined;
		const num = parseFloat(val);
		return Number.isFinite(num) && num > 0 ? num : undefined;
	};

	const explicitWidth = parseLen(svgEl.getAttribute("width"));
	const explicitHeight = parseLen(svgEl.getAttribute("height"));
	if (explicitWidth !== undefined && explicitHeight !== undefined) {
		return { width: explicitWidth, height: explicitHeight };
	}

	const viewBox = svgEl.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox
			.trim()
			.split(/[\s,]+/)
			.map(Number);
		if (parts.length === 4 && parts.every(Number.isFinite)) {
			const [, , vbW, vbH] = parts;
			return {
				width: explicitWidth ?? (vbW > 0 ? vbW : undefined),
				height: explicitHeight ?? (vbH > 0 ? vbH : undefined)
			};
		}
	}

	return { width: explicitWidth, height: explicitHeight };
}
