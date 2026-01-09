@group(0) @binding(0) var<uniform> camera: Camera;

@group(1) @binding(0) var<uniform>                settings: Settings;
@group(1) @binding(1) var lightsDepthMaps:        texture_depth_2d_array;
@group(1) @binding(2) var lightsDepthMapsSampler: sampler_comparison;
@group(1) @binding(3) var irradianceMap:          texture_cube<f32>;
@group(1) @binding(4) var prefilteredMap:         texture_cube<f32>;
@group(1) @binding(5) var brdfConvolution:        texture_2d<f32>;
@group(1) @binding(6) var linearSampler:          sampler;

@group(2) @binding(0) var depthTexture: texture_depth_2d;

@group(3) @binding(0) var<storage, read> lights: array<Light>;

//https://bartwronski.com/wp-content/uploads/2014/08/bwronski_volumetric_fog_siggraph2014.pdf

fn phaseHenyeyGreenstein(light: vec3f, view: vec3f, g: f32) -> f32 {
    let gSquared = g * g;
    let oneOver4Pi = 1.0 / (4 * PI);
    return oneOver4Pi * ((1.0 - gSquared) / pow(1.0 + gSquared - 2 * g * dot(light, view), 1.5));
}

// this one doesnt do pcf
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

    var sampled_depth = textureSampleCompare(
        lightsDepthMaps,
        lightsDepthMapsSampler, 
        uv,
        shadowIndex,
        ndc.z - 0.0001f
    );
    return select(sampled_depth, 1.0, any(ndc.xy < vec2(-1.0)) || any(ndc.xy > vec2(1.0)));
}

fn volumetricFog(input: FullscreenVertexOutput) -> vec4f
{
    if (settings.fogSteps <= 0)
    {
        discard;
    }

    let uv = input.uv; 
    let loc = vec2i(uv * vec2f(textureDimensions(depthTexture)));
    let depth = textureLoad(depthTexture, loc, 0);
    let world = recreateWorld(uv, depth, camera.inverseViewMatrix * camera.inverseProjectionMatrix);
    
    let is_skybox = false;

    var scatter = vec3f(0.0);
    var transmit = 1.0;

    let diff = world - camera.position.xyz;
    let direction = normalize(diff);
    // TODO: figure out something smart with the 50
    let distance = select(length(diff), 50.0, is_skybox);
    let irradiance = textureSample(irradianceMap, linearSampler, direction).rgb;

    let steps = i32(settings.fogSteps);
    var t = 0.0;
    var dt = distance / f32(steps);
    for (var s = 0; s <= steps; s++) {
        let p = camera.position.xyz + direction * t;

        let sigmaT = settings.fogStrength;
        let sigmaS = sigmaT * 0.85;

        var Li = vec3(0.0);
        let nLights = arrayLength(&lights);
        for (var i = 0u; i < nLights; i++) {
            let lightt = lights[i];
            let toLight = lightt.position.xyz - p.xyz;
            let light = normalize(toLight);
            let shadow = calculateShadow(lightt, p);
            var d = clamp(dot(lightt.direction, light), -1.0, 1.0);
            if (d > lightt.outerAngle)
            {
                let attenuation = select(1.0f, 1.0f / max(length2(toLight), 1.0), lightt.falloff > 0);
                let phase = phaseHenyeyGreenstein(light, direction, 0.9);
                Li += lightt.color * lightt.intensity * attenuation * shadow * phase;
            }
        }

        scatter += transmit * (sigmaS * dt) * ((Li * settings.fogLightFactor) + irradiance);
        transmit *= exp(-sigmaT * dt);

        // mm ljkubim non uniform control flow
        // if (fog.transmit < 0.001) {
        //     fog.transmit = 0.0;
        //     break;
        // }

        t += dt;
    }

    return vec4(scatter, transmit);
}

fn depthFog(input: FullscreenVertexOutput) -> vec4f
{
    let uv = input.uv; 
    let loc = vec2i(uv * vec2f(textureDimensions(depthTexture)));
    let depth = textureLoad(depthTexture, loc, 0);
    var ndc = vec3(input.uv.xy * 2.0 - 1.0, depth);
    ndc.y = -ndc.y;
    let view = recreateView(vec3(ndc.x, -ndc.y, ndc.z), camera.inverseProjectionMatrix);
    let fog = exp(-max(-view.z, 0.0) * settings.depthFogDensity);
    return vec4f(vec3f(1.0 - fog), fog);
}

@fragment
fn fragment(input: FullscreenVertexOutput) -> @location(0) vec4<f32> 
{
    if (settings.volumetricFog > 0.5)
    {
        return volumetricFog(input);
    }
    return depthFog(input);
}