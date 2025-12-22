import { describe, it, expect } from "@jest/globals";
import { formatClipErrorMessage, extractFilenameFromError } from "../src/components/timeline/utils/error-messages";

describe("extractFilenameFromError", () => {
	it("should extract filename from URL in error message", () => {
		const error = 'Invalid source: "https://example.com/path/to/video.mp4"';
		expect(extractFilenameFromError(error)).toBe("video.mp4");
	});

	it("should extract filename from URL with query params", () => {
		const error = "Failed to load: https://cdn.example.com/assets/image.jpg?token=abc123";
		expect(extractFilenameFromError(error)).toBe("image.jpg");
	});

	it("should return null for errors without URLs", () => {
		const error = "Something went wrong";
		expect(extractFilenameFromError(error)).toBeNull();
	});

	it("should handle URLs without quotes", () => {
		const error = "Invalid source: https://example.com/file.png";
		expect(extractFilenameFromError(error)).toBe("file.png");
	});
});

describe("formatClipErrorMessage", () => {
	describe("image asset with wrong file types", () => {
		it("should detect video file in image clip", () => {
			const error = 'Invalid source: "https://example.com/source.mp4"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("expects an image");
			expect(message).toContain("source.mp4");
			expect(message).toContain("video file");
			expect(message).toContain(".jpg, .png, or .gif");
		});

		it("should detect mov file in image clip", () => {
			const error = 'Invalid source: "https://example.com/movie.mov"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("video file");
		});

		it("should detect audio file in image clip", () => {
			const error = 'Invalid source: "https://example.com/song.mp3"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("expects an image");
			expect(message).toContain("audio file");
		});

		it("should detect wav file in image clip", () => {
			const error = 'Invalid source: "https://example.com/sound.wav"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("audio file");
		});
	});

	describe("video asset with wrong file types", () => {
		it("should detect image file in video clip", () => {
			const error = 'Invalid source: "https://example.com/photo.jpg"';
			const message = formatClipErrorMessage(error, "video");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("expects a video");
			expect(message).toContain("image file");
			expect(message).toContain(".mp4 or .mov");
		});

		it("should detect png file in video clip", () => {
			const error = 'Invalid source: "https://example.com/image.png"';
			const message = formatClipErrorMessage(error, "video");

			expect(message).toContain("image file");
		});

		it("should detect audio file in video clip", () => {
			const error = 'Invalid source: "https://example.com/music.mp3"';
			const message = formatClipErrorMessage(error, "video");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("expects a video");
			expect(message).toContain("audio file");
		});
	});

	describe("audio asset with wrong file types", () => {
		it("should detect video file in audio clip", () => {
			const error = 'Invalid source: "https://example.com/clip.mp4"';
			const message = formatClipErrorMessage(error, "audio");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("expects audio");
			expect(message).toContain("video file");
			expect(message).toContain(".mp3 or .wav");
		});

		it("should detect image file in audio clip", () => {
			const error = 'Invalid source: "https://example.com/pic.png"';
			const message = formatClipErrorMessage(error, "audio");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("expects audio");
			expect(message).toContain("image file");
		});
	});

	describe("luma asset with wrong file types", () => {
		it("should detect audio file in luma clip", () => {
			const error = 'Invalid source: "https://example.com/audio.mp3"';
			const message = formatClipErrorMessage(error, "luma");

			expect(message).toContain("Wrong file type");
			expect(message).toContain("Luma masks require an image or video");
			expect(message).toContain("audio file");
		});
	});

	describe("generic errors", () => {
		it("should return generic message for unknown file with URL", () => {
			const error = 'Failed: "https://example.com/file.xyz"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("Couldn't load file");
			expect(message).toContain("file.xyz");
			expect(message).toContain("Check that the file exists");
		});

		it("should return fallback message for errors without URL", () => {
			const error = "Unknown error occurred";
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("Something went wrong");
			expect(message).toContain("couldn't be loaded");
		});

		it("should return generic message when error doesn't match invalid source pattern", () => {
			const error = 'Network error loading "https://example.com/video.mp4"';
			const message = formatClipErrorMessage(error, "image");

			// Should not detect as wrong file type because error doesn't contain "invalid" and "source"
			expect(message).toContain("Couldn't load file");
			expect(message).not.toContain("Wrong file type");
		});
	});

	describe("edge cases", () => {
		it("should handle webm video extension", () => {
			const error = 'Invalid source: "https://example.com/animation.webm"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("video file");
		});

		it("should handle webp image extension", () => {
			const error = 'Invalid source: "https://example.com/photo.webp"';
			const message = formatClipErrorMessage(error, "video");

			expect(message).toContain("image file");
		});

		it("should handle ogg audio extension", () => {
			const error = 'Invalid source: "https://example.com/sound.ogg"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("audio file");
		});

		it("should handle case-insensitive error matching", () => {
			const error = 'INVALID SOURCE: "https://example.com/video.mp4"';
			const message = formatClipErrorMessage(error, "image");

			expect(message).toContain("Wrong file type");
		});
	});
});
