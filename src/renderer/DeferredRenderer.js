import { mat4, vec2, vec3, vec4 } from 'glm';

import * as WebGPU from '../../engine/WebGPU.js';

import { Camera, Model } from '../../engine/core/core.js';

import { BaseRenderer } from '../../engine/renderers/BaseRenderer.js';
import { LightComponent } from '../components/LightComponent.js';

export class DeferredRendererSettings {
    pass = 0;
    showUI = true;
    showSkybox = true;
    showBloom = true;
    bloom = {
        threshold: 1.3,
        // strength: 0.0,
        strength: 0.012,
        filterRadius: 1.0,
        dirtStrength: 0.0,
    };
    tonemapping = {
        // index: 0, // 0 none, 1 reinhard, 2 agx
        index: 2, // 0 none, 1 reinhard, 2 agx
        agxSlope: [1.0, 1.0, 1.0],
        agxPower: [1.35, 1.35, 1.35],
        agxSat: 1.4
    };
    blackAndWhite = 0.0;
    wireframe = false;
    debug = false;
    test = 0.0;
    showSSAO = true;
    ssaoRadius = 0.5;
    ssaoBias = 0.025;
    ssaoMaxDelta = 0.17;
    showFog = true;
    fogStrength = 0.006;
    fogLightFactor = 1.0;
    fogSteps = 60;
    vignette = 0.0;
    vignetteRadius = 0.0;
    vignetteSoftness = 0.0;
    caX = 5.0;
    caY = 5.0;
    scanlines = 0.0;
    scanlinesDensity = 0.0;
    scanlinesSpeed = 0.0;
    environment = true;
}

class GPUBuffer {
    constructor(device, capacity = 0, elementSize = 1, T = Uint8Array, usage = GPUBufferUsage.VERTEX | GPUBufferUsage.FRAGMENT | GPUBufferUsage.COPY_DST)
    {
        this.T = T;
        this.capacity = 0;
        this.elementSize = elementSize;
        this.usage = usage;
        this.ensureCapacity(capacity, device);
    }

    ensureCapacity(n, device)
    {
        if (this.capacity >= n)
            return false;
        this.capacity = n;
        this.array = new this.T(n * this.elementSize);
        this.buffer = WebGPU.createBuffer(device, {
            size: this.array.byteLength,
            usage: this.usage,
        });
        return true;
    }
}

export class DeferredRenderer extends BaseRenderer {

    static randomRectangle = { position: new vec2(0.25, 0.25), scale: new vec2(0.5, 0.5) };
    static s = null;

    materialBuffer = new Float32Array(4 + 4);
    cameraBuffer = new Float32Array(16 + 16 + 16 + 16 + 4);
    poprSettingsBufferArray = new Float32Array(4 * 8);
    poprSettingsBuffer = null;
    lightsDefaultProjectionMatrix = mat4.perspectiveZO(mat4.create(), 30 * 0.0174532925, 1, 0.1, 100);
    lightsDefaultInverseProjectionMatrix = mat4.perspectiveZO(mat4.create(), 30 * 0.0174532925, 1, 0.1, 100).invert();
    poprSettingsBindGroup = null;

    // per frame stuff
    bloomTextures = [];
    debugLines = [];
    lights = [];
    skeletons = [];
    skeletonToJoint = new Map();
    models = new Map();
    nShadowCastingLights = 0;

    constructor(canvas) {
        super(canvas);
    }

