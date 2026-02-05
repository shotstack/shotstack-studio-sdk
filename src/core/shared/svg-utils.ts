/**
 * SVG manipulation utilities for programmatic SVG transformations.
 */

/**
 * Detect if SVG is simple (rect-only) vs complex (paths, circles, etc.)
 *
 * Simple SVGs need viewBox manipulation to maintain toolbar compatibility.
 * Complex SVGs should NOT be manipulated - the renderer handles scaling.
 * Over time we'll add circle, ellipse, line support to the viewBox scaling logic.
 *
 * @param svg - The SVG markup to analyze
 * @returns true if SVG only contains rect elements
 */
export function isSimpleRectSvg(svg: string): boolean {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svg, "image/svg+xml");
	if (doc.querySelector("parsererror")) return false;

	const svgEl = doc.querySelector("svg");
	if (!svgEl) return false;

	const complexElements = svgEl.querySelectorAll("path, polygon, polyline, circle, ellipse, line, g");
	return complexElements.length === 0;
}

/**
 * Update SVG viewBox and scale rect elements proportionally.
 *
 * @param svg - The SVG markup string to transform
 * @param width - New width for the viewBox
 * @param height - New height for the viewBox
 * @returns The modified SVG markup, or original on error
 */
export function updateSvgViewBox(svg: string, width: number, height: number): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(svg, "image/svg+xml");

	// Check for parse errors
	const errorNode = doc.querySelector("parsererror");
	if (errorNode) {
		console.warn("[SVG Utils] Invalid SVG markup");
		return svg;
	}

	const svgEl = doc.documentElement;
	const viewBox = svgEl.getAttribute("viewBox");
	if (!viewBox) {
		console.warn("[SVG Utils] SVG missing viewBox");
		return svg;
	}

	const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
	if (!vbWidth || !vbHeight) {
		console.warn("[SVG Utils] Invalid viewBox dimensions");
		return svg;
	}

	// Calculate scale factors
	const scaleX = width / vbWidth;
	const scaleY = height / vbHeight;
	const radiusScale = Math.min(scaleX, scaleY);

	// Update viewBox
	svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);

	// Scale rect elements
	doc.querySelectorAll("rect").forEach(rect => {
		const scale = (attr: string, factor: number) => {
			const val = rect.getAttribute(attr);
			if (val) rect.setAttribute(attr, String(parseFloat(val) * factor));
		};

		scale("x", scaleX);
		scale("y", scaleY);
		scale("width", scaleX);
		scale("height", scaleY);
		scale("rx", radiusScale);
		scale("ry", radiusScale);
	});

	return new XMLSerializer().serializeToString(doc);
}

/**
 * Update a specific attribute on the first SVG shape element.
 * Used by toolbar controls to modify fill, corner radius, etc.
 *
 * @param svg - The SVG markup string to transform
 * @param attr - The attribute name to update (e.g., "fill", "rx", "ry")
 * @param value - The new attribute value
 * @returns The modified SVG markup
 */
export function updateSvgAttribute(svg: string, attr: string, value: string): string {
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	const shape = doc.querySelector("svg")?.querySelector("rect, circle, polygon, path, ellipse, line, polyline");

	if (!shape) {
		// Fallback: insert attribute on first shape tag
		const shapePattern = /(<(?:rect|circle|polygon|path|ellipse|line|polyline)[^>]*)(>)/;
		return svg.replace(shapePattern, `$1 ${attr}="${value}"$2`);
	}

	shape.setAttribute(attr, value);
	return new XMLSerializer().serializeToString(doc);
}
