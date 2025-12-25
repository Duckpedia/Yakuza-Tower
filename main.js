import { mat4, vec4, vec3 } from 'glm';
import * as glm from 'glm';
import { GUI } from 'dat';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { PlayerComponent } from 'src/components/PlayerComponent.js';

import {
    Camera,
    Entity,
    Model,
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

//tukej se vsi resources dodajajo
const resources = await loadResources({
    'white_image': new URL('./textures/white.png', import.meta.url),
    'dirt_image': new URL('./textures/DirtMaskTextureExample.webp', import.meta.url),
    'floor_mesh': new URL('./models/floor/floor.json', import.meta.url),
    'floor_image': new URL('./models/floor/grass.png', import.meta.url),
    'guy_model': new URL('./models/xd/character.gltf', import.meta.url),
    'katana_model': new URL('./models/katana/katana.gltf', import.meta.url),
    'soba_model' : new URL('./models/soba/soba.gltf', import.meta.url),
    'pistol_model' : new URL('./models/pistol/pistol.gltf', import.meta.url),
    'bullet_model' : new URL('./models/bullet/bullett.gltf', import.meta.url)
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

// make the weapons n shit (anything made with this will be pickable up)
function createPickup(modelResource, position, scale = [0.2, 0.2, 0.2], rotationAxis = [1,0,0], rotationAngle = Math.PI/2, itemType = "generic")
{
    const pickupScene = modelResource.loadScene();
    const visualEntity = modelResource.buildEntityFromScene(pickupScene);

    const transform = visualEntity.getComponentOfType(Transform);
    transform.translation = position;
    transform.scale = scale;
    glm.quat.setAxisAngle(transform.rotation, rotationAxis, rotationAngle);

    scene.push(...pickupScene);

    const collider = new Entity();
    collider.name = modelResource.name + "Collider";
    collider.addComponent(new Transform({ translation: position }));
    collider.customProperties = { isStatic: true, itemType };
    collider.aabbManual = true;
    collider.aabb = { 
        min: [-scale[0], -scale[1], -scale[2]], 
        max: [ scale[0],  scale[1],  scale[2]] 
    };

    collider.isPickup = true;
    collider.visualEntities = pickupScene;

    scene.push(collider);

    return collider;
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
player.customProperties = { isDynamic: true, currentItem: null };
//current item bo zdj storeal kaj si picku up, pol pa lah droppas
//bi bilo zelo uporabno ce bi kdo hotu naredit weapone!!!!


player.aabb = {
  min: [-0.2, -0.2, -0.2],
  max: [ 0.2,  0.2,  0.2],
};

const scene = [player];

//reference za item modele ko spawnas, prosim dodaj tukaj ce dodas se kaksen weapon
const itemResources = {
    katana: resources.katana_model,
    gun: resources.pistol_model,
};

//make pickups like this!!
const katanaPickup = createPickup(resources.katana_model, [2,0.1,0], [0.2,0.2,0.2], [1,0,0], Math.PI/2, "katana");
const pistolPickup = createPickup(resources.pistol_model, [3,0.1,1], [0.2,0.2,0.2], undefined, undefined, "gun");


const invisibleWallCollider = new Entity();
invisibleWallCollider.name = 'InvisibleWall';
invisibleWallCollider.addComponent(new Transform({ translation: [4, 0.1, 0] }));
invisibleWallCollider.customProperties = { isStatic: true };
invisibleWallCollider.aabbManual = true;
invisibleWallCollider.aabb = {
  min: [-0.05, -0.1, -2.0],
  max: [ 0.05, 10.0, 2.0]
};
scene.push(invisibleWallCollider);

const soba_scene = resources.soba_model.loadScene();
const soba = resources.soba_model.buildEntityFromScene(soba_scene);
soba.customProperties = { isStatic: true };
scene.push(...soba_scene);

const guy_scene = resources.guy_model.loadScene();
const guy = resources.guy_model.buildEntityFromScene(guy_scene);
guy.skeleton.playAnimationByIndex(3);
guy.addComponent(new EnemyComponent(scene, guy, player));
guy.customProperties = { isDynamic: true };
guy.aabbManual = true;
guy.aabb = { min: [-0.35, -0.1, -0.30], max: [0.35, 1.6, 0.30] };
scene.push(...guy_scene);

const rangedGuyScene = resources.guy_model.loadScene();
const rangedGuy = resources.guy_model.buildEntityFromScene(rangedGuyScene);
rangedGuy.skeleton.playAnimationByIndex(3);
rangedGuy.addComponent(new EnemyComponent(scene, rangedGuy, player, resources.bullet_model,'Ranged'));
const rangedGuy_transform = rangedGuy.getComponentOfType(Transform);
rangedGuy_transform.translation = [1, 0, 1];
rangedGuy.customProperties = { isDynamic: true };
rangedGuy.aabbManual = true;
rangedGuy.aabb = { min: [-0.35, -0.1, -0.30], max: [0.35, 1.6, 0.30] };
scene.push(...rangedGuyScene);

{
    const littleguy_scene = resources.katana_model.loadScene();
    const littleguy = resources.katana_model.buildEntityFromScene(littleguy_scene);
    littleguy.addComponent(new EnemyComponent(scene, littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = [16, 16, 16];

    const littleguy2_scene = resources.pistol_model.loadScene();
    const littleguy2 = resources.pistol_model.buildEntityFromScene(littleguy2_scene);
    littleguy2.addComponent(new EnemyComponent(scene, littleguy2, player));
    const littleguy2_transform = littleguy2.getComponentOfType(Transform);
    littleguy2_transform.scale = [20, 20, 20];

    littleguy2.parent = rangedGuy.findChildByName("mixamorig:RightHand");
    littleguy.parent = guy.findChildByName("mixamorig:RightHand");
    scene.push(...littleguy_scene);
    scene.push(...littleguy2_scene);
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
for (let i = 0; i < 360; i += 60)
{
    const light = new Entity();
    let translation = new vec4(Math.cos(degreesToRads(i)), Math.random() + 0.1, Math.sin(degreesToRads(i)), 1);
    vec3.scale(translation, translation, Math.random() * 9 + 1);
    light.transform = new Transform({ translation });
    light.addComponent(light.transform);
    light.addComponent(new LightComponent({ color: hsv2rgb(Math.random() * 360, 1.0, 1.0), intensity: Math.random() * 70 + 2230.0 }));
    light.addComponent({ update(t, dt) { glm.vec4.transformMat4(light.transform.translation, light.transform.translation, rotationMat); }});
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
    if (World.poprSettings.debug)
    {
        const x = -11;
        DeferredRenderer.Draw3DLine([x, 1, -0.5], [x, 1, 0.5]);
        DeferredRenderer.Draw3DBoxMinMax([x - 1, 0, -1], [x + 1, 1, 1], null);
        DeferredRenderer.Draw3DBoxPosScale([x, 1, 0], [0.5, 0.5, 0.5], mat4.rotateY(new mat4(), new mat4(), t));
        DeferredRenderer.DrawAxis([x, 0, 0], 3);
    }

    if (Inputs.isPressed('KeyG'))
    {
        World.poprSettings.pass = (World.poprSettings.pass + 1) % 6;
        World.poprSettings.showBloom = World.poprSettings.pass == 0;
        World.poprSettings.showSkybox = World.poprSettings.pass == 0;
        World.poprSettings.showUI = World.poprSettings.pass == 0;
    }

    if (Inputs.isPressed('KeyH'))
    {
        World.poprSettings.wireframe = !World.poprSettings.wireframe;
    }

    if (Inputs.isPressed('KeyI'))
    {
        World.poprSettings.debug = !World.poprSettings.debug;
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

if (Inputs.isPressed('KeyQ')) { // drop currently held item
    const currentItem = player.customProperties.currentItem;
    if (currentItem) {
        const playerTransform = player.getComponentOfType(Transform);
        const spawnPosition = vec3.clone(playerTransform.translation);

        const forward = vec3.transformQuat(vec3.create(), [0, 0, -1], playerTransform.rotation);
        vec3.scaleAndAdd(spawnPosition, spawnPosition, forward, 0.5);

        const resource = itemResources[currentItem];
        createPickup(resource, spawnPosition, [0.2, 0.2, 0.2], [1,0,0], Math.PI/2, currentItem);

        // clear item, can comment this if u wanna spawn lots
        player.customProperties.currentItem = null;
    }
    else {
        const camEntity = World.activeCamera;
        const camTransform = camEntity.getComponentOfType(Transform);

        const from = vec3.clone(camTransform.translation);

        const forward = vec3.transformQuat(
            vec3.create(),
            [0, 0, -1],
            camTransform.rotation
        );

        const to = vec3.scaleAndAdd(
            vec3.create(),
            from,
            forward,
            50.0
        );

        const hit = physics.raycast(from, to);

        if (hit && hit.entity.isPickup) {
            const distance = vec3.distance(from, hit.point);
            if (distance <= 3.0) { // distance check (not perfect since camera is off the floor)
                console.log("PICKUP HIT", hit.point, hit.distance);

                // drop current item if there is one
                if (player.customProperties.currentItem) {
                    const playerTransform = player.getComponentOfType(Transform);
                    const dropPosition = vec3.clone(playerTransform.translation);
                    const forward = vec3.transformQuat(vec3.create(), [0, 0, -1], playerTransform.rotation);
                    vec3.scaleAndAdd(dropPosition, dropPosition, forward, 0.5);

                    const resource = itemResources[player.customProperties.currentItem];
                    createPickup(resource, dropPosition, [0.2, 0.2, 0.2], [1, 0, 0], Math.PI/2, player.customProperties.currentItem);

                    console.log("dropped previous item:", player.customProperties.currentItem);
                }

                // pick up new item
                if (hit.entity.customProperties?.itemType) {
                    player.customProperties.currentItem = hit.entity.customProperties.itemType;
                    console.log("Picked up:", player.customProperties.currentItem);
                }

                // remove visual and collider of pickedup
                const i = scene.indexOf(hit.entity);
                if (i !== -1) scene.splice(i, 1);

                if (hit.entity.visualEntities) {
                    for (const v of hit.entity.visualEntities) {
                        const vi = scene.indexOf(v);
                        if (vi !== -1) scene.splice(vi, 1);
                    }
                }
            } else {
                console.log("too far to pick up", hit.entity.name, distance);
            }
        } else {
            console.log("MISS or not a pickup");
        }

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
        if (!entity.parent) updateWorldMatricesRecursive(entity, new mat4());
    }
        
    inputs.update();
    physics.update(t, dt);
}

function updateWorldMatricesRecursive(entity, parentMatrix)
{
    const transform = entity._transform;
    // TODO: tuki je transform.matrix dost slow k rab klicat fromRotationTranslatioScale
    mat4.mul(transform.final, parentMatrix, transform.matrix);
    if (entity._calculateInverse)
        mat4.invert(transform.inv_final, transform.final);
    for (const child of entity.children) {
        updateWorldMatricesRecursive(child, transform.final);
    }
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
gui.add(World.poprSettings.tonemapping, 'index', 0, 3);
gui.add(World.poprSettings.tonemapping.agxSlope, 0, 0.0, 1.0).name('slopeX');
gui.add(World.poprSettings.tonemapping.agxSlope, 1, 0.0, 1.0).name('slopeY');
gui.add(World.poprSettings.tonemapping.agxSlope, 2, 0.0, 1.0).name('slopeZ');
gui.add(World.poprSettings.tonemapping.agxPower, 0, 0.0, 2.0).name('powerX');
gui.add(World.poprSettings.tonemapping.agxPower, 1, 0.0, 2.0).name('powerY');
gui.add(World.poprSettings.tonemapping.agxPower, 2, 0.0, 2.0).name('powerZ');
gui.add(World.poprSettings.tonemapping, 'agxSat', 0.0, 5.0);
gui.add(World.poprSettings, 'test', 0.0, 1.0);
gui.add(World.poprSettings, 'showSSAO', 0.0, 1.0);
gui.add(World.poprSettings, 'ssaoRadius', 0.0, 1.0);
gui.add(World.poprSettings, 'ssaoBias', 0.0, 0.1);
gui.add(World.poprSettings, 'ssaoMaxDelta', 0.0, 1.0);