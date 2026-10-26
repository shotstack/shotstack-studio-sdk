import { isKeyframedValue } from "@core/shared/clip-utils";

const tween = [{ from: 0, to: 1, start: 0, length: 1, interpolation: "linear" as const }];

describe("isKeyframedValue", () => {
	it("accepts plain numbers as editable, including zero", () => {
		expect(isKeyframedValue(0)).toBe(false);
		expect(isKeyframedValue(0.5)).toBe(false);
		expect(isKeyframedValue(undefined)).toBe(false);
	});

	it("rejects keyframes and unresolved merge placeholders", () => {
		expect(isKeyframedValue(tween)).toBe(true);
		expect(isKeyframedValue("{{ MEDIA_OPACITY }}")).toBe(true);
	});
});
