/**
 * FitSystem Unit Tests
 *
 * Tests for fit mode calculations: scale factors, container scaling, sprite scaling.
 * These are regression tests to ensure refactoring doesn't break fit/scale behavior.
 */

import { calculateFitScale, calculateContainerScale, calculateSpriteTransform, FIT_MODES, type FitMode } from "@core/layout/fit-system";

describe("FitSystem", () => {
	// ─── Constants Tests ──────────────────────────────────────────────────────

	describe("constants", () => {
		it("exports all fit modes", () => {
			expect(FIT_MODES).toContain("crop");
			expect(FIT_MODES).toContain("cover");
			expect(FIT_MODES).toContain("contain");
			expect(FIT_MODES).toContain("none");
		});
	});

	// ─── calculateFitScale Tests ──────────────────────────────────────────────

	describe("calculateFitScale", () => {
		const contentSize = { width: 1920, height: 1080 };
		const targetSize = { width: 1280, height: 720 };

		describe("crop mode", () => {
			it("returns max ratio to fill target (uniform scale)", () => {
				const scale = calculateFitScale(contentSize, targetSize, "crop");

				// Both ratios are 1280/1920 = 0.667 and 720/1080 = 0.667
				// For this case they're equal, so max = 0.667
				expect(scale).toBeCloseTo(0.667, 2);
			});

			it("uses max ratio when aspect ratios differ", () => {
				const wideContent = { width: 1920, height: 800 };
				const scale = calculateFitScale(wideContent, targetSize, "crop");

				// ratioX = 1280/1920 = 0.667, ratioY = 720/800 = 0.9
				// max = 0.9 (fill vertically, crop horizontally)
				expect(scale).toBeCloseTo(0.9, 2);
			});
		});

		describe("cover mode (same as crop for uniform scale)", () => {
			it("returns max ratio like crop", () => {
				const scale = calculateFitScale(contentSize, targetSize, "cover");

				expect(scale).toBeCloseTo(0.667, 2);
			});
		});

		describe("contain mode", () => {
			it("returns min ratio to fit within target (uniform scale)", () => {
				const scale = calculateFitScale(contentSize, targetSize, "contain");

				expect(scale).toBeCloseTo(0.667, 2);
			});

			it("uses min ratio when aspect ratios differ", () => {
				const wideContent = { width: 1920, height: 800 };
				const scale = calculateFitScale(wideContent, targetSize, "contain");

				// ratioX = 1280/1920 = 0.667, ratioY = 720/800 = 0.9
				// min = 0.667 (fit horizontally, letterbox vertically)
				expect(scale).toBeCloseTo(0.667, 2);
			});

			it("letterboxes tall content", () => {
				const tallContent = { width: 800, height: 1200 };
				const scale = calculateFitScale(tallContent, targetSize, "contain");

				// ratioX = 1280/800 = 1.6, ratioY = 720/1200 = 0.6
				// min = 0.6 (fit vertically, pillarbox horizontally)
				expect(scale).toBeCloseTo(0.6, 2);
			});
		});

		describe("none mode", () => {
			it("returns 1 (no scaling)", () => {
				const scale = calculateFitScale(contentSize, targetSize, "none");

				expect(scale).toBe(1);
			});

			it("returns 1 regardless of sizes", () => {
				const tinyContent = { width: 100, height: 100 };
				const scale = calculateFitScale(tinyContent, targetSize, "none");

				expect(scale).toBe(1);
			});
		});

		describe("edge cases", () => {
			it("handles zero content width gracefully", () => {
				const zeroWidth = { width: 0, height: 1080 };
				const scale = calculateFitScale(zeroWidth, targetSize, "crop");

				expect(scale).toBe(Infinity);
			});

			it("handles zero content height gracefully", () => {
				const zeroHeight = { width: 1920, height: 0 };
				const scale = calculateFitScale(zeroHeight, targetSize, "crop");

				expect(scale).toBe(Infinity);
			});

			it("defaults to crop when fit is undefined", () => {
				const scale = calculateFitScale(contentSize, targetSize, undefined as unknown as FitMode);

				// Should behave like crop
				expect(scale).toBeCloseTo(0.667, 2);
			});
		});
	});

	// ─── calculateContainerScale Tests ────────────────────────────────────────

	describe("calculateContainerScale", () => {
		const contentSize = { width: 1920, height: 1080 };
		const targetSize = { width: 1280, height: 720 };

		describe("with explicit dimensions (hasFixedDimensions = true)", () => {
			it("returns base scale only (fit handled elsewhere)", () => {
				const scale = calculateContainerScale(contentSize, targetSize, "crop", 1, true);

				expect(scale).toEqual({ x: 1, y: 1 });
			});

			it("applies base scale when provided", () => {
				const scale = calculateContainerScale(contentSize, targetSize, "crop", 1.5, true);

				expect(scale).toEqual({ x: 1.5, y: 1.5 });
			});
		});

		describe("without explicit dimensions", () => {
			describe("contain mode", () => {
				it("returns uniform min scale", () => {
					const scale = calculateContainerScale(contentSize, targetSize, "contain", 1, false);

					// min(1280/1920, 720/1080) = min(0.667, 0.667) = 0.667
					expect(scale.x).toBeCloseTo(0.667, 2);
					expect(scale.y).toBeCloseTo(0.667, 2);
					expect(scale.x).toBe(scale.y); // Uniform
				});

				it("applies base scale multiplier", () => {
					const scale = calculateContainerScale(contentSize, targetSize, "contain", 2, false);

					expect(scale.x).toBeCloseTo(1.333, 2);
					expect(scale.y).toBeCloseTo(1.333, 2);
				});
			});

			describe("crop mode", () => {
				it("returns uniform max scale", () => {
					const wideContent = { width: 1920, height: 800 };
					const scale = calculateContainerScale(wideContent, targetSize, "crop", 1, false);

					// max(1280/1920, 720/800) = max(0.667, 0.9) = 0.9
					expect(scale.x).toBeCloseTo(0.9, 2);
					expect(scale.y).toBeCloseTo(0.9, 2);
					expect(scale.x).toBe(scale.y); // Uniform
				});
			});

			describe("cover mode", () => {
				it("returns non-uniform stretch scale", () => {
					const scale = calculateContainerScale(contentSize, targetSize, "cover", 1, false);

					// ratioX = 1280/1920 = 0.667, ratioY = 720/1080 = 0.667
					expect(scale.x).toBeCloseTo(0.667, 2);
					expect(scale.y).toBeCloseTo(0.667, 2);
				});

				it("stretches non-uniformly when aspect ratios differ", () => {
					const wideContent = { width: 1920, height: 800 };
					const scale = calculateContainerScale(wideContent, targetSize, "cover", 1, false);

					// ratioX = 1280/1920 = 0.667, ratioY = 720/800 = 0.9
					// cover returns non-uniform: { x: 0.667, y: 0.9 }
					expect(scale.x).toBeCloseTo(0.667, 2);
					expect(scale.y).toBeCloseTo(0.9, 2);
					expect(scale.x).not.toBe(scale.y); // Non-uniform!
				});
			});

			describe("none mode", () => {
				it("returns base scale only", () => {
					const scale = calculateContainerScale(contentSize, targetSize, "none", 1, false);

					expect(scale).toEqual({ x: 1, y: 1 });
				});

				it("applies base scale", () => {
					const scale = calculateContainerScale(contentSize, targetSize, "none", 0.5, false);

					expect(scale).toEqual({ x: 0.5, y: 0.5 });
				});
			});
		});

		describe("edge cases", () => {
			it("returns base scale for zero-size content", () => {
				const zeroSize = { width: 0, height: 0 };
				const scale = calculateContainerScale(zeroSize, targetSize, "crop", 1.5, false);

				expect(scale).toEqual({ x: 1.5, y: 1.5 });
			});

			it("returns base scale for zero-width content", () => {
				const zeroWidth = { width: 0, height: 1080 };
				const scale = calculateContainerScale(zeroWidth, targetSize, "crop", 2, false);

				expect(scale).toEqual({ x: 2, y: 2 });
			});
		});
	});

	// ─── calculateSpriteTransform Tests ───────────────────────────────────────

	describe("calculateSpriteTransform", () => {
		const nativeSize = { width: 1920, height: 1080 };
		const targetSize = { width: 640, height: 480 };

		describe("cover mode", () => {
			it("returns non-uniform scale to exactly fill", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "cover");

				// scaleX = 640/1920 = 0.333, scaleY = 480/1080 = 0.444
				expect(transform.scaleX).toBeCloseTo(0.333, 2);
				expect(transform.scaleY).toBeCloseTo(0.444, 2);
			});

			it("centers sprite in target", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "cover");

				expect(transform.positionX).toBe(320); // 640/2
				expect(transform.positionY).toBe(240); // 480/2
			});
		});

		describe("crop mode", () => {
			it("returns uniform max scale", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "crop");

				// max(640/1920, 480/1080) = max(0.333, 0.444) = 0.444
				expect(transform.scaleX).toBeCloseTo(0.444, 2);
				expect(transform.scaleY).toBeCloseTo(0.444, 2);
				expect(transform.scaleX).toBe(transform.scaleY);
			});

			it("centers sprite in target", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "crop");

				expect(transform.positionX).toBe(320);
				expect(transform.positionY).toBe(240);
			});
		});

		describe("contain mode", () => {
			it("returns uniform min scale", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "contain");

				// min(640/1920, 480/1080) = min(0.333, 0.444) = 0.333
				expect(transform.scaleX).toBeCloseTo(0.333, 2);
				expect(transform.scaleY).toBeCloseTo(0.333, 2);
				expect(transform.scaleX).toBe(transform.scaleY);
			});

			it("centers sprite (letterboxes/pillarboxes as needed)", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "contain");

				expect(transform.positionX).toBe(320);
				expect(transform.positionY).toBe(240);
			});
		});

		describe("none mode", () => {
			it("returns scale of 1 (native size)", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "none");

				expect(transform.scaleX).toBe(1);
				expect(transform.scaleY).toBe(1);
			});

			it("centers sprite at native size", () => {
				const transform = calculateSpriteTransform(nativeSize, targetSize, "none");

				expect(transform.positionX).toBe(320);
				expect(transform.positionY).toBe(240);
			});
		});
	});

	// ─── Real-World Scenarios ─────────────────────────────────────────────────

	describe("real-world scenarios", () => {
		it("HD video in 4K canvas with crop", () => {
			const hdVideo = { width: 1920, height: 1080 };
			const canvas4K = { width: 3840, height: 2160 };

			const scale = calculateFitScale(hdVideo, canvas4K, "crop");

			// 3840/1920 = 2, 2160/1080 = 2, max = 2
			expect(scale).toBe(2);
		});

		it("square image in wide canvas with contain", () => {
			const square = { width: 1000, height: 1000 };
			const wide = { width: 1920, height: 1080 };

			const scale = calculateFitScale(square, wide, "contain");

			// 1920/1000 = 1.92, 1080/1000 = 1.08, min = 1.08
			expect(scale).toBeCloseTo(1.08, 2);
		});

		it("portrait image in landscape canvas with crop", () => {
			const portrait = { width: 1080, height: 1920 };
			const landscape = { width: 1920, height: 1080 };

			const scale = calculateFitScale(portrait, landscape, "crop");

			// 1920/1080 = 1.78, 1080/1920 = 0.56, max = 1.78
			expect(scale).toBeCloseTo(1.78, 2);
		});

		it("thumbnail generation with cover (distort to exact size)", () => {
			const photo = { width: 4000, height: 3000 };
			const thumbnail = { width: 200, height: 200 };

			const transform = calculateSpriteTransform(photo, thumbnail, "cover");

			// Distorts to exact 200x200
			expect(transform.scaleX).toBeCloseTo(0.05, 3); // 200/4000
			expect(transform.scaleY).toBeCloseTo(0.067, 2); // 200/3000
		});
	});

	// ─── Consistency Tests ────────────────────────────────────────────────────

	describe("consistency", () => {
		it("crop and contain produce same result for matching aspect ratios", () => {
			const content = { width: 1920, height: 1080 };
			const target = { width: 960, height: 540 }; // Same 16:9 aspect ratio

			const cropScale = calculateFitScale(content, target, "crop");
			const containScale = calculateFitScale(content, target, "contain");

			expect(cropScale).toBe(containScale);
		});

		it("cover produces uniform scale for matching aspect ratios", () => {
			const content = { width: 1920, height: 1080 };
			const target = { width: 960, height: 540 };

			const scale = calculateContainerScale(content, target, "cover", 1, false);

			expect(scale.x).toBe(scale.y);
		});
	});
});
