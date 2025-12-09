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
import { EnemyComponent } from './src/components/EnemyComponent.js';

const resources = await loadResources({
    'white_image': new URL('./textures/white.png', import.meta.url),
    'floor_mesh': new URL('./models/floor/floor.json', import.meta.url),
    'floor_image': new URL('./models/floor/grass.png', import.meta.url),
});

const canvas = document.querySelector('canvas');
const renderer = new UnlitRenderer(canvas);
await renderer.initialize(resources.white_image);

const player = new Entity();
player.addComponent(new Transform({
    translation: [0, 1, 0],
}));
player.addComponent(new Camera());
player.addComponent(new PlayerComponent(player, canvas));

const scene = [player];

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
scene.push(floor);

const guy_loader = new GLTFLoader();
await guy_loader.load(new URL('./models/xd/character.gltf', import.meta.url));

let i = 0;
while(true) {
    const guy_scene = guy_loader.loadScene();
    const guy = guy_loader.buildEntityFromScene(guy_scene);
    if (!guy.skeleton.playAnimationByIndex(i++))
        break;
    const guy_transform = guy.getComponentOfType(Transform);
    guy_transform.translation = [i * (i % 2 ? 1 : -1), 0, -3];
    guy_transform.scale = [.1, .1, .1];
    scene.push(...guy_scene);
}

const loader = new GLTFLoader();
await loader.load(new URL('./models/cat/cat.gltf', import.meta.url));
const cat_scene = loader.loadScene();
const cat = loader.buildEntityFromScene(cat_scene);
const transform = cat.getComponentOfType(Transform);
transform.translation = [0, 0, -2];
cat.addComponent(new EnemyComponent(cat));
scene.push(...cat_scene);

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