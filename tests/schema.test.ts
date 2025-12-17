import { describe, it, expect } from "@jest/globals";
import { ClipSchema } from "../src/core/schemas/clip";
import { EditSchema, TimelineSchema, OutputSchema } from "../src/core/schemas/edit";
import { TrackSchema } from "../src/core/schemas/track";
import { VideoAssetSchema } from "../src/core/schemas/video-asset";
import { AudioAssetSchema } from "../src/core/schemas/audio-asset";
import { TextAssetSchema } from "../src/core/schemas/text-asset";
import { ImageAssetSchema } from "../src/core/schemas/image-asset";
import { ShapeAssetSchema } from "../src/core/schemas/shape-asset";
import { HtmlAssetSchema } from "../src/core/schemas/html-asset";

describe("Schema Imports", () => {
	it("should import all schemas without WASM errors", () => {
		expect(ClipSchema).toBeDefined();
		expect(EditSchema).toBeDefined();
		expect(VideoAssetSchema).toBeDefined();
		expect(AudioAssetSchema).toBeDefined();
		expect(TextAssetSchema).toBeDefined();
		expect(ImageAssetSchema).toBeDefined();
		expect(ShapeAssetSchema).toBeDefined();
		expect(HtmlAssetSchema).toBeDefined();
		expect(TrackSchema).toBeDefined();
		expect(TimelineSchema).toBeDefined();
		expect(OutputSchema).toBeDefined();
	});
});

describe("ClipSchema Validation", () => {
	it("should validate a valid video clip", () => {
		const validClip = {
			asset: {
				type: "video",
				src: "https://example.com/video.mp4"
			},
			start: 0,
			length: 5
		};

		const result = ClipSchema.safeParse(validClip);
		expect(result.success).toBe(true);
	});

	it("should reject invalid clip with negative start", () => {
		const invalidClip = {
			asset: {
				type: "video",
				src: "https://example.com/video.mp4"
			},
			start: -1,
			length: 5
		};

		const result = ClipSchema.safeParse(invalidClip);
		expect(result.success).toBe(false);
	});

	it("should reject invalid clip with zero length", () => {
		const invalidClip = {
			asset: {
				type: "video",
				src: "https://example.com/video.mp4"
			},
			start: 0,
			length: 0
		};

		const result = ClipSchema.safeParse(invalidClip);
		expect(result.success).toBe(false);
	});

	it("should validate clip with all optional properties", () => {
		const fullClip = {
			asset: {
				type: "video",
				src: "https://example.com/video.mp4",
				trim: 2,
				volume: 0.8
			},
			start: 0,
			length: 5,
			position: "center",
			fit: "cover",
			opacity: 1,
			scale: 1.5,
			offset: { x: 0, y: 0 }
		};

		const result = ClipSchema.safeParse(fullClip);
		expect(result.success).toBe(true);
	});
});

describe("EditSchema Validation", () => {
	it("should validate a complete edit configuration", () => {
		const validEdit = {
			timeline: {
				background: "#000000",
				tracks: [
					{
						clips: [
							{
								asset: {
									type: "video",
									src: "https://example.com/video.mp4"
								},
								start: 0,
								length: 5
							}
						]
					}
				]
			},
			output: {
				size: {
					width: 1920,
					height: 1080
				},
				format: "mp4",
				fps: 30
			}
		};

		const result = EditSchema.safeParse(validEdit);
		expect(result.success).toBe(true);
	});

	it("should validate edit with multiple tracks", () => {
		const validEdit = {
			timeline: {
				tracks: [
					{
						clips: [
							{
								asset: { type: "video", src: "https://example.com/bg.mp4" },
								start: 0,
								length: 10
							}
						]
					},
					{
						clips: [
							{
								asset: { type: "text", text: "Hello World" },
								start: 2,
								length: 5
							}
						]
					}
				]
			},
			output: {
				size: { width: 1920, height: 1080 },
				format: "mp4"
			}
		};

		const result = EditSchema.safeParse(validEdit);
		expect(result.success).toBe(true);
	});

	it("should reject edit with invalid output size", () => {
		const invalidEdit = {
			timeline: {
				tracks: [
					{
						clips: [
							{
								asset: { type: "video", src: "https://example.com/video.mp4" },
								start: 0,
								length: 5
							}
						]
					}
				]
			},
			output: {
				size: {
					width: -1920,
					height: 1080
				},
				format: "mp4"
			}
		};

		const result = EditSchema.safeParse(invalidEdit);
		expect(result.success).toBe(false);
	});
});

