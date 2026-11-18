import { UniformFilter } from "./uniform-filter";

/** Where a channel shifted by `shift` of the frame reads from, wrapping at the edge as the render does. */
export function rgbSplitSource(coord: number, shift: number): number {
	return (((coord - shift) % 1) + 1) % 1;
}

// Red moves by (uX, uY) of the frame with +y up, blue by the opposite; green and alpha stay. A shift wraps around the
// frame, so a whole frame shows no split.
const RGB_SPLIT_GL = `
    vec2 toFrame = uInputSize.xy / (vec2(uFrameWidth, uFrameHeight) * uScale);
    vec2 point = vTextureCoord * toFrame;
    vec2 shift = vec2(uX, -uY);
    vec4 color = texture(uTexture, vTextureCoord);
    vec4 red = texture(uTexture, fract(point - shift) / toFrame);
    vec4 blue = texture(uTexture, fract(point + shift) / toFrame);
    finalColor = vec4(red.r, color.g, blue.b, color.a);
`;

const RGB_SPLIT_WGSL = `
    let toFrame = gfu.uInputSize.xy / (vec2<f32>(u.uFrameWidth, u.uFrameHeight) * u.uScale);
    let point = uv * toFrame;
    let shift = vec2<f32>(u.uX, -u.uY);
    let color = textureSampleLevel(uTexture, uSampler, uv, 0.0);
    let red = textureSampleLevel(uTexture, uSampler, fract(point - shift) / toFrame, 0.0);
    let blue = textureSampleLevel(uTexture, uSampler, fract(point + shift) / toFrame, 0.0);
    return vec4<f32>(red.r, color.g, blue.b, color.a);
`;

export class RgbSplitFilter extends UniformFilter<"uX" | "uY" | "uFrameWidth" | "uFrameHeight" | "uScale"> {
	constructor() {
		super("rgb-split-filter", RGB_SPLIT_GL, RGB_SPLIT_WGSL, { uX: 0, uY: 0, uFrameWidth: 0, uFrameHeight: 0, uScale: 1 });
		// The texture must hold the whole clip, so the frame starts at its origin wherever the clip sits on screen.
		this.clipToViewport = false;
	}
}
