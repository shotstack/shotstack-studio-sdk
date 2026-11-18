import { clamp01, type Rgb, UniformFilter } from "./uniform-filter";

export interface Grade {
	exposure: number;
	temperature: number;
	tint: number;
	highlights: number;
	shadows: number;
	vibrance: number;
}

const LUMA = [0.299, 0.587, 0.114];

/** The grade shader's maths on one unpremultiplied pixel. */
export function gradePixel([r0, g0, b0]: Rgb, grade: Grade): number[] {
	const luma = (rgb: number[]) => rgb.reduce((sum, channel, index) => sum + channel * LUMA[index], 0);
	let rgb = [clamp01(r0 + grade.temperature * 0.125), clamp01(g0 - grade.tint * 0.1), clamp01(b0 - grade.temperature * 0.125)];
	rgb = [clamp01(rgb[0] + grade.tint * 0.05), rgb[1], clamp01(rgb[2] + grade.tint * 0.05)];
	rgb = rgb.map(channel => clamp01(channel * 2 ** grade.exposure));
	const y = luma(rgb);
	const lift = grade.shadows * (1 - y) ** 2 * 0.35 + grade.highlights * y ** 2 * 0.35;
	rgb = rgb.map(channel => clamp01(channel + lift));
	const grey = luma(rgb);
	const factor = Math.max(0, 1 + grade.vibrance * (1 - (Math.max(...rgb) - Math.min(...rgb))));
	return rgb.map(channel => clamp01(grey + (channel - grey) * factor));
}

// Temperature and tint, exposure, shadows and highlights, then vibrance, each clamped as the render clamps it.
const GRADE_GL = `
    vec4 color = texture(uTexture, vTextureCoord);
    if (color.a == 0.0) {
        finalColor = color;
        return;
    }
    vec3 rgb = color.rgb / color.a;
    rgb = clamp(rgb + vec3(uTemperature * 0.125, -uTint * 0.1, -uTemperature * 0.125), 0.0, 1.0);
    rgb = clamp(rgb + vec3(uTint * 0.05, 0.0, uTint * 0.05), 0.0, 1.0);
    rgb = clamp(rgb * exp2(uExposure), 0.0, 1.0);
    float y = dot(rgb, vec3(${LUMA.join(", ")}));
    rgb = clamp(rgb + uShadows * (1.0 - y) * (1.0 - y) * 0.35 + uHighlights * y * y * 0.35, 0.0, 1.0);
    y = dot(rgb, vec3(${LUMA.join(", ")}));
    float factor = max(0.0, 1.0 + uVibrance * (1.0 - (max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b)))));
    rgb = clamp(y + (rgb - y) * factor, 0.0, 1.0);
    finalColor = vec4(rgb * color.a, color.a);
`;

const GRADE_WGSL = `
    let color = textureSample(uTexture, uSampler, uv);
    if (color.a == 0.0) {
        return color;
    }
    var rgb = color.rgb / color.a;
    rgb = saturate(rgb + vec3<f32>(u.uTemperature * 0.125, -u.uTint * 0.1, -u.uTemperature * 0.125));
    rgb = saturate(rgb + vec3<f32>(u.uTint * 0.05, 0.0, u.uTint * 0.05));
    rgb = saturate(rgb * exp2(u.uExposure));
    var y = dot(rgb, vec3<f32>(${LUMA.join(", ")}));
    rgb = saturate(rgb + u.uShadows * (1.0 - y) * (1.0 - y) * 0.35 + u.uHighlights * y * y * 0.35);
    y = dot(rgb, vec3<f32>(${LUMA.join(", ")}));
    let factor = max(0.0, 1.0 + u.uVibrance * (1.0 - (max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b)))));
    rgb = saturate(y + (rgb - y) * factor);
    return vec4<f32>(rgb * color.a, color.a);
`;

export class GradeFilter extends UniformFilter<"uExposure" | "uTemperature" | "uTint" | "uHighlights" | "uShadows" | "uVibrance"> {
	constructor() {
		super("grade-filter", GRADE_GL, GRADE_WGSL, { uExposure: 0, uTemperature: 0, uTint: 0, uHighlights: 0, uShadows: 0, uVibrance: 0 });
	}
}
