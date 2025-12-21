struct InstanceInput {
    @location(0) start: vec4f,
    @location(1) end: vec4f,
    @location(2) color: vec4f,
}

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec3f
}

struct CameraUniforms {
    viewMatrix: mat4x4f,
    projectionMatrix: mat4x4f,
    position: vec4f,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

@vertex
fn vertex(@builtin(vertex_index) v_index : u32, instance: InstanceInput) -> VertexOutput {
    var position = instance.start;
    if (v_index > 0)
    {
        position = instance.end;
    }

    var output: VertexOutput;
    output.position = camera.projectionMatrix * camera.viewMatrix * vec4f(position.xyz, 1.0);
    output.color = instance.color.rgb;
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.color, 1.0);
}