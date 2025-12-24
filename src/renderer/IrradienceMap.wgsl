struct FragmentOutput {
    @location(0) px : vec4f,
    @location(1) nx : vec4f,
    @location(2) py : vec4f,
    @location(3) ny : vec4f,
    @location(4) pz : vec4f,
    @location(5) nz : vec4f,
}

@group(0) @binding(0) var texture: texture_cube<f32>;
@group(0) @binding(1) var texture_sampler: sampler;

// https://github.com/tchayen/pbr-webgpu/
fn getIrradiance(normal: vec3f) -> vec4f {
    let basis = makeBasis(normal);
    let right = basis[0];
    let up    = basis[1];

    var irradiance = vec3f(0.0);
    var nrSamples: f32 = 0.0;

    var phi: f32 = 0.0;

    var sampleDelta = 0.025;
    for(var phi: f32 = 0.0; phi < 2.0 * PI; phi += sampleDelta) {
        for(var theta : f32 = 0.0; theta < 0.5 * PI; theta += sampleDelta) {
            // spherical to cartesian (in tangent space)
            let sinT = sin(theta);
            let cosT = cos(theta);
            let tangentSample: vec3f = vec3f(sinT * cos(phi), sinT * sin(phi), cosT);
            // tangent space to world
            let sampleVec = tangentSample.x * right + tangentSample.y * up + tangentSample.z * normal;

            irradiance += textureSample(texture, texture_sampler, sampleVec).rgb * cosT * sinT;
            nrSamples += 1.0;
        }
    }

    return vec4f((irradiance * PI) / nrSamples, 1.0);
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    let uv = input.uv * 2.0 - 1.0;
    output.px = getIrradiance(normalize(vec3f(1, -uv.y, -uv.x)));
    output.nx = getIrradiance(normalize(vec3f(-1, -uv.y, uv.x)));
    output.py = getIrradiance(normalize(vec3f(uv.x, 1, uv.y)));
    output.ny = getIrradiance(normalize(vec3f(uv.x, -1, -uv.y)));
    output.pz = getIrradiance(normalize(vec3f(uv.x, -uv.y, 1)));
    output.nz = getIrradiance(normalize(vec3f(-uv.x, -uv.y, -1)));
    return output;
}