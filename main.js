import { mat4, vec3, vec4 } from 'glm';
import { quat } from 'glm';
import * as glm from 'glm';

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
import { LightComponent } from './src/components/LightComponent.js';
import { World } from './src/World.js';
import { Inputs } from './src/Inputs.js';

// time scale for slow down
window.worldTimeScale = 1; 

const resources = await loadResources({
    'white_image': new URL('./textures/white.png', import.meta.url),
    'floor_mesh': new URL('./models/floor/floor.json', import.meta.url),
    'floor_image': new URL('./models/floor/grass.png', import.meta.url),
    'guy_model': new URL('./models/xd/character.gltf', import.meta.url),
    'katana_model': new URL('./models/katana/katana.gltf', import.meta.url)
});


const canvas = document.querySelector('canvas');
const renderer = new UnlitRenderer(canvas);
await renderer.initialize(resources.white_image);

const inputs = new Inputs(canvas);

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


const guy_scene = resources.guy_model.loadScene();
const guy = resources.guy_model.buildEntityFromScene(guy_scene);
guy.skeleton.playAnimationByIndex(3);
guy.addComponent(new EnemyComponent(guy, player));
const guy_transform = guy.getComponentOfType(Transform);
scene.push(...guy_scene);

const guy2_scene = resources.guy_model.loadScene();
const guy2 = resources.guy_model.buildEntityFromScene(guy2_scene);
guy2.skeleton.playAnimationByIndex(4);
guy2.addComponent(new EnemyComponent(guy2, player));
const guy2_transform = guy2.getComponentOfType(Transform);
guy2_transform.translation = [3, 0, 0];
scene.push(...guy2_scene);

const guy2_katana_scene = resources.katana_model.loadScene();
const guy2_katana = resources.katana_model.buildEntityFromScene(guy2_katana_scene);
guy2_katana.addComponent(new EnemyComponent(guy2_katana, player));
const guy2_katana_transform = guy2_katana.getComponentOfType(Transform);
guy2_katana_transform.scale = [16, 16, 16];
guy2_katana.parent = guy2.findChildByName("mixamorig:RightHand");
scene.push(...guy2_katana_scene);

{
    const littleguy_scene = resources.katana_model.loadScene();
    const littleguy = resources.katana_model.buildEntityFromScene(littleguy_scene);
    littleguy.addComponent(new EnemyComponent(littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = [16, 16, 16];

    const littleguy2_scene = resources.katana_model.loadScene();
    const littleguy2 = resources.katana_model.buildEntityFromScene(littleguy2_scene);
    littleguy2.addComponent(new EnemyComponent(littleguy2, player));
    const littleguy2_transform = littleguy2.getComponentOfType(Transform);
    littleguy2_transform.scale = [16, 16, 16];

    littleguy2.parent = guy.findChildByName("mixamorig:RightHand");
    littleguy.parent = guy.findChildByName("mixamorig:LeftHand");
    scene.push(...littleguy_scene);
    scene.push(...littleguy2_scene);
}

const player_guy_scene = resources.guy_model.loadScene();
const player_guy = resources.katana_model.buildEntityFromScene(player_guy_scene);
player_guy.addComponent(new EnemyComponent(player_guy, player));
const player_guy_transform = player_guy.getComponentOfType(Transform);
player_guy_transform.translation = [0, -1, -1];
player_guy_transform.rotation = [0, 0, 0, 0];
quat.setAxisAngle(
  player_guy_transform.rotation,
  [0, 1, 0],   // Y axis
  Math.PI     // 180°
);
player_guy.parent = player.parent;
scene.push(...player_guy_scene);






// const player_katana_scene = resources.katana_model.loadScene();
// const player_katana = resources.katana_model.buildEntityFromScene(player_katana_scene);
// player_katana.addComponent(new EnemyComponent(player_katana, player));
// const player_katana_transform = player_katana.getComponentOfType(Transform);
// player_katana_transform.scale = [16, 16, 16];
// player_katana.parent = player_guy;
// scene.push(...player_katana_scene);


// stackoverflow
function hsv2rgb(h,s,v) 
{                              
  let f= (n,k=(n+h/60)%6) => v - v*s*Math.max( Math.min(k,4-k,1), 0);     
  return [f(5),f(3),f(1)];       
}  

const rotationMat = new glm.mat4();
glm.mat4.fromYRotation(rotationMat, .016);

const degreesToRads = deg => (deg * Math.PI) / 180.0;
const radsToDegrees = rad => (rad * 180.0) / Math.PI;
for (let i = 0; i < 360; i+=5)
{
    const light = new Entity();
    let translation = new vec4(Math.cos(degreesToRads(i)), Math.random() + 0.1, Math.sin(degreesToRads(i)), 1);
    vec3.scale(translation, translation, Math.random() * 9 + 1);
    light.transform = new Transform({ translation });
    light.addComponent(light.transform);
    light.addComponent(new LightComponent({ emission: hsv2rgb(Math.random() * 360, 1.0, 1.0) }));
    light.addComponent({update(t, dt) {
        glm.vec4.transformMat4(light.transform.translation, light.transform.translation, rotationMat);
    }});
    scene.push(light);
}

function updateWorldMatricesRecursive(entity, parentMatrix)
{
    const transform = entity.getComponentOfType(Transform);
    // TODO: tuki je transform.matrix dost slow k rab klicat fromRotationTranslatioScale
    transform.final = mat4.mul(transform.final, parentMatrix, transform.matrix);
    for (const child of entity.children) {
        updateWorldMatricesRecursive(child, transform.final);
    }
}

function update(t, dt) {

    const scaledDt = dt * World.timeScale;
    for (const entity of scene) {
        for (const component of entity.components) {
            if (component instanceof PlayerComponent) {
                component.update?.(t, dt);    
            } else {
                component.update?.(t, scaledDt); 
            }
        }
    }

    for (const entity of scene)
        if (!entity.parent)
            updateWorldMatricesRecursive(entity, new mat4());
        
    inputs.update();
}

function render() {
    renderer.render(scene, player, World.poprSettings);
}

function resize({ displaySize: { width, height }}) {
    player.getComponentOfType(Camera).aspect = width / height;
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();