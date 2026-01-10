import { mat4, quat, vec3 } from 'glm';
import * as glm from 'glm';
import { GUI } from 'dat';

import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { PlayerComponent } from 'src/components/PlayerComponent.js';
import { RecordComponent } from 'src/components/RecordComponent.js';

import {
    Camera,
    Transform
} from 'engine/core/core.js';

import { loadResources } from 'engine/loaders/resources.js';
import { DeferredRenderer } from './src/renderer/DeferredRenderer.js';
import { EnemyComponent } from './src/components/EnemyComponent.js';
import { BulletPool } from './src/components/BulletPool.js';
import { World } from './src/World.js';
import { Inputs } from './src/Inputs.js';
import { Physics, Layers } from './src/Physics.js';
import { PhysicsComponent } from './src/components/PhysicsComponent.js';
import { updateFinalMatrixTree } from './engine/core/SceneUtils.js';
import { KatanaComponent } from './src/components/KatanaComponent.js';
import { Scene } from './src/Scene.js';
import { SpawnpointComponent } from './src/components/SpawnpointComponent.js';

let gameStarted = false;

//tukej se vsi resources dodajajo
const resources = await loadResources({
    'white_image': new URL('./textures/white.png', import.meta.url),
    'dirt_image': new URL('./textures/DirtMaskTextureExample.webp', import.meta.url),
    'guy_model': new URL('./models/xd/character.gltf', import.meta.url),
    'katana_model': new URL('./models/katana_real/katana.gltf', import.meta.url),
    'soba_model' : new URL('./models/ulica/ulica.gltf', import.meta.url),
    'tutorial' : new URL('./models/tutorial/tutorial.gltf', import.meta.url),
    'pistol_model' : new URL('./models/pistol/pistol.gltf', import.meta.url),
    'bullet_model' : new URL('./models/bullet/bullet.gltf', import.meta.url),
});

let bulletPool = new BulletPool(resources.bullet_model);

const canvas = document.querySelector('canvas');

const startMenu = document.getElementById("startMenu");
const startBtn = document.getElementById("startBtn");

document.querySelector(".crosshair").style.display = "none";

startBtn.onclick = () => {
    startMenu.style.display = "none";
    gameStarted = true;

    document.querySelector(".crosshair").style.display = "block";
    gui.domElement.style.display = "block";

    canvas.requestPointerLock?.();
};


const renderer = new DeferredRenderer(canvas);
await renderer.initialize(resources.white_image, resources.dirt_image);

const inputs = new Inputs(canvas);
const physics = new Physics(World.scene);
World.physics = physics;

const defaultPoprSettings = World.poprSettings;
const replay = { frames: [] };

//player creation
const player = World.scene.addEntity(World.scene.createEntity());
player.addComponent(new Transform({
    translation: new vec3(0, 1.2, 2),
}));
player.addComponent(new Camera());
player.addComponent(new RecordComponent());
player.addComponent(new PlayerComponent(player, canvas, resources.guy_model));

// Make player invulnerable for 2 seconds at start
player.invulnerable = true;
setTimeout(() => {
    player.invulnerable = false;
    console.log("Player invulnerability ended");
}, 2000);

player.addComponent(new PhysicsComponent({
  type: "aabb",
  localMin: [-0.2, -0.2, -0.2],
  localMax: [ 0.2,  0.2,  0.2],
  isDynamic: true,
  layer: Layers.PLAYER,
  mask: Layers.WORLD | Layers.ENEMY | Layers.PICKUP | Layers.TRIGGER,
}));


//Player test katana
const playerKatana = resources.katana_model.build(World.scene);
playerKatana.addComponent(new KatanaComponent(playerKatana, player, player));
playerKatana.parent = player.getComponentOfType(Camera).entity;
player.getComponentOfType(PlayerComponent).givePlayerKatana(playerKatana);


World.loadStage = "soba_model";
let active_camera = 0;

