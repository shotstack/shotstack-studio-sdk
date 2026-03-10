import { relativeToAbsolute, absoluteToRelative } from "@core/layouts/position-builder";

describe("PositionBuilder", () => {
	describe("relativeToAbsolute", () => {
		it("centers entity with zero offset on 1920x1080", () => {
			const container = { width: 1920, height: 1080 };
			const entity = { width: 200, height: 100 };
			const result = relativeToAbsolute(container, entity, "center", { x: 0, y: 0 });

			expect(result.x).toBe(860); // (0.5 * 1920) - 100
			expect(result.y).toBe(490); // (0.5 * 1080) - 50
		});

		it("centers entity with zero offset on 1080x1920 (vertical)", () => {
			const container = { width: 1080, height: 1920 };
			const entity = { width: 200, height: 100 };
			const result = relativeToAbsolute(container, entity, "center", { x: 0, y: 0 });

			expect(result.x).toBe(440); // (0.5 * 1080) - 100
			expect(result.y).toBe(910); // (0.5 * 1920) - 50
		});

		it("positions at topLeft with zero offset", () => {
			const container = { width: 1920, height: 1080 };
			const entity = { width: 200, height: 100 };
			const result = relativeToAbsolute(container, entity, "topLeft", { x: 0, y: 0 });

			expect(result.x).toBeCloseTo(0);
			expect(result.y).toBeCloseTo(0);
		});

		it("positions at bottomRight with zero offset", () => {
			const container = { width: 1920, height: 1080 };
			const entity = { width: 200, height: 100 };
			const result = relativeToAbsolute(container, entity, "bottomRight", { x: 0, y: 0 });

			expect(result.x).toBe(1720); // 1920 - 200
			expect(result.y).toBe(980); // 1080 - 100
		});
	});

	describe("round-trip: relativeToAbsolute → absoluteToRelative", () => {
		const anchors = ["center", "topLeft", "topRight", "bottomLeft", "bottomRight", "left", "right", "top", "bottom"] as const;
		const containers = [
			{ width: 1920, height: 1080 },
			{ width: 1080, height: 1920 },
			{ width: 800, height: 600 }
		];

		const cases = anchors.flatMap(anchor =>
			containers.map(container => ({ anchor, container }))
		);

		it.each(cases)("round-trips for anchor=$anchor at $container.width×$container.height", ({ anchor, container }) => {
			const entity = { width: 300, height: 150 };
			const original = { x: 0.15, y: -0.25 };

			const absolute = relativeToAbsolute(container, entity, anchor, original);
			const roundTripped = absoluteToRelative(container, entity, anchor, absolute);

			expect(roundTripped.x).toBeCloseTo(original.x, 10);
			expect(roundTripped.y).toBeCloseTo(original.y, 10);
		});
	});

	describe("different container sizes produce different positions", () => {
		it("same relative offset yields different absolute positions for different resolutions", () => {
			const entity = { width: 200, height: 100 };
			const offset = { x: 0, y: 0 };

			const horizontal = relativeToAbsolute({ width: 1920, height: 1080 }, entity, "center", offset);
			const vertical = relativeToAbsolute({ width: 1080, height: 1920 }, entity, "center", offset);

			expect(horizontal.x).not.toBe(vertical.x);
			expect(horizontal.y).not.toBe(vertical.y);
		});
	});
});
