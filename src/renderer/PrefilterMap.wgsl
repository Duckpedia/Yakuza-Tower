struct FragmentOutput {
    @location(0) px : vec4f,
    @location(1) nx : vec4f,
    @location(2) py : vec4f,
    @location(3) ny : vec4f,
    @location(4) pz : vec4f,
    @location(5) nz : vec4f,
}

struct Config {
    roughness: f32
}

@group(0) @binding(0) var texture: texture_cube<f32>;
@group(0) @binding(1) var texture_sampler: sampler;

@group(1) @binding(0) var<uniform> config: Config;

// https://github.com/tchayen/pbr-webgpu/
fn getPrefilter(normal: vec3f) -> vec4f {
    let r = normal;
    let view = r;

    let SAMPLE_COUNT = 4096u;
    var prefilteredColor = vec3f(0.0, 0.0, 0.0);
    var totalWeight = 0.0;

    for (var i = 0u; i < SAMPLE_COUNT; i += 1u) 
    {
        // Generates a sample vector that's biased towards the preferred alignment
        // direction (importance sampling).
        let xi = hammersley(i, SAMPLE_COUNT);
        let half = importanceSampleGGX(xi, normal, config.roughness);
        let light = normalize(2.0 * dot(view, half) * half - view);

        let normalDotLight = dot(normal, light);

        if (normalDotLight < 0.0) 
        {
            continue;
        }

        // sample from the environment's mip level based on roughness/pdf
        let d = distributionGGX(normal, half, config.roughness);
        let normalDotHalf = positiveDot(normal, half);
        let halfDotView = positiveDot(half, view);
        let pdf = d * normalDotHalf / (4.0 * halfDotView) + 0.0001;

        var resolution = f32(textureDimensions(texture).x);
        let saTexel = 4.0 * PI / (6.0 * resolution * resolution);
        let saSample = 1.0 / (f32(SAMPLE_COUNT) * pdf + 0.0001);

        let mipLevel = select(0.5 * log2(saSample / saTexel), 0.0, config.roughness == 0.0);

        prefilteredColor += textureSampleLevel(texture, texture_sampler, light, mipLevel).rgb * normalDotLight;
        totalWeight += normalDotLight;
    }

    prefilteredColor = prefilteredColor / totalWeight;
    return vec4f(prefilteredColor, 1.0);
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    let uv = input.uv * 2.0 - 1.0;
    output.px = getPrefilter(normalize(vec3f(1, -uv.y, -uv.x)));
    output.nx = getPrefilter(normalize(vec3f(-1, -uv.y, uv.x)));
    output.py = getPrefilter(normalize(vec3f(uv.x, 1, uv.y)));
    output.ny = getPrefilter(normalize(vec3f(uv.x, -1, -uv.y)));
    output.pz = getPrefilter(normalize(vec3f(uv.x, -uv.y, 1)));
    output.nz = getPrefilter(normalize(vec3f(-uv.x, -uv.y, -1)));
    return output;
}