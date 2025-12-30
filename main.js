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
    Transform
} from 'engine/core/core.js';

import { updateWorldMatricesRecursive } from './root/engine/core/SceneUtils.js';

import { loadResources } from 'engine/loaders/resources.js';
import { DeferredRenderer } from './src/renderer/DeferredRenderer.js';
import { EnemyComponent } from './src/components/EnemyComponent.js';
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
  const c = World.scene.createEntity();
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
    const visualEntity = modelResource.build(World.scene);

    const transform = visualEntity.getComponentOfType(Transform);
    transform.scale = scale;
    glm.quat.setAxisAngle(transform.rotation, rotationAxis, rotationAngle);

    const collider = World.scene.addEntity(World.scene.createEntity());
    collider.name = modelResource.name + "Collider";
    collider.addComponent(new Transform({ translation: position }));
    collider.customProperties = { isStatic: true, itemType };
    collider.aabbManual = true;
    collider.aabb = { 
        min: [-scale[0], -scale[1], -scale[2]], 
        max: [ scale[0],  scale[1],  scale[2]] 
    };

    collider.isPickup = true;

    visualEntity.parent = collider;
    return collider;
}

const canvas = document.querySelector('canvas');
const renderer = new DeferredRenderer(canvas);
await renderer.initialize(resources.white_image, resources.dirt_image);

const inputs = new Inputs(canvas);
const physics = new Physics(World.scene);

//player creation

const player = World.scene.addEntity(World.scene.createEntity());
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

//reference za item modele ko spawnas, prosim dodaj tukaj ce dodas se kaksen weapon
const itemResources = {
    katana: resources.katana_model,
    gun: resources.pistol_model,
};

//make pickups like this!!
const katanaPickup = createPickup(resources.katana_model, [2,0.1,0], [0.2,0.2,0.2], [1,0,0], Math.PI/2, "katana");
const pistolPickup = createPickup(resources.pistol_model, [3,0.1,1], [0.2,0.2,0.2], undefined, undefined, "gun");


const invisibleWallCollider = World.scene.addEntity(World.scene.createEntity());
invisibleWallCollider.name = 'InvisibleWall';
invisibleWallCollider.addComponent(new Transform({ translation: [4, 0.1, 0] }));
invisibleWallCollider.customProperties = { isStatic: true };
invisibleWallCollider.aabbManual = true;
invisibleWallCollider.aabb = {
  min: [-0.05, -0.1, -2.0],
  max: [ 0.05, 10.0, 2.0]
};

const soba = resources.soba_model.build(World.scene);
soba.customProperties = { isStatic: true };

const guy = resources.guy_model.build(World.scene);
guy.skeleton.playAnimationByIndex(3);
guy.addComponent(new EnemyComponent(guy, player));
guy.customProperties = { isDynamic: true };
guy.aabbManual = true;
guy.aabb = { min: [-0.35, -0.1, -0.30], max: [0.35, 1.6, 0.30] };

const rangedGuy = resources.guy_model.build(World.scene);
rangedGuy.skeleton.playAnimationByIndex(3);
rangedGuy.addComponent(new EnemyComponent(rangedGuy, player, resources.bullet_model,'Ranged'));
const rangedGuy_transform = rangedGuy.getComponentOfType(Transform);
rangedGuy_transform.translation = [1, 0, 1];
rangedGuy.customProperties = { isDynamic: true };
rangedGuy.aabbManual = true;
rangedGuy.aabb = { min: [-0.35, -0.1, -0.30], max: [0.35, 1.6, 0.30] };

{
    const littleguy = resources.katana_model.build(World.scene);
    // littleguy.addComponent(new EnemyComponent(littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = [16, 16, 16];

    const littleguy2 = resources.pistol_model.build(World.scene);
    // littleguy2.addComponent(new EnemyComponent(littleguy2, player));
    const littleguy2_transform = littleguy2.getComponentOfType(Transform);
    littleguy2_transform.scale = [20, 20, 20];

    littleguy2.parent = rangedGuy.findChildByName("mixamorig:RightHand");
    littleguy.parent = guy.findChildByName("mixamorig:RightHand");
}

for (const entity of World.scene.entities()) {
  if (entity.aabbManual) continue;

  const model = entity.getComponentOfType(Model);
  if (!model) continue;

  const boxes = model.primitives.map(p => calculateAxisAlignedBoundingBox(p.mesh));
  entity.aabb = mergeAxisAlignedBoundingBoxes(boxes);
}

const cameras = []
for (const entity of World.scene.entities())
{
    const c = entity.getComponentOfType(Camera);
    if (c) cameras.push(entity);
}
let active_camera = 0;
World.activeCamera = cameras[0];
const defaultPoprSettings = World.poprSettings;

function update(t, dt) {
    World.poprSettings.time = t;
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
        World.poprSettings.pass = (World.poprSettings.pass + 1) % 7;
        World.poprSettings.showBloom = World.poprSettings.pass == 0;
        World.poprSettings.showSkybox = World.poprSettings.pass == 0;
        World.poprSettings.showUI = World.poprSettings.pass == 0;
    }

    if (Inputs.isPressed('KeyE'))
    {
        guy.hidden = !guy.hidden;
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
    if (currentItem)
    {
        currentItem._transform.matrix = player._transform.matrix;
        const forward = vec3.transformQuat(
            vec3.create(),
            [0, 0, -1],
            player._transform.rotation
        );
        vec3.add(currentItem._transform.translation, currentItem._transform.translation, forward);
        currentItem.hidden = false;
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

        const hit = physics.raycast(from, to, World.scene);
        if (hit && hit.entity.isPickup) {
            const distance = vec3.distance(from, hit.point);
            if (distance <= 3.0) { // distance check (not perfect since camera is off the floor)
                console.log("PICKUP HIT", hit.point, hit.distance);
                // pick up new item
                if (hit.entity.customProperties?.itemType) {
                    player.customProperties.currentItem = hit.entity.customProperties.itemType;
                    console.log("Picked up:", player.customProperties.currentItem);
                }
                player.customProperties.currentItem = hit.entity;
                player.customProperties.currentItem.hidden = true;
            } else {
                console.log("too far to pick up", hit.entity.name, distance);
            }
        } else {
            console.log("MISS or not a pickup");
        }
    }
}

    const scaledDt = dt * World.timeScale;
    for (const entity of World.scene.entities()) {
        for (const component of entity.components) {
            if (component instanceof PlayerComponent) {
                component.update?.(t, dt);    
            } else {
                component.update?.(t, scaledDt); 
            }
        }
    }

    updateWorldMatricesRecursive(World.scene.root, new mat4());
        
    inputs.update();
    physics.update(t, dt, World.scene);
}

function render() 
{
    renderer.render(World.scene, World.activeCamera, World.poprSettings);
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
gui.add(World.poprSettings, 'showSSAO', 0, 1);
gui.add(World.poprSettings, 'ssaoRadius', 0.0, 1.0);
gui.add(World.poprSettings, 'ssaoBias', 0.0, 0.1);
gui.add(World.poprSettings, 'ssaoMaxDelta', 0.0, 1.0);
gui.add(World.poprSettings, 'fogStrength', 0.0, 0.1);
gui.add(World.poprSettings, 'fogLightFactor', 0.0, 10.0);
gui.add(World.poprSettings, 'fogSteps', 0, 160);
gui.add(World.poprSettings, 'showFog', 0, 1);