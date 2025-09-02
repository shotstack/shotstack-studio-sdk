import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from "vitest";
import { TextRenderEngine } from "../src/core/text-renderer/text-render-engine";
import { AnimationEngine } from "../src/core/text-renderer/animations/animation-engine";
import { TextStyleManager } from "../src/core/text-renderer/text-style-manager";
import { TextLayoutEngine } from "../src/core/text-renderer/text-layout-engine";
import { GradientBuilder } from "../src/core/text-renderer/gradient-builder";
import { validateRichTextAsset, isRichTextAsset, type RichTextAsset } from "../src/core/schemas/rich-text-asset";
import type { CanvasConfig, RenderResult, AnimationFrame, GradientConfig } from "../src/core/text-renderer/types";

const mockCanvasKit = {
	FontWeight: {
		Thin: 100,
		ExtraLight: 200,
		Light: 300,
		Normal: 400,
		Medium: 500,
		SemiBold: 600,
		Bold: 700,
		ExtraBold: 800,
		Black: 900,
		ExtraBlack: 950
	},
	FontWidth: { Normal: 5 },
	FontSlant: {
		Upright: 0,
		Italic: 1,
		Oblique: 2
	},
	BlurStyle: { Normal: 0 },
	PaintStyle: { Fill: 0, Stroke: 1 },
	TileMode: { Clamp: 0 },
	StrokeJoin: { Round: 0 },
	StrokeCap: { Round: 0 },
	TRANSPARENT: [0, 0, 0, 0],
	ColorType: {
		RGBA_8888: 4
	},
	AlphaType: {
		Premul: 1
	},
	ColorSpace: {
		SRGB: {}
	},
	Color4f: vi.fn((r, g, b, a) => new Float32Array([r, g, b, a])),
	XYWHRect: vi.fn((x, y, w, h) => ({ x, y, width: w, height: h })),
	Malloc: vi.fn((type, size) => ({
		toTypedArray: () => new Uint8Array(size)
	})),
	Free: vi.fn(),
	Paint: vi.fn(() => ({
		setColor: vi.fn(),
		setAlphaf: vi.fn(),
		setAntiAlias: vi.fn(),
		setStyle: vi.fn(),
		setStrokeWidth: vi.fn(),
		setStrokeJoin: vi.fn(),
		setStrokeCap: vi.fn(),
		setShader: vi.fn(),
		setMaskFilter: vi.fn(),
		delete: vi.fn()
	})),
	Font: vi.fn(() => {
		const font = {
			setSize: vi.fn(),
			setEmbolden: vi.fn(),
			setSkewX: vi.fn(),
			getGlyphIDs: vi.fn((input: any) => {
				const n = typeof input === "string" ? input.length : (input && input.length) || 0;
				const ids = new Uint16Array(n);
				for (let i = 0; i < n; i++) ids[i] = i + 1;
				return ids;
			}),
			getGlyphWidths: vi.fn((glyphs: any) => {
				const n = (glyphs && glyphs.length) || 0;
				const widths = new Float32Array(n);
				for (let i = 0; i < n; i++) widths[i] = 10;
				return widths;
			}),
			getMetrics: vi.fn(() => ({
				ascent: -16,
				descent: 4,
				leading: 0
			})),
			delete: vi.fn()
		};
		return font;
	}),
	Path: vi.fn(() => ({
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		arcToTangent: vi.fn(),
		addRect: vi.fn(),
		close: vi.fn(),
		delete: vi.fn()
	})),
	MaskFilter: {
		MakeBlur: vi.fn(() => ({}))
	},
	Shader: {
		MakeLinearGradient: vi.fn(() => ({})),
		MakeRadialGradient: vi.fn(() => ({}))
	},
	FontMgr: {
		FromData: vi.fn(() => ({
			countFamilies: () => 1,
			matchFamilyStyle: vi.fn(() => ({}))
		}))
	},
	MakeSurface: vi.fn(() => mockSurface)
};

const mockCanvas = {
	scale: vi.fn(),
	save: vi.fn(),
	restore: vi.fn(),
	translate: vi.fn(),
	rotate: vi.fn(),
	clear: vi.fn(),
	drawText: vi.fn(),
	drawRect: vi.fn(),
	drawPath: vi.fn()
};

const mockSurface = {
	getCanvas: vi.fn(() => mockCanvas),
	flush: vi.fn(),
	makeImageSnapshot: vi.fn(() => ({
		width: 100,
		height: 100,
		readPixels: vi.fn(() => true),
		delete: vi.fn()
	})),
	delete: vi.fn()
};

