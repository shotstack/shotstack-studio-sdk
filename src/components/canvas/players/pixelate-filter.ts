import { UniformFilter } from "./uniform-filter";

/** Blocks across a frame `width` render pixels wide, as the render counts them. */
export function pixelateBlocks(width: number, value: number): number {
	return Math.max(1, Math.floor(width * Math.min(0.001 ** Math.abs(value), 1)));
}

// The render shrinks the frame to `pixelateBlocks` pixels wide with smoothing and draws it back unsmoothed, so each
// block is its area's average; 4 × 4 samples stand in for that average. The frame is the clip's in render pixels and
// uScale is screen pixels per render pixel, so blocks hold still while the clip moves or the view zooms.
const PIXELATE_GL = `
    vec2 size = vec2(uFrameWidth, uFrameHeight);
    vec2 frame = size * uScale;
    float across = max(1.0, floor(size.x * min(pow(0.001, abs(uValue)), 1.0)));
    vec2 blocks = vec2(across, max(1.0, floor(size.y * across / size.x + 0.5)));
    vec2 cell = floor(vTextureCoord * uInputSize.xy / frame * blocks);
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4; j++) {
            vec2 point = (cell + (vec2(float(i), float(j)) + 0.5) / 4.0) / blocks;
            sum += texture(uTexture, clamp(point * frame * uInputSize.zw, uInputClamp.xy, uInputClamp.zw));
        }
    }
    finalColor = sum / 16.0;
`;

const PIXELATE_WGSL = `
    let size = vec2<f32>(u.uFrameWidth, u.uFrameHeight);
    let frame = size * u.uScale;
    let across = max(1.0, floor(size.x * min(pow(0.001, abs(u.uValue)), 1.0)));
    let blocks = vec2<f32>(across, max(1.0, floor(size.y * across / size.x + 0.5)));
    let cell = floor(uv * gfu.uInputSize.xy / frame * blocks);
    var sum = vec4<f32>(0.0);
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            let point = (cell + (vec2<f32>(f32(i), f32(j)) + 0.5) / 4.0) / blocks;
            sum += textureSampleLevel(uTexture, uSampler, clamp(point * frame * gfu.uInputSize.zw, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0);
        }
    }
    return sum / 16.0;
`;

export class PixelateFilter extends UniformFilter<"uValue" | "uFrameWidth" | "uFrameHeight" | "uScale"> {
	constructor() {
		super("pixelate-filter", PIXELATE_GL, PIXELATE_WGSL, { uValue: 0, uFrameWidth: 0, uFrameHeight: 0, uScale: 1 });
		// The texture must hold the whole clip, so the frame starts at its origin wherever the clip sits on screen.
		this.clipToViewport = false;
	}
}
