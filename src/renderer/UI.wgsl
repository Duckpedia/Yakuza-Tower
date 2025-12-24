struct VertexOutput {
    @builtin(position) position: vec4f,
}

struct InstanceInput {
    @location(0) position: vec4f,
    @location(1) scale: vec4f,
}

@vertex
fn vertex(@builtin(vertex_index) v_index : u32, instance: InstanceInput) -> VertexOutput {
    let position = (FULLSCREEN_QUAD_POSITIONS[v_index] * 0.5 + 0.5) * instance.scale.xy + instance.position.xy;

    var output: VertexOutput;
    output.position = vec4(position.xy * 2.0 - 1.0, 0.0, 1.0);
    return output;
}

@fragment
fn fragment(input: VertexOutput) -> @location(0) vec4<f32> {
    return vec4(1.0, 0.0, 0.0, 1.0);
}