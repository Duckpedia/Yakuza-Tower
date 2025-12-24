@group(0) @binding(0) var<uniform>         camera: Camera;

@group(1) @binding(0) var<uniform>                settings: Settings;
@group(1) @binding(1) var lightsDepthMaps:        texture_depth_2d_array;
@group(1) @binding(2) var lightsDepthMapsSampler: sampler_comparison;
@group(1) @binding(3) var irradianceMap:          texture_cube<f32>;
@group(1) @binding(4) var prefilteredMap:           texture_cube<f32>;
@group(1) @binding(5) var brdfConvolution:        texture_2d<f32>;
@group(1) @binding(6) var envSampler:             sampler;

@group(2) @binding(0) var gBufferAlbedo:   texture_2d<f32>;
@group(2) @binding(1) var gBufferPosWorld: texture_2d<f32>;
@group(2) @binding(2) var gBufferNormal:   texture_2d<f32>;
@group(3) @binding(0) var<storage, read>   lights: array<Light>;

// https://learnopengl.com/PBR/Theory
fn distributionGGX(normal: vec3f, half: vec3f, roughness: f32) -> f32
{
    let a = roughness * roughness * roughness * roughness;
    let d = positiveDot(normal, half);
    var denom = d * d * (a - 1.0f) + 1.0f;
    return a / (3.14159265359f * denom * denom);
}

fn geometrySchlickGGX(normalDotView: f32 , roughness: f32) -> f32
{
    let r = roughness + 1.0f;
    let k = (r * r) / 8.0f;
    return normalDotView / (normalDotView * (1.0f - k) + k);
}

fn geometrySmith(normal: vec3f, view: vec3f, light: vec3f, roughness: f32) -> f32
{
    let normalDotView = positiveDot(normal, view);
    let normalDotLight = positiveDot(normal, light);
    return geometrySchlickGGX(normalDotView, roughness) * geometrySchlickGGX(normalDotLight, roughness);
}

fn fresnelSchlick(halfDotView: f32, f0: vec3f) -> vec3f
{
    return f0 + (1.0f - f0) * pow(clamp(1.0f - halfDotView, 0.0f, 1.0f), 5.0f);
}

fn fresnelSchlickRoughness(halfDotView: f32, f0: vec3f, roughness: f32) -> vec3f
{
    return f0 + (max(vec3(1.0f - roughness), f0) - f0) * pow(clamp(1.0f - halfDotView, 0.0f, 1.0f), 5.0f);
}

fn calculateShadow(light: Light, world: vec3f) -> f32
{
    let shadowIndex = i32(light.shadowIndex);
    if (shadowIndex < 0)
    {
        return 1.0f;
    }

    var shadow = 1.0;
    let clip = light.viewProjMatrix * vec4(world, 1.0f);
    var ndc = clip.xyz / clip.w;
    var uv = vec2(ndc.x, -ndc.y) * 0.5f + 0.5f;

    var avg_sampled_depth = 0.0;
    var resolution = textureDimensions(lightsDepthMaps);
    let tex_d = 1.0f / vec2f(resolution);
    for (var i = -1; i <= 1; i++) {
        for (var j = -1; j <= 1; j++) {
            let diff = vec2f(f32(i), f32(j)) * tex_d * 2.0f;
            avg_sampled_depth += textureSampleCompare(
                lightsDepthMaps,
                lightsDepthMapsSampler, 
                uv + diff,
                shadowIndex,
                ndc.z - 0.00001f
            );
        }
    }
    var sampled_depth = avg_sampled_depth / 9.0f;

    if (any(ndc.xy < vec2(-1.0)) || any(ndc.xy > vec2(1.0)))
    {
        sampled_depth = 1.0f;
    }

    return sampled_depth;
}

fn PBR(albedo: vec3f, world: vec3f, normal: vec3f, metallic: f32, roughness: f32, ao: f32, uv : vec2f) -> vec3f
{
    let view = normalize(camera.position.xyz - world.xyz);
    let f0 = mix(vec3(0.04), albedo, metallic);
    var l0 = vec3(0.0);
    let reflected = reflect(-view, normal);

    let normalDotView = positiveDot(normal, view);

    let nLights = arrayLength(&lights);
    for (var i = 0u; i < nLights; i++) {
        let lightt = lights[i];
        let lightPosition = lightt.position.xyz;
        let lightColor = lightt.color;
        let lightIntensity = lightt.intensity;
        let toLight = lightPosition - world.xyz;
        let light = normalize(toLight);

        var attenuation = 1.0f;
        if (lightt.falloff > 0)
        {
            attenuation = 1.0f / length2(toLight);
        }
        let shadow = calculateShadow(lightt, world);
        
        // do calculation only if inside spotlight
        var d = clamp(dot(lightt.direction, light), -1.0, 1.0);
        if (d > lightt.outerAngle)
        {
            let normalDotLight = positiveDot(normal, light);
            let half = normalize(view + light);

            let ndf = distributionGGX(normal, half, roughness);
            let g = geometrySmith(normal, view, light, roughness);
            let f = fresnelSchlick(positiveDot(half, view), f0);

            let numerator = ndf * g * f;
            let denominator = 4.0f * normalDotView * normalDotLight + 0.0001f;
            let specular = numerator / denominator;

            let ks = f;
            let kd = (vec3(1.0f) - ks) * (1.0f - metallic);

            let radiance = lightColor * lightIntensity * attenuation;
            
            d = clamp((d - lightt.outerAngle) / (lightt.innerAngle - lightt.outerAngle), 0.0, 1.0);
            l0 += (kd * albedo / PI + specular) * radiance * normalDotLight * shadow * d;
        }
    }

    let f = fresnelSchlickRoughness(normalDotView, f0, roughness); 
    let prefiltered = textureSampleLevel(prefilteredMap, envSampler, reflected, roughness * 8).rgb; 
    let brdf = textureSample(brdfConvolution, envSampler, vec2(normalDotView, roughness)).rg;
    let specular = prefiltered * (f * brdf.x + brdf.y);
    let irradiance = textureSample(irradianceMap, envSampler, normal).rgb;
    let ks = f;
    let kd = 1.0 - ks;
    let diffuse = irradiance * albedo;
    let ambient = (kd * diffuse + specular) * ao; 

    var color = ambient + l0;

    return color;
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let loc = vec2i(input.uv * vec2f(textureDimensions(gBufferAlbedo)));
    let albedoAndMetallic = textureLoad(gBufferAlbedo, loc, 0);
    let worldAndRoughness = textureLoad(gBufferPosWorld, loc, 0);
    let normalAndValid = textureLoad(gBufferNormal, loc, 0);
    let albedo = albedoAndMetallic.xyz;
    let world = worldAndRoughness.xyz;
    let metallic = albedoAndMetallic.w;
    let roughness = worldAndRoughness.w;
    let normal = normalize(normalAndValid.rgb);
    let valid = normalAndValid.a;
    let ao = 1.0;//material.ao;

    if (valid == 0.0)
    {
        discard;
    }

    var color = PBR(albedo, world, normal, metallic, roughness, ao, input.uv);
    if (settings.passIndex >= 5.0) {
        color = vec3(roughness);
    }
    else if (settings.passIndex >= 4.0) {
        color = world;
    }
    else if (settings.passIndex >= 3.0) {
        color = normal;
    }
    else if (settings.passIndex >= 2.0) {
        color = vec3(metallic);
    }
    else if (settings.passIndex >= 1.0) {
        color = albedo;
    }

    return vec4(color, 1.0);
}