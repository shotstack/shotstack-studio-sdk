import { clamp01, type Rgb, UniformFilter } from "./uniform-filter";

/** The hue shader's maths on one unpremultiplied pixel. */
export function huePixel([r, g, b]: Rgb, degrees: number): number[] {
	const angle = (degrees * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const m = [cos + (1 - cos) / 3, (1 - cos) / 3 - Math.sqrt(1 / 3) * sin, (1 - cos) / 3 + Math.sqrt(1 / 3) * sin];
	return [r * m[0] + g * m[1] + b * m[2], r * m[2] + g * m[0] + b * m[1], r * m[1] + g * m[2] + b * m[0]].map(clamp01);
}

// Rotation about the grey axis, on unpremultiplied colour as the render turns it.
const HUE_GL = `
    vec4 color = texture(uTexture, vTextureCoord);
    if (color.a == 0.0) {
        finalColor = color;
        return;
    }
    float angle = radians(uDegrees);
    float c = cos(angle);
    float s = sin(angle) * sqrt(1.0 / 3.0);
    vec3 m = vec3(c + (1.0 - c) / 3.0, (1.0 - c) / 3.0 - s, (1.0 - c) / 3.0 + s);
    vec3 rgb = color.rgb / color.a;
    rgb = clamp(vec3(dot(rgb, m), dot(rgb, m.zxy), dot(rgb, m.yzx)), 0.0, 1.0);
    finalColor = vec4(rgb * color.a, color.a);
`;

const HUE_WGSL = `
    let color = textureSample(uTexture, uSampler, uv);
    if (color.a == 0.0) {
        return color;
    }
    let angle = radians(u.uDegrees);
    let c = cos(angle);
    let s = sin(angle) * sqrt(1.0 / 3.0);
    let m = vec3<f32>(c + (1.0 - c) / 3.0, (1.0 - c) / 3.0 - s, (1.0 - c) / 3.0 + s);
    let rgb = color.rgb / color.a;
    let turned = saturate(vec3<f32>(dot(rgb, m), dot(rgb, m.zxy), dot(rgb, m.yzx)));
    return vec4<f32>(turned * color.a, color.a);
`;

export class HueFilter extends UniformFilter<"uDegrees"> {
	constructor() {
		super("hue-filter", HUE_GL, HUE_WGSL, { uDegrees: 0 });
	}
}
