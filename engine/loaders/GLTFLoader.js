import { SkeletonComponent } from '../../src/components/SkeletonComponent.js';
import {
    Accessor,
    Camera,
    Model,
    Entity,
    Primitive,
    Sampler,
    Texture,
    Transform,
    Vertex,
    Mesh,
    Material,
} from '../core/core.js';

// TODO: GLB support
// TODO: accessors with no buffer views (zero-initialized)
// TODO: image from buffer view
// TODO: mipmaps
// TODO: material texcoord sets
// TODO: material alpha, doubleSided

export class GLTFLoader {

    /**
     * Loads the GLTF JSON file and all buffers and images that it references.
     * It also creates a cache for all future resource loading.
     * @param {URL} url
     */
    async load(url) {
        this.gltfUrl = url;
        this.gltf = await this.fetchJson(this.gltfUrl);
        this.defaultScene = this.gltf.scene ?? 0;
        this.cache = new Map();

        await Promise.all(this.gltf.buffers?.map(buffer => this.preloadBuffer(buffer)) ?? []);
        await Promise.all(this.gltf.images?.map(image => this.preloadImage(image)) ?? []);

        return this;
    }

    // Finds an object in list at the given index, or if the 'name'
    // property matches the given name.
    findByNameOrIndex(list, nameOrIndex) {
        if (typeof nameOrIndex === 'number') {
            return list[nameOrIndex];
        } else {
            return list.find(element => element.name === nameOrIndex);
        }
    }

    fetchJson(url) {
        return fetch(url)
            .then(response => response.json());
    }

    fetchBuffer(url) {
        return fetch(url)
            .then(response => response.arrayBuffer());
    }

    fetchImage(url) {
        return fetch(url)
            .then(response => response.blob())
            .then(blob => createImageBitmap(blob));
    }

    async preloadImage(gltfSpec) {
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        if (gltfSpec.uri) {
            const url = new URL(gltfSpec.uri, this.gltfUrl);
            const image = await this.fetchImage(url);
            this.cache.set(gltfSpec, image);
            return image;
        } else {
            const bufferView = this.gltf.bufferViews[gltfSpec.bufferView];
            const buffer = this.loadBuffer(bufferView.buffer);
            const dataView = new DataView(buffer, bufferView.byteOffset ?? 0, bufferView.byteLength);
            const blob = new Blob([dataView], { type: gltfSpec.mimeType });
            const url = URL.createObjectURL(blob);
            const image = await this.fetchImage(url);
            URL.revokeObjectURL(url);
            this.cache.set(gltfSpec, image);
            return image;
        }
    }

    async preloadBuffer(gltfSpec) {
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const url = new URL(gltfSpec.uri, this.gltfUrl);
        const buffer = await this.fetchBuffer(url);
        this.cache.set(gltfSpec, buffer);
        return buffer;
    }

    loadImage(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.images, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }

