import { GUI } from 'dat';
import * as glm from 'glm';

import * as WebGPU from 'engine/WebGPU.js';
import { GLTFLoader } from 'engine/loaders/GLTFLoader.js';
import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { UnlitRenderer } from 'engine/renderers/UnlitRenderer.js';
import { FirstPersonController } from 'engine/controllers/FirstPersonController.js';

import {
    Camera,
    Entity,
    Material,
    Model,
    Primitive,
    Sampler,
    Texture,
    Transform,
} from 'engine/core/core.js';

import { loadResources } from 'engine/loaders/resources.js';

const resources = await loadResources({
    'floor_mesh': new URL('./models/floor/floor.json', import.meta.url),
    'floor_image': new URL('./models/floor/grass.png', import.meta.url),
});

const canvas = document.querySelector('canvas');
const renderer = new UnlitRenderer(canvas);
await renderer.initialize();

const camera = new Entity();
camera.addComponent(new Transform({
    translation: [0, 1, 0],
}));
camera.addComponent(new Camera());
camera.addComponent(new FirstPersonController(camera, canvas));

const floor = new Entity();
floor.addComponent(new Transform({
    scale: [10, 1, 10],
}));
floor.addComponent(new Model({
    primitives: [
        new Primitive({
            mesh: resources.floor_mesh,
            material: new Material({
                baseTexture: new Texture({
                    image: resources.floor_image,
                    sampler: new Sampler({
                        minFilter: 'nearest',
                        magFilter: 'nearest',
                        addressModeU: 'repeat',
                        addressModeV: 'repeat',
                    }),
                }),
            }),
        }),
    ],
}));

const loader = new GLTFLoader();
await loader.load(new URL('./models/cat/cat.gltf', import.meta.url));
const cat = loader.loadScene()[0];
        console.log(glm);
        console.log(glm.quat);
const cat_transform = cat.getComponentOfType(Transform);
cat_transform.scale = new glm.vec3(2);
cat_transform.translation[2] = -3.0;
cat.addComponent({
    update(t, dt) {
        cat_transform.translation[1] = Math.sin(t) * 0.3 + Math.log(t) * 0.3;
        glm.quat.rotateY(cat_transform.rotation, cat_transform.rotation, dt * t * t * 0.1);
    }
});

const scene = [floor, cat, camera];

function update(t, dt) {
    for (const entity of scene) {
        for (const component of entity.components) {
            component.update?.(t, dt);
        }
    }
}

function render() {
    renderer.render(scene, camera);
}

function resize({ displaySize: { width, height }}) {
    camera.getComponentOfType(Camera).aspect = width / height;
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();