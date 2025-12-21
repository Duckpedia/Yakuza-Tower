import { mat4, vec2 } from 'glm';

import * as WebGPU from '../../engine/WebGPU.js';

import { Camera, Material, Sampler, Texture } from '../../engine/core/core.js';

import {
    getGlobalViewMatrix,
    getProjectionMatrix,
} from '../../engine/core/SceneUtils.js';

import { BaseRenderer } from '../../engine/renderers/BaseRenderer.js';
import { ImageLoader } from '../../engine/loaders/ImageLoader.js';
import { quat, vec3, vec4 } from '../../lib/glm.js';

export class DeferredRendererSettings {
    constructor()
    {
        this.pass = 0;
        this.showUI = true;
        this.showSkybox = true;
        this.showBloom = true;
        this.bloom = {
            threshold: 1.3,
            strength: 0.012,
            filterRadius: 1.0,
            dirtStrength: 0.0,
        },
        this.tonemapping = {
            index: 1,
            agxSlope: [1.0, 1.0, 1.0],
            agxPower: [1.35, 1.35, 1.35],
            agxSat: 1.4
        }
        this.blackAndWhite = false;
        this.wireframe = false;
    }
}

export class DeferredRenderer extends BaseRenderer {

    static randomRectangle = { position: new vec2(0.25, 0.25), scale: new vec2(0.5, 0.5) };

    constructor(canvas) {
        super(canvas);
    }

    async initialize(defaultTextureImage, dirtImage) {
        await super.initialize(defaultTextureImage);

        await this.setUpDefaults();
        await this.setUpSkybox();
        await this.setUpDeferred();
        await this.setUpAABB();
        await this.setUpPopr(dirtImage);
        await this.setUpUI();

        this.recreateRenderTargets();
    }