    async initialize(defaultTextureImage, dirtImage) {
        await super.initialize(defaultTextureImage);

        this.commonShaderCode = await fetch(new URL('Common.wgsl', import.meta.url)).then(response => response.text());
        this.skyboxCommonCode = await fetch(new URL("SkyboxCommon.wgsl", import.meta.url)).then(response => response.text());
        this.fullscreenCommonCode = await fetch(new URL("FullscreenCommon.wgsl", import.meta.url)).then(response => response.text());

        this.cameraBindGroupLayout = this.createBindGroupLayout([uniformBufferBindGroupEntry]);
        this.linearTextureSampler = this.device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear',
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
        this.filteringSamplerBindGroupLayout = this.createBindGroupLayout([filteringSamplerBindGroupEntry])
        this.filteringSamplerBindGroup = this.device.createBindGroup({
            layout: this.filteringSamplerBindGroupLayout,
            entries: [ { binding: 0, resource: this.linearTextureSampler } ],
        });

        this.jointsBuffer = new GPUBuffer(this.device, 0, 16, Float32Array, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
        this.lightsBuffer = new GPUBuffer(this.device, 0, 16 + 4 + 4 + 4 + 4, Float32Array, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
        this.instancesBuffer = new GPUBuffer(this.device, 0, 132, ArrayBuffer, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
        this.uiInstancesBuffer = new GPUBuffer(this.device, 0, 4 + 4, Float32Array, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
        this.debugLinesBuffer = new GPUBuffer(this.device, 0, 4 + 4 + 4, Float32Array, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
        this.deferredTargets = [
            { format: 'bgra8unorm', },
            { format: 'rgba16float', }, // TODO: use a smaller format
            // { format: 'bgra8unorm', } 
        ];

        await this.setUpSkybox();
        await this.setUpDeferred();
        await this.setUpLighting();
        await this.setUpDebug();
        await this.setUpPopr(dirtImage);
        await this.setUpBloom();
        await this.setUpUI();

        this.recreateRenderTargets();

        DeferredRenderer.s = this;
    }

    async loadShaderModule(url, prefixes = [])
    {
        const code = this.commonShaderCode + prefixes.join('') +
            await fetch(new URL(url, import.meta.url)).then(response => response.text());
        return this.device.createShaderModule({ code });
    }

    async setUpUI()
    {
        const module = await this.loadShaderModule("UI.wgsl");
        this.uiPipeline = await this.device.createRenderPipelineAsync({
            label: 'ui',
            layout: 'auto',
            vertex: {
                module,
                buffers: [ uiInstanceBufferLayout ],
            },
            fragment: {
                module,
                targets: [{ format: this.format }],
            }
        });
    }

    // TODO: rename to environment
    async setUpSkybox() {
        console.log("setting up skybox");

        const loadHDR = (url) => {
            return new Promise((resolve, reject) => {
                const img = new HDRImage();
                img.onload = () => resolve(img);
                img.onerror = (e) => reject(new Error(`Failed to load HDR: ${url}`));
                img.src = url;
            });
        };
    
        const environmentImages = await Promise.all([
            './textures/cpsmall/px.hdr',
            './textures/cpsmall/nx.hdr',
            './textures/cpsmall/py.hdr',
            './textures/cpsmall/ny.hdr',
            './textures/cpsmall/pz.hdr',
            './textures/cpsmall/nz.hdr',
        ].map(url => loadHDR(url)));

        const envBindGroupLayout = this.createBindGroupLayout([cubemapBindGroupEntry, filteringSamplerBindGroupEntry]);
        
        { // default skybox pipeline
            const layout = this.device.createPipelineLayout({
                bindGroupLayouts: [this.cameraBindGroupLayout, envBindGroupLayout],
            });
            const module = await this.loadShaderModule('Skybox.wgsl');
            this.skyboxPipeline = await this.device.createRenderPipelineAsync({
                label: 'skybox',
                layout,
                vertex: { module },
                fragment: {
                    targets: this.deferredTargets,
                    module,
                },
                depthStencil: {
                    format: 'depth24plus',
                    depthWriteEnabled: false,
                    depthCompare: 'less-equal',
                },
            });

            this.environmentTexture = this.device.createTexture({
                size: [environmentImages[0].width, environmentImages[0].height, 6],
                format: 'rgba16float',
                usage:
                    GPUTextureUsage.TEXTURE_BINDING |
                    GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.RENDER_ATTACHMENT,
            });

            for (let i = 0; i < environmentImages.length; i++) {
                const image = environmentImages[i];
                const f32Data = image.dataFloat;
                let data = new Float16Array(image.width * image.height * 4);
                for (let j = 0; j < image.width * image.height; j++)
                {
                    const f32i = j * 3;
                    const f16i = j * 4;
                    data.set([f32Data[f32i], f32Data[f32i+1], f32Data[f32i+2], 1.0], f16i);
                }
                this.device.queue.writeTexture(
                    { texture: this.environmentTexture, origin: [0, 0, i] },
                    data,
                    { bytesPerRow: image.width * 8, rowsPerImage: image.height },
                    { width: image.width, height: image.height, depthOrArrayLayers: 1 },
                );
            }
            
            this.skyboxBindGroup = this.device.createBindGroup({
                layout: envBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.environmentTexture.createView({ dimension: 'cube' }) },
                    { binding: 1, resource: this.linearTextureSampler },
                ],
            });
        }

        { // irradiance map
            const layout = this.device.createPipelineLayout({ bindGroupLayouts: [ envBindGroupLayout ] });
            const module = await this.loadShaderModule('IrradienceMap.wgsl', [this.skyboxCommonCode, this.fullscreenCommonCode]);
            const pipeline = await this.device.createRenderPipelineAsync({
                label: 'irradience',
                layout,
                vertex: { module },
                fragment: {
                    module,
                    targets: [
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                    ], 
                }
            });
            
            this.irradianceTexture = this.device.createTexture({
                size: [environmentImages[0].width, environmentImages[0].height, 6],
                format: 'rgba16float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            const colorAttachments = []; 
            for (let i = 0; i < 6; i++) { 
                colorAttachments.push({
                    view: this.irradianceTexture.createView({ 
                        baseArrayLayer: i, 
                        arrayLayerCount: 1, 
                    }), 
                    loadOp: "load", 
                    storeOp: "store", 
                }); 
            }

            const encoder = this.device.createCommandEncoder();
            const renderPass = encoder.beginRenderPass({
                colorAttachments,
            });

            renderPass.setPipeline(pipeline);
            renderPass.setBindGroup(0, this.skyboxBindGroup);
            renderPass.draw(6);
            renderPass.end();

            this.device.queue.submit([encoder.finish()]);
        }
        
        { // prefilter map
            const configLayout = this.createBindGroupLayout([ uniformBufferBindGroupEntry ]);
            const layout = this.device.createPipelineLayout({ bindGroupLayouts: [ envBindGroupLayout, configLayout ] });
            const module = await this.loadShaderModule('PrefilterMap.wgsl', [this.skyboxCommonCode, this.fullscreenCommonCode]);
            const pipeline = await this.device.createRenderPipelineAsync({
                label: 'prefilter',
                layout,
                vertex: { module },
                fragment: {
                    module,
                    targets: [
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                        { format: 'rgba16float' },
                    ], 
                }
            });

            const bindGroups = [];
            const mipLevelCount = 7;
            for (let i = 0; i < mipLevelCount; i++)
            {
                const buffer = WebGPU.createBuffer(this.device, {
                    data: new Float32Array([i / (mipLevelCount - 1)]),
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
                bindGroups.push(this.device.createBindGroup({
                    layout: configLayout,
                    entries: [ { binding: 0, resource: buffer } ],
                }))
            }
            
            this.prefilterTexture = this.device.createTexture({
                size: [environmentImages[0].width, environmentImages[0].height, 6],
                format: 'rgba16float',
                mipLevelCount,
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            for (let mip = 0; mip < mipLevelCount; mip++)
            {
                const colorAttachments = [];
                for (let i = 0; i < 6; i++) { 
                    colorAttachments.push({
                        view: this.prefilterTexture.createView({
                            baseArrayLayer: i, 
                            arrayLayerCount: 1, 
                            baseMipLevel: mip,
                            mipLevelCount: 1,
                        }), 
                        clearValue: [0, 0, 0, 1],
                        loadOp: "clear", 
                        storeOp: "store", 
                    }); 
                }

                const encoder = this.device.createCommandEncoder();
                const renderPass = encoder.beginRenderPass({
                    colorAttachments,
                });

                renderPass.setPipeline(pipeline);
                renderPass.setBindGroup(0, this.skyboxBindGroup);
                renderPass.setBindGroup(1, bindGroups[mip]);
                renderPass.draw(6);
                renderPass.end();

                this.device.queue.submit([encoder.finish()]);
            }
        }
        
        { // brdf convolution
            const module = await this.loadShaderModule('BRDFConvolution.wgsl', [this.skyboxCommonCode, this.fullscreenCommonCode]);
            const pipeline = await this.device.createRenderPipelineAsync({
                label: 'brdf convolution',
                layout: 'auto',
                vertex: { module },
                fragment: { module, targets: [ { format: 'rg16float' } ] }
            });
            
            this.brdfConvolutionTexture = this.device.createTexture({
                size: [512, 512],
                format: 'rg16float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
            });
            
            const encoder = this.device.createCommandEncoder();
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [ { 
                    view: this.brdfConvolutionTexture.createView(), 
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear", 
                    storeOp: "store"
                }],
            });

            renderPass.setPipeline(pipeline);
            renderPass.draw(6);
            renderPass.end();

            this.device.queue.submit([encoder.finish()]);
        }

        this.irradianceBindGroup = this.device.createBindGroup({
            layout: envBindGroupLayout,
            entries: [
                { 
                    binding: 0, 
                    resource: this.prefilterTexture.createView({ 
                        dimension: 'cube', 
                        baseMipLevel: 1,
                        mipLevelCount: 1
                    })
                },
                { binding: 1, resource: this.linearTextureSampler },
            ],
        });
    }

    async setUpDeferred() {
        console.log("setting up deferred");

        this.jointsBindGroupLayout = this.createBindGroupLayout([storageBufferBindGroupEntry]);
        this.materialBindGroupLayout = this.createBindGroupLayout([textureBindGroupEntry, filteringSamplerBindGroupEntry, uniformBufferBindGroupEntry]);
        const deferredLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBindGroupLayout, this.jointsBindGroupLayout, this.materialBindGroupLayout],
        });

        const lightsLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBindGroupLayout, this.jointsBindGroupLayout],
        });

        const module = await this.loadShaderModule('Deferred.wgsl');
        const deferredPipelineOptions = {
            label: 'deferred',
            layout: deferredLayout,
            vertex: {
                module,
                buffers: [ vertexBufferLayout, instanceBufferLayout ],
            },
            fragment: {
                module,
                targets: this.deferredTargets,
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
            },
            primitive: {
                cullMode: 'back'
            }
        };
        this.deferredPipeline = await this.device.createRenderPipelineAsync(deferredPipelineOptions);
        deferredPipelineOptions.primitive.topology = 'line-list';
        this.wireframePipeline = await this.device.createRenderPipelineAsync(deferredPipelineOptions);

        const depthPassPipelineOptions = {
            label: 'depthPass',
            layout: lightsLayout,
            vertex: {
                module,
                buffers: [ vertexBufferLayout, instanceBufferLayout ],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
            primitive: {
                cullMode: 'back'
            }
        };
        this.depthPassPipeline = await this.device.createRenderPipelineAsync(depthPassPipelineOptions);
        depthPassPipelineOptions.primitive.topology = 'line-list';
        this.wireframedepthPassPipeline = await this.device.createRenderPipelineAsync(depthPassPipelineOptions);

        this.dummySkeletonBuffer = WebGPU.createBuffer(this.device, {
            data: new Float32Array(16),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.dummySkeletonBindGroup = this.device.createBindGroup({
            layout: this.jointsBindGroupLayout,
            entries: [ { binding: 0, resource: { buffer: this.dummySkeletonBuffer } } ],
        });

        this.poprSettingsBuffer = WebGPU.createBuffer(this.device, {
            data: this.poprSettingsBufferArray,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.lightDepthTextureArray = this.device.createTexture({
                format: 'depth24plus',
                size: [1000, 1000, 8],
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
        this.lightDepthTextureArrayView = this.lightDepthTextureArray.createView({ dimension: '2d-array' });
        
        this.lightDepthTextureArrayViews = [];
        for (let i = 0; i < 8; i++)
        {
            const view = this.lightDepthTextureArray.createView({ 
                    dimension: '2d', 
                    baseArrayLayer: i  
                });
            this.lightDepthTextureArrayViews.push(view);
        }
        
        this.lightDepthSampler = this.device.createSampler({
            compare: 'less',
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
    }

    async setUpLighting()
    {
        console.log("setting up lighting");
        const secondBindGroupLayout = this.createBindGroupLayout([
            uniformBufferBindGroupEntry, 
            depthArrayTextureBindGroupEntry, 
            comparisonSamplerBindGroupEntry,
            cubemapBindGroupEntry,
            cubemapBindGroupEntry,
            textureBindGroupEntry,
            filteringSamplerBindGroupEntry
        ]);
        this.deferredtargetsBindGroupLayout = this.createBindGroupLayout([
            textureBindGroupEntry, 
            textureBindGroupEntry, 
            // textureBindGroupEntry, 
            textureBindGroupEntry,
            depthTextureBindGroupEntry
        ]);
        this.lightsBindGroupLayout = this.createBindGroupLayout([storageBufferBindGroupEntry]);
        const lightingLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBindGroupLayout, secondBindGroupLayout, this.deferredtargetsBindGroupLayout, this.lightsBindGroupLayout],
        });

        const lightingModule = await this.loadShaderModule('Lighting.wgsl', [this.fullscreenCommonCode]);
        this.lightingPipeline = await this.device.createRenderPipelineAsync({
            label: 'lighting',
            layout: lightingLayout,
            vertex: { module: lightingModule },
            fragment: {
                module: lightingModule,
                targets: [{ format: 'rgba16float' }],
            },
        });
        
        this.fogBindGroupLayout = this.createBindGroupLayout([depthTextureBindGroupEntry]);
        const fogLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.cameraBindGroupLayout, secondBindGroupLayout, this.fogBindGroupLayout, this.lightsBindGroupLayout],
        });

        const fogModule = await this.loadShaderModule('Fog.wgsl', [this.fullscreenCommonCode]);
        this.fogPipeline = await this.device.createRenderPipelineAsync({
            label: 'fog',
            layout: fogLayout,
            vertex: { module: fogModule },
            fragment: {
                module: fogModule,
                targets: [{ format: 'bgra8unorm' }],
            },
        });

        this.lightingBindGroup = this.device.createBindGroup({
            layout: secondBindGroupLayout,
            entries: [
                { binding: 0, resource: this.poprSettingsBuffer },
                { binding: 1, resource: this.lightDepthTextureArrayView },
                { binding: 2, resource: this.lightDepthSampler },
                { binding: 3, resource: this.irradianceTexture.createView({ dimension: 'cube' }) },
                { binding: 4, resource: this.prefilterTexture.createView({ dimension: 'cube' }) },
                { binding: 5, resource: this.brdfConvolutionTexture.createView() },
                { binding: 6, resource: this.linearTextureSampler },
            ],
        });
    }

    async setUpDebug()
    {
        console.log("setting up debug");

        const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.cameraBindGroupLayout] });

        const module = await this.loadShaderModule('Debug.wgsl');
        this.debugPipeline = await this.device.createRenderPipelineAsync({
            label: 'debug',
            layout,
            vertex: {
                module,
                buffers: [ debugInstanceBufferLayout ],
            },
            fragment: {
                module,
                targets: [{ format: this.format}],
            },
            primitive: {
                topology: 'line-strip',
                frontFace: 'ccw',
                cullMode: 'none'
            }
        });
    }

    async setUpPopr(dirtImage) {
        console.log("setting up popr");

        this.poprTextureBindGroupLayout = this.createBindGroupLayout([ textureBindGroupEntry ]);
        const poprConstantsBindGroupLayout = this.createBindGroupLayout([
            filteringSamplerBindGroupEntry,
            uniformBufferBindGroupEntry,
            textureBindGroupEntry
        ]);
        this.poprBloomTextureBindGroupLayout = this.createBindGroupLayout([ textureBindGroupEntry ]);

        const tonemapLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [ 
                this.poprTextureBindGroupLayout,
                poprConstantsBindGroupLayout,
                this.poprBloomTextureBindGroupLayout,
            ],
        });