describe("Asset Schema Validation", () => {
	it("should validate video asset", () => {
		const videoAsset = {
			type: "video",
			src: "https://example.com/video.mp4",
			trim: 2,
			volume: 0.8
		};

		const result = VideoAssetSchema.safeParse(videoAsset);
		expect(result.success).toBe(true);
	});

	it("should validate audio asset", () => {
		const audioAsset = {
			type: "audio",
			src: "https://example.com/audio.mp3",
			volume: 0.5
		};

		const result = AudioAssetSchema.safeParse(audioAsset);
		expect(result.success).toBe(true);
	});

	it("should validate text asset", () => {
		const textAsset = {
			type: "text",
			text: "Hello World",
			font: {
				family: "Arial",
				size: 24,
				color: "#ffffff"
			}
		};

		const result = TextAssetSchema.safeParse(textAsset);
		expect(result.success).toBe(true);
	});

	it("should validate image asset", () => {
		const imageAsset = {
			type: "image",
			src: "https://example.com/image.jpg"
		};

		const result = ImageAssetSchema.safeParse(imageAsset);
		expect(result.success).toBe(true);
	});

	it("should validate shape asset", () => {
		const shapeAsset = {
			type: "shape",
			shape: "rectangle",
			rectangle: {
				width: 100,
				height: 50
			},
			fill: {
				color: "#ff0000",
				opacity: 1
			}
		};

		const result = ShapeAssetSchema.safeParse(shapeAsset);
		expect(result.success).toBe(true);
	});

	it("should validate HTML asset", () => {
		const htmlAsset = {
			type: "html",
			html: "<div>Hello</div>",
			css: "div { color: red; }"
		};

		const result = HtmlAssetSchema.safeParse(htmlAsset);
		expect(result.success).toBe(true);
	});
});

describe("Real-world Use Cases", () => {
	it("should validate complex multi-track video edit", () => {
		const complexEdit = {
			timeline: {
				background: "#000000",
				fonts: [
					{
						src: "https://fonts.googleapis.com/css2?family=Roboto"
					}
				],
				tracks: [
					{
						clips: [
							{
								asset: {
									type: "video",
									src: "https://example.com/background.mp4",
									volume: 0.3
								},
								start: 0,
								length: 30
							}
						]
					},
					{
						clips: [
							{
								asset: {
									type: "image",
									src: "https://example.com/logo.png"
								},
								start: 0,
								length: 5,
								position: "topRight",
								scale: 0.5,
								offset: { x: -0.05, y: 0.05 }
							}
						]
					},
					{
						clips: [
							{
								asset: {
									type: "text",
									text: "Welcome!",
									font: {
										family: "Roboto",
										size: 48,
										color: "#ffffff"
									}
								},
								start: 5,
								length: 3,
								position: "center",
								transition: {
									in: "fade",
									out: "fade"
								}
							}
						]
					},
					{
						clips: [
							{
								asset: {
									type: "audio",
									src: "https://example.com/music.mp3",
									volume: 0.6
								},
								start: 0,
								length: 30
							}
						]
					}
				]
			},
			output: {
				size: {
					width: 1920,
					height: 1080
				},
				fps: 30,
				format: "mp4"
			}
		};

		const result = EditSchema.safeParse(complexEdit);
		expect(result.success).toBe(true);
	});
});