vi.mock("../src/core/text-renderer/canvas-kit-manager", () => ({
	CanvasKitManager: {
		getInstance: vi.fn(() => ({
			initialize: vi.fn(async () => mockCanvasKit),
			createOffscreenSurface: vi.fn(async () => mockSurface),
			getCanvasKit: vi.fn(() => mockCanvasKit),
			getFontManager: vi.fn(() => mockCanvasKit.FontMgr.FromData()),
			getTypefaceForFont: vi.fn(async (_family: string, _weight?: string, _style?: string) => ({}))
		}))
	}
}));

vi.mock("../src/core/text-renderer/font-manager", () => ({
	FontManager: {
		getInstance: vi.fn(() => ({
			initialize: vi.fn(),
			loadGoogleFont: vi.fn(),
			loadCustomFonts: vi.fn(),
			getFontMetrics: vi.fn(() => ({
				ascent: 16,
				descent: 4,
				lineHeight: 20
			})),
			ensureFamilyAvailable: vi.fn(async (_family: string, _weight: string, _style: string) => true),
			loadTimelineFonts: vi.fn()
		}))
	}
}));

describe("RichTextAsset Schema Validation", () => {
	it("should validate a minimal rich text asset", () => {
		const asset: RichTextAsset = {
			type: "rich-text",
			text: "Hello World",
			cacheEnabled: true,
			pixelRatio: 2
		};

		expect(() => validateRichTextAsset(asset)).not.toThrow();
		expect(isRichTextAsset(asset)).toBe(true);
	});

	it("should validate complete rich text asset with all properties", () => {
		const asset: RichTextAsset = {
			type: "rich-text",
			text: "Complete Asset",
			width: 1920,
			height: 1080,
			font: {
				family: "Roboto",
				size: 48,
				weight: "700",
				style: "italic",
				color: "#ff0000",
				opacity: 0.9
			},
			style: {
				letterSpacing: 2,
				lineHeight: 1.8,
				textTransform: "uppercase",
				textDecoration: "underline",
				gradient: {
					type: "linear",
					angle: 45,
					stops: [
						{ offset: 0, color: "#ff0000" },
						{ offset: 1, color: "#00ff00" }
					]
				}
			},
			stroke: {
				width: 2,
				color: "#000000",
				opacity: 1
			},
			shadow: {
				offsetX: 5,
				offsetY: 5,
				blur: 10,
				color: "#000000",
				opacity: 0.5
			},
			background: {
				color: "#ffffff",
				opacity: 0.8,
				borderRadius: 10
			},
			align: {
				horizontal: "center",
				vertical: "middle"
			},
			animation: {
				preset: "typewriter",
				speed: 1.5,
				duration: 3,
				style: "character"
			},
			customFonts: [
				{
					src: "https://shotstack-ingest-api-stage-sources.s3.ap-southeast-2.amazonaws.com/jnmalrdeem/zzz01k45-s9d8c-70bd2-n8b8c-21ekqw/source.ttf",
					family: "CustomFont",
					weight: "400",
					style: "normal"
				}
			],
			cacheEnabled: true,
			pixelRatio: 2
		};

		expect(() => validateRichTextAsset(asset)).not.toThrow();
		expect(isRichTextAsset(asset)).toBe(true);
	});

	it("should reject invalid asset types", () => {
		const invalidAsset = {
			type: "video",
			text: "Invalid"
		};

		expect(isRichTextAsset(invalidAsset)).toBe(false);
	});

	it("should reject invalid color formats", () => {
		const invalidAsset = {
			type: "rich-text",
			text: "Test",
			font: {
				color: "not-a-color"
			}
		};

		expect(() => validateRichTextAsset(invalidAsset)).toThrow();
	});

	it("should validate all animation presets", () => {
		const presets = ["typewriter", "movingLetters", "fadeIn", "slideIn", "ascend", "shift"];

		presets.forEach(preset => {
			const asset: RichTextAsset = {
				type: "rich-text",
				text: "Animation Test",
				animation: {
					preset: preset as any,
					speed: 1,
					duration: 2
				},
				cacheEnabled: true,
				pixelRatio: 2
			};

			expect(() => validateRichTextAsset(asset)).not.toThrow();
		});
	});

	it("should validate animation with style only for typewriter and shift", () => {
		const validTypewriter: RichTextAsset = {
			type: "rich-text",
			text: "Test",
			animation: {
				preset: "typewriter",
				speed: 1,
				style: "character"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(validTypewriter)).not.toThrow();

		const validShift: RichTextAsset = {
			type: "rich-text",
			text: "Test",
			animation: {
				preset: "shift",
				speed: 1,
				style: "word"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(validShift)).not.toThrow();

		const invalidFadeIn = {
			type: "rich-text",
			text: "Test",
			animation: {
				preset: "fadeIn",
				style: "character"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(invalidFadeIn)).toThrow();
	});

	it("should validate animation directions correctly", () => {
		const validAscend: RichTextAsset = {
			type: "rich-text",
			text: "Test",
			animation: {
				preset: "ascend",
				speed: 1,
				direction: "up"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(validAscend)).not.toThrow();

		const invalidAscend = {
			type: "rich-text",
			text: "Test",
			animation: {
				preset: "ascend",
				direction: "left"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(invalidAscend)).toThrow();

		const invalidTypewriter = {
			type: "rich-text",
			text: "Test",
			animation: {
				preset: "typewriter",
				direction: "up"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(invalidTypewriter)).toThrow();
	});

	it("should handle default values correctly", () => {
		const minimal = {
			type: "rich-text",
			text: "Test"
		};

		const validated = validateRichTextAsset(minimal);
		expect(validated.cacheEnabled).toBe(true);
		expect(validated.pixelRatio).toBe(2);
	});

	it("should validate hex color formats", () => {
		const valid: RichTextAsset = {
			type: "rich-text",
			text: "Test",
			font: {
				family: "Arial",
				size: 12,
				opacity: 1,
				style: "normal",
				weight: "normal",
				color: "#ff0000"
			},
			cacheEnabled: true,
			pixelRatio: 2
		};
		expect(() => validateRichTextAsset(valid)).not.toThrow();

		const invalid = {
			type: "rich-text",
			text: "Test",
			font: {
				color: "#ff00"
			}
		};
		expect(() => validateRichTextAsset(invalid)).toThrow();
	});
});

describe("TextRenderEngine", () => {
	let engine: TextRenderEngine;

	beforeEach(() => {
		engine = new TextRenderEngine();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Initialization", () => {
		it("should initialize with default config", async () => {
			const config: Partial<CanvasConfig> = {
				text: "Test",
				width: 800,
				height: 600
			};

			await engine.initialize(config);

			expect(mockSurface.getCanvas).toHaveBeenCalled();
			expect(mockCanvas.scale).toHaveBeenCalled();
		});

		it("should initialize with custom fonts", async () => {
			const config: Partial<CanvasConfig> = {
				text: "Custom Font Test",
				customFonts: [
					{
						src: "https://shotstack-ingest-api-stage-sources.s3.ap-southeast-2.amazonaws.com/jnmalrdeem/zzz01k45-s9d8c-70bd2-n8b8c-21ekqw/source.ttf",
						family: "CustomFont"
					}
				]
			};

			await engine.initialize(config);

			expect(engine.getConfig()?.customFonts).toEqual(config.customFonts);
		});

		it("should initialize animation engine for animated text", async () => {
			const config: Partial<CanvasConfig> = {
				text: "Animated",
				animation: {
					preset: "typewriter",
					duration: 2
				}
			};

			await engine.initialize(config);

			expect(mockCanvas.scale).toHaveBeenCalled();
		});
	});

	describe("Text Rendering", () => {
		beforeEach(async () => {
			await engine.initialize({
				text: "Render Test",
				width: 800,
				height: 600
			});
		});

		it("should render single line text", async () => {
			const result = await engine.render("Single Line");

			expect(result.type).toBe("image");
			expect(result.metadata.width).toBe(800);
			expect(result.metadata.height).toBe(600);
		});

		it("should render multi-line text with word wrapping", async () => {
			const longText = "This is a very long text that should wrap to multiple lines when rendered in the canvas";
			const result = await engine.render(longText);

			expect(result.type).toBe("image");
			expect(mockCanvas.drawText).toHaveBeenCalled();
		});

		it("should handle text with explicit line breaks", async () => {
			const multiLineText = "Line 1\nLine 2\nLine 3";
			const result = await engine.render(multiLineText);

			expect(result.type).toBe("image");
			expect(mockCanvas.drawText).toHaveBeenCalled();
		});
	});

	describe("Text Transformations", () => {
		const transformTests = [
			{ transform: "uppercase", input: "hello world", expected: "HELLO WORLD" },
			{ transform: "lowercase", input: "HELLO WORLD", expected: "hello world" },
			{ transform: "capitalize", input: "hello world", expected: "Hello World" }
		];

		transformTests.forEach(({ transform, input, expected }) => {
			it(`should apply ${transform} transformation`, async () => {
				await engine.initialize({
					text: input,
					textTransform: transform as any
				});

				const result = await engine.render();
				expect(result.type).toBe("image");
			});
		});
	});
});

describe("TextStyleManager", () => {
	let styleManager: TextStyleManager;
	let config: CanvasConfig;

	beforeEach(() => {
		config = {
			text: "Style Test",
			width: 800,
			height: 600,
			fontSize: 48,
			fontFamily: "Roboto",
			fontWeight: "400",
			fontStyle: "normal",
			color: "#ffffff",
			opacity: 1,
			backgroundColor: "transparent",
			borderRadius: 0,
			textAlign: "center",
			textBaseline: "middle",
			letterSpacing: 0,
			lineHeight: 1.2,
			textTransform: "none",
			textDecoration: "none",
			duration: 1,
			fps: 30,
			pixelRatio: 2
		};

		styleManager = new TextStyleManager(mockCanvasKit as any, config);
	});

	describe("Style Application", () => {
		it("should apply basic text styles", () => {
			const paint = new mockCanvasKit.Paint();
			styleManager.applyTextStyles(paint as any);

			expect(paint.setColor).toHaveBeenCalled();
			expect(paint.setAntiAlias).toHaveBeenCalled();
		});

		it("should apply gradient styles with bounds", () => {
			config.gradient = {
				type: "linear",
				stops: [
					{ offset: 0, color: "#ff0000" },
					{ offset: 1, color: "#00ff00" }
				],
				angle: 45
			};

			const paint = new mockCanvasKit.Paint();
			const bounds = { x: 0, y: 0, width: 100, height: 100 };
			styleManager.applyTextStyles(paint as any, bounds);

			expect(paint.setShader).toHaveBeenCalled();
		});

		it("should apply opacity", () => {
			config.opacity = 0.5;
			styleManager = new TextStyleManager(mockCanvasKit as any, config);

			const paint = new mockCanvasKit.Paint();
			styleManager.applyTextStyles(paint as any);

			expect(paint.setAlphaf).toHaveBeenCalledWith(0.5);
		});
	});

	describe("Text Effects", () => {
		it("should render text with shadow", () => {
			config.shadow = {
				offsetX: 5,
				offsetY: 5,
				blur: 10,
				color: "#000000",
				opacity: 0.5
			};

			const canvas = mockCanvas;
			const font = new mockCanvasKit.Font();

			styleManager.renderTextShadow(canvas as any, "Shadow Text", 100, 100, font as any, vi.fn());

			expect(mockCanvasKit.MaskFilter.MakeBlur).toHaveBeenCalled();
		});

		it("should render text with stroke", () => {
			config.stroke = {
				width: 2,
				color: "#000000",
				opacity: 1
			};

			const canvas = mockCanvas;
			const font = new mockCanvasKit.Font();

			styleManager.renderTextStroke(canvas as any, "Stroke Text", 100, 100, font as any, vi.fn());

			expect(mockCanvasKit.Paint).toHaveBeenCalled();
		});

		it("should render text with letter spacing", () => {
			config.letterSpacing = 2;
			styleManager = new TextStyleManager(mockCanvasKit as any, config);

			const canvas = mockCanvas;
			const paint = new mockCanvasKit.Paint();
			const font = new mockCanvasKit.Font();

			styleManager.renderTextWithLetterSpacing(canvas as any, "Spaced", 0, 0, paint as any, font as any);

			expect(canvas.drawText).toHaveBeenCalled();
		});
	});

	describe("Text Transformations", () => {
		it("should transform text to uppercase", () => {
			config.textTransform = "uppercase";
			styleManager = new TextStyleManager(mockCanvasKit as any, config);

			const result = styleManager.applyTextTransform("hello");
			expect(result).toBe("HELLO");
		});

		it("should transform text to lowercase", () => {
			config.textTransform = "lowercase";
			styleManager = new TextStyleManager(mockCanvasKit as any, config);

			const result = styleManager.applyTextTransform("HELLO");
			expect(result).toBe("hello");
		});

		it("should capitalize text", () => {
			config.textTransform = "capitalize";
			styleManager = new TextStyleManager(mockCanvasKit as any, config);

			const result = styleManager.applyTextTransform("hello world");
			expect(result).toBe("Hello World");
		});
	});
});

describe("GradientBuilder", () => {
	let gradientBuilder: GradientBuilder;

	beforeEach(() => {
		gradientBuilder = new GradientBuilder(mockCanvasKit as any);
	});

	it("should create linear gradient", () => {
		const config: GradientConfig = {
			type: "linear",
			stops: [
				{ offset: 0, color: "#ff0000" },
				{ offset: 0.5, color: "#00ff00" },
				{ offset: 1, color: "#0000ff" }
			],
			angle: 90
		};

		const gradient = gradientBuilder.createGradient(config, 200, 100);

		expect(mockCanvasKit.Shader.MakeLinearGradient).toHaveBeenCalled();
	});

	it("should create radial gradient", () => {
		const config: GradientConfig = {
			type: "radial",
			stops: [
				{ offset: 0, color: "#ffffff" },
				{ offset: 1, color: "#000000" }
			]
		};

		const gradient = gradientBuilder.createGradient(config, 100, 100);

		expect(mockCanvasKit.Shader.MakeRadialGradient).toHaveBeenCalled();
	});

	it("should handle various color formats", () => {
		const config: GradientConfig = {
			type: "linear",
			stops: [
				{ offset: 0, color: "#ff0000" },
				{ offset: 0.33, color: "#00ff0080" },
				{ offset: 0.66, color: "rgba(0,255,0,0.5)" },
				{ offset: 1, color: "rgb(0,0,255)" }
			]
		};

		const gradient = gradientBuilder.createGradient(config, 100, 100);

		expect(mockCanvasKit.Color4f).toHaveBeenCalledTimes(4);
	});

	it("should create gradient for bounds", () => {
		const config: GradientConfig = {
			type: "linear",
			stops: [
				{ offset: 0, color: "#ff0000" },
				{ offset: 1, color: "#0000ff" }
			],
			angle: 45
		};

		const bounds = { x: 10, y: 20, width: 100, height: 80 };
		const gradient = (gradientBuilder as any).createGradientForBounds(config, bounds);

		expect(mockCanvasKit.Shader.MakeLinearGradient).toHaveBeenCalled();
	});
});

describe("TextLayoutEngine", () => {
	let layoutEngine: TextLayoutEngine;
	let config: CanvasConfig;
	let mockFont: any;

	beforeEach(() => {
		config = {
			text: "Layout Test",
			width: 800,
			height: 600,
			fontSize: 24,
			fontFamily: "Arial",
			fontWeight: "400",
			fontStyle: "normal",
			color: "#000000",
			opacity: 1,
			backgroundColor: "transparent",
			borderRadius: 0,
			textAlign: "left",
			textBaseline: "top",
			letterSpacing: 0,
			lineHeight: 1.2,
			textTransform: "none",
			textDecoration: "none",
			duration: 1,
			fps: 30,
			pixelRatio: 1
		};

		mockFont = new mockCanvasKit.Font();
		layoutEngine = new TextLayoutEngine(mockCanvasKit as any, config);
	});

	describe("Text Measurement", () => {
		it("should measure text width correctly", () => {
			const width = layoutEngine.measureTextWithLetterSpacing("Test", mockFont);
			expect(width).toBeGreaterThan(0);
		});

		it("should calculate text width with letter spacing", () => {
			config.letterSpacing = 2;
			layoutEngine = new TextLayoutEngine(mockCanvasKit as any, config);

			const width = layoutEngine.measureTextWithLetterSpacing("Test", mockFont);
			expect(width).toBeGreaterThan(0);
		});
	});

	describe("Word Wrapping", () => {
		it("should wrap long text to fit width", () => {
			const longText = "This is a very long text that should definitely wrap to multiple lines";
			const lines = layoutEngine.wrapText(longText, 200, mockFont);

			expect(lines.length).toBeGreaterThan(1);
		});

		it("should not wrap short text", () => {
			const shortText = "Short";
			const lines = layoutEngine.wrapText(shortText, 1000, mockFont);

			expect(lines.length).toBe(1);
			expect(lines[0]).toBe("Short");
		});

		it("should handle empty text", () => {
			const lines = layoutEngine.wrapText("", 100, mockFont);
			expect(lines.length).toBe(1);
			expect(lines[0]).toBe("");
		});
	});

	describe("Multi-line Layout", () => {
		it("should calculate layout for left alignment", () => {
			config.textAlign = "left";
			layoutEngine = new TextLayoutEngine(mockCanvasKit as any, config);

			const lines = ["Line 1", "Line 2", "Line 3"];
			const layout = layoutEngine.calculateMultilineLayout(lines, mockFont, 800, 600);

			expect(layout.length).toBe(3);
			layout.forEach(line => {
				expect(line.x).toBe(0);
			});
		});

		it("should calculate layout for center alignment", () => {
			config.textAlign = "center";
			layoutEngine = new TextLayoutEngine(mockCanvasKit as any, config);

			const lines = ["Short", "A longer line", "Mid"];
			const layout = layoutEngine.calculateMultilineLayout(lines, mockFont, 800, 600);

			expect(layout.length).toBe(3);
		});

		it("should calculate layout for right alignment", () => {
			config.textAlign = "right";
			layoutEngine = new TextLayoutEngine(mockCanvasKit as any, config);

			const lines = ["Line 1", "Line 2"];
			const layout = layoutEngine.calculateMultilineLayout(lines, mockFont, 800, 600);

			expect(layout.length).toBe(2);
		});

		it("should handle vertical alignments", () => {
			const alignments = ["top", "middle", "bottom"] as const;
			const lines = ["Test Line"];

			alignments.forEach(alignment => {
				config.textBaseline = alignment;
				const engine = new TextLayoutEngine(mockCanvasKit as any, config);
				const layout = engine.calculateMultilineLayout(lines, mockFont, 800, 600);

				expect(layout[0].y).toBeDefined();
			});
		});
	});

	describe("Character and Word Layout", () => {
		it("should calculate character positions", () => {
			const text = "ABC";
			const charLayout = layoutEngine.calculateCharacterLayout(text, mockFont, 100, 100);

			expect(charLayout.length).toBe(3);
			expect(charLayout[0].char).toBe("A");
			expect(charLayout[1].char).toBe("B");
			expect(charLayout[2].char).toBe("C");

			expect(charLayout[1].x).toBeGreaterThan(charLayout[0].x);
			expect(charLayout[2].x).toBeGreaterThan(charLayout[1].x);
		});

		it("should calculate word positions", () => {
			const text = "Hello World Test";
			const lines = [text];
			const wordLayout = layoutEngine.calculateWordLayout(text, mockFont, lines);

			expect(wordLayout.length).toBe(3);
			expect(wordLayout[0].word).toBe("Hello");
			expect(wordLayout[1].word).toBe("World");
			expect(wordLayout[2].word).toBe("Test");
		});
	});
});

describe("Animation System", () => {
	let animationEngine: AnimationEngine;
	let config: CanvasConfig;

	beforeEach(() => {
		config = {
			text: "Animated Text",
			width: 800,
			height: 600,
			fontSize: 48,
			fontFamily: "Arial",
			fontWeight: "400",
			fontStyle: "normal",
			color: "#ffffff",
			opacity: 1,
			backgroundColor: "transparent",
			borderRadius: 0,
			textAlign: "center",
			textBaseline: "middle",
			letterSpacing: 0,
			lineHeight: 1.2,
			textTransform: "none",
			textDecoration: "none",
			duration: 2,
			fps: 30,
			pixelRatio: 1,
			animation: {
				preset: "typewriter",
				speed: 1,
				duration: 2
			}
		};

		animationEngine = new AnimationEngine(mockCanvasKit as any, config);
	});

	describe("Animation Generation", () => {
		const animationTypes = ["typewriter", "movingLetters", "fadeIn", "slideIn", "ascend", "shift"] as const;

		animationTypes.forEach(animationType => {
			it(`should generate ${animationType} animation frames`, async () => {
				const result = await animationEngine.generateAnimation("Test Text", animationType);

				expect(result.type).toBe("animation");
				expect(result.data).toBeInstanceOf(Array);
				expect(result.metadata.frameCount).toBeGreaterThan(0);
				expect(result.metadata.duration).toBe(2);
				expect(result.metadata.fps).toBe(30);
			});
		});

		it("should cache generated frames", async () => {
			const text = "Cached Animation";
			const type = "fadeIn" as const;

			const result1 = await animationEngine.generateAnimation(text, type);

			const result2 = await animationEngine.generateAnimation(text, type);

			expect(result1.data).toBe(result2.data);
		});

		it("should handle animation with custom speed", async () => {
			config.animation!.speed = 2;
			animationEngine = new AnimationEngine(mockCanvasKit as any, config);

			const result = await animationEngine.generateAnimation("Fast Animation", "typewriter");

			expect(result.type).toBe("animation");
			expect(result.metadata.frameCount).toBeGreaterThan(0);
		});

		it("should handle animation with direction parameter", async () => {
			const directions = ["left", "right", "up", "down"] as const;

			for (const direction of directions) {
				config.direction = direction;
				config.animation!.direction = direction;
				const engine = new AnimationEngine(mockCanvasKit as any, config);

				const result = await engine.generateAnimation("Directional", "slideIn");
				expect(result.type).toBe("animation");
			}
		});

		it("should handle character vs word animation style", async () => {
			const styles = ["character", "word"] as const;

			for (const style of styles) {
				config.animationStyle = style;
				config.animation!.style = style;
				const engine = new AnimationEngine(mockCanvasKit as any, config);

				const result = await engine.generateAnimation("Style Test", "shift");
				expect(result.type).toBe("animation");
			}
		});
	});

	describe("Frame Management", () => {
		it("should get frame at specific time", async () => {
			const result = await animationEngine.generateAnimation("Frame Test", "fadeIn");
			const frames = result.data as AnimationFrame[];

			const frame = animationEngine.getFrameAtTime(frames, 1.0);
			expect(frame).toBeDefined();
			expect(frame?.timestamp).toBeDefined();
		});

		it("should clear animation cache", () => {
			animationEngine.clearCache();
			const stats = animationEngine.getCacheStats();

			expect(stats.size).toBe(0);
		});

		it("should provide cache statistics", async () => {
			await animationEngine.generateAnimation("Stats Test", "typewriter");
			const stats = animationEngine.getCacheStats();

			expect(stats.size).toBeGreaterThan(0);
			expect(stats.maxSize).toBeDefined();
			expect(stats.hitRate).toBeDefined();
		});
	});

	describe("Animation Cleanup", () => {
		it("should cleanup resources properly", () => {
			animationEngine.cleanup();

			expect(async () => {
				await animationEngine.generateAnimation("After Cleanup", "fadeIn");
			}).not.toThrow();
		});
	});
});

describe("Edge Cases and Error Handling", () => {
	let engine: TextRenderEngine;

	beforeEach(() => {
		engine = new TextRenderEngine();
	});

	it("should handle empty text", async () => {
		await engine.initialize({ text: "", width: 800, height: 600 });
		const result = await engine.render();

		expect(result.type).toBe("image");
	});

	it("should handle very long text", async () => {
		const longText = "A".repeat(10000);
		await engine.initialize({ text: longText, width: 800, height: 600 });
		const result = await engine.render();

		expect(result.type).toBe("image");
	});

	it("should handle special characters", async () => {
		const specialText = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
		await engine.initialize({ text: specialText, width: 800, height: 600 });
		const result = await engine.render();

		expect(result.type).toBe("image");
	});

	it("should handle unicode and emoji", async () => {
		const unicodeText = "你好世界 🌍 مرحبا بالعالم";
		await engine.initialize({ text: unicodeText, width: 800, height: 600 });
		const result = await engine.render();

		expect(result.type).toBe("image");
	});

	it("should handle extreme dimensions", async () => {
		const configs = [
			{ width: 1, height: 1 },
			{ width: 10000, height: 10000 },
			{ width: 1920, height: 1 }
		];

		for (const config of configs) {
			await engine.initialize({ text: "Test", ...config });
			const result = await engine.render();
			expect(result.type).toBe("image");
		}
	});

	it("should handle extreme font sizes", async () => {
		const sizes = [1, 512, 1000];

		for (const size of sizes) {
			await engine.initialize({
				text: "Size Test",
				fontSize: size,
				width: 800,
				height: 600
			});
			const result = await engine.render();
			expect(result.type).toBe("image");
		}
	});

	it("should handle invalid gradient configurations gracefully", () => {
		const gradientBuilder = new GradientBuilder(mockCanvasKit as any);

		const config: Partial<GradientConfig> = {
			type: "linear",
			stops: []
		};

		expect(() => {
			gradientBuilder.createGradient(config as GradientConfig, 100, 100);
		}).not.toThrow();

		const singleStop: GradientConfig = {
			type: "linear",
			stops: [{ offset: 0.5, color: "#ff0000" }]
		};

		expect(() => {
			gradientBuilder.createGradient(singleStop, 100, 100);
		}).not.toThrow();
	});
});

it("should handle rendering without initialization gracefully", async () => {
	const newEngine = new TextRenderEngine();

	await expect(newEngine.render("Test")).rejects.toThrow("Engine not initialized");
});

describe("Performance and Memory", () => {
	it("should handle multiple consecutive renders", async () => {
		const engine = new TextRenderEngine();
		await engine.initialize({ text: "Performance Test", width: 800, height: 600 });

		const renderCount = 100;
		const results: RenderResult[] = [];

		for (let i = 0; i < renderCount; i++) {
			const result = await engine.render(`Test ${i}`);
			results.push(result);
		}

		expect(results.length).toBe(renderCount);
		expect(results.every(r => r.type === "image")).toBe(true);
	});

	it("should cleanup resources properly", async () => {
		const engine = new TextRenderEngine();
		await engine.initialize({ text: "Cleanup Test", width: 800, height: 600 });

		await engine.render();
		engine.cleanup();

		expect(mockSurface.delete).toHaveBeenCalled();
	});

	it("should handle pixel ratio correctly", async () => {
		const pixelRatios = [1, 2, 3];

		for (const ratio of pixelRatios) {
			const engine = new TextRenderEngine();
			await engine.initialize({
				text: "Pixel Ratio Test",
				width: 800,
				height: 600,
				pixelRatio: ratio
			});

			const result = await engine.render();
			expect(result.metadata.width).toBe(800);
			expect(result.metadata.height).toBe(600);
		}
	});
});

describe("Integration Tests", () => {
	it("should render text with all effects combined", async () => {
		const engine = new TextRenderEngine();

		const complexConfig: Partial<CanvasConfig> = {
			text: "Complex Styled Text",
			width: 1920,
			height: 1080,
			fontSize: 72,
			fontFamily: "Impact",
			fontWeight: "bold",
			fontStyle: "italic",
			color: "#ff0000",
			opacity: 0.9,
			backgroundColor: "#0000ff",
			borderRadius: 20,
			textAlign: "center",
			textBaseline: "middle",
			letterSpacing: 2,
			lineHeight: 1.5,
			textTransform: "uppercase",
			textDecoration: "underline",
			gradient: {
				type: "radial",
				stops: [
					{ offset: 0, color: "#ffffff" },
					{ offset: 0.5, color: "#ff0000" },
					{ offset: 1, color: "#000000" }
				]
			},
			shadow: {
				offsetX: 10,
				offsetY: 10,
				blur: 20,
				color: "#000000",
				opacity: 0.8
			},
			stroke: {
				width: 4,
				color: "#00ff00",
				opacity: 1
			}
		};

		await engine.initialize(complexConfig);
		const result = await engine.render();

		expect(result.type).toBe("image");
		expect(result.metadata.width).toBe(1920);
		expect(result.metadata.height).toBe(1080);
	});

	it("should generate smooth animation with all parameters", async () => {
		const config: CanvasConfig = {
			text: "Full Animation Test",
			width: 1280,
			height: 720,
			fontSize: 60,
			fontFamily: "Arial",
			fontWeight: "bold",
			fontStyle: "normal",
			color: "#ffffff",
			opacity: 1,
			backgroundColor: "#000000",
			borderRadius: 10,
			textAlign: "center",
			textBaseline: "middle",
			letterSpacing: 1,
			lineHeight: 1.3,
			textTransform: "none",
			textDecoration: "none",
			duration: 3,
			fps: 60,
			pixelRatio: 2,
			animation: {
				preset: "movingLetters",
				speed: 1.5,
				duration: 3,
				style: "character",
				direction: "left"
			},
			gradient: {
				type: "linear",
				angle: 45,
				stops: [
					{ offset: 0, color: "#ff0000" },
					{ offset: 1, color: "#00ff00" }
				]
			},
			shadow: {
				offsetX: 5,
				offsetY: 5,
				blur: 10,
				color: "#333333",
				opacity: 0.7
			}
		};

		const engine = new AnimationEngine(mockCanvasKit as any, config);
		const result = await engine.generateAnimation("Animated Text with All Effects", "movingLetters");

		expect(result.type).toBe("animation");
		expect(result.metadata.frameCount).toBe(Math.ceil(3 * 60));
		expect(result.metadata.duration).toBe(3);
		expect(result.metadata.fps).toBe(60);

		const frames = result.data as AnimationFrame[];
		expect(frames[0].frameNumber).toBe(0);
		expect(frames[frames.length - 1].frameNumber).toBe(frames.length - 1);
	});
});
