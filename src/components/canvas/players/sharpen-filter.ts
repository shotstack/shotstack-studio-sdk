import { UniformFilter } from "./uniform-filter";

const LUMA = "0.299, 0.587, 0.114";

/** The sharpen shader's maths on one unpremultiplied pixel and its blurred copy. */
export function sharpenPixel(rgb: readonly number[], blurred: readonly number[], amount: number): number[] {
	const detail = [0.299, 0.587, 0.114].reduce((sum, weight, index) => sum + weight * (rgb[index] - blurred[index]), 0);
	const lift = amount * detail * (1 - Math.abs(detail));
	return rgb.map(channel => Math.min(1, Math.max(0, channel + lift)));
}

// The render's unsharp mask on luma, with its halo limiter and no threshold. Its blur is three box passes of sigma
// `radius × frame height / 720`; this samples a Gaussian of that sigma on a 13 × 13 grid, a texel apart until the
// grid would cover less than ±3 sigma.
// ponytail: one 169-tap pass; split into horizontal and vertical passes if large sharpened clips drop frames.
const SHARPEN_GL = `
    vec4 color = texture(uTexture, vTextureCoord);
    vec2 sigma = max(uRadius * uFrameHeight / 720.0, 0.1) * uScale * uInputSize.zw;
    vec2 spacing = max(sigma * 0.5, uInputSize.zw);
    vec4 sum = vec4(0.0);
    float total = 0.0;
    for (int i = -6; i <= 6; i++) {
        for (int j = -6; j <= 6; j++) {
            vec2 offset = vec2(float(i), float(j)) * spacing;
            float weight = exp(-0.5 * dot(offset / sigma, offset / sigma));
            sum += texture(uTexture, clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw)) * weight;
            total += weight;
        }
    }
    vec4 blurred = sum / total;
    if (color.a == 0.0 || blurred.a == 0.0 || uRadius <= 0.0) {
        finalColor = color;
        return;
    }
    vec3 rgb = color.rgb / color.a;
    float detail = dot(rgb - blurred.rgb / blurred.a, vec3(${LUMA}));
    rgb = clamp(rgb + uAmount * detail * (1.0 - abs(detail)), 0.0, 1.0);
    finalColor = vec4(rgb * color.a, color.a);
`;

const SHARPEN_WGSL = `
    let color = textureSampleLevel(uTexture, uSampler, uv, 0.0);
    let sigma = max(u.uRadius * u.uFrameHeight / 720.0, 0.1) * u.uScale * gfu.uInputSize.zw;
    let spacing = max(sigma * 0.5, gfu.uInputSize.zw);
    var sum = vec4<f32>(0.0);
    var total = 0.0;
    for (var i = -6; i <= 6; i++) {
        for (var j = -6; j <= 6; j++) {
            let offset = vec2<f32>(f32(i), f32(j)) * spacing;
            let weight = exp(-0.5 * dot(offset / sigma, offset / sigma));
            sum += textureSampleLevel(uTexture, uSampler, clamp(uv + offset, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0) * weight;
            total += weight;
        }
    }
    let blurred = sum / total;
    if (color.a == 0.0 || blurred.a == 0.0 || u.uRadius <= 0.0) {
        return color;
    }
    let rgb = color.rgb / color.a;
    let detail = dot(rgb - blurred.rgb / blurred.a, vec3<f32>(${LUMA}));
    return vec4<f32>(saturate(rgb + u.uAmount * detail * (1.0 - abs(detail))) * color.a, color.a);
`;

export class SharpenFilter extends UniformFilter<"uAmount" | "uRadius" | "uFrameWidth" | "uFrameHeight" | "uScale"> {
	constructor() {
		super("sharpen-filter", SHARPEN_GL, SHARPEN_WGSL, { uAmount: 0, uRadius: 3, uFrameWidth: 0, uFrameHeight: 0, uScale: 1 });
		// The texture must hold the whole clip, so the frame starts at its origin wherever the clip sits on screen.
		this.clipToViewport = false;
	}
}