        const poprLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [ 
                this.poprTextureBindGroupLayout,
                poprConstantsBindGroupLayout,
            ],
        });

        const module = await this.loadShaderModule('Popr.wgsl');
        this.tonemapPipeline = await this.device.createRenderPipelineAsync({
            label: 'tonemap',
            layout: tonemapLayout,
            vertex: { module },
            fragment: {
                module,
                entryPoint: 'tonemap',
                targets: [{ format: this.format }],
            },
        });

        this.poprPipeline = await this.device.createRenderPipelineAsync({
            label: 'popr',
            layout: poprLayout,
            vertex: { module },
            fragment: {
                module,
                entryPoint: 'popr',
                targets: [{ format: this.format }],
            },
        });

        this.dirtTexture = WebGPU.createTexture(this.device, {
            source: dirtImage,
            format: 'rgba8unorm',
        });

        this.poprConstantsBindGroup = this.device.createBindGroup({
            layout: poprConstantsBindGroupLayout,
            entries: [
                { binding: 0, resource: this.linearTextureSampler },
                { binding: 1, resource: this.poprSettingsBuffer },
                { binding: 2, resource: this.dirtTexture.createView() }
            ],
        });
    }

    async setUpBloom() {
        console.log("setting up bloom");

        this.bloomTextureBindGroupLayout = this.createBindGroupLayout([
            textureBindGroupEntry
        ]);
        const bloomConstantsBindGroupLayout = this.createBindGroupLayout([
            {
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { 
                    type: "uniform",
                    hasDynamicOffset: true, 
                    minBindingSize: 24
                },
            }
        ]);

        const layout = this.device.createPipelineLayout({
            bindGroupLayouts: [ this.bloomTextureBindGroupLayout, this.filteringSamplerBindGroupLayout, bloomConstantsBindGroupLayout ],
        });
        
        const module = await this.loadShaderModule('Bloom.wgsl');
        this.downsamplePipeline = await this.device.createRenderPipelineAsync({
            label: 'downsample',
            layout,
            vertex: { module },
            fragment: {
                module,
                entryPoint: 'downsample',
                targets: [{ format: 'rgba16float' }],
            },
        });
        this.upsamplePipeline = await this.device.createRenderPipelineAsync({
            label: 'upsample',
            layout,
            vertex: { module },
            fragment: {
                module,
                entryPoint: 'upsample',
                targets: [{ 
                    format: 'rgba16float',
                    blend: {
                        color: {
                            operation: "add",
                            srcFactor: "one",
                            dstFactor: "one",
                        },
                        alpha: {
                            operation: "add",
                            srcFactor: "one",
                            dstFactor: "one",
                        },
                    },
                    writeMask: GPUColorWrite.ALL,
                }],
            },
        });

        this.bloomParamsStride = this.device.limits.minUniformBufferOffsetAlignment;
        this.maxBloomPasses = 5 * 2;
        this.bloomParamsBufferArray = new Float32Array((this.bloomParamsStride / 4) * this.maxBloomPasses);

        this.bloomParamsBuffer = this.device.createBuffer({
            size: this.bloomParamsStride * this.maxBloomPasses,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.bloomConstantsBindGroup = this.device.createBindGroup({
            layout: bloomConstantsBindGroupLayout,
            entries: [ { binding: 0, resource: { buffer: this.bloomParamsBuffer, offset: 0, size: 24 } } ],
        });
    }

    recreateRenderTargets() {
        this.defferedDepthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.defferedDepthTextureView = this.defferedDepthTexture.createView();

        this.colorTexture = this.device.createTexture({
            format: 'bgra8unorm',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredBaseAndMetallicTextureView = this.colorTexture.createView();
        this.colorTextureView = this.colorTexture.createView();

        this.deferredNormalEmissionRoughnessTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredNormalEmissionRoughnessView = this.deferredNormalEmissionRoughnessTexture.createView();

        // this.deferredSubsurfaceSpecularSpecularTintClearcoatTexture = this.device.createTexture({
        //     format: 'bgra8unorm',
        //     size: [this.canvas.width, this.canvas.height],
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        // });
        // this.deferredSubsurfaceSpecularSpecularTintClearcoatView = this.deferredSubsurfaceSpecularSpecularTintClearcoatTexture.createView();

        this.fogTexture = this.device.createTexture({
            format: 'bgra8unorm',
            size: [this.canvas.width * 0.4, this.canvas.height * 0.4],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.fogTextureView = this.fogTexture.createView();

        this.deferredTargetsBindGroup = this.device.createBindGroup({
            layout: this.deferredtargetsBindGroupLayout,
            entries: [
                { binding: 0, resource: this.deferredBaseAndMetallicTextureView, },
                { binding: 1, resource: this.deferredNormalEmissionRoughnessView, },
                // { binding: 2, resource: this.deferredSubsurfaceSpecularSpecularTintClearcoatView, },
                { binding: 2, resource: this.fogTextureView, },
                { binding: 3, resource: this.defferedDepthTextureView, },
            ],
        });

        this.fogBindGroup = this.device.createBindGroup({
            layout: this.fogBindGroupLayout,
            entries: [ { binding: 0, resource: this.defferedDepthTextureView, } ],
        });
        
        this.lightingTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.lightingTextureView = this.lightingTexture.createView();

        this.tonemapTextureBindGroup = this.device.createBindGroup({
            layout: this.poprTextureBindGroupLayout,
            entries: [ { binding: 0, resource: this.lightingTextureView } ],
        });

        this.poprTextureBindGroup = this.device.createBindGroup({
            layout: this.poprTextureBindGroupLayout,
            entries: [ { binding: 0, resource: this.colorTextureView } ],
        });

        this.bloomTextures.length = 0;
        let width = this.canvas.width;
        let height = this.canvas.height;
        for (let i = 0; i < 5; i++)
        {
            width /= 2;
            height /= 2;
            const tex = this.device.createTexture({
                format: 'rgba16float',
                size: [width, height],
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            const view = tex.createView();
            const bindGroup = this.device.createBindGroup({
                layout: this.poprTextureBindGroupLayout,
                entries: [ { binding: 0, resource: view } ],
            });
            this.bloomTextures.push({ tex, bindGroup, view, width, height });
        }
    }

    render(scene, camera, poprSettings) {
        if (this.defferedDepthTexture.width !== this.canvas.width || this.defferedDepthTexture.height !== this.canvas.height) {
            this.recreateRenderTargets();
        }

        this.poprSettingsBufferArray[0] = poprSettings.pass;
        this.poprSettingsBufferArray[1] = poprSettings.bloom.strength;
        this.poprSettingsBufferArray[2] = poprSettings.bloom.dirtStrength;
        this.poprSettingsBufferArray[3] = poprSettings.tonemapping.index;
        this.poprSettingsBufferArray.set(poprSettings.tonemapping.agxSlope, 4);
        this.poprSettingsBufferArray.set(poprSettings.tonemapping.agxPower, 4 + 4);
        this.poprSettingsBufferArray[12] = poprSettings.tonemapping.agxSat;
        this.poprSettingsBufferArray[13] = poprSettings.blackAndWhite;
        this.poprSettingsBufferArray[14] = poprSettings.test;
        this.poprSettingsBufferArray[15] = poprSettings.time;
        this.poprSettingsBufferArray[16] = poprSettings.showSSAO;
        this.poprSettingsBufferArray[17] = poprSettings.ssaoRadius;
        this.poprSettingsBufferArray[18] = poprSettings.ssaoBias;
        this.poprSettingsBufferArray[19] = poprSettings.ssaoMaxDelta;
        this.poprSettingsBufferArray[20] = poprSettings.fogStrength;
        this.poprSettingsBufferArray[21] = poprSettings.fogLightFactor;
        this.poprSettingsBufferArray[22] = poprSettings.showFog ? poprSettings.fogSteps : 0;
        this.poprSettingsBufferArray[23] = poprSettings.vignette;
        this.poprSettingsBufferArray[24] = poprSettings.vignetteRadius;
        this.poprSettingsBufferArray[25] = poprSettings.vignetteSoftness;
        this.poprSettingsBufferArray[26] = poprSettings.caX;
        this.poprSettingsBufferArray[27] = poprSettings.caY;
        this.poprSettingsBufferArray[28] = poprSettings.scanlines;
        this.poprSettingsBufferArray[29] = poprSettings.scanlinesDensity;
        this.poprSettingsBufferArray[30] = poprSettings.scanlinesSpeed;
        this.poprSettingsBufferArray[31] = poprSettings.environment;
        this.device.queue.writeBuffer(this.poprSettingsBuffer, 0, this.poprSettingsBufferArray.buffer);
        
        const cameraComponent = camera.getComponentOfType(Camera);
        let projectionMatrix = cameraComponent.projectionMatrix;
        let viewMatrix = new mat4();
        mat4.invert(viewMatrix, camera._transform.final);
        const { cameraUniformBuffer, cameraBindGroup } = this.prepareCamera(cameraComponent);
        this.cameraBuffer.set(viewMatrix, 0);
        this.cameraBuffer.set(projectionMatrix, 16);
        this.cameraBuffer.set(viewMatrix.invert(), 32);
        this.cameraBuffer.set(projectionMatrix.invert(), 48);
        this.cameraBuffer.set(camera._transform.final_position, 64);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, this.cameraBuffer.buffer);

        const target = this.context.getCurrentTexture().createView();
        const encoder = this.device.createCommandEncoder();

        this.prepareRender(scene);

        this.renderDeferred(encoder, cameraBindGroup, poprSettings);
            
        this.renderLights(encoder);

        if (poprSettings.showSkybox)
        {
            this.renderSkybox(encoder,cameraBindGroup, poprSettings);
        }

        this.renderLighting(encoder, cameraBindGroup, poprSettings);

        if (poprSettings.showBloom)
        {
            this.renderBloom(encoder, poprSettings);
        }

        this.renderPopr(encoder, target);
            
        if (poprSettings.debug)
        {
            this.renderDebug(encoder, target, cameraBindGroup);
        }
        
        this.clearDebug();

        if (poprSettings.showUI)
        {
            this.renderUI(encoder, target);
        }

        this.device.queue.submit([encoder.finish()]);
    }

    clearDebug()
    {
        this.debugLines.length = 0;
    }

    prepareRender(scene)
    {
        this.models.clear();
        this.skeletons.length = 0;
        this.skeletonToJoint.clear();
        let nInstances = 0;
        let nJoints = 0;
        this.lights.length = 0;
        for (const [entity, model] of scene.query(Model))
        {
            let data = this.models.get(model);
            if (!data) {
                data = { arr: [], instanceOffset: 0 };
                this.models.set(model, data);
            }

            const skeleton = entity._skeleton;
            if (skeleton) {
                if (this.skeletons.indexOf(skeleton) < 0)
                {
                    this.skeletons.push(skeleton);
                    this.skeletonToJoint.set(skeleton, nJoints);
                    nJoints += skeleton.joints.length;
                }
            }

            data.arr.push({ transform: entity._transform, skeleton });
            nInstances += 1;
        }

        for (const [entity, light] of scene.query(LightComponent))
        {
            this.lights.push(entity);
        }

        if (this.skeletons.length > 0)
        {
            if (this.jointsBuffer.ensureCapacity(nJoints, this.device))
            {
                this.skeletonBindGroup = this.device.createBindGroup({
                    layout: this.jointsBindGroupLayout,
                    entries: [ { binding: 0, resource: this.jointsBuffer.buffer } ],
                });
            }
            
            const joint_mat = new mat4(); 
            for (const skeleton of this.skeletons)
            {
                const jointI = this.skeletonToJoint.get(skeleton);
                for (let i = 0; i < skeleton.joints.length; i++)
                {
                    const transform = skeleton.joints[i]._transform;
                    mat4.mul(joint_mat, transform.final, skeleton.inverseBindMatrices[i]);
                    this.jointsBuffer.array.set(joint_mat, (jointI + i) * this.jointsBuffer.elementSize);
                }
            }

            this.device.queue.writeBuffer(this.jointsBuffer.buffer, 0, this.jointsBuffer.array);
        }

        const strideFloats = 32;
        if (this.instancesBuffer.ensureCapacity(nInstances, this.device))
        {
            this.floatView = new Float32Array(this.instancesBuffer.array);
            this.uintView  = new Int32Array(this.instancesBuffer.array);
        }

        let instanceOffset = 0;
        const inv_mat = new mat4();
        for (const [_, data] of this.models.entries())
        {
            data.instanceOffset = instanceOffset;
            instanceOffset += data.arr.length;
            for (let i = 0; i < data.arr.length; i++)
            {
                const { transform, skeleton } = data.arr[i];
                mat4.transpose(inv_mat, transform.inv_final);
                const index = (this.instancesBuffer.elementSize * (data.instanceOffset + i)) / 4;
                this.floatView.set(transform.final, index);
                this.floatView.set(inv_mat, index + 16);
                this.uintView[index + strideFloats] = skeleton ? (this.skeletonToJoint.get(skeleton) ?? -1) : -1;
            }
        }
        this.device.queue.writeBuffer(this.instancesBuffer.buffer, 0, this.instancesBuffer.array);
    }

    renderDeferred(encoder, cameraBindGroup, poprSettings)
    {
        { // depth prepass
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.defferedDepthTextureView,
                    depthClearValue: 1,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                },
            });

            renderPass.setPipeline(poprSettings.wireframe ? this.wireframedepthPassPipeline : this.depthPassPipeline);
            renderPass.setBindGroup(0, cameraBindGroup);
            renderPass.setBindGroup(1, this.skeletonBindGroup);

            for (const [model, data] of this.models.entries())
            {
                this.renderModel(model, data.instanceOffset, data.arr.length, renderPass, false);
            }

            renderPass.end();
        }

        { // actual pass
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.deferredBaseAndMetallicTextureView,
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                    {
                        view: this.deferredNormalEmissionRoughnessView,
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                    // {
                    //     view: this.deferredSubsurfaceSpecularSpecularTintClearcoatView,
                    //     clearValue: [ 0.0, 0.0, 0.0, 0.0 ],
                    //     loadOp: 'clear',
                    //     storeOp: 'store',
                    // },
                ],
                depthStencilAttachment: {
                    view: this.defferedDepthTextureView,
                    depthLoadOp: 'load',
                    depthStoreOp: 'store',
                },
            });

            renderPass.setPipeline(poprSettings.wireframe ? this.wireframePipeline : this.deferredPipeline);
            renderPass.setBindGroup(0, cameraBindGroup);
            renderPass.setBindGroup(1, this.skeletonBindGroup);

            for (const [model, data] of this.models.entries())
            {
                this.renderModel(model, data.instanceOffset, data.arr.length, renderPass, true);
            }

            renderPass.end();
        }
    }

    renderLights(encoder)
    {
        if (this.lights.length <= 0)
            return;
        
        if (this.lightsBuffer.ensureCapacity(this.lights.length, this.device))
        {
            this.lightsBindGroup = this.device.createBindGroup({
                layout: this.lightsBindGroupLayout,
                entries: [ { binding: 0, resource: this.lightsBuffer.buffer } ],
            });
        }

        let nShadowCastingLights = 0;
        const viewProj = mat4.create();
        for (let i = 0; i < this.lights.length; i++)
        {
            const light = this.lights[i];
            const bufI = i * this.lightsBuffer.elementSize;
            const shadowindex = light._light.shadows ? nShadowCastingLights++ : -1;
            const hasFalloff = light._light.type === 'directional' ? 0 : 1;
            mat4.mul(viewProj, this.lightsDefaultProjectionMatrix, light._transform.inv_final);
            this.lightsBuffer.array.set(viewProj, bufI);
            this.lightsBuffer.array.set(light._light.color, bufI + 16);
            this.lightsBuffer.array.set([light._light.intensity], bufI + 16 + 3);
            this.lightsBuffer.array.set(light._transform.final_position, bufI + 16 + 4);
            this.lightsBuffer.array.set([shadowindex], bufI + 16 + 4 + 3);
            this.lightsBuffer.array.set(light._transform.final_direction, bufI + 16 + 4 + 4);
            this.lightsBuffer.array.set([hasFalloff], bufI + 16 + 4 + 4 + 3);
            this.lightsBuffer.array.set([light._light.innerAngle], bufI + 16 + 4 + 4 + 4);
            this.lightsBuffer.array.set([light._light.outerAngle], bufI + 16 + 4 + 4 + 4 + 1);
        }

        this.device.queue.writeBuffer(this.lightsBuffer.buffer, 0, this.lightsBuffer.array);

        nShadowCastingLights = 0;
        for (let i = 0; i < this.lights.length; i++)
        {
            const light = this.lights[i];
            if (light._light.type !== "directional" || !light._light.shadows)
                continue;
            if (nShadowCastingLights > 8)
            {
                break;
            }

            const {lightUniformBuffer, lightUniformBufferArray, lightBindGroup} = this.prepareLight(light._light);
            lightUniformBufferArray.set(light._transform.inv_final, 0);
            lightUniformBufferArray.set(this.lightsDefaultProjectionMatrix, 16);
            this.device.queue.writeBuffer(lightUniformBuffer, 0, lightUniformBufferArray);

            const renderPass = encoder.beginRenderPass({
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.lightDepthTextureArrayViews[nShadowCastingLights],
                    depthClearValue: 1,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                },
            });

            renderPass.setPipeline(this.depthPassPipeline);
            renderPass.setBindGroup(0, lightBindGroup);
            renderPass.setBindGroup(1, this.skeletonBindGroup ?? this.dummySkeletonBindGroup);

            for (const [model, data] of this.models.entries())
            {
                this.renderModel(model, data.instanceOffset, data.arr.length, renderPass, false);
            }

            renderPass.end();
            
            nShadowCastingLights++;
        }
    }

    renderLighting(encoder, cameraBindGroup, poprSettings)
    {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.fogTextureView,
                    clearValue: [ 0.0, 0.0, 0.0, 1.0 ],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });

        renderPass.setPipeline(this.fogPipeline);
        renderPass.setBindGroup(0, cameraBindGroup);
        renderPass.setBindGroup(1, this.lightingBindGroup);
        renderPass.setBindGroup(2, this.fogBindGroup);
        renderPass.setBindGroup(3, this.lightsBindGroup);
        renderPass.draw(6);

        renderPass.end();

        {
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.lightingTextureView,
                        clearValue: [ 0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            });

            renderPass.setPipeline(this.lightingPipeline);
            renderPass.setBindGroup(0, cameraBindGroup);
            renderPass.setBindGroup(1, this.lightingBindGroup);
            renderPass.setBindGroup(2, this.deferredTargetsBindGroup);
            renderPass.setBindGroup(3, this.lightsBindGroup);
            renderPass.draw(6);

            renderPass.end();
        }
    }

    renderSkybox(encoder, cameraBindGroup, poprSettings)
    {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.deferredBaseAndMetallicTextureView,
                    loadOp: 'load',
                    storeOp: 'store',
                },
                {
                    view: this.deferredNormalEmissionRoughnessView,
                    loadOp: 'load',
                    storeOp: 'store',
                },
                // {
                //     view: this.deferredSubsurfaceSpecularSpecularTintClearcoatView,
                //     loadOp: 'load',
                //     storeOp: 'store',
                // },
            ],
            depthStencilAttachment: {
                view: this.defferedDepthTextureView,
                depthLoadOp: 'load',
                depthStoreOp: 'store',
            },
        });

        renderPass.setPipeline(this.skyboxPipeline);
        renderPass.setBindGroup(0, cameraBindGroup);
        renderPass.setBindGroup(1, poprSettings.debug ? this.irradianceBindGroup : this.skyboxBindGroup);
        renderPass.draw(36);

        renderPass.end();
    }

    renderBloom(encoder, poprSettings)
    {
        let paramsBufferOffset = 0;
        const updateBuffer = (width, height, filterRadius, threshold, bufferOffset) =>
        {
            this.bloomParamsBufferArray[0] = width;
            this.bloomParamsBufferArray[1] = height;
            this.bloomParamsBufferArray[2] = filterRadius;
            this.bloomParamsBufferArray[3] = threshold;
            this.bloomParamsBufferArray[4] = poprSettings.bloomStrength;
            this.device.queue.writeBuffer(
                this.bloomParamsBuffer,
                bufferOffset,
                this.bloomParamsBufferArray,
                0,
                24
            );
        }

        { // downsample
            let input = { 
                bindGroup: this.tonemapTextureBindGroup, 
                width: this.bloomTextures[0].width * 2, 
                height: this.bloomTextures[1].height * 2
            };

            for (let i = 0; i < this.bloomTextures.length; i++)
            {
                updateBuffer(input.width, input.height, 0.0, i == 0 ? poprSettings.bloom.threshold : 0.0, paramsBufferOffset);

                const output = this.bloomTextures[i];
                const renderPass = encoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: output.view,
                            clearValue: [0.0, 0.0, 0.0, 1.0 ],
                            loadOp: 'clear',
                            storeOp: 'store',
                        },
                    ],
                });
                renderPass.setPipeline(this.downsamplePipeline);
                renderPass.setBindGroup(0, input.bindGroup);
                renderPass.setBindGroup(1, this.filteringSamplerBindGroup);
                renderPass.setBindGroup(2, this.bloomConstantsBindGroup, [paramsBufferOffset]);
                renderPass.draw(6);
                renderPass.end();

                paramsBufferOffset += this.bloomParamsStride;
                input = output;
            }
        }
        
        { // upsample
            for (let i = this.bloomTextures.length - 1; i > 0; i--)
            {
                const input = this.bloomTextures[i];
                const output = this.bloomTextures[i - 1];

                updateBuffer(input.width, input.height, poprSettings.bloom.filterRadius * (1.0 / input.width), 0.0, paramsBufferOffset);

                const renderPass = encoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: output.view,
                            loadOp: 'load',
                            storeOp: 'store',
                        },
                    ],
                });
                renderPass.setPipeline(this.upsamplePipeline);
                renderPass.setBindGroup(0, input.bindGroup);
                renderPass.setBindGroup(1, this.filteringSamplerBindGroup);
                renderPass.setBindGroup(2, this.bloomConstantsBindGroup, [paramsBufferOffset]);
                renderPass.draw(6);
                renderPass.end();

                paramsBufferOffset += this.bloomParamsStride;
            }
        }
    }

    renderPopr(encoder, target)
    {
        { // tonemap
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.colorTextureView,
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            });

            renderPass.setPipeline(this.tonemapPipeline);
            renderPass.setBindGroup(0, this.tonemapTextureBindGroup);
            renderPass.setBindGroup(1, this.poprConstantsBindGroup);
            renderPass.setBindGroup(2, this.bloomTextures[0].bindGroup);
            renderPass.draw(6);

            renderPass.end();
        }

        { // popr
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: target,
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            });

            renderPass.setPipeline(this.poprPipeline);
            renderPass.setBindGroup(0, this.poprTextureBindGroup);
            renderPass.setBindGroup(1, this.poprConstantsBindGroup);
            renderPass.draw(6);

            renderPass.end();
        }
    }

    renderDebug(encoder, target, cameraBindGroup)
    {
        if (this.debugLines.length <= 0)
            return;

        this.debugLinesBuffer.ensureCapacity(this.debugLines.length, this.device);

        for (let i = 0; i < this.debugLines.length; i++) {
            const line = this.debugLines[i];
            this.debugLinesBuffer.array.set(line.start, i * 12);
            this.debugLinesBuffer.array.set(line.end, i * 12 + 4);
            this.debugLinesBuffer.array.set(line.color, i * 12 + 8);
        }

        this.device.queue.writeBuffer(this.debugLinesBuffer.buffer, 0, this.debugLinesBuffer.array);

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: target,
                    loadOp: 'load',
                    storeOp: 'store',
                },
            ]
        });

        renderPass.setPipeline(this.debugPipeline);
        renderPass.setBindGroup(0, cameraBindGroup);
        renderPass.setVertexBuffer(0, this.debugLinesBuffer.buffer);
        renderPass.draw(2, this.debugLines.length);

        renderPass.end();
    }

    renderUI(encoder, target)
    {
        // collect instances (only the randomRectForNow)
        let nUIInstances = 1;
        this.uiInstancesBuffer.ensureCapacity(nUIInstances, this.device);

        this.uiInstancesBuffer.array.set(DeferredRenderer.randomRectangle.position, 0);
        this.uiInstancesBuffer.array.set(DeferredRenderer.randomRectangle.scale, 4);
        this.device.queue.writeBuffer(this.uiInstancesBuffer.buffer, 0, this.uiInstancesBuffer.array);

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: target,
                    loadOp: 'load',
                    storeOp: 'store',
                },
            ]
        });

        renderPass.setPipeline(this.uiPipeline);
        renderPass.setVertexBuffer(0, this.uiInstancesBuffer.buffer);
        renderPass.draw(6, 1);

        renderPass.end();
    }

    renderModel(model, instanceOffset, nInstances, renderPass, materials) {
        for (const [material, primitives] of model.primitivesByMaterial.entries()) {
            
            if (materials)
            {
                const { materialBindGroup } = this.prepareMaterial(material ?? this.dummyMaterial);
                renderPass.setBindGroup(2, materialBindGroup);
            }

            // TODO: these primitives should be joined into one probably
            for (const primitive of primitives)
            {
                this.renderPrimitive(primitive, instanceOffset, nInstances, renderPass);
            }
        }
    }

    renderPrimitive(primitive, instanceOffset, nInstances, renderPass) {
        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setVertexBuffer(1, this.instancesBuffer.buffer);
        renderPass.setIndexBuffer(indexBuffer, 'uint32');

        renderPass.drawIndexed(primitive.mesh.indices.length, nInstances, 0, 0, instanceOffset);
    }

    prepareCamera(camera) {
        if (this.gpuObjects.has(camera)) {
            return this.gpuObjects.get(camera);
        }

        const cameraUniformBuffer = this.device.createBuffer({
            size: (16 + 16 + 16 + 16 + 4) * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const cameraBindGroup = this.device.createBindGroup({
            layout: this.cameraBindGroupLayout,
            entries: [ { binding: 0, resource: cameraUniformBuffer } ],
        });

        const gpuObjects = { cameraUniformBuffer, cameraBindGroup };
        this.gpuObjects.set(camera, gpuObjects);
        return gpuObjects;
    }

    prepareLight(light)
    {
        if (this.gpuObjects.has(light)) {
            return this.gpuObjects.get(light);
        }

        const lightUniformBufferArray = new Float32Array(16 + 16 + 16 + 16 + 4);
        const lightUniformBuffer = WebGPU.createBuffer(this.device, {
            data: lightUniformBufferArray,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const lightBindGroup = this.device.createBindGroup({
            layout: this.cameraBindGroupLayout,
            entries: [
                { binding: 0, resource: lightUniformBuffer },
            ],
        });

        const gpuObjects = { lightUniformBuffer, lightBindGroup, lightUniformBufferArray };
        this.gpuObjects.set(light, gpuObjects);
        return gpuObjects;
    }

    prepareTexture(texture, isSRGB, screen) {
        if (this.gpuObjects.has(texture)) {
            return this.gpuObjects.get(texture);
        }

        let { gpuTexture } = this.prepareImage(texture.image, isSRGB);
        if (screen){
            gpuTexture = this.lightingTexture;
        }
        const { gpuSampler } = this.prepareSampler(texture.sampler);

        const gpuObjects = { gpuTexture, gpuSampler };
        this.gpuObjects.set(texture, gpuObjects);
        return gpuObjects;
    }

    prepareMaterial(material) {
        if (this.gpuObjects.has(material)) {
            return this.gpuObjects.get(material);
        }

        if (!material.baseTexture) 
        {
            material.baseTexture = this.dummyMaterial.baseTexture;
        }
        
        const baseTexture = this.prepareTexture(material.baseTexture, true, material.screen); // base is always srgb

        this.materialBuffer.set(material.base, 0);
        this.materialBuffer[3] = material.metallic;
        this.materialBuffer[4] = material.clearcoat;
        this.materialBuffer[5] = material.roughness;
        this.materialBuffer[6] = material.emission;
        // this.materialBuffer[5] = material.subsurface;
        // this.materialBuffer[6] = material.specular;
        // this.materialBuffer[7] = material.specularTint;
        // this.materialBuffer[8] = material.clearcoat;

        const materialUniformBuffer = WebGPU.createBuffer(this.device, {
            data: this.materialBuffer,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const materialBindGroup = this.device.createBindGroup({
            layout: this.materialBindGroupLayout,
            entries: [
                { binding: 0, resource: baseTexture.gpuTexture },
                { binding: 1, resource: baseTexture.gpuSampler },
                { binding: 2, resource: materialUniformBuffer },
            ],
        });

        const gpuObjects = { materialBindGroup };
        this.gpuObjects.set(material, gpuObjects);
        return gpuObjects;
    }

    createBindGroupLayout(entries)
    {
        const indexed = entries.map((e, i) => ({ ...e, binding: i }));
        return this.device.createBindGroupLayout({ entries: indexed });
    }

    static Draw3DLine(start, end, color = [1.0, 0.0, 1.0])
    {
        DeferredRenderer.s.debugLines.push({ start, end, color});
    }

    static DrawAxis(start, size)
    {
        DeferredRenderer.s.debugLines.push({ start, end: [start[0] + size, start[1], start[2]], color: [1.0, 0.0, 0.0]});
        DeferredRenderer.s.debugLines.push({ start, end: [start[0], start[1] + size, start[2]], color: [0.0, 1.0, 0.0]});
        DeferredRenderer.s.debugLines.push({ start, end: [start[0], start[1], start[2] + size], color: [0.0, 0.0, 1.0]});
    }

    static Draw3DBoxMinMax(min, max, mat = null, color = [1.0, 0.0, 1.0]) 
    {
        const center = vec3.fromValues((min[0] + max[0]) * 0.5, (min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5);
        const c = [
            vec3.fromValues(min[0], min[1], min[2]),
            vec3.fromValues(max[0], min[1], min[2]),
            vec3.fromValues(max[0], max[1], min[2]),
            vec3.fromValues(min[0], max[1], min[2]),
            vec3.fromValues(min[0], min[1], max[2]),
            vec3.fromValues(max[0], min[1], max[2]),
            vec3.fromValues(max[0], max[1], max[2]),
            vec3.fromValues(min[0], max[1], max[2]),
        ];

        if (mat)
        {
            for (let i = 0; i < c.length; i++) {
                vec3.sub(c[i], c[i], center);
                vec3.transformMat4(c[i], c[i], mat);
                vec3.add(c[i], c[i], center);
            }
        }

        DeferredRenderer.Draw3DLine(c[0], c[1], color);
        DeferredRenderer.Draw3DLine(c[1], c[2], color);
        DeferredRenderer.Draw3DLine(c[2], c[3], color);
        DeferredRenderer.Draw3DLine(c[3], c[0], color);

        DeferredRenderer.Draw3DLine(c[4], c[5], color);
        DeferredRenderer.Draw3DLine(c[5], c[6], color);
        DeferredRenderer.Draw3DLine(c[6], c[7], color);
        DeferredRenderer.Draw3DLine(c[7], c[4], color);

        DeferredRenderer.Draw3DLine(c[0], c[4], color);
        DeferredRenderer.Draw3DLine(c[1], c[5], color);
        DeferredRenderer.Draw3DLine(c[2], c[6], color);
        DeferredRenderer.Draw3DLine(c[3], c[7], color);
    }

    static Draw3DBoxPosScale(pos, scale, mat = null, color = [1.0, 0.0, 1.0])
     {
        DeferredRenderer.Draw3DBoxMinMax(
            [ pos[0] - scale[0], pos[1] - scale[1], pos[2] - scale[2] ], 
            [ pos[0] + scale[0], pos[1] + scale[1], pos[2] + scale[2] ], 
            mat, color
        );
    }

    static Draw3DBox(mat, color = [1.0, 0.0, 1.0]) 
    {
        DeferredRenderer.Draw3DBoxMinMax([-1, -1, -1], [1, 1, 1], mat, color);
    }
}

const vertexBufferLayout = {
    arrayStride: 40,
    stepMode: 'vertex',
    attributes: [
        {
            name: 'position',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
        },
        {
            name: 'normal',
            shaderLocation: 1,
            offset: 12,
            format: 'float32x3',
        },
        {
            name: 'texcoords',
            shaderLocation: 2,
            offset: 24,
            format: 'float32x2',
        },
        {
            name: 'joints',
            shaderLocation: 3,
            offset: 32,
            format: 'uint8x4',
        },
        {
            name: 'weights',
            shaderLocation: 4,
            offset: 36,
            format: 'unorm8x4',
        },
    ],
};

const instanceBufferLayout = {
    arrayStride: 132,
    stepMode: 'instance',
    attributes: [
        {
            name: 'row1',
            shaderLocation: 5,
            offset: 0,
            format: 'float32x4',
        },
        {
            name: 'row2',
            shaderLocation: 6,
            offset: 16,
            format: 'float32x4',
        },
        {
            name: 'row3',
            shaderLocation: 7,
            offset: 32,
            format: 'float32x4',
        },
        {
            name: 'row4',
            shaderLocation: 8,
            offset: 48,
            format: 'float32x4',
        },
        {
            name: 'inv_row1',
            shaderLocation: 9,
            offset: 64,
            format: 'float32x4',
        },
        {
            name: 'inv_row2',
            shaderLocation: 10,
            offset: 80,
            format: 'float32x4',
        },
        {
            name: 'inv_row3',
            shaderLocation: 11,
            offset: 96,
            format: 'float32x4',
        },
        {
            name: 'inv_row4',
            shaderLocation: 12,
            offset: 112,
            format: 'float32x4',
        },
        {
            name: 'jointI',
            shaderLocation: 13,
            offset: 128,
            format: 'sint32',
        },
    ],
};

const uiInstanceBufferLayout = {
    arrayStride: 32,
    stepMode: 'instance',
    attributes: [
        {
            name: 'position',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x4',
        },
        {
            name: 'scale',
            shaderLocation: 1,
            offset: 16,
            format: 'float32x4',
        },
    ],
};

const debugInstanceBufferLayout = {
    arrayStride: 48,
    stepMode: 'instance',
    attributes: [
        {
            name: 'from',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x4',
        },
        {
            name: 'to',
            shaderLocation: 1,
            offset: 16,
            format: 'float32x4',
        },
        {
            name: 'color',
            shaderLocation: 2,
            offset: 32,
            format: 'float32x4',
        },
    ],
};

const uniformBufferBindGroupEntry = {
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: { type: "uniform" },
};

const storageBufferBindGroupEntry = {
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
    buffer: {
        type: "read-only-storage",
    },
};

const textureBindGroupEntry = {
    visibility: GPUShaderStage.FRAGMENT,
    texture: {
        viewDimension: "2d",
        sampleType: "float",
    },
};

const depthTextureBindGroupEntry = {
    visibility: GPUShaderStage.FRAGMENT,
    texture: {
        viewDimension: "2d",
        sampleType: "depth",
    },
};

const depthArrayTextureBindGroupEntry = {
    visibility: GPUShaderStage.FRAGMENT,
    texture: {
        viewDimension: "2d-array",
        sampleType: "depth",
    },
};

const cubemapBindGroupEntry = {
    visibility: GPUShaderStage.FRAGMENT,
    texture: {
        viewDimension: "cube",
        sampleType: "float",
    },
};

const filteringSamplerBindGroupEntry =  {
    visibility: GPUShaderStage.FRAGMENT,
    sampler: { type: "filtering" },
};

const comparisonSamplerBindGroupEntry = {
    visibility: GPUShaderStage.FRAGMENT,
    sampler: { type: "comparison" },
};