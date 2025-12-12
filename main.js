import { GUI } from 'dat';
import { mat4 } from 'glm';

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
    translation: [0, 1.2, 2],
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
                albedoTexture: new Texture({
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
const guy_scene = guy_loader.loadScene();
const guy = guy_loader.buildEntityFromScene(guy_scene);
guy.skeleton.playAnimationByIndex(0);
guy.addComponent(new EnemyComponent(guy, player));
const guy_transform = guy.getComponentOfType(Transform);
guy_transform.scale = [.01, .01, .01];
scene.push(...guy_scene);

{
    const littleguy_scene = guy_loader.loadScene();
    const littleguy = guy_loader.buildEntityFromScene(littleguy_scene);
    littleguy.addComponent(new EnemyComponent(littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = [.6, .6, .6];
    littleguy.parent = guy.findChildByName("mixamorig:LeftHand");
    scene.push(...littleguy_scene);
}

function updateWorldMatricesRecursive(entity, parentMatrix)
{
    const transform = entity.getComponentOfType(Transform);
    transform.final = mat4.mul(transform.final, parentMatrix, transform.matrix);
    for (const child of entity.children) {
        updateWorldMatricesRecursive(child, transform.final);
    }
}

function update(t, dt) {
    // full update
    for (const entity of scene) {
        for (const component of entity.components) {
            component.update?.(t, dt);
        }
    }

    // figure out the final world matrices down the node tree
    for (const entity of scene)
        if (!entity.parent)
            updateWorldMatricesRecursive(entity, new mat4());
}

function render() {
    renderer.render(scene, player);
}

function resize({ displaySize: { width, height }}) {
    player.getComponentOfType(Camera).aspect = width / height;
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();