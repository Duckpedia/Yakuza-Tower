import { mat4 } from 'glm';

import * as WebGPU from '../WebGPU.js';

import { Camera, Model, Transform } from '../core/core.js';

import {
    getGlobalViewMatrix,
    getProjectionMatrix,
} from '../core/SceneUtils.js';

import { BaseRenderer } from './BaseRenderer.js';
import { ImageLoader } from '../loaders/ImageLoader.js';
import { SkeletonComponent } from '../../src/components/SkeletonComponent.js';
import { LightComponent } from '../../src/components/LightComponent.js';

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

export class UnlitRenderer extends BaseRenderer {

    constructor(canvas) {
        super(canvas);
    }

    async initialize(defaultTextureImage) {
        await super.initialize(defaultTextureImage);

        await this.setUpDefaults();
        await this.setUpSkybox();
        await this.setUpDeferred();

        this.recreateRenderTargets();
    }

    async setUpDefaults() {
        this.materialBuffer = new Float32Array(6);
        this.cameraBuffer = new Float32Array(36);
        this.models = new Map();
        this.skeletonToJoint = new Map();
        this.maxJoints = 0;
        this.maxInstances = 0;
        this.maxLights = 0;
        this.jointsBuffer = null;
        this.lightsBuffer = null;
        this.instancesBuffer = null;
        this.skeletons = [];
        this.lights = [];
    }

    async setUpDeferred() {
        const deferredCode = await fetch(new URL('Deferred.wgsl', import.meta.url)).then(response => response.text());
        const deferredModule = this.device.createShaderModule({ code: deferredCode });
        this.deferredPipeline = await this.device.createRenderPipelineAsync({
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
                targets: [{ format: this.format }],
            },
        });