function updateInput()
{
    const time = World.getTime();
    if (Inputs.isPressed('KeyG'))
    {
        World.poprSettings.pass = (World.poprSettings.pass + 1) % 8;
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
        active_camera = (active_camera + 1) % World.cameras.length;
        World.activeCamera = World.cameras[active_camera];
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
        else 
        {
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

            const hit = physics.raycast(from, to, World.scene, Layers.PICKUP);
            console.log(hit);
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

    if (Inputs.isHeld('KeyR'))
    {
        World.loadStage = "tutorial";
    }
}

function updateStage()
{
    if (!World.loadStage)
        return;

    let newScene = new Scene();

    newScene.addEntity(player);

    resources[World.loadStage].build(newScene);

    bulletPool = new BulletPool(resources.bullet_model);
    
    const mat = new mat4();
    for (const [e, spawner] of newScene.query(SpawnpointComponent))
    {
        let entity = null;
        const type = spawner.spawnType.toLowerCase();
        if (type == "meele")
        {
            const katana = resources.katana_model.build(newScene);
            entity = resources.guy_model.build(newScene);
            katana.addComponent(new KatanaComponent(katana, entity, player));
            entity.addComponent(new EnemyComponent(entity, player, katana));
            entity.addComponent(new RecordComponent());
            katana.parent = entity.findChildByName("up_righthand");
        }
        else if (type == "ranged")
        {
            entity = resources.guy_model.build(newScene);
            entity.addComponent(new EnemyComponent(entity, player, bulletPool,'Ranged'));
            entity.addComponent(new RecordComponent());

            const gun = resources.pistol_model.build(newScene);
            gun._transform.scale = [20, 20, 20];
            gun.parent = entity.findChildByName("up_righthand");
        }
        else if (type == "katana")
        {
            entity = resources.katana_model.build(newScene);
        }
        else if (type == "gun")
        {
            entity = resources.pistol_model.build(newScene);
        }
        else if (type == "player")
        {
            entity = player;
            player._transform.translation = [0, 0, 0];
            player._transform.rotation = new quat();
        }

        entity._transform.matrix = mat4.mul(mat, e._transform.final, entity._transform.matrix);
    }

    for (const entity of newScene.entities())
    {
        for (const component of entity.components)
        {
            component.onReset?.();
        }
    }


    World.cameras.length = 0;
    for (const [ent, camera] of newScene.query(Camera))
    {
        camera.aspect = World.aspect;
        World.cameras.push(ent);
    }
    World.activeCamera = player;

    World.scene = newScene;

    World.loadStage = null;
    World.loaded = true;
}

const elementUpdate = document.getElementById("update");
const elementRender = document.getElementById("render");

let updateTimeAccum = 0.0;
let updateTimeSamples = 0;
function update(t, dt) {

    if (!gameStarted) {
        return;
    }

    updateTimeAccum += dt;
    updateTimeSamples += 1;
    if (updateTimeAccum >= 0.5)
    {
        elementUpdate.innerText = "" + updateTimeSamples / updateTimeAccum;
        updateTimeAccum = 0;
        updateTimeSamples = 0;
    }
    
    renderer.clearDebug();
    
    World.timers.global.time = t;
    World.timers.global.dt = dt;
    World.timers.game.dt = dt * World.timeScale;
    if (Inputs.isHeld('KeyB'))
    {
        World.timers.game.dt *= 100.0;
    }
    World.timers.game.time += World.timers.game.dt;
    World.poprSettings.time = World.timers.global.time;

    updateInput();
    
    updateStage();

    if (World.doUpdate)
    {
        for (const entity of World.scene.entities()) {
            for (const component of entity.components) {
                component.update?.(); 
            }
        }
    }

    updateFinalMatrixTree(World.scene.root);
        
    if (World.doUpdate)
    {
        inputs.update();
        physics.update(t, dt, World.scene);
    }

    updateFinalMatrixTree(World.scene.root);
}

let renderTimeAccum = 0.0;
let renderTimeSamples = 0;
function render(dt) 
{
    if (!World.loaded)
        return;
    renderTimeAccum += dt;
    renderTimeSamples += 1;
    if (renderTimeAccum >= 0.5)
    {
        elementRender.innerText = "" + renderTimeSamples / renderTimeAccum;
        renderTimeAccum = 0;
        renderTimeSamples = 0;
    }
    renderer.render(World.scene, World.activeCamera, World.poprSettings);
}

function resize({ displaySize: { width, height }}) {
    World.aspect = width / height;
    for (const camera of World.cameras)
    {
        camera.getComponentOfType(Camera).aspect = World.aspect;
    }
}

new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();



const gui = new GUI();
gui.domElement.style.display = "none";



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
gui.add(World.poprSettings, 'environment', 0, 1);
gui.add(World.poprSettings, 'volumetricFog', 0.0, 1.0);
gui.add(World.poprSettings, 'depthFogDensity', 0.0, 0.1);
gui.add(World.poprSettings, 'barrelDistortion', 1.0, 2.0);