        return this.cache.get(gltfSpec);
    }

    loadBuffer(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.buffers, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }

        return this.cache.get(gltfSpec);
    }

    loadSampler(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.samplers, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const minFilter = {
            9728: 'nearest',
            9729: 'linear',
            9984: 'nearest',
            9985: 'linear',
            9986: 'nearest',
            9987: 'linear',
        };

        const magFilter = {
            9728: 'nearest',
            9729: 'linear',
        };

        const mipmapFilter = {
            9728: 'nearest',
            9729: 'linear',
            9984: 'nearest',
            9985: 'nearest',
            9986: 'linear',
            9987: 'linear',
        };

        const addressMode = {
            33071: 'clamp-to-edge',
            33648: 'mirror-repeat',
            10497: 'repeat',
        };

        const sampler = new Sampler({
            minFilter: minFilter[gltfSpec.minFilter ?? 9729],
            magFilter: magFilter[gltfSpec.magFilter ?? 9729],
            mipmapFilter: mipmapFilter[gltfSpec.minFilter ?? 9729],
            addressModeU: addressMode[gltfSpec.wrapS ?? 10497],
            addressModeV: addressMode[gltfSpec.wrapT ?? 10497],
        });

        this.cache.set(gltfSpec, sampler);
        return sampler;
    }

    loadTexture(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.textures, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const options = {};
        if (gltfSpec.source !== undefined) {
            options.image = this.loadImage(gltfSpec.source);
        }
        if (gltfSpec.sampler !== undefined) {
            options.sampler = this.loadSampler(gltfSpec.sampler);
        } else {
            options.sampler = new Sampler();
        }

        const texture = new Texture(options);

        this.cache.set(gltfSpec, texture);
        return texture;
    }

    loadMaterial(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.materials, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const options = {};
        const pbr = gltfSpec.pbrMetallicRoughness;
        if (pbr) {
            if (pbr.baseColorTexture) {
                options.baseTexture = this.loadTexture(pbr.baseColorTexture.index);
                options.baseTexture.isSRGB = true;
            }
            if (pbr.metallicRoughnessTexture) {
                options.metalnessTexture = this.loadTexture(pbr.metallicRoughnessTexture.index);
                options.roughnessTexture = this.loadTexture(pbr.metallicRoughnessTexture.index);
            }
            options.baseFactor = pbr.baseColorFactor;
            options.metalnessFactor = pbr.metallicFactor;
            options.roughnessFactor = pbr.roughnessFactor;
        }

        if (gltfSpec.normalTexture) {
            options.normalTexture = this.loadTexture(gltfSpec.normalTexture.index);
            options.normalFactor = gltfSpec.normalTexture.scale;
        }

        if (gltfSpec.emissiveTexture) {
            options.emissionTexture = this.loadTexture(gltfSpec.emissiveTexture.index);
            options.emissionTexture.isSRGB = true;
            options.emissionFactor = gltfSpec.emissiveFactor;
        }

        if (gltfSpec.occlusionTexture) {
            options.occlusionTexture = this.loadTexture(gltfSpec.occlusionTexture.index);
            options.occlusionFactor = gltfSpec.occlusionTexture.strength;
        }

        const material = new Material(options);

        this.cache.set(gltfSpec, material);
        return material;
    }

    loadAccessor(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.accessors, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        if (gltfSpec.bufferView === undefined) {
            console.warn('Accessor does not reference a buffer view');
            return null;
        }

        const bufferView = this.gltf.bufferViews[gltfSpec.bufferView];
        const buffer = this.loadBuffer(bufferView.buffer);

        const componentType = {
            5120: 'int',
            5121: 'int',
            5122: 'int',
            5123: 'int',
            5124: 'int',
            5125: 'int',
            5126: 'float',
        }[gltfSpec.componentType];

        const componentSize = {
            5120: 1,
            5121: 1,
            5122: 2,
            5123: 2,
            5124: 4,
            5125: 4,
            5126: 4,
        }[gltfSpec.componentType];

        const componentSigned = {
            5120: true,
            5121: false,
            5122: true,
            5123: false,
            5124: true,
            5125: false,
            5126: false,
        }[gltfSpec.componentType];

        const componentCount = {
            SCALAR: 1,
            VEC2: 2,
            VEC3: 3,
            VEC4: 4,
            MAT2: 4,
            MAT3: 9,
            MAT4: 16,
        }[gltfSpec.type];

        const componentNormalized = gltfSpec.normalized ?? false;

        const stride = bufferView.byteStride ?? (componentSize * componentCount);
        const offset = gltfSpec.byteOffset ?? 0;
        const viewOffset = bufferView.byteOffset ?? 0;
        const viewLength = bufferView.byteLength;

        const accessor = new Accessor({
            buffer,
            viewLength,
            viewOffset,
            offset,
            stride,

            componentType,
            componentCount,
            componentSize,
            componentSigned,
            componentNormalized,
        });

        this.cache.set(gltfSpec, accessor);
        return accessor;
    }

    createMeshFromPrimitive(spec) {
        if (spec.attributes.POSITION === undefined) {
            console.warn('No position in mesh');
            return new Mesh();
        }

        if (spec.indices === undefined) {
            console.warn('No indices in mesh');
            return new Mesh();
        }

        const accessors = {};
        for (const attribute in spec.attributes) {
            accessors[attribute] = this.loadAccessor(spec.attributes[attribute]);
        }

        const position = accessors.POSITION;
        const texcoords = accessors.TEXCOORD_0;
        const normal = accessors.NORMAL;
        const tangent = accessors.TANGENT;
        const joints0 = accessors.JOINTS_0;
        const weights0 = accessors.WEIGHTS_0;

        const vertexCount = position.count;
        const vertices = [];

        for (let i = 0; i < vertexCount; i++) {
            const options = {};

            if (position) { options.position = position.get(i); }
            if (texcoords) { options.texcoords = texcoords.get(i); }
            if (normal) { options.normal = normal.get(i); }
            if (tangent) { options.tangent = tangent.get(i); }
            if (joints0) { options.joints = joints0.get(i); }
            options.weights  = weights0 ? weights0.get(i) : [1, 0, 0, 0];

            vertices.push(new Vertex(options));
        }

        const indices = [];
        const indicesAccessor = this.loadAccessor(spec.indices);
        const indexCount = indicesAccessor.count;

        for (let i = 0; i < indexCount; i++) {
            indices.push(indicesAccessor.get(i));
        }

        return new Mesh({ vertices, indices });
    }

    loadMesh(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.meshes, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const primitives = [];
        for (const primitiveSpec of gltfSpec.primitives) {
            if (primitiveSpec.mode !== 4 && primitiveSpec.mode !== undefined) {
                console.warn(`GLTFLoader: skipping primitive with mode ${primitiveSpec.mode}`);
                continue;
            }

            const options = {};
            options.mesh = this.createMeshFromPrimitive(primitiveSpec);

            if (primitiveSpec.material !== undefined) {
                options.material = this.loadMaterial(primitiveSpec.material);
            }

            primitives.push(new Primitive(options));
        }

        const model = new Model({ primitives });

        this.cache.set(gltfSpec, model);
        return model;
    }

    loadCamera(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.cameras, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const options = {};
        if (gltfSpec.type === 'perspective') {
            const { aspectRatio, yfov, znear, zfar } = gltfSpec.perspective;
            Object.assign(options, {
                orthographic: 0,
                aspect: aspectRatio,
                fovy: yfov,
                near: znear,
                far: zfar,
            });
        } else if (gltfSpec.type === 'orthographic') {
            const { xmag, ymag, znear, zfar } = gltfSpec.orthographic;
            Object.assign(options, {
                orthographic: 1,
                aspect: xmag / ymag,
                halfy: ymag,
                near: znear,
                far: zfar,
            });
        }

        const camera = new Camera(options);

        this.cache.set(gltfSpec, camera);
        return camera;
    }

    loadAnimation(gltfSpec) {
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec);
        }

        const channels = gltfSpec.channels.map(channelSpec => {
            const target = channelSpec.target;

            const samplerSpec = gltfSpec.samplers[channelSpec.sampler];
            const inputAccessor = this.loadAccessor(samplerSpec.input);
            const outputAccessor = this.loadAccessor(samplerSpec.output);

            const keyframeCount = inputAccessor.count;

            const times = new Float32Array(keyframeCount);
            for (let i = 0; i < keyframeCount; i++) {
                times[i] = inputAccessor.get(i)[0];
            }

            const values = new Array(keyframeCount);
            for (let i = 0; i < keyframeCount; i++) {
                values[i] = outputAccessor.get(i);
            }

            return {
                interpolation: samplerSpec.interpolation ?? 'LINEAR',
                times,
                values,
                samplerIndex: channelSpec.sampler,
                targetNodeIndex: target.node,
                targetPath: target.path,
            };
        });

        let duration = 0;
        for (const channel of channels) {
            if (channel.times.length > 0) {
                const last = channel.times[channel.times.length - 1];
                if (last > duration) duration = last;
            }
        }

        const animation = {
            name: gltfSpec.name,
            channels,
            duration,
        };

        this.cache.set(gltfSpec, animation);
        return animation;
    }

    loadAnimations() {
        if (!this.gltf.animations) {
            return [];
        }

        if (this.cache.has(this.gltf.animations)) {
            return this.cache.get(this.gltf.animations);
        }

        const result = this.gltf.animations.map(i => this.loadAnimation(i));
        this.cache.set(this.gltf.animations, result);
        return result;
    }

    loadSkeleton(nameOrIndex) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.skins, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }
        if (this.cache.has(gltfSpec)) {
            return this.cache.get(gltfSpec).clone();
        }

        let inverseBindMatrices = null;
        if (gltfSpec.inverseBindMatrices !== undefined) {
            const accessor = this.loadAccessor(gltfSpec.inverseBindMatrices);
            const count = accessor.count;
            inverseBindMatrices = new Array(count);
            for (let i = 0; i < count; i++) {
                inverseBindMatrices[i] = accessor.get(i);
            }
        }

        const animations = this.loadAnimations();
        for (const anim of animations)
        {
            for (const channel of anim.channels)
            {
                channel.targetNodeIndex = gltfSpec.joints.findIndex(e => e === channel.targetNodeIndex);
            }
        }


        const skeleton = new SkeletonComponent({ 
            jointIndices: gltfSpec.joints, 
            inverseBindMatrices, 
            name: gltfSpec.name,
            animations
        });
        this.cache.set(gltfSpec, skeleton);
        return skeleton;
    }

    loadNode(gltfSpec) {
        const entity = new Entity();

        entity.addComponent(new Transform(gltfSpec));

        if (gltfSpec.camera !== undefined) {
            entity.addComponent(this.loadCamera(gltfSpec.camera));
        }

        if (gltfSpec.mesh !== undefined) {
            entity.addComponent(this.loadMesh(gltfSpec.mesh));
        }

        if (gltfSpec.skin !== undefined) {
            const skeleton = this.loadSkeleton(gltfSpec.skin);
            if (skeleton)
                entity.addComponent(skeleton);
        }

        if (gltfSpec.extras) {
            entity.customProperties = structuredClone(gltfSpec.extras);
        }

        entity.name = gltfSpec.name;

        return entity;
    }

    loadScene(nameOrIndex = this.defaultScene) {
        const gltfSpec = this.findByNameOrIndex(this.gltf.scenes, nameOrIndex);
        if (!gltfSpec) {
            return null;
        }

        const nodeEntities = [];
        const scene = [];
        const to_add = [{index: gltfSpec.nodes[0], parent: null }];
        while(to_add.length > 0) {
            const {index, parent} = to_add.shift();
            const gltfSpec = this.findByNameOrIndex(this.gltf.nodes, index);
            if (!gltfSpec) {
                continue;
            }
            const node = this.loadNode(gltfSpec);
            node.parent = parent;
            nodeEntities[index] = node;
            scene.push(node);
            if (gltfSpec.children)
                to_add.push(...gltfSpec.children.map(childIndex => ({ index: childIndex, parent: node})));
        }

        for(const entity of scene) {
            const skeleton = entity.getComponentOfType(SkeletonComponent);
            if (!skeleton) continue;
            skeleton.joints = skeleton.jointIndices.map(index => nodeEntities[index]);
        }

        return scene;
    }

    buildEntityFromScene(scene) {
        const root = scene[0];
        root.skeleton = null;
        root.models = [];
        for (const entity of scene)
        {
            if (!root.skeleton)
                root.skeleton = entity.getComponentOfType(SkeletonComponent);
            const model = entity.getComponentOfType(Model);
            if (model)
                root.models.push(model);
        }
        root.animations = root.skeleton?.animations ?? [];
        return root;
    }
}