        this.dummySkeletonBuffer = WebGPU.createBuffer(this.device, {
            data: new mat4(),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.dummySkeletonBindGroup = this.device.createBindGroup({
            layout: this.deferredPipeline.getBindGroupLayout(1),
            entries: [ { binding: 0, resource: { buffer: this.dummySkeletonBuffer } } ],
        });

        
        this.lightsBuffer = WebGPU.createBuffer(this.device, {
            data: new Float32Array([0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0]),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.lightsBindGroup = this.device.createBindGroup({
            layout: this.lightingPipeline.getBindGroupLayout(2),
            entries: [ { binding: 0, resource: this.lightsBuffer } ],
        });
    }

    async setUpSkybox() {
        const skyboxCode = await fetch(new URL('Skybox.wgsl', import.meta.url)).then(response => response.text());
        const skyboxModule = this.device.createShaderModule({ code: skyboxCode });
        this.skyboxPipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: { module: skyboxModule },
            fragment: { module: skyboxModule, targets: [{ format: this.format }], },
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
        this.defferedDepthTexture?.destroy();
        this.defferedDepthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredAlbedoTexture = this.device.createTexture({
            format: 'bgra8unorm',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredPositionTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredNormalTexture = this.device.createTexture({
            format: 'rgba16float',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.deferredTargetsBindGroup = this.device.createBindGroup({
            layout: this.lightingPipeline.getBindGroupLayout(1),
            entries: [
                {
                    binding: 0,
                    resource: this.deferredAlbedoTexture.createView(),
                },
                {
                    binding: 1,
                    resource: this.deferredPositionTexture.createView(),
                },
                {
                    binding: 2,
                    resource: this.deferredNormalTexture.createView(),
                },
            ],
        });
    }

    prepareCamera(camera) {
        if (this.gpuObjects.has(camera)) {
            return this.gpuObjects.get(camera);
        }

        const cameraUniformBuffer = this.device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

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

        const gpuObjects = { cameraUniformBuffer, deferredCameraBindGroup, lightingCameraBindGroup, skyboxCameraBindgroup };
        this.gpuObjects.set(camera, gpuObjects);
        return gpuObjects;
    }

    prepareTexture(texture) {
        if (this.gpuObjects.has(texture)) {
            return this.gpuObjects.get(texture);
        }

        const { gpuTexture } = this.prepareImage(texture.image); // ignore sRGB
        const { gpuSampler } = this.prepareSampler(texture.sampler);

        const gpuObjects = { gpuTexture, gpuSampler };
        this.gpuObjects.set(texture, gpuObjects);
        return gpuObjects;
    }

    prepareMaterial(material) {
        if (this.gpuObjects.has(material)) {
            return this.gpuObjects.get(material);
        }

        if (!material.albedoTexture) material.albedoTexture = this.dummyMaterial.albedoTexture;
        const albedoTexture = this.prepareTexture(material.albedoTexture);

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

    render(entities, camera) {
        if (this.defferedDepthTexture.width !== this.canvas.width || this.defferedDepthTexture.height !== this.canvas.height) {
            this.recreateRenderTargets();
        }
        
        const cameraComponent = camera.getComponentOfType(Camera);
        const { cameraUniformBuffer, deferredCameraBindGroup, lightingCameraBindGroup, skyboxCameraBindgroup } = this.prepareCamera(cameraComponent);
        this.cameraBuffer.set(getGlobalViewMatrix(camera), 0);
        this.cameraBuffer.set(getProjectionMatrix(camera), 16);
        this.cameraBuffer.set(camera.getComponentOfType(Transform).final_position, 32);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, this.cameraBuffer.buffer);

        const target = this.context.getCurrentTexture().createView();
        const encoder = this.device.createCommandEncoder();

        { // deferred
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: this.deferredAlbedoTexture.createView(),
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                    {
                        view: this.deferredPositionTexture.createView(),
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                    {
                        view: this.deferredNormalTexture.createView(),
                        clearValue: [0.0, 0.0, 0.0, 1.0 ],
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
                depthStencilAttachment: {
                    view: this.defferedDepthTexture.createView(),
                    depthClearValue: 1,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store',
                },
            });

            renderPass.setPipeline(this.deferredPipeline);
            renderPass.setBindGroup(0, deferredCameraBindGroup);

            this.renderEntities(entities, renderPass);

            renderPass.end();
        }
            
        { // lighting
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

            renderPass.setPipeline(this.lightingPipeline);
            renderPass.setBindGroup(0, lightingCameraBindGroup);
            renderPass.setBindGroup(1, this.deferredTargetsBindGroup);
            renderPass.setBindGroup(2, this.lightsBindGroup);
            renderPass.draw(6);

            renderPass.end();
        }
            
        { // skybox
            const renderPass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: target,
                        loadOp: 'load',
                        storeOp: 'store',
                    },
                ],
                depthStencilAttachment: {
                    view: this.defferedDepthTexture.createView(),
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

        this.device.queue.submit([encoder.finish()]);
    }
    
    renderEntities(entities, renderPass) {
        this.models.clear();
        this.skeletons.length = 0;
        this.skeletonToJoint.clear();
        let nInstances = 0;
        let nJoints = 0;
        this.lights.length = 0;

        for (const entity of entities) {
            if (entity.hidden) continue;
            const transform = entity.getComponentOfType(Transform);
            if (!transform) continue;
            const light = entity.getComponentOfType(LightComponent);
            if (light) {
                this.lights.push({position: transform.final_position, light});
            }
            const model = entity.getComponentOfType(Model);
            if (!model) continue;
            let data = this.models.get(model);
            if (!data) {
                data = { arr: [], instanceOffset: 0 };
                this.models.set(model, data);
            }

            const skeleton = entity.getComponentOfType(SkeletonComponent);
            if (skeleton) {
                if (this.skeletons.indexOf(skeleton) < 0)
                {
                    this.skeletons.push(skeleton);
                    this.skeletonToJoint.set(skeleton, nJoints);
                    nJoints += skeleton.joints.length;
                }
            }

            data.arr.push({ transform: transform.final, skeleton });
            nInstances += 1;
        }

        if (this.lights.length > 0)
        {
            if (this.maxLights < this.lights.length)
            {
                this.maxLights = this.lights.length;
                this.lightBufferArray = new Float32Array(this.lights.length * 8);
                this.lightBuffer = WebGPU.createBuffer(this.device, {
                    size: this.lights.length * 32,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });

                this.lightsBindGroup = this.device.createBindGroup({
                    layout: this.lightingPipeline.getBindGroupLayout(2),
                    entries: [ { binding: 0, resource: this.lightBuffer } ],
                });
            }
            for (let i = 0; i < this.lights.length; i++)
            {
                this.lightBufferArray.set(this.lights[i].position, i * 8);
                this.lightBufferArray.set(this.lights[i].light.emission, i * 8 + 4);
            }
            this.device.queue.writeBuffer(this.lightBuffer, 0, this.lightBufferArray);
        }

        if (this.skeletons.length > 0)
        {
            if (this.maxJoints < nJoints)
            {
                this.maxJoints = nJoints;
                this.jointsBuffer = new Float32Array(nJoints * 16);

                this.skeletonBuffer = WebGPU.createBuffer(this.device, {
                    size: nJoints * 64,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });

                this.skeletonBindGroup = this.device.createBindGroup({
                    layout: this.deferredPipeline.getBindGroupLayout(1),
                    entries: [ { binding: 0, resource: this.skeletonBuffer } ],
                });
            }
            
            const joint_mat = new mat4(); 
            for (const skeleton of this.skeletons)
            {
                const jointI = this.skeletonToJoint.get(skeleton);
                for (let i = 0; i < skeleton.joints.length; i++)
                {
                    mat4.mul(joint_mat, skeleton.joints[i].getComponentOfType(Transform).final, skeleton.inverseBindMatrices[i]);
                    this.jointsBuffer.set(joint_mat, (jointI + i) * 16);
                }
            }

            this.device.queue.writeBuffer(this.skeletonBuffer, 0, this.jointsBuffer);
        }
    
        const strideFloats = 32;
        const stride = 132;
        if (this.maxInstances < nInstances)
        {
            this.maxInstances = nInstances;
            this.instanceBufferArray = new ArrayBuffer(nInstances * stride);
            this.floatView = new Float32Array(this.instanceBufferArray);
            this.uintView  = new Int32Array(this.instanceBufferArray);
            this.instanceBuffer = WebGPU.createBuffer(this.device, {
                data: this.instanceBufferArray,
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
                mat4.invert(inv_mat, transform);
                mat4.transpose(inv_mat, inv_mat);
                const index = (stride * (data.instanceOffset + i)) / 4;
                this.floatView.set(transform, index);
                this.floatView.set(inv_mat, index + 16);
                this.uintView[index + strideFloats] = skeleton ? (this.skeletonToJoint.get(skeleton) ?? -1) : -1;
            }
        }
        this.device.queue.writeBuffer(this.instanceBuffer, 0, this.instanceBufferArray);

        for (const [model, data] of this.models.entries())
        {
            this.renderModel(model, data.instanceOffset, data.arr.length, renderPass);
        }
    }

    renderModel(model, instanceOffset, nInstances, renderPass) {
        for (const primitive of model.primitives) {
            this.renderPrimitive(primitive, instanceOffset, nInstances, renderPass);
        }
    }

    renderPrimitive(primitive, instanceOffset, nInstances, renderPass) {
        renderPass.setBindGroup(1, this.skeletonBindGroup ?? this.dummySkeletonBindGroup);
        const material = primitive.material ?? this.dummyMaterial;
        const { materialBindGroup, materialUniformBuffer } = this.prepareMaterial(material);
        this.materialBuffer.set(material.albedoFactor, 0);
        this.materialBuffer[3] = material.metalnessFactor;
        this.materialBuffer[4] = material.roughnessFactor;
        this.materialBuffer[5] = material.aoFactor;
        this.device.queue.writeBuffer(materialUniformBuffer, 0, this.materialBuffer.buffer);
        renderPass.setBindGroup(2, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        renderPass.setVertexBuffer(0, vertexBuffer);
        renderPass.setVertexBuffer(1, this.instanceBuffer);
        renderPass.setIndexBuffer(indexBuffer, 'uint32');

        renderPass.drawIndexed(primitive.mesh.indices.length, nInstances, 0, 0, instanceOffset);
    }
}