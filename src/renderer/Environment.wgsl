struct VertexInput {
    @location(0) position : vec3f,
    @location(1) texcoords : vec2f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) world: vec4f,
    @location(1) texcoords: vec3f,
}

@group(0) @binding(0) var<uniform> camera: Camera;

@group(1) @binding(0) var envTexture: texture_cube<f32>;
@group(1) @binding(1) var envSampler: sampler;

@vertex
fn vertex(@builtin(vertex_index) v_index : u32) -> VertexOutput {
    let position = CUBE_POSITIONS[v_index];

    let cameraRot = mat4x4f(
        vec4f(camera.viewMatrix[0].xyz, 0.0),
        vec4f(camera.viewMatrix[1].xyz, 0.0),
        vec4f(camera.viewMatrix[2].xyz, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0),
    );

    let world = vec4f(position * 1000.0, 1.0);
    let clip = camera.projectionMatrix * cameraRot * world;

    var output: VertexOutput;
    output.position = vec4f(clip.x, clip.y, clip.w, clip.w);
    output.world = world;
    output.texcoords = position;
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> DeferredOutput {
    let rgb = textureSample(envTexture, envSampler, input.texcoords.xyz).rgb;
    var output: DeferredOutput; 
    output.baseAndMetallicWetness = vec4f(rgb, 0.0);
    output.normalEmissionRoughness = vec4f(0.0, 0.0, 0.0, -1.0);
    // output.subsurfaceSpecularSpecularTintClearcoat = vec4f(0.0);
    return output;
}