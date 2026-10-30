import type { ResolvedClip } from "@schemas";
import { defaultFilterVert, Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";

/**
 * Recolours a clip with the render's brightness, saturation and negate maths.
 *
 * Per unpremultiplied pixel: contrast `f · (c − mid) + mid`, then `+ brightness`, each clamped; then saturation
 * around the HSP brightness `√(.299r² + .587g² + .114b²)`; then inversion.
 */

interface ColorParams {
	/** −255…255 */
	contrast?: number;
	brightness?: number;
	saturation?: number;
	negate?: boolean;
}

export const COLOR_FILTERS: Partial<Record<NonNullable<ResolvedClip["filter"]>, ColorParams>> = {
	boost: { saturation: 1.75 },
	contrast: { contrast: 15 },
	darken: { brightness: -0.15 },
	greyscale: { saturation: 0 },
	lighten: { brightness: 0.15 },
	muted: { contrast: 85, brightness: -0.05, saturation: 0.6 },
	negative: { negate: true }
};

const MID = "0.5019608"; // 128 / 255
const HSP = "0.299, 0.587, 0.114";

const glFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uContrast;
uniform float uBrightness;
uniform float uSaturation;
uniform float uNegate;

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    if (color.a == 0.0) {
        finalColor = color;
        return;
    }
    vec3 rgb = clamp(uContrast * (color.rgb / color.a - ${MID}) + ${MID}, 0.0, 1.0);
    rgb = clamp(rgb + uBrightness, 0.0, 1.0);
    float p = sqrt(dot(rgb * rgb, vec3(${HSP})));
    rgb = clamp(p + (rgb - p) * uSaturation, 0.0, 1.0);
    rgb = mix(rgb, 1.0 - rgb, uNegate);
    finalColor = vec4(rgb * color.a, color.a);
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

struct ColorUniforms {
  uContrast:f32,
  uBrightness:f32,
  uSaturation:f32,
  uNegate:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;
@group(1) @binding(0) var<uniform> colorUniforms : ColorUniforms;

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
    let color = textureSample(uTexture, uSampler, uv);
    if (color.a == 0.0) {
        return color;
    }
    var rgb = saturate(colorUniforms.uContrast * (color.rgb / color.a - ${MID}) + ${MID});
    rgb = saturate(rgb + colorUniforms.uBrightness);
    let p = sqrt(dot(rgb * rgb, vec3<f32>(${HSP})));
    rgb = saturate(p + (rgb - p) * colorUniforms.uSaturation);
    rgb = select(rgb, 1.0 - rgb, colorUniforms.uNegate > 0.5);
    return vec4<f32>(rgb * color.a, color.a);
}
`;

export class ColorFilter extends Filter {
	constructor({ contrast = 0, brightness = 0, saturation = 1, negate = false }: ColorParams) {
		const glProgram = GlProgram.from({ vertex: defaultFilterVert, fragment: glFragment, name: "color-filter" });
		const gpuProgram = GpuProgram.from({
			vertex: { source: gpuSource, entryPoint: "mainVertex" },
			fragment: { source: gpuSource, entryPoint: "mainFragment" }
		});
		const colorUniforms = new UniformGroup({
			uContrast: { value: (259 * (contrast + 255)) / (255 * (259 - contrast)), type: "f32" },
			uBrightness: { value: brightness, type: "f32" },
			uSaturation: { value: saturation, type: "f32" },
			uNegate: { value: negate ? 1 : 0, type: "f32" }
		});
		super({ glProgram, gpuProgram, resources: { colorUniforms }, padding: 0 });
	}
}
