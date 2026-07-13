import { appendCorsQuery, getUrlExtension, isGifUrl } from "@loaders/gif-url";

describe("GIF URL classification", () => {
	it.each([
		"https://cdn.example.com/animation.gif",
		"https://cdn.example.com/ANIMATION.GIF?token=abc",
		"data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA=="
	])("recognises %s", src => {
		expect(isGifUrl(src)).toBe(true);
	});

	it.each(["https://cdn.example.com/image.png", "data:image/png;base64,abc", "https://cdn.example.com/assets/image"])(
		"does not infer GIF from %s",
		src => {
			expect(isGifUrl(src)).toBe(false);
		}
	);

	it("extracts a case-normalised extension without query parameters", () => {
		expect(getUrlExtension("https://example.com/path/FILE.GIF?v=2")).toBe(".gif");
		expect(getUrlExtension("https://example.com/path/asset")).toBeNull();
	});

	it("adds the CORS query only to HTTP URLs", () => {
		expect(appendCorsQuery("https://example.com/a.gif")).toBe("https://example.com/a.gif?x-cors=1");
		expect(appendCorsQuery("https://example.com/a.gif?v=1")).toBe("https://example.com/a.gif?v=1&x-cors=1");
		expect(appendCorsQuery("data:image/gif;base64,abc")).toBe("data:image/gif;base64,abc");
	});
});
