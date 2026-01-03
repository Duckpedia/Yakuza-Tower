import { mat4, quat, vec3 } from 'glm';
import * as glm from 'glm';
import { GUI } from 'dat';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { PlayerComponent } from 'src/components/PlayerComponent.js';
import { RecordComponent } from 'src/components/RecordComponent.js';

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
import { Physics, Layers } from './src/Physics.js';
import { PhysicsComponent } from './src/components/PhysicsComponent.js';

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
  offset = new vec3(0, 1.0, 0),
  halfExtents = new vec3(0.35, 1.0, 0.35),
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
function createPickup(modelResource, position, scale = new vec3(0.2, 0.2, 0.2), rotationAxis = new vec3(1,0,0), rotationAngle = Math.PI/2, itemType = "generic")
{
    const visualEntity = modelResource.build(World.scene);

    const transform = visualEntity.getComponentOfType(Transform);
    transform.scale = scale;
    glm.quat.setAxisAngle(transform.rotation, rotationAxis, rotationAngle);

    const collider = World.scene.addEntity(World.scene.createEntity());
    collider.name = modelResource.name + "Collider";
    collider.addComponent(new Transform({ translation: position }));
    collider.velocity = new vec3(0, 0, 0); //da bo padlo na tla + dynamic ker ja 

    collider.addComponent(new PhysicsComponent({
        type: "aabb",
        localMin: [-scale[0], -scale[1], -scale[2]],
        localMax: [ scale[0],  scale[1],  scale[2]],
        isDynamic: true,
        layer: Layers.PICKUP,
        mask: Layers.WORLD | Layers.PLAYER, //se player da se bumpata, ce nocte da se bumpata sam zbriste da se collida s playerjem
    }));

    collider.isPickup = true;

    visualEntity.parent = collider;
    return collider;
}

const canvas = document.querySelector('canvas');
const renderer = new DeferredRenderer(canvas);
await renderer.initialize(resources.white_image, resources.dirt_image);

const inputs = new Inputs(canvas);
const physics = new Physics(World.scene);

const floor = World.scene.addEntity(World.scene.createEntity());
floor.name = "Floor";

floor.addComponent(new Transform({
  translation: [0, 0, 0], // Y = floor height
}));

//player creation

const player = World.scene.addEntity(World.scene.createEntity());
player.addComponent(new Transform({
    translation: new vec3(0, 1.2, 2),
}));
player.addComponent(new Camera());
player.addComponent(new RecordComponent());
player.addComponent(new PlayerComponent(player, canvas));

// to samo doda da dejansko dela aabb collision

player.currentItem = null;
//ce bi hotl da ni direkt na player:
//player.game = player.game ?? {};
//player.game.currentItem = null;

//current item bo zdj storeal kaj si picku up, pol pa lah droppas
//bi bilo zelo uporabno ce bi kdo hotu naredit weapone!!!!

//ok spremenila sm na bounds in sm dala player.currentItem namest customProperties da ne mixamo vec stvari

player.addComponent(new PhysicsComponent({
  type: "aabb",
  localMin: [-0.2, -0.2, -0.2],
  localMax: [ 0.2,  0.2,  0.2],
  isDynamic: true,
  layer: Layers.PLAYER,
  mask: Layers.WORLD | Layers.ENEMY | Layers.PICKUP,
}));
//layers!! koncno

//reference za item modele ko spawnas, prosim dodaj tukaj ce dodas se kaksen weapon
const itemResources = {
    katana: resources.katana_model,
    gun: resources.pistol_model,
};

//make pickups like this!!
const katanaPickup = createPickup(resources.katana_model, new vec3(2,0.1,0), new vec3(0.2,0.2,0.2), new vec3(1,0,0), Math.PI/2, "katana");
const pistolPickup = createPickup(resources.pistol_model, new vec3(3,0.1,1), new vec3(0.2,0.2,0.2), undefined, undefined, "gun");

const invisibleWallCollider = World.scene.addEntity(World.scene.createEntity());
invisibleWallCollider.name = 'InvisibleWall';
invisibleWallCollider.addComponent(new Transform({ translation: new vec3(4, 0.1, 0) }));

const soba = resources.soba_model.build(World.scene);

const guy = resources.guy_model.build(World.scene);
guy.skeleton.playAnimation(2, "base");
guy.addComponent(new EnemyComponent(guy, player));
guy.addComponent(new RecordComponent());

const rangedGuy = resources.guy_model.build(World.scene);
// rangedGuy.skeleton.playAnimationByIndex(3);
rangedGuy.addComponent(new EnemyComponent(rangedGuy, player, resources.bullet_model,'Ranged'));
rangedGuy.addComponent(new RecordComponent());
const rangedGuy_transform = rangedGuy.getComponentOfType(Transform);
rangedGuy_transform.translation = new vec3(1, 0, 1);

{
    const littleguy = resources.katana_model.build(World.scene);
    // littleguy.addComponent(new EnemyComponent(littleguy, player));
    const littleguy_transform = littleguy.getComponentOfType(Transform);
    littleguy_transform.scale = new vec3(16, 16, 16);

    const littleguy2 = resources.pistol_model.build(World.scene);
    // littleguy2.addComponent(new EnemyComponent(littleguy2, player));
    const littleguy2_transform = littleguy2.getComponentOfType(Transform);
    littleguy2_transform.scale = new vec3(20, 20, 20);

    littleguy2.parent = rangedGuy.findChildByName("up_righthand");
    littleguy.parent = guy.findChildByName("up_righthand");
}

