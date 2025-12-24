fn integrateBRDF(NdotV: f32, roughness: f32) -> vec2f {
    var V: vec3f;
    V.x = sqrt(1.0 - NdotV * NdotV);
    V.y = 0.0;
    V.z = NdotV;

    var A: f32 = 0.0;
    var B: f32 = 0.0;

    let N = vec3f(0.0, 0.0, 1.0);

    let SAMPLE_COUNT: u32 = 1024u;
    for(var i: u32 = 0u; i < SAMPLE_COUNT; i = i + 1u) {
        let Xi: vec2f = hammersley(i, SAMPLE_COUNT);
        let H: vec3f = importanceSampleGGX(Xi, N, roughness);
        let L: vec3f = normalize(2.0 * dot(V, H) * H - V);

        let NdotL: f32 = max(L.z, 0.0);
        let NdotH: f32 = max(H.z, 0.0);
        let VdotH: f32 = max(dot(V, H), 0.0);

        if(NdotL > 0.0) {
            let G: f32 = geometrySmith(N, V, L, roughness);
            let G_Vis: f32 = (G * VdotH) / max(NdotH * max(NdotV, 1e-4), 1e-4);
            let Fc: f32 = pow(1.0 - VdotH, 5.0);

            A += (1.0 - Fc) * G_Vis;
            B += Fc * G_Vis;
        }
    }
    A /= f32(SAMPLE_COUNT);
    B /= f32(SAMPLE_COUNT);
    return vec2f(A, B);
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec2f {
  let result = integrateBRDF(input.uv.x, 1 - input.uv.y);
  return result;
}