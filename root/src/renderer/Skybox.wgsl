struct VertexInput {
    @location(0) position : vec3f,
    @location(1) texcoords : vec2f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(1) texcoords: vec3f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var envTexture: texture_cube<f32>;
@group(1) @binding(1) var envSampler: sampler;

const CUBE_POSITIONS : array<vec3f, 36> = array<vec3f, 36>(
    // +X face
    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),

    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f( 1.0, -1.0,  1.0),

    // -X face
    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f(-1.0,  1.0, -1.0),

    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0,  1.0, -1.0),
    vec3f(-1.0, -1.0, -1.0),

    // +Y face
    vec3f(-1.0,  1.0, -1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),

    vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0, -1.0),

    // -Y face
    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0, -1.0),

    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0,  1.0),

    // +Z face
    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),

    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f(-1.0,  1.0,  1.0),

    // -Z face
    vec3f( 1.0, -1.0, -1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),

    vec3f( 1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0, -1.0),
);

@vertex
fn vertex(@builtin(vertex_index) v_index : u32) -> VertexOutput {
    let position = CUBE_POSITIONS[v_index];

    let cameraRot = mat4x4f(
        vec4f(camera.viewMatrix[0].xyz, 0.0),
        vec4f(camera.viewMatrix[1].xyz, 0.0),
        vec4f(camera.viewMatrix[2].xyz, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0),
    );

    let clip = camera.projectionMatrix * cameraRot * vec4f(position, 1.0);

    var output: VertexOutput;
    output.position = vec4f(clip.x, clip.y, clip.w, clip.w);
    output.texcoords = position;
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4f(textureSample(envTexture, envSampler, input.texcoords.xyz).rgb, 1.0);
}