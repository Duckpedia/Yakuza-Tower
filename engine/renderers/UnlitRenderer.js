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

        this.recreateDepthTexture();

        // create dummy skeleton with one identity joint
        this.dummySkeletonBuffer =  this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Float32Array(this.dummySkeletonBuffer.getMappedRange()).set(new Float32Array([
            1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            0,0,0,1
        ]));
        this.dummySkeletonBuffer.unmap();
        this.dummySkeletonBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [ { binding: 0, resource: { buffer: this.dummySkeletonBuffer } } ],
        });

        const cubeCode = await fetch(new URL('Skybox.wgsl', import.meta.url)).then(response => response.text());
        const cubeModule = this.device.createShaderModule({ code: cubeCode });
        this.cubePipeline = await this.device.createRenderPipelineAsync({
            layout: 'auto',
            vertex: { module: cubeModule },
            fragment: { module: cubeModule, targets: [{ format: this.format }], },
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
        this.cubeBindGroup = this.device.createBindGroup({
            layout: this.cubePipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: this.environmentTexture.createView({ dimension: 'cube' }) },
                { binding: 1, resource: this.environmentSampler },
            ],
        });
        this.cubeBindGroup2 = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(3),
            entries: [
                { binding: 0, resource: this.environmentTexture.createView({ dimension: 'cube' }) },
                { binding: 1, resource: this.environmentSampler },
            ],
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
            layout: this.cubePipeline.getBindGroupLayout(0),
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

        const baseTexture = this.prepareTexture(material.baseTexture);

        const materialBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: baseTexture.gpuTexture },
                { binding: 1, resource: baseTexture.gpuSampler },
            ],
        });

        const gpuObjects = { materialBindGroup };
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
        const cameraBuffer = new Float32Array(36);
        cameraBuffer.set(getGlobalViewMatrix(camera), 0);
        cameraBuffer.set(getProjectionMatrix(camera), 16);
        cameraBuffer.set(camera.getComponentOfType(Transform).translation, 32);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, cameraBuffer.buffer);

        this.renderPass.setPipeline(this.cubePipeline);
        this.renderPass.setBindGroup(0, cameraSkyboxBindGroup);
        this.renderPass.setBindGroup(1, this.cubeBindGroup);
        this.renderPass.draw(36);

        this.renderPass.setPipeline(this.pipeline);
        this.renderPass.setBindGroup(0, cameraBindGroup);
        this.renderPass.setBindGroup(3, this.cubeBindGroup2);

        const models = new Map();
        const skeletons = [];
        const skeletonToJoint = new Map();
        let nJoints = 0;
        for (const entity of entities) {
            if (entity.hidden) continue;

            const transform = entity.getComponentOfType(Transform);
            if (!transform) continue;

            const model = entity.getComponentOfType(Model);
            if (!model) continue;

            let arr = models.get(model);
            if (!arr) {
                arr = [];
                models.set(model, arr);
            }

            const skeleton = entity.getComponentOfType(SkeletonComponent) ?? null;
            if (skeleton) {
                if (skeletons.indexOf(skeleton) < 0)
                {
                    skeletons.push(skeleton);
                    skeletonToJoint.set(skeleton, nJoints);
                    nJoints += skeleton.joints.length;
                }
            }
            arr.push({ transform: transform.final, skeleton });
        }

        if (skeletons.length > 0)
        {
            const jointsBuffer = new Float32Array(nJoints * 16);
            for (const skeleton of skeletons)
            {
                const jointI = skeletonToJoint.get(skeleton);
                for (let i = 0; i < skeleton.joints.length; i++)
                {
                    const joint_final = skeleton.joints[i].getComponentOfType(Transform).final;
                    const joint_mat = new mat4(); mat4.mul(joint_mat, joint_final, skeleton.inverseBindMatrices[i]);
                    // const joint_inv_mat = new mat4(); 
                    // mat4.invert(joint_inv_mat, joint_mat);
                    // mat4.transpose(joint_inv_mat, joint_inv_mat);
                    jointsBuffer.set(joint_mat, (jointI + i) * 16);
                    // jointsBuffer.set(joint_inv_mat, (jointI + i) * 16 * 2 + 16);
                }
            }

            if (!this.maxJoints || this.maxJoints < nJoints)
            {
                this.maxJoints = nJoints;
                this.skeletonBuffer = WebGPU.createBuffer(this.device, {
                    data: jointsBuffer,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: true,
                });

                this.skeletonBindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(1),
                    entries: [ { binding: 0, resource: this.skeletonBuffer } ],
                });
            }
            else 
            {
                this.device.queue.writeBuffer(this.skeletonBuffer, 0, jointsBuffer);
            }
        }

        for (const [model, arr] of models.entries())
        {
            if (!this.gpuObjects.has(model))
                this.gpuObjects.set(model, { maxInstances: 0, instanceBuffer: null });

            const strideFloats = 32;
            const stride  = 132;
            const instanceBuffer = new ArrayBuffer(arr.length * stride);
            const floatView = new Float32Array(instanceBuffer);
            const uintView  = new Int32Array(instanceBuffer);
            for (let i = 0; i < arr.length; i++)
            {
                const { transform, skeleton } = arr[i];
                const inv_mat = new mat4();
                mat4.invert(inv_mat, transform);
                mat4.transpose(inv_mat, inv_mat);
                floatView.set(transform, (stride * i) / 4);
                floatView.set(inv_mat, (stride * i) / 4 + 16);
                uintView[(stride * i) / 4 + strideFloats] = skeleton ? (skeletonToJoint.get(skeleton) ?? -1) : -1;
            }

            const modelData = this.gpuObjects.get(model);

            const nInstances = arr.length;
            if (modelData.maxInstances < nInstances) 
            {
                modelData.maxInstances = nInstances;
                modelData.instanceBuffer = WebGPU.createBuffer(this.device, {
                    data: instanceBuffer,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: true,
                });
            }
            else 
            {
                this.device.queue.writeBuffer(modelData.instanceBuffer, 0, instanceBuffer);
            }

            this.renderModel(model, modelData.instanceBuffer, nInstances);
        }

        this.renderPass.end();
        this.device.queue.submit([encoder.finish()]);
    }
    
    renderModel(model, instanceBuffer, nInstances) {
        for (const primitive of model.primitives) {
            this.renderPrimitive(primitive, instanceBuffer, nInstances);
        }
    }

    renderPrimitive(primitive, instanceBuffer, nInstances) {
        this.renderPass.setBindGroup(1, this.skeletonBindGroup ?? this.dummySkeletonBindGroup);
        const { materialBindGroup } = this.prepareMaterial(primitive.material ?? this.dummyMaterial);
        this.renderPass.setBindGroup(2, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        this.renderPass.setVertexBuffer(0, vertexBuffer);
        this.renderPass.setVertexBuffer(1, instanceBuffer);
        this.renderPass.setIndexBuffer(indexBuffer, 'uint32');

        this.renderPass.drawIndexed(primitive.mesh.indices.length, nInstances);
    }

}