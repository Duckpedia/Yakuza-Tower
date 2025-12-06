import { mat4 } from 'glm';

import * as WebGPU from '../WebGPU.js';

import { Camera, Model } from '../core/core.js';

import {
    getGlobalModelMatrix,
    getGlobalViewMatrix,
    getProjectionMatrix,
} from '../core/SceneUtils.js';

import { BaseRenderer } from './BaseRenderer.js';

const vertexBufferLayout = {
    arrayStride: 20,
    stepMode: 'vertex',
    attributes: [
        {
            name: 'position',
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3',
        },
        {
            name: 'texcoords',
            shaderLocation: 1,
            offset: 12,
            format: 'float32x2',
        },
    ],
};

const instanceBufferLayout = {
    arrayStride: 64,
    stepMode: 'instance',
    attributes: [
        {
            name: 'row1',
            shaderLocation: 2,
            offset: 0,
            format: 'float32x4',
        },
        {
            name: 'row2',
            shaderLocation: 3,
            offset: 16,
            format: 'float32x4',
        },
        {
            name: 'row3',
            shaderLocation: 4,
            offset: 32,
            format: 'float32x4',
        },
        {
            name: 'row4',
            shaderLocation: 5,
            offset: 48,
            format: 'float32x4',
        },
    ],
};

export class UnlitRenderer extends BaseRenderer {

    constructor(canvas) {
        super(canvas);
    }

    async initialize() {
        await super.initialize();

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
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const cameraBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: cameraUniformBuffer },
            ],
        });

        const gpuObjects = { cameraUniformBuffer, cameraBindGroup };
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
            layout: this.pipeline.getBindGroupLayout(1),
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
                    clearValue: [1, 1, 1, 1],
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
        this.renderPass.setPipeline(this.pipeline);

        const cameraComponent = camera.getComponentOfType(Camera);
        const viewMatrix = getGlobalViewMatrix(camera);
        const projectionMatrix = getProjectionMatrix(camera);
        const { cameraUniformBuffer, cameraBindGroup } = this.prepareCamera(cameraComponent);
        this.device.queue.writeBuffer(cameraUniformBuffer, 0, viewMatrix);
        this.device.queue.writeBuffer(cameraUniformBuffer, 64, projectionMatrix);
        this.renderPass.setBindGroup(0, cameraBindGroup);

        const modelMatrices = new Map();
        for (const entity of entities) {
            const model = entity.getComponentOfType(Model);
            if (!model) continue;

            let arr = modelMatrices.get(model);
            if (!arr) {
                arr = [];
                modelMatrices.set(model, arr);
            }
            arr.push(getGlobalModelMatrix(entity));
        }

        for (const [model, matrices] of modelMatrices.entries())
        {
            if (!this.gpuObjects.has(model))
                this.gpuObjects.set(model, { nInstances: 0, instanceBuffer: null });

            const modelData = this.gpuObjects.get(model);
            const nInstances = matrices.length;
            const instanceArrayBuffer = new Float32Array(nInstances * 16);
            for (let i = 0; i < nInstances; i++)
                instanceArrayBuffer.set(matrices[i], i * 16);

            if (modelData.nInstances !== nInstances) {
                const instanceBuffer = WebGPU.createBuffer(this.device, {
                    data: instanceArrayBuffer.buffer,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                });
                modelData.nInstances = nInstances;
                modelData.instanceBuffer = instanceBuffer;
            }
            else {
                this.device.queue.writeBuffer(modelData.instanceBuffer, 0, instanceArrayBuffer);
            }

            this.renderModel(model, modelData.instanceBuffer, modelData.nInstances);
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
        const { materialBindGroup } = this.prepareMaterial(primitive.material);
        this.renderPass.setBindGroup(1, materialBindGroup);

        const { vertexBuffer, indexBuffer } = this.prepareMesh(primitive.mesh, vertexBufferLayout);
        this.renderPass.setVertexBuffer(0, vertexBuffer);
        this.renderPass.setVertexBuffer(1, instanceBuffer);
        this.renderPass.setIndexBuffer(indexBuffer, 'uint32');

        this.renderPass.drawIndexed(primitive.mesh.indices.length, nInstances);
    }

}
