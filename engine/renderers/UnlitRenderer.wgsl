struct VertexInput {
    @location(0) position: vec3f,
    @location(1) texcoords: vec2f,
}

struct InstanceInput {
    @location(2) row0: vec4f,
    @location(3) row1: vec4f,
    @location(4) row2: vec4f,
    @location(5) row3: vec4f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(1) texcoords: vec2f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@group(1) @binding(0) var baseTexture: texture_2d<f32>;
@group(1) @binding(1) var baseSampler: sampler;

@vertex
fn vertex(v: VertexInput, i: InstanceInput) -> VertexOutput {
    var output: VertexOutput;

    let model_matrix = mat4x4<f32>( i.row0, i.row1, i.row2, i.row3 );

    output.position = camera.projectionMatrix * camera.viewMatrix * model_matrix * vec4(v.position, 1);
    output.texcoords = v.texcoords;

    return output;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(baseTexture, baseSampler, input.texcoords);
    return color;
}
