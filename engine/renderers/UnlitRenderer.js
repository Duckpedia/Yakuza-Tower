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

        const code = await fetch(new URL('UnlitRenderer.wgsl', import.meta.url))
            .then(response => response.text());
        const module = this.device.createShaderModule({ code });

        this.pipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: {
                module,
                buffers: [ vertexBufferLayout, instanceBufferLayout ],
            },
            fragment: {
                module,
                targets: [{ format: this.format }],
            },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: true,
                depthCompare: 'less',
            },
        });

        const skyboxCode = await fetch(new URL('Skybox.wgsl', import.meta.url)).then(response => response.text());
        const skyboxModule = this.device.createShaderModule({ code: skyboxCode });
        this.skyboxPipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: { module: skyboxModule },
            fragment: { module: skyboxModule, targets: [{ format: this.format }], },
            depthStencil: {
                format: 'depth24plus',
                depthWriteEnabled: false,
                depthCompare: 'less',
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

        this.skyboxBindGroup2 = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(3),
            entries: [
                { binding: 0, resource: this.environmentTexture.createView({ dimension: 'cube' }) },
                { binding: 1, resource: this.environmentSampler },
            ],
        });

        this.recreateDepthTexture();

        this.materialBuffer = new Float32Array(6);
        this.cameraBuffer = new Float32Array(36);
        this.maxJoints = null;
        this.jointsBuffer = null;
        this.models = new Map();
        this.skeletonToJoint = new Map();
        this.skeletons = [];

        this.dummySkeletonBuffer = WebGPU.createBuffer(this.device, {
            data: new mat4(),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.dummySkeletonBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [ { binding: 0, resource: { buffer: this.dummySkeletonBuffer } } ],
        });
    }

    recreateDepthTexture() {
        this.depthTexture?.destroy();
        this.depthTexture = this.device.createTexture({
            format: 'depth24plus',
            size: [this.canvas.width, this.canvas.height],
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
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

        const cameraBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const cameraSkyboxBindGroup = this.device.createBindGroup({
            layout: this.skyboxPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const gpuObjects = { cameraUniformBuffer, cameraBindGroup, cameraSkyboxBindGroup };
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
            layout: this.pipeline.getBindGroupLayout(2),
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
        if (this.depthTexture.width !== this.canvas.width || this.depthTexture.height !== this.canvas.height) {
            this.recreateDepthTexture();
        }

        const encoder = this.device.createCommandEncoder();
        this.renderPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture(),
                    clearValue: [251.0 / 255.0, 239.0 / 255.0, 239.0 / 255, 1],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture,
                depthClearValue: 1,
                depthLoadOp: 'clear',
                depthStoreOp: 'discard',
            },
        });
        
        const cameraComponent = camera.getComponentOfType(Camera);
        const { cameraUniformBuffer, cameraBindGroup, cameraSkyboxBindGroup } = this.prepareCamera(cameraComponent);
        this.cameraBuffer.set(getGlobalViewMatrix(camera), 0);
        this.cameraBuffer.set(getProjectionMatrix(camera), 16);
        this.cameraBuffer.set(camera.getComponentOfType(Transform).translation, 32);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, this.cameraBuffer.buffer);

        this.renderPass.setPipeline(this.skyboxPipeline);
        this.renderPass.setBindGroup(0, cameraSkyboxBindGroup);
        this.renderPass.setBindGroup(1, this.skyboxBindGroup);
        this.renderPass.draw(36);

        this.renderPass.setPipeline(this.pipeline);
        this.renderPass.setBindGroup(0, cameraBindGroup);
        this.renderPass.setBindGroup(3, this.skyboxBindGroup2);

        this.models.clear();
        this.skeletons.length = 0;
        this.skeletonToJoint.clear();
        let nInstances = 0;
        let nJoints = 0;
        for (const entity of entities) {
            if (entity.hidden) continue;
            const transform = entity.getComponentOfType(Transform);
            if (!transform) continue;
            const model = entity.getComponentOfType(Model);
            if (!model) continue;

            let data = this.models.get(model);
            if (!data) {
                data = { arr: [], instanceOffset: 0 };
                this.models.set(model, data);
            }

            const skeleton = entity.getComponentOfType(SkeletonComponent) ?? null;
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

        if (this.skeletons.length > 0)
        {
            if (!this.maxJoints || this.maxJoints < nJoints)
            {
                this.maxJoints = nJoints;
                this.jointsBuffer = new Float32Array(nJoints * 16);

                this.skeletonBuffer = WebGPU.createBuffer(this.device, {
                    size: nJoints * 64,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });

                this.skeletonBindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(1),
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
        if (!this.maxInstances || this.maxInstances < nInstances)
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
            this.renderModel(model, data.instanceOffset, data.arr.length);
        }

        this.renderPass.end();
        this.device.queue.submit([encoder.finish()]);
    }
    
    renderModel(model, instanceOffset, nInstances) {
        for (const primitive of model.primitives) {
            this.renderPrimitive(primitive, instanceOffset, nInstances);
        }
    }

    renderPrimitive(primitive, instanceOffset, nInstances) {
        this.renderPass.setBindGroup(1, this.skeletonBindGroup ?? this.dummySkeletonBindGroup);
        const material = primitive.material ?? this.dummyMaterial;
        const { materialBindGroup, materialUniformBuffer } = this.prepareMaterial(material);
        this.materialBuffer.set(material.albedoFactor, 0);
        this.materialBuffer[3] = material.metalnessFactor;
        this.materialBuffer[4] = material.roughnessFactor;
        this.materialBuffer[5] = material.aoFactor;
        this.device.queue.writeBuffer(materialUniformBuffer, 0, this.materialBuffer.buffer);
        this.renderPass.setBindGroup(2, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        this.renderPass.setVertexBuffer(0, vertexBuffer);
        this.renderPass.setVertexBuffer(1, this.instanceBuffer);
        this.renderPass.setIndexBuffer(indexBuffer, 'uint32');

        this.renderPass.drawIndexed(primitive.mesh.indices.length, nInstances, 0, 0, instanceOffset);
    }
}