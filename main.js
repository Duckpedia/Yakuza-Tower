import { mat4, vec4, vec3 } from 'glm';
import * as glm from 'glm';
import { GUI } from 'dat';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
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
import { DeferredRenderer } from './src/renderer/DeferredRenderer.js';
import { EnemyComponent } from './src/components/EnemyComponent.js';
import { LightComponent } from './src/components/LightComponent.js';
import { World } from './src/World.js';
import { Inputs } from './src/Inputs.js';
import { Physics } from './src/Physics.js';

import {
    calculateAxisAlignedBoundingBox,
    mergeAxisAlignedBoundingBoxes,
} from 'engine/core/MeshUtils.js';

// time scale for slow down
window.worldTimeScale = 1; 

//tukej se vsi resources dodajajo
const resources = await loadResources({
    'white_image': new URL('./textures/white.png', import.meta.url),
    'dirt_image': new URL('./textures/DirtMaskTextureExample.webp', import.meta.url),
    'floor_mesh': new URL('./models/floor/floor.json', import.meta.url),
    'floor_image': new URL('./models/floor/grass.png', import.meta.url),
    'guy_model': new URL('./models/xd/character.gltf', import.meta.url),
    'katana_model': new URL('./models/katana/katana.gltf', import.meta.url),
    'soba_model' : new URL('./models/soba/soba.gltf', import.meta.url),
    'pistol_model' : new URL('./models/pistol/pistol.gltf', import.meta.url)
});

//box helper colider, da ne bo problemov z animated mesh
function attachBoxCollider(parent, {
  name = 'Collider',
  offset = [0, 1.0, 0],
  halfExtents = [0.35, 1.0, 0.35],
  isStatic = true,
} = {}) {
  const c = new Entity();
  c.name = name;

  c.addComponent(new Transform({
    translation: offset,
  }));

  c.customProperties = isStatic ? { isStatic: true } : { isDynamic: true };
  c.aabbManual = true;
  c.aabb = {
    min: [-halfExtents[0], -halfExtents[1], -halfExtents[2]],
    max: [ halfExtents[0],  halfExtents[1],  halfExtents[2]],
  };

  c.parent = parent;
  parent.children ??= [];
  parent.children.push(c);

  return c;
}

const canvas = document.querySelector('canvas');
const renderer = new DeferredRenderer(canvas);
await renderer.initialize(resources.white_image, resources.dirt_image);

const inputs = new Inputs(canvas);

//player creation

const player = new Entity();
player.addComponent(new Transform({
    translation: [0, 1.2, 2],
}));
player.addComponent(new Camera());
player.addComponent(new PlayerComponent(player, canvas));

// to samo doda da dejansko dela aabb collision
player.customProperties = { isDynamic: true };

player.aabb = {
  min: [-0.2, -0.2, -0.2],
  max: [ 0.2,  0.2,  0.2],
};

const scene = [player];

const soba_scene = resources.soba_model.loadScene();
const soba = resources.soba_model.buildEntityFromScene(soba_scene);
soba.customProperties = { isStatic: true };
scene.push(...soba_scene);

//box object creation

const box = new Entity();
box.addComponent(new Transform({ translation: [0, 0.5, 0] })); // collider position
box.customProperties = { isStatic: true };
box.aabb = { min: [-0.5,-0.5,-0.5], max: [0.5,0.5,0.5] };
box.aabbManual = true;
scene.push(box);


scene.push(box);

const guy_scene = resources.guy_model.loadScene();
const guy = resources.guy_model.buildEntityFromScene(guy_scene);
guy.skeleton.playAnimationByIndex(3);
guy.addComponent(new EnemyComponent(guy, player));
scene.push(...guy_scene);


const rangedGuyScene = resources.guy_model.loadScene();
const rangedGuy = resources.guy_model.buildEntityFromScene(rangedGuyScene);
rangedGuy.skeleton.playAnimationByIndex(3);
rangedGuy.addComponent(new EnemyComponent(rangedGuy, player, 'Ranged'));
const rangedGuy_transform = rangedGuy.getComponentOfType(Transform);
rangedGuy_transform.translation = [1, 0, 1];
scene.push(...rangedGuyScene);