// for (const entity of World.scene.entities()) {
//   if (entity.aabbManual) continue;

//   const model = entity.getComponentOfType(Model);
//   if (!model) continue;

//   const boxes = model.primitives.map(p => calculateAxisAlignedBoundingBox(p.mesh));
//   entity.aabb = mergeAxisAlignedBoundingBoxes(boxes);
// }

const cameras = []
for (const entity of World.scene.entities())
{
    const c = entity.getComponentOfType(Camera);
    if (c) cameras.push(entity);
}
let active_camera = 0;
World.activeCamera = cameras[0];
const defaultPoprSettings = World.poprSettings;

console.log(World.scene, glm);

const replay = { frames: [] };

function update(t, dt) {
    renderer.clearDebug();
    const time = World.getTime();
    World.timers.global.time = t;
    World.timers.global.dt = dt;
    World.timers.game.dt = dt * World.timeScale;
    World.timers.game.time += World.timers.game.dt;
    World.poprSettings.time = World.timers.global.time;

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
            World.poprSettings.blackAndWhite = 1.0;
        }
        else{
            World.poprSettings = defaultPoprSettings;
        }
    }

    if (Inputs.isPressed('KeyQ')) { // drop currently held item
        const currentItem = player.currentItem;
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
            player.currentItem = null;
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
                    if (hit.entity.itemType) {
                        player.currentItem = hit.entity.itemType;
                        console.log("Picked up:", player.currentItem);
                    }
                    player.currentItem = hit.entity;
                    player.currentItem.hidden = true;
                } else {
                    console.log("too far to pick up", hit.entity.name, distance);
                }
            } else {
                console.log("MISS or not a pickup");
            }
        }
    }

    if (Inputs.isPressed('KeyX'))
    {
        replay.start = time;
        replay.frames.length = 0;
    }

    if (Inputs.isHeld('KeyX'))
    {
        const frame = { data: new Map() };
        frame.time = time - replay.start;
        for (const [entity, _] of World.scene.query(RecordComponent)) {
            frame.data.set(entity, ({
                hidden: entity.hidden,
                translation: vec3.clone(entity._transform.translation),
                rotation: quat.clone(entity._transform.rotation),
                scale: vec3.clone(entity._transform.scale),
            }));
            entity.forEachChild((child) => {
                if (!child._transform) return;
                frame.data.set(child, ({
                    hidden: child.hidden,
                    translation: vec3.clone(child._transform.translation),
                    rotation: quat.clone(child._transform.rotation),
                    scale: vec3.clone(child._transform.scale),
                }));
            });
        }
        replay.frames.push(frame);
    }

    if (Inputs.isPressed('KeyZ'))
    {
        replay.playbackStart = time;
        World.doUpdate = false;
    }
    
    if (Inputs.isReleased('KeyZ'))
    {
        replay.playbackStart = time;
        World.doUpdate = true;
    }

    if (Inputs.isHeld('KeyZ') && replay.frames.length !== 0)
    {
        const replayTime = time - replay.playbackStart;
        let i = replay.frames.findIndex(f => replayTime <= f.time);
        if (i < 0) i = replay.frames.length - 1;
        const frame = replay.frames[Math.max(i - 1, 0)];
        const nextFrame = replay.frames[i];
        const delta = nextFrame.time - frame.time;
        const t = delta > 0.0 ? Math.min((replayTime - frame.time) / delta, 1.0) : 0.0;
        for (const [entity, a] of frame.data.entries())
        {
            const b = nextFrame.data.get(entity) ?? a;
            entity.hidden = t < 0.5 ? a.hidden : b.hidden;
            vec3.lerp(entity._transform.translation, a.translation, b.translation, t);
            quat.slerp(entity._transform.rotation, a.rotation, b.rotation, t);
            vec3.lerp(entity._transform.scale, a.scale, b.scale, t);
        }
    }
    
    if (World.doUpdate)
    {
        for (const entity of World.scene.entities()) {
            for (const component of entity.components) {
                component.update?.(); 
            }
        }
    }

    updateWorldMatricesRecursive(World.scene.root, new mat4());
        
    if (World.doUpdate)
    {
        inputs.update();

        physics.update(t, dt, World.scene);
    }
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
gui.add(World, 'doUpdate', 0, 1);
gui.add(World.poprSettings.bloom, 'threshold', 0.0, 10.0);
gui.add(World.poprSettings.bloom, 'filterRadius', 0.0, 10.0);
gui.add(World.poprSettings.bloom, 'strength', 0.0, 1.0);
gui.add(World.poprSettings.bloom, 'dirtStrength', 0.0, 100.0);
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
gui.add(World.poprSettings, 'vignette', 0.0, 1.0);
gui.add(World.poprSettings, 'vignetteRadius', 0.0, 2.0);
gui.add(World.poprSettings, 'vignetteSoftness', 0.0, 2.0);
gui.add(World.poprSettings, 'caX', -10.0, 10.0);
gui.add(World.poprSettings, 'caY', -10.0, 10.0);
gui.add(World.poprSettings, 'blackAndWhite', 0.0, 1.0);
gui.add(World.poprSettings, 'scanlines', 0.0, 1.0);
gui.add(World.poprSettings, 'scanlinesDensity', 0.0, 1.0);
gui.add(World.poprSettings, 'scanlinesSpeed', 0.0, 1.0);