@vertex
fn vertex(@builtin(vertex_index) v_index : u32) -> FullscreenVertexOutput {
    var output: FullscreenVertexOutput;
    output.position = vec4(FULLSCREEN_QUAD_POSITIONS[v_index], 0.0, 1.0);
    output.uv = output.position.xy * 0.5 + 0.5;
    output.uv.y = 1.0f - output.uv.y;
    return output;
}