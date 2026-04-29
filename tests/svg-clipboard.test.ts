/**
 * @jest-environment jsdom
 */

import { parseSvgIntrinsicSize, readSvgFromClipboard, sanitiseSvg } from "@core/clipboard/svg-clipboard";

describe("readSvgFromClipboard", () => {
	const originalClipboard = navigator.clipboard;

	afterEach(() => {
		Object.defineProperty(navigator, "clipboard", {
			value: originalClipboard,
			configurable: true
		});
	});

	function setClipboard(impl: Partial<Clipboard>): void {
		Object.defineProperty(navigator, "clipboard", {
			value: impl,
			configurable: true
		});
	}

	it("returns null when clipboard API is unavailable", async () => {
		setClipboard(undefined as unknown as Clipboard);
		expect(await readSvgFromClipboard()).toBeNull();
	});

	it("returns SVG markup from an svg+xml ClipboardItem", async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
		const blob = { text: jest.fn().mockResolvedValue(svg) };
		setClipboard({
			read: jest.fn().mockResolvedValue([
				{
					types: ["image/svg+xml"],
					getType: jest.fn().mockResolvedValue(blob)
				}
			]),
			readText: jest.fn().mockResolvedValue("")
		} as unknown as Clipboard);

		expect(await readSvgFromClipboard()).toBe(svg);
	});

	it("falls back to readText when no svg+xml MIME present", async () => {
		const svg = '<svg viewBox="0 0 1 1"><rect/></svg>';
		setClipboard({
			read: jest.fn().mockResolvedValue([{ types: ["text/plain"], getType: jest.fn() }]),
			readText: jest.fn().mockResolvedValue(svg)
		} as unknown as Clipboard);

		expect(await readSvgFromClipboard()).toBe(svg);
	});

	it("returns null when clipboard text is not SVG", async () => {
		setClipboard({
			read: jest.fn().mockRejectedValue(new Error("denied")),
			readText: jest.fn().mockResolvedValue("hello world")
		} as unknown as Clipboard);

		expect(await readSvgFromClipboard()).toBeNull();
	});

	it("accepts SVG markup with an XML declaration prefix", async () => {
		const svg = '<?xml version="1.0"?><svg viewBox="0 0 10 10"><rect/></svg>';
		setClipboard({
			read: jest.fn().mockRejectedValue(new Error("denied")),
			readText: jest.fn().mockResolvedValue(svg)
		} as unknown as Clipboard);

		expect(await readSvgFromClipboard()).toBe(svg);
	});

	it("accepts SVG markup with a DOCTYPE prefix", async () => {
		const svg =
			'<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg viewBox="0 0 10 10"><rect/></svg>';
		setClipboard({
			read: jest.fn().mockRejectedValue(new Error("denied")),
			readText: jest.fn().mockResolvedValue(svg)
		} as unknown as Clipboard);

		expect(await readSvgFromClipboard()).toBe(svg);
	});

	it("logs a warning when clipboard.read() throws", async () => {
		const svg = '<svg viewBox="0 0 1 1"/>';
		const warnSpy = jest.spyOn(console, "warn").mockImplementation();
		setClipboard({
			read: jest.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
			readText: jest.fn().mockResolvedValue(svg)
		} as unknown as Clipboard);

		await readSvgFromClipboard();

		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("clipboard.read()"), expect.any(Error));
		warnSpy.mockRestore();
	});

	it("survives read() permission denial and uses readText path", async () => {
		const svg = '<svg viewBox="0 0 1 1"/>';
		setClipboard({
			read: jest.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
			readText: jest.fn().mockResolvedValue(svg)
		} as unknown as Clipboard);

		expect(await readSvgFromClipboard()).toBe(svg);
	});
});

describe("sanitiseSvg", () => {
	it("removes <script> elements", () => {
		const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>';
		const clean = sanitiseSvg(dirty);
		expect(clean).not.toMatch(/<script/i);
		expect(clean).toMatch(/<rect/);
	});

	it("removes <foreignObject> elements", () => {
		const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe src="evil"/></foreignObject><rect/></svg>';
		const clean = sanitiseSvg(dirty);
		expect(clean).not.toMatch(/foreignObject/i);
		expect(clean).not.toMatch(/iframe/);
	});

	it("strips on* event handler attributes", () => {
		const dirty = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="x()"/></svg>';
		const clean = sanitiseSvg(dirty);
		expect(clean).not.toMatch(/onload=/i);
		expect(clean).not.toMatch(/onclick=/i);
	});

	it("strips javascript: hrefs", () => {
		const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>';
		const clean = sanitiseSvg(dirty);
		expect(clean).not.toMatch(/javascript:/i);
	});

	it("preserves benign markup", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>';
		const clean = sanitiseSvg(svg);
		expect(clean).toMatch(/viewBox="0 0 100 100"/);
		expect(clean).toMatch(/<rect/);
		expect(clean).toMatch(/fill="red"/);
	});

	it("returns markup unchanged when parsing fails", () => {
		const garbage = "<svg><<not really svg";
		expect(sanitiseSvg(garbage)).toBe(garbage);
	});
});

describe("parseSvgIntrinsicSize", () => {
	it("reads explicit width/height attributes", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect/></svg>';
		expect(parseSvgIntrinsicSize(svg)).toEqual({ width: 320, height: 180 });
	});

	it("falls back to viewBox dimensions when width/height absent", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect/></svg>';
		expect(parseSvgIntrinsicSize(svg)).toEqual({ width: 640, height: 360 });
	});

	it("strips px units from width/height attributes", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="80px"><rect/></svg>';
		expect(parseSvgIntrinsicSize(svg)).toEqual({ width: 120, height: 80 });
	});

	it("returns empty object when SVG has no size info", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
		expect(parseSvgIntrinsicSize(svg)).toEqual({});
	});

	it("returns empty object for unparseable markup", () => {
		expect(parseSvgIntrinsicSize("not svg")).toEqual({});
	});

	it("handles comma-separated viewBox values", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0,0,200,100"><rect/></svg>';
		expect(parseSvgIntrinsicSize(svg)).toEqual({ width: 200, height: 100 });
	});
});
