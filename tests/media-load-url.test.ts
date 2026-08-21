import { toLoadUrl, warnIfCorsBlocked } from "@core/shared/utils";

describe("toLoadUrl", () => {
	it("appends the cache-busting parameter to plain http(s) URLs", () => {
		expect(toLoadUrl("https://bucket.s3.amazonaws.com/video.mp4")).toBe("https://bucket.s3.amazonaws.com/video.mp4?x-cors=1");
		expect(toLoadUrl("http://example.com/image.png")).toBe("http://example.com/image.png?x-cors=1");
	});

	it("leaves URLs with a query string untouched", () => {
		const signed = "https://bucket.s3.amazonaws.com/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc";
		expect(toLoadUrl(signed)).toBe(signed);
		expect(toLoadUrl("https://cdn.example.com/a.jpg?v=2")).toBe("https://cdn.example.com/a.jpg?v=2");
	});

	it("leaves non-http URLs untouched", () => {
		const dataUri = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";
		expect(toLoadUrl(dataUri)).toBe(dataUri);
		expect(toLoadUrl("blob:https://example.com/uuid")).toBe("blob:https://example.com/uuid");
	});
});

describe("warnIfCorsBlocked", () => {
	let warnSpy: jest.SpyInstance;
	let fetchMock: jest.Mock;

	beforeEach(() => {
		warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		fetchMock = jest.fn();
		global.fetch = fetchMock as never;
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it("warns when the URL is reachable but blocks CORS", async () => {
		fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ type: "opaque" });

		await warnIfCorsBlocked("https://bucket.s3.amazonaws.com/video.mp4");

		expect(fetchMock).toHaveBeenNthCalledWith(1, "https://bucket.s3.amazonaws.com/video.mp4", { method: "HEAD", mode: "cors" });
		expect(fetchMock).toHaveBeenNthCalledWith(2, "https://bucket.s3.amazonaws.com/video.mp4", { method: "HEAD", mode: "no-cors" });
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("CORS"));
	});

	it("stays silent when the CORS request succeeds", async () => {
		fetchMock.mockResolvedValueOnce({ ok: true });

		await warnIfCorsBlocked("https://example.com/a.jpg");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("stays silent when the URL is unreachable", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

		await warnIfCorsBlocked("https://nowhere.invalid/a.jpg");

		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("skips non-http URLs", async () => {
		await warnIfCorsBlocked("data:image/png;base64,abc");

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
