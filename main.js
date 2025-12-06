import * as glm from 'glm';

import { GLTFLoader } from 'engine/loaders/GLTFLoader.js';
import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { UnlitRenderer } from 'engine/renderers/UnlitRenderer.js';
import { PlayerComponent } from 'src/components/PlayerComponent.js';

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
import { EnemyComponent } from 'src/components/EnemyComponent.js';

const resources = await loadResources({
    'floor_mesh': new URL('./models/floor/floor.json', import.meta.url),
    'floor_image': new URL('./models/floor/grass.png', import.meta.url),
});

const canvas = document.querySelector('canvas');
const renderer = new UnlitRenderer(canvas);
await renderer.initialize();

const player = new Entity();
player.addComponent(new Transform({
    translation: [0, 1, 0],
}));
player.addComponent(new Camera());
player.addComponent(new PlayerComponent(player, canvas));

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

const scene = [floor, player];

const torad = Math.PI / 180;;
for (let i = 0; i < 360; i++) {
    const angle = i * torad;
    const distance = 5 + Math.random() * 75;
    const height = 1 + Math.random() * 75;
    const cat = loader.loadScene()[0];
    const transform = cat.getComponentOfType(Transform);
    transform.translation = [
        Math.cos(angle) * distance,
        height,
        Math.sin(angle) * distance,
    ];
    transform.rotation = glm.quat.random(new glm.quat());
    console.log(transform.translation);
    transform.scale = new glm.vec3(glm.vec3.length(transform.translation) * 0.7);
    cat.addComponent(new EnemyComponent(cat));
    scene.push(cat);
}

function update(t, dt) {
    for (const entity of scene) {
        for (const component of entity.components) {
            component.update?.(t, dt);
        }
    }
}

function render() {
    renderer.render(scene, player);
}

function resize({ displaySize: { width, height }}) {
    player.getComponentOfType(Camera).aspect = width / height;
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();