    async setUpUI()
    {
        const code = await fetch(new URL('UI.wgsl', import.meta.url)).then(response => response.text());
        const module = this.device.createShaderModule({ code: code });
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

        this.uiInstancesBuffer = WebGPU.createBuffer(this.device, {
            data: new Float32Array([0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    async setUpDefaults() {
        this.materialBuffer = new Float32Array(6);
        this.cameraBuffer = new Float32Array(16 + 16 + 4);
        this.models = new Map();
        this.skeletonToJoint = new Map();
        this.maxJoints = 0;
        this.maxInstances = 0;
        this.maxUIInstances = 0;
        this.maxLights = 0;
        this.maxAABBs = 0;
        this.jointsBufferArray = null;
        this.lightsBufferArray = null;
        this.instancesBufferArray = null;
        this.uiInstancesBufferArray = null;
        this.poprSettingsBufferArray = new Float32Array(4 + 4 + 4 + 4);
        this.aabbsInstancesBufferArray = new Float32Array(16);
        this.jointsBuffer = null;
        this.lightsBuffer = null;
        this.instancesBuffer = null;
        this.uiInstancesBuffer = null;
        this.poprSettingsBuffer = null;
        this.boxInstancesBuffer = null;
        this.skeletons = [];
        this.lights = [];
        this.aabbs = [];
        this.lightsDefaultProjectionMatrix = mat4.perspectiveZO(mat4.create(), 30 * 0.0174532925, 1, 0.1, 100);
        this.nShadowCastingLights = 0;
        this.poprSettingsBindGroup = null;
        this.bloomTextures = [];
    }

    async setUpDeferred() {
        const deferredCode = await fetch(new URL('Deferred.wgsl', import.meta.url)).then(response => response.text());
        const deferredModule = this.device.createShaderModule({ code: deferredCode });
        const deferredPipelineOptions = {
            label: 'deferred',
            layout: 'auto',
            vertex: {
                module: deferredModule,
                buffers: [ vertexBufferLayout, instanceBufferLayout ],
            },
            fragment: {
                module: deferredModule,
                targets: [{ format: 'bgra8unorm', }, { format: 'rgba16float', }, { format: 'rgba16float', }],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
            primitive: {
                frontFace: 'ccw',
                cullMode: 'back'
            }
        };
        this.deferredPipeline = await this.device.createRenderPipelineAsync(deferredPipelineOptions);
        deferredPipelineOptions.primitive.topology = 'line-list';
        this.deferredWireframePipeline = await this.device.createRenderPipelineAsync(deferredPipelineOptions);

        this.lightsPipeline = await this.device.createRenderPipelineAsync({
            label: 'deferred',
            layout: 'auto',
            vertex: {
                module: deferredModule,
                buffers: [ vertexBufferLayout, instanceBufferLayout ],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
            primitive: {
                frontFace: 'ccw',
                cullMode: 'front'
            }
        });

        const lightingCode = await fetch(new URL('Lighting.wgsl', import.meta.url)).then(response => response.text());
        const lightingModule = this.device.createShaderModule({ code: lightingCode });
        this.lightingPipeline = await this.device.createRenderPipelineAsync({
            label: 'lighting',
            layout: 'auto',
            vertex: {
                module: lightingModule,
            },
            fragment: {
                module: lightingModule,
                targets: [{ format: 'rgba16float' }],
            },
        });

        this.dummySkeletonBuffer = WebGPU.createBuffer(this.device, {
            data: new Float32Array(16),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.dummySkeletonBindGroup = this.device.createBindGroup({
            layout: this.deferredPipeline.getBindGroupLayout(1),
            entries: [ { binding: 0, resource: { buffer: this.dummySkeletonBuffer } } ],
        });
        this.dummyLightsSkeletonBindGroup = this.device.createBindGroup({
            layout: this.lightsPipeline.getBindGroupLayout(1),
            entries: [ { binding: 0, resource: this.dummySkeletonBuffer } ],
        });
        
        this.lightsBuffer = WebGPU.createBuffer(this.device, {
            data: new Float32Array(16 + 4 + 4 + 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.lightsBindGroup = this.device.createBindGroup({
            layout: this.lightingPipeline.getBindGroupLayout(3),
            entries: [ { binding: 0, resource: this.lightsBuffer } ],
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

        this.lightingBindGroup = this.device.createBindGroup({
            layout: this.lightingPipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: this.poprSettingsBuffer },
                { binding: 1, resource: this.lightDepthTextureArrayView },
                { binding: 2, resource: this.lightDepthSampler },
            ],
        });

        this.instancesBufferArray = new ArrayBuffer(16 + 16 + 4);
        this.instanceBuffer = WebGPU.createBuffer(this.device, {
            data: this.instancesBufferArray,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
    }

    async setUpAABB()
    {
        const code = await fetch(new URL('AABB.wgsl', import.meta.url)).then(response => response.text());
        const module = this.device.createShaderModule({ code });
        this.aabbPipeline = await this.device.createRenderPipelineAsync({
            label: 'aabb',
            layout: 'auto',
            vertex: {
                module,
                buffers: [ aabbInstanceBufferLayout ],
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
        this.poprTextureBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d",
                        multisampled: false,
                    },
                },
            ],
        });

        const poprConstantsBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: "filtering",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: "float",
                        viewDimension: "2d",
                        multisampled: false,
                    },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform"
                    },
                },
            ],
        });

        const bloomParamsBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                        hasDynamicOffset: true,
                        minBindingSize: 24, 
                    },
                },
            ],
        });

        const tonemapLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.poprTextureBindGroupLayout,
                poprConstantsBindGroupLayout,
                this.poprTextureBindGroupLayout,
                bloomParamsBindGroupLayout,
            ],
        });

        const bloomLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.poprTextureBindGroupLayout,
                poprConstantsBindGroupLayout,
                null,
                bloomParamsBindGroupLayout,
            ],
        });

        const code = await fetch(new URL('Popr.wgsl', import.meta.url)).then(response => response.text());
        const module = this.device.createShaderModule({ code });
        this.tonemapPipeline = await this.device.createRenderPipelineAsync({
            label: 'tonemap',
            layout: tonemapLayout,
            vertex: {
                module,
            },
            fragment: {
                module,
                entryPoint: 'tonemap',
                targets: [{ format: this.format }],
            },
        });

        this.downsamplePipeline = await this.device.createRenderPipelineAsync({
            label: 'downsample',
            layout: bloomLayout,
            vertex: {
                module,
            },
            fragment: {
                module,
                entryPoint: 'downsample',
                targets: [{ format: 'rgba16float' }],
            },
        });

        this.upsamplePipeline = await this.device.createRenderPipelineAsync({
            label: 'upsample',
            layout: bloomLayout,
            vertex: {
                module,
            },
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

        this.linearTextureSampler = this.device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });

        this.dirtTexture = WebGPU.createTexture(this.device, {
            source: dirtImage,
            format: 'rgba8unorm',
        });

        this.poprConstantsBindGroup = this.device.createBindGroup({
            layout: poprConstantsBindGroupLayout,
            entries: [
                { binding: 0, resource: this.linearTextureSampler },
                { binding: 1, resource: this.dirtTexture.createView() },
                { binding: 2, resource: this.poprSettingsBuffer }
            ],
        });

        this.bloomParamsStride = this.device.limits.minUniformBufferOffsetAlignment;
        this.maxBloomPasses = 5 * 2;
        this.bloomParamsBufferArray = new Float32Array((this.bloomParamsStride / 4) * this.maxBloomPasses);

        this.bloomParamsBuffer = this.device.createBuffer({
            size: this.bloomParamsStride * this.maxBloomPasses,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.bloomParamsBindGroup = this.device.createBindGroup({
            layout: bloomParamsBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this.bloomParamsBuffer, offset: 0, size: 24 },
            }],
        });
    }

    async setUpSkybox() {
        const skyboxCode = await fetch(new URL('Skybox.wgsl', import.meta.url)).then(response => response.text());
        const skyboxModule = this.device.createShaderModule({ code: skyboxCode });
        this.skyboxPipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: { module: skyboxModule },
            fragment: { 
                module: skyboxModule,
                targets: [{
                    format: this.format,
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
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: false,
                depthCompare: 'less-equal',
            },
        });
        const imageLoader = new ImageLoader();
        const environmentImages = await Promise.all([
            'posx.jpg',
            'negx.jpg',
            'posy.jpg',
            'negy.jpg',
            'posz.jpg',
            'negz.jpg',
        ].map(url => imageLoader.load(url)));

        this.environmentSampler = this.device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear',
        });
        this.environmentTexture = this.device.createTexture({
            size: [environmentImages[0].width, environmentImages[0].height, 6],
            format: 'rgba8unorm',
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });

        for (let i = 0; i < environmentImages.length; i++) {
            this.device.queue.copyExternalImageToTexture(
                { source: environmentImages[i] },
                { texture: this.environmentTexture, origin: [0, 0, i] },
                [environmentImages[i].width, environmentImages[i].height],
            );
        }

        this.skyboxBindGroup = this.device.createBindGroup({
            layout: this.skyboxPipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: this.environmentTexture.createView({ dimension: 'cube' }) },
                { binding: 1, resource: this.environmentSampler },
            ],
        });
    }

    recreateRenderTargets() {
        this.defferedDepthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.defferedDepthTextureView = this.defferedDepthTexture.createView();

        this.deferredAlbedoTexture = this.device.createTexture({
            format: 'bgra8unorm',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredAlbedoTextureView = this.deferredAlbedoTexture.createView();

        this.deferredPositionTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredPositionTextureView = this.deferredPositionTexture.createView();

        this.deferredNormalTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredNormalTextureView = this.deferredNormalTexture.createView();

        this.deferredTargetsBindGroup = this.device.createBindGroup({
            layout: this.lightingPipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: this.deferredAlbedoTextureView, },
                { binding: 1, resource: this.deferredPositionTextureView, },
                { binding: 2, resource: this.deferredNormalTextureView, },
            ],
        });
        
        this.lightingTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.lightingTextureView = this.lightingTexture.createView();

        this.lightingTextureBindGroup = this.device.createBindGroup({
            layout: this.tonemapPipeline.getBindGroupLayout(0),
            entries: [ { binding: 0, resource: this.lightingTextureView } ],
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

    render(entities, camera, poprSettings) {
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
        this.device.queue.writeBuffer(this.poprSettingsBuffer, 0, this.poprSettingsBufferArray.buffer);
        
        const cameraComponent = camera.getComponentOfType(Camera);
        const { cameraUniformBuffer, deferredCameraBindGroup, lightingCameraBindGroup, skyboxCameraBindgroup, aabbCameraBindGroup } = this.prepareCamera(cameraComponent);
        this.cameraBuffer.set(getGlobalViewMatrix(camera), 0);
        this.cameraBuffer.set(getProjectionMatrix(camera), 16);
        this.cameraBuffer.set(camera._transform.final_position, 32);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, this.cameraBuffer.buffer);

        const target = this.context.getCurrentTexture().createView();
        const encoder = this.device.createCommandEncoder();

        this.renderDeferred(encoder, entities, deferredCameraBindGroup, poprSettings);
            
        this.renderLights(encoder);

        this.renderLighting(encoder, lightingCameraBindGroup);

        if (poprSettings.showBloom)
        {
            this.renderBloom(encoder, poprSettings);
        }

        this.renderTonemap(encoder, target);
            
        if (poprSettings.showSkybox)
        {
            this.renderSkybox(encoder, target, skyboxCameraBindgroup);
        }
        
        this.renderAABBs(encoder, target, aabbCameraBindGroup);

        if (poprSettings.showUI)
        {
            this.renderUI(encoder, target);
        }

        this.device.queue.submit([encoder.finish()]);
    }

    renderDeferred(encoder, entities, deferredCameraBindGroup, poprSettings)
    {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.deferredAlbedoTextureView,
                    clearValue: [0.0, 0.0, 0.0, 1.0 ],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.deferredPositionTextureView,
                    clearValue: [0.0, 0.0, 0.0, 1.0 ],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
                {
                    view: this.deferredNormalTextureView,
                    clearValue: [0.0, 0.0, 0.0, 1.0 ],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.defferedDepthTextureView,
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        renderPass.setPipeline(poprSettings.wireframe ? this.deferredWireframePipeline : this.deferredPipeline);
        renderPass.setBindGroup(0, deferredCameraBindGroup);

        this.renderEntities(entities, renderPass);

        renderPass.end();
    }

    renderLights(encoder)
    {
        if (this.lights.length <= 0)
            return;
        
        const stride = 16 + 4 + 4 + 4;
        if (this.maxLights < this.lights.length)
        {
            this.maxLights = this.lights.length;
            this.lightsBufferArray = new Float32Array(this.lights.length * stride);
            this.lightsBuffer = WebGPU.createBuffer(this.device, {
                size: this.lightsBufferArray.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            this.lightsBindGroup = this.device.createBindGroup({
                layout: this.lightingPipeline.getBindGroupLayout(3),
                entries: [ { binding: 0, resource: this.lightsBuffer } ],
            });
        }

        let nShadowCastingLights = 0;
        const viewProj = mat4.create();
        for (let i = 0; i < this.lights.length; i++)
        {
            const light = this.lights[i];
            const bufI = i * stride;
            const shadowindex = light._light.shadows ? nShadowCastingLights++ : -1;
            const hasFalloff = light._light.type === 'point' ? 1 : 0;
            mat4.mul(viewProj, this.lightsDefaultProjectionMatrix, light._transform.inv_final);
            this.lightsBufferArray.set(viewProj, bufI);
            this.lightsBufferArray.set(light._light.color, bufI + 16);
            this.lightsBufferArray.set([light._light.intensity], bufI + 16 + 3);
            this.lightsBufferArray.set(light._transform.final_position, bufI + 16 + 4);
            this.lightsBufferArray.set([shadowindex], bufI + 16 + 4 + 4);
            this.lightsBufferArray.set([hasFalloff], bufI + 16 + 4 + 4 + 1);
        }

        this.device.queue.writeBuffer(this.lightsBuffer, 0, this.lightsBufferArray);

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

            renderPass.setPipeline(this.lightsPipeline);
            renderPass.setBindGroup(0, lightBindGroup);
            renderPass.setBindGroup(1, this.lightsSkeletonBindGroup ?? this.dummyLightsSkeletonBindGroup);

            for (const [model, data] of this.models.entries())
            {
                this.renderModel(model, data.instanceOffset, data.arr.length, renderPass, false);
            }

            renderPass.end();
            
            nShadowCastingLights++;
        }
    }

    renderLighting(encoder, lightingCameraBindGroup)
    {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.lightingTextureView,
                    clearValue: [0.0, 0.0, 0.0, 1.0 ],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });

        renderPass.setPipeline(this.lightingPipeline);
        renderPass.setBindGroup(0, lightingCameraBindGroup);
        renderPass.setBindGroup(1, this.lightingBindGroup);
        renderPass.setBindGroup(2, this.deferredTargetsBindGroup);
        renderPass.setBindGroup(3, this.lightsBindGroup);
        renderPass.draw(6);

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
                bindGroup: this.lightingTextureBindGroup, 
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
                renderPass.setBindGroup(1, this.poprConstantsBindGroup);
                renderPass.setBindGroup(3, this.bloomParamsBindGroup, [paramsBufferOffset]);
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
                renderPass.setBindGroup(1, this.poprConstantsBindGroup);
                renderPass.setBindGroup(3, this.bloomParamsBindGroup, [paramsBufferOffset]);
                renderPass.draw(6);
                renderPass.end();

                paramsBufferOffset += this.bloomParamsStride;
            }
        }
    }

    renderTonemap(encoder, target)
    {
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

        renderPass.setPipeline(this.tonemapPipeline);
        renderPass.setBindGroup(0, this.lightingTextureBindGroup);
        renderPass.setBindGroup(1, this.poprConstantsBindGroup);
        renderPass.setBindGroup(2, this.bloomTextures[0].bindGroup);
        renderPass.setBindGroup(3, this.bloomParamsBindGroup, [0]);
        renderPass.draw(6);

        renderPass.end();
    }

    renderSkybox(encoder, target, skyboxCameraBindgroup)
    {
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: target,
                    loadOp: 'load',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.defferedDepthTextureView,
                depthLoadOp: 'load',
                depthStoreOp: 'discard',
            },
        });

        renderPass.setPipeline(this.skyboxPipeline);
        renderPass.setBindGroup(0, skyboxCameraBindgroup);
        renderPass.setBindGroup(1, this.skyboxBindGroup);
        renderPass.draw(36);

        renderPass.end();
    }

    renderAABBs(encoder, target, aabbCameraBindGroup)
    {
        if (this.aabbs.length <= 0)
            return;

        if (this.maxAABBs < this.aabbs.length)
        {
            this.maxAABBs = this.aabbs.length;
            this.aabbsInstancesBufferArray = new Float32Array(this.aabbs.length * 16);
            this.aabbsInstancesBuffer = WebGPU.createBuffer(this.device, {
                size: this.aabbsInstancesBufferArray.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }

        const mat = new mat4();
        const position = vec3.create();
        const scale = vec3.create();
        const center = vec3.create();
        const half = vec3.create();

        for (let i = 0; i < this.aabbs.length; i++) {
            const entity = this.aabbs[i];

            mat4.getTranslation(position, entity._transform.final);
            mat4.getScaling(scale, entity._transform.final);

            const min = entity.aabb.min;
            const max = entity.aabb.max;

            center[0] = (min[0] + max[0]) * 0.5;
            center[1] = (min[1] + max[1]) * 0.5;
            center[2] = (min[2] + max[2]) * 0.5;

            half[0] = (max[0] - min[0]) * 0.5;
            half[1] = (max[1] - min[1]) * 0.5;
            half[2] = (max[2] - min[2]) * 0.5;

            mat4.identity(mat);
            mat4.translate(mat, mat, position);
            mat4.scale(mat, mat, scale);
            mat4.translate(mat, mat, center);
            mat4.scale(mat, mat, half);

            this.aabbsInstancesBufferArray.set(mat, i * 16);
        }

        this.device.queue.writeBuffer(this.aabbsInstancesBuffer, 0, this.aabbsInstancesBufferArray);

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: target,
                    loadOp: 'load',
                    storeOp: 'store',
                },
            ]
        });

        renderPass.setPipeline(this.aabbPipeline);
        renderPass.setBindGroup(0, aabbCameraBindGroup);
        renderPass.setVertexBuffer(0, this.aabbsInstancesBuffer);
        renderPass.draw(36, this.aabbs.length);

        renderPass.end();
    }

    renderUI(encoder, target)
    {
        // collect instances (only the randomRectForNow)
        let nUIInstances = 1;
        if (this.maxUIInstances < nUIInstances)
        {
            this.maxUIInstances = nUIInstances;
            this.uiInstancesBufferArray = new Float32Array(nUIInstances * 8);
            this.uiInstancesBuffer = WebGPU.createBuffer(this.device, {
                size: nUIInstances * 8 * 4,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }

        this.uiInstancesBufferArray.set(DeferredRenderer.randomRectangle.position, 0);
        this.uiInstancesBufferArray.set(DeferredRenderer.randomRectangle.scale, 4);
        this.device.queue.writeBuffer(this.uiInstancesBuffer, 0, this.uiInstancesBufferArray);

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
        renderPass.setVertexBuffer(0, this.uiInstancesBuffer);
        renderPass.draw(6, 1);

        renderPass.end();
    }
    
    renderEntities(entities, renderPass) {
        this.models.clear();
        this.skeletons.length = 0;
        this.skeletonToJoint.clear();
        let nInstances = 0;
        let nJoints = 0;
        this.lights.length = 0;
        this.aabbs.length = 0;
        for (const entity of entities) {
            if (entity.hidden) continue;

            const transform = entity._transform;
            if (!transform) continue;

            const light = entity._light;
            if (light) this.lights.push(entity);

            if (entity.aabb && entity.customProperties) this.aabbs.push(entity);

            const model = entity._model;
            if (!model) continue;

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

            data.arr.push({ transform, skeleton });
            nInstances += 1;
        }

        if (this.skeletons.length > 0)
        {
            const stride = 16;
            if (this.maxJoints < nJoints)
            {
                this.maxJoints = nJoints;
                this.jointsBufferArray = new Float32Array(nJoints * stride);

                this.skeletonBuffer = WebGPU.createBuffer(this.device, {
                    size: nJoints * stride * 4,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });

                this.skeletonBindGroup = this.device.createBindGroup({
                    layout: this.deferredPipeline.getBindGroupLayout(1),
                    entries: [ { binding: 0, resource: this.skeletonBuffer } ],
                });

                this.lightsSkeletonBindGroup = this.device.createBindGroup({
                    layout: this.lightsPipeline.getBindGroupLayout(1),
                    entries: [ { binding: 0, resource: this.skeletonBuffer } ],
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
                    this.jointsBufferArray.set(joint_mat, (jointI + i) * stride);
                }
            }

            this.device.queue.writeBuffer(this.skeletonBuffer, 0, this.jointsBufferArray);
        }

        renderPass.setBindGroup(1, this.skeletonBindGroup ?? this.dummySkeletonBindGroup);

        const strideFloats = 32;
        const stride = 132;
        if (this.maxInstances < nInstances)
        {
            this.maxInstances = nInstances;
            this.instancesBufferArray = new ArrayBuffer(nInstances * stride);
            this.floatView = new Float32Array(this.instancesBufferArray);
            this.uintView  = new Int32Array(this.instancesBufferArray);
            this.instanceBuffer = WebGPU.createBuffer(this.device, {
                data: this.instancesBufferArray,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
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
                const index = (stride * (data.instanceOffset + i)) / 4;
                this.floatView.set(transform.final, index);
                this.floatView.set(inv_mat, index + 16);
                this.uintView[index + strideFloats] = skeleton ? (this.skeletonToJoint.get(skeleton) ?? -1) : -1;
            }
        }
        this.device.queue.writeBuffer(this.instanceBuffer, 0, this.instancesBufferArray);

        for (const [model, data] of this.models.entries())
        {
            this.renderModel(model, data.instanceOffset, data.arr.length, renderPass, true);
        }
    }

    renderModel(model, instanceOffset, nInstances, renderPass, materials) {
        for (const [material, primitives] of model.primitivesByMaterial.entries()) {

            if (materials)
            {
                const { materialBindGroup, materialUniformBuffer } = this.prepareMaterial(material);
                this.materialBuffer.set(material.albedoFactor, 0);
                this.materialBuffer[3] = material.metalnessFactor;
                this.materialBuffer[4] = material.roughnessFactor;
                this.materialBuffer[5] = material.aoFactor;
                this.device.queue.writeBuffer(materialUniformBuffer, 0, this.materialBuffer.buffer);
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
        renderPass.setVertexBuffer(1, this.instanceBuffer);
        renderPass.setIndexBuffer(indexBuffer, 'uint32');

        renderPass.drawIndexed(primitive.mesh.indices.length, nInstances, 0, 0, instanceOffset);
    }

    prepareCamera(camera) {
        if (this.gpuObjects.has(camera)) {
            return this.gpuObjects.get(camera);
        }

        const cameraUniformBuffer = this.device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // layout: 'auto' my beloved
        const deferredCameraBindGroup = this.device.createBindGroup({
            layout: this.deferredPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const lightingCameraBindGroup = this.device.createBindGroup({
            layout: this.lightingPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const skyboxCameraBindgroup = this.device.createBindGroup({
            layout: this.skyboxPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const aabbCameraBindGroup = this.device.createBindGroup({
            layout: this.aabbPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const gpuObjects = { cameraUniformBuffer, deferredCameraBindGroup, lightingCameraBindGroup, skyboxCameraBindgroup, aabbCameraBindGroup };
        this.gpuObjects.set(camera, gpuObjects);
        return gpuObjects;
    }

    prepareLight(light)
    {
        if (this.gpuObjects.has(light)) {
            return this.gpuObjects.get(light);
        }

        const lightUniformBufferArray = new Float32Array(16 + 16 + 4);
        const lightUniformBuffer = WebGPU.createBuffer(this.device, {
            data: lightUniformBufferArray,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const lightBindGroup = this.device.createBindGroup({
            layout: this.lightsPipeline.getBindGroupLayout(0),
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

        if (!material.albedoTexture) 
        {
            material.albedoTexture = this.dummyMaterial.albedoTexture;
        }
        
        const albedoTexture = this.prepareTexture(material.albedoTexture, true, material.screen); // albedo is always srgb

        const materialUniformBuffer = this.device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const materialBindGroup = this.device.createBindGroup({
            layout: this.deferredPipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: albedoTexture.gpuTexture },
                { binding: 1, resource: albedoTexture.gpuSampler },
                { binding: 2, resource: materialUniformBuffer },
            ],
        });

        const gpuObjects = { materialBindGroup, materialUniformBuffer };
        this.gpuObjects.set(material, gpuObjects);
        return gpuObjects;
    }
}

const vertexBufferLayout = {
    arrayStride: 48,
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
            offset: 16,
            format: 'float32x3',
        },
        {
            name: 'texcoords',
            shaderLocation: 2,
            offset: 32,
            format: 'float32x2',
        },
        {
            name: 'joints',
            shaderLocation: 3,
            offset: 40,
            format: 'uint8x4',
        },
        {
            name: 'weights',
            shaderLocation: 4,
            offset: 44,
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

const aabbInstanceBufferLayout = {
    arrayStride: 64,
    stepMode: 'instance',
    attributes: [
        {
            name: 'row0',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x4',
        },
        {
            name: 'row1',
            shaderLocation: 1,
            offset: 16,
            format: 'float32x4',
        },
        {
            name: 'row2',
            shaderLocation: 2,
            offset: 32,
            format: 'float32x4',
        },
        {
            name: 'row3',
            shaderLocation: 3,
            offset: 48,
            format: 'float32x4',
        },
    ],
};
