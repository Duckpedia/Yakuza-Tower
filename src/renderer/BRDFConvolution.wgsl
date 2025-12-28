// learnopengl
// "kako zgleda brdf pr temu roughnessu in kotu pogleda"
fn integrateBRDF(normalDotView: f32, roughness: f32) -> vec2f {
    let normal = vec3f(0.0, 0.0, 1.0);
    let view = vec3(sqrt(1.0 - normalDotView * normalDotView), 0.0, normalDotView);

    var a = 0.0;
    var b = 0.0;

    let SAMPLE_COUNT = 1024u;
    for(var i = 0u; i < SAMPLE_COUNT; i += 1u) {
        let Xi = hammersley(i, SAMPLE_COUNT);
        let half = importanceSampleGGX(Xi, normal, roughness);
        let light = normalize(2.0 * dot(view, half) * half - view);

        // v(0,0,1) dot X = X.z
        let normalDotLight = max(light.z, 0.0);
        let normalDotHalf  = max(half.z, 0.0);
        let viewDotHalf    = max(dot(view, half), 0.0);

        if(normalDotLight > 0.0) {
            let g = geometrySmith(normal, view, light, roughness);
            let G_Vis = (g * viewDotHalf) / max(normalDotHalf * max(normalDotView, 1e-4), 1e-4);
            let Fc = pow(1.0 - viewDotHalf, 5.0);

            a += (1.0 - Fc) * G_Vis;
            b += Fc * G_Vis;
        }
    }
    return vec2f(a, b) / f32(SAMPLE_COUNT);
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec2f {
  let result = integrateBRDF(input.uv.x, 1 - input.uv.y);
  return result;
}