import { defaultFilterVert, Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";

/**
 * Reveals or hides a clip by sweeping a horizontal luminosity gradient across it.
 *
 * Per pixel: `alpha = clamp(0.5 + K · (0.5 − m − brightness), 0, 1)`, where `m` is the gradient
 * value (`1 − x` for a right-to-left wipe, `x` for left-to-right), `brightness` sweeps `+1`
 * (hidden) → `−1` (revealed), and `K` sets the edge softness.
 */

const CONTRAST_K = "1.1764706"; // edge softness factor

const glFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uBrightness;
uniform float uRevealFromRight;

void main(void)
{
    float m = (uRevealFromRight > 0.5) ? (1.0 - vTextureCoord.x) : vTextureCoord.x;
    float a = clamp(0.5 + ${CONTRAST_K} * (0.5 - m - uBrightness), 0.0, 1.0);
    finalColor = texture(uTexture, vTextureCoord) * a;
}
`;

const gpuSource = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct WipeUniforms {
  uBrightness:f32,
  uRevealFromRight:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> wipeUniforms : WipeUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>
};

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition : vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>, @builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    var m = select(uv.x, 1.0 - uv.x, wipeUniforms.uRevealFromRight > 0.5);
    var a = clamp(0.5 + ${CONTRAST_K} * (0.5 - m - wipeUniforms.uBrightness), 0.0, 1.0);
    return textureSample(uTexture, uSampler, uv) * a;
}
`;

export class WipeFilter extends Filter {
	private readonly uniformGroup: UniformGroup<{
		uBrightness: { value: number; type: "f32" };
		uRevealFromRight: { value: number; type: "f32" };
	}>;

	constructor() {
		const glProgram = GlProgram.from({ vertex: defaultFilterVert, fragment: glFragment, name: "wipe-filter" });
		const gpuProgram = GpuProgram.from({
			vertex: { source: gpuSource, entryPoint: "mainVertex" },
			fragment: { source: gpuSource, entryPoint: "mainFragment" }
		});
		const wipeUniforms = new UniformGroup({
			uBrightness: { value: 1, type: "f32" },
			uRevealFromRight: { value: 0, type: "f32" }
		});
		super({ glProgram, gpuProgram, resources: { wipeUniforms }, padding: 0 });
		this.uniformGroup = wipeUniforms;
	}

	/** Sweep position: `+1` fully hidden → `−1` fully revealed. */
	public set brightness(value: number) {
		this.uniformGroup.uniforms.uBrightness = value;
	}

	/** `true` reveals from the right edge inward (wipeLeft), `false` from the left (wipeRight). */
	public set revealFromRight(value: boolean) {
		this.uniformGroup.uniforms.uRevealFromRight = value ? 1 : 0;
	}
}
