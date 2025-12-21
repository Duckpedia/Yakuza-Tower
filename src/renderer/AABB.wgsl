struct InstanceInput {
    @location(0) row0: vec4f,
    @location(1) row1: vec4f,
    @location(2) row2: vec4f,
    @location(3) row3: vec4f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    position: vec4f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

const BOX_POSITIONS : array<vec3f, 36> = array<vec3f, 36>(
    // +Z (front)
    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f(-1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f(-1.0,  1.0,  1.0),

    // -Z (back)
    vec3f( 1.0, -1.0, -1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0, -1.0),

    // +X (right)
    vec3f( 1.0, -1.0,  1.0),
    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0,  1.0, -1.0),
    vec3f( 1.0, -1.0,  1.0),
    vec3f( 1.0,  1.0, -1.0),
    vec3f( 1.0,  1.0,  1.0),

    // -X (left)
    vec3f(-1.0, -1.0, -1.0),
    vec3f(-1.0, -1.0,  1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f(-1.0,  1.0, -1.0),

    // +Y (top)
    vec3f(-1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0, -1.0),
    vec3f(-1.0,  1.0,  1.0),
    vec3f( 1.0,  1.0, -1.0),
    vec3f(-1.0,  1.0, -1.0),

    // -Y (bottom)
    vec3f(-1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0,  1.0),
    vec3f(-1.0, -1.0, -1.0),
    vec3f( 1.0, -1.0,  1.0),
    vec3f(-1.0, -1.0,  1.0),
);

@vertex
fn vertex(@builtin(vertex_index) v_index : u32, instance: InstanceInput) -> VertexOutput {
    let model_matrix = mat4x4<f32>( 
        instance.row0,
        instance.row1,
        instance.row2,
        instance.row3 
    );

    let position = BOX_POSITIONS[v_index];

    var output: VertexOutput;
    output.position = camera.projectionMatrix * camera.viewMatrix * model_matrix * vec4f(position.xyz, 1.0);
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 1.0, 1.0);
}