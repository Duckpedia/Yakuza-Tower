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


//Vsi loaderji
const guy_loader = new GLTFLoader();
await guy_loader.load(new URL('./models/xd/character.gltf', import.meta.url));
const katana_loader = new GLTFLoader();
await katana_loader.load(new URL('./models/katana/katana.gltf', import.meta.url));






const guy_scene = guy_loader.loadScene();
const guy = guy_loader.buildEntityFromScene(guy_scene);
guy.skeleton.playAnimationByIndex(3);
guy.addComponent(new EnemyComponent(guy, player));
const guy_transform = guy.getComponentOfType(Transform);
scene.push(...guy_scene);

const guy2_scene = guy_loader.loadScene();
const guy2 = guy_loader.buildEntityFromScene(guy2_scene);
guy2.skeleton.playAnimationByIndex(4);
console.log(guy2.skeleton);
guy2.addComponent(new EnemyComponent(guy2, player));
const guy2_transform = guy2.getComponentOfType(Transform);
guy2_transform.translation = [3, 0, 0];
scene.push(...guy2_scene);


const guy2_katana_scene = katana_loader.loadScene();
const guy2_katana = katana_loader.buildEntityFromScene(guy2_katana_scene);
guy2_katana.addComponent(new EnemyComponent(guy2_katana, player));
const guy2_katana_transform = guy2_katana.getComponentOfType(Transform);
guy2_katana_transform.scale = [16, 16, 16];
guy2_katana.parent = guy2.findChildByName("mixamorig:RightHand");
scene.push(...guy2_katana_scene);

{
    const littleguy_scene = katana_loader.loadScene();
    const littleguy = katana_loader.buildEntityFromScene(littleguy_scene);
    littleguy.addComponent(new EnemyComponent(littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = [16, 16, 16];



    const littleguy2_scene = katana_loader.loadScene();
    const littleguy2 = katana_loader.buildEntityFromScene(littleguy2_scene);
    littleguy2.addComponent(new EnemyComponent(littleguy2, player));
    const littleguy2_transform = littleguy2.getComponentOfType(Transform);
    littleguy2_transform.scale = [16, 16, 16];


    littleguy2.parent = guy.findChildByName("mixamorig:RightHand");
    littleguy.parent = guy.findChildByName("mixamorig:LeftHand");
    scene.push(...littleguy_scene);
    scene.push(...littleguy2_scene);
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