const guyCollider = attachBoxCollider(guy, {
  offset: [0, 1.0, 0],
  halfExtents: [0.35, 0.9, 0.35],
  isStatic: true,
});

scene.push(guyCollider);

const rangedGuyCollider = attachBoxCollider(rangedGuy, {
  offset: [0, 1.0, 0],
  halfExtents: [0.35, 0.9, 0.35],
  isStatic: true,
});

scene.push(rangedGuyCollider);

{
    const littleguy_scene = resources.katana_model.loadScene();
    const littleguy = resources.katana_model.buildEntityFromScene(littleguy_scene);
    littleguy.addComponent(new EnemyComponent(littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = [16, 16, 16];

    const littleguy2_scene = resources.pistol_model.loadScene();
    const littleguy2 = resources.pistol_model.buildEntityFromScene(littleguy2_scene);
    littleguy2.addComponent(new EnemyComponent(littleguy2, player));
    const littleguy2_transform = littleguy2.getComponentOfType(Transform);
    littleguy2_transform.scale = [20, 20, 20];

    littleguy2.parent = rangedGuy.findChildByName("mixamorig:RightHand");
    littleguy.parent = guy.findChildByName("mixamorig:RightHand");
    scene.push(...littleguy_scene);
    scene.push(...littleguy2_scene);
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

// stackoverflow
function hsv2rgb(h,s,v) 
{                              
  let f= (n,k=(n+h/60)%6) => v - v*s*Math.max( Math.min(k,4-k,1), 0);     
  return [f(5),f(3),f(1)];       
}  

const rotationMat = new glm.mat4();
glm.mat4.fromYRotation(rotationMat, .016);

const degreesToRads = deg => (deg * Math.PI) / 180.0;
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

const physics = new Physics(scene);
for (const entity of scene) {
  if (entity.aabbManual) continue;

  const model = entity.getComponentOfType(Model);
  if (!model) continue;

  const boxes = model.primitives.map(p => calculateAxisAlignedBoundingBox(p.mesh));
  entity.aabb = mergeAxisAlignedBoundingBoxes(boxes);
}

const cameras = []
for (const entity of scene)
{
    const c = entity.getComponentOfType(Camera);
    if (c) cameras.push(entity);
}
let active_camera = 0;
World.activeCamera = cameras[0];
const defaultPoprSettings = World.poprSettings;

function update(t, dt) {
    if (Inputs.isPressed('KeyG'))
    {
        World.poprSettings.pass = (World.poprSettings.pass + 1) % 5
    }

    if (Inputs.isPressed('KeyT'))
    {
        active_camera = (active_camera + 1) % cameras.length;
        World.activeCamera = cameras[active_camera];
        if (active_camera == 1)
        {
            World.poprSettings = structuredClone(World.poprSettings);
            World.poprSettings.bloom.dirtStrength = 20.0;
            World.poprSettings.bloom.strength = 0.05;
            World.poprSettings.blackAndWhite = 1;
        }
        else{
            World.poprSettings = defaultPoprSettings;
        }
    }

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
    {
        if (!entity.parent)
        {
            updateWorldMatricesRecursive(entity, new mat4());
        }
    }
        
    inputs.update();
    physics.update(t, dt);
}

function render() {
    renderer.render(scene, World.activeCamera, World.poprSettings);
}

function resize({ displaySize: { width, height }}) {
    for (const camera of cameras)
    {
        camera.getComponentOfType(Camera).aspect = width / height;
    }
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();

const gui = new GUI();
gui.add(World.poprSettings.bloom, 'threshold', 0.0, 10.0);
gui.add(World.poprSettings.bloom, 'filterRadius', 0.0, 10.0);
gui.add(World.poprSettings.bloom, 'strength', 0.0, 1.0);
