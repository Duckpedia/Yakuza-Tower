import { quat, vec3, mat4 } from 'glm';

import { Transform } from 'engine/core/Transform.js';
import { DeferredRenderer } from '../renderer/DeferredRenderer.js';
import { World } from '../World.js';
import { Inputs } from '../Inputs.js';
import { PhysicsComponent } from './PhysicsComponent.js';
import { Layers } from '../Physics.js';
import { KatanaComponent } from './KatanaComponent.js';

export class PlayerComponent {

    constructor(entity, domElement, model = null, {
        pitch = 0,
        yaw = 0,
        velocity = [0, 0, 0],
        acceleration = 50,
        maxSpeed = 5,
        decay = 0.99999,
        pointerSensitivity = 0.002,
        isCrouching = false,
        groundY = 1.5,
        isGrounded = true,
        isSlowTime = false

    } = {}) {
        this.entity = entity;
        this.domElement = domElement;

        
        // if (model) {
        //     this.guyEntity = model.build(this.entity.scene);
        //     this.guyEntity.parent = this.entity;
        //     this.guyEntity.hidden = true;
        //     this.guyEntity.skeleton?.playAnimation(-1); // stop animation
        //     this.guyEntity.addComponent(new PhysicsComponent({
        //         type: "aabb",
        //         localMin: [-0.35, -0.1, -0.30],
        //         localMax: [0.35, 1.6, 0.30],
        //         isDynamic: false,
        //         layer: Layers.PLAYER,
        //         mask: Layers.WORLD | Layers.ENEMY | Layers.BULLET | Layers.TRIGGER,
        //     }));
        //     console.log(this.guyEntity._bounds);
        // } 

        this.isCrouching = isCrouching
        this.isGrounded = isGrounded
        this.groundY = groundY
        this.standY = 1.5;
        this.crouchY = 0.8;
        this.currentY = this.standY;
        this.crouchSpeed = 10;

        this.pitch = pitch;
        this.yaw = yaw;

        this.velocity = velocity;
        this.acceleration = acceleration;
        this.maxSpeed = maxSpeed;
        this.decay = decay;
        this.pointerSensitivity = pointerSensitivity;
        this.playerTimeScale = 1.0
        this.isSlowTime = isSlowTime

        DeferredRenderer.randomRectangle.position[0] = 0.33;
        DeferredRenderer.randomRectangle.position[1] = 0.1;
        DeferredRenderer.randomRectangle.scale[0] = 0.4;
        DeferredRenderer.randomRectangle.scale[1] = 0.025;

        this.weapon = undefined;
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    update() {
        let dt = World.getDt();

        this.updateInput();

        if (this.isSlowTime) {
            if (DeferredRenderer.randomRectangle.scale[0] > 0) {
            //DeferredRenderer.randomRectangle.scale[0] -= dt * 0.05;
            } else {
                this.playerTimeScale = 1;
                World.timeScale = 1;
                this.isSlowTime = false;
                DeferredRenderer.randomRectangle.scale[0] = 0;
            }
        } else {
            DeferredRenderer.randomRectangle.scale[0] += dt * 0.025;
            DeferredRenderer.randomRectangle.scale[0] = Math.min(DeferredRenderer.randomRectangle.scale[0], 0.4);
        }

        const effectiveDt = dt * this.playerTimeScale;
        
        // Clamp effectiveDt to prevent teleporting when time scale changes abruptly
        let maxEffectiveDt = 0.05; // Maximum 50ms per frame
        if(this.isSlowTime){
            maxEffectiveDt  = 0.01; // Maximum 200ms per frame when slowing time
        }
        const clampedEffectiveDt = Math.min(effectiveDt, maxEffectiveDt);
        const cos = Math.cos(this.yaw);
        const sin = Math.sin(this.yaw);
        const forward = [-sin, 0, -cos];
        const right = [cos, 0, -sin];
        const up = [0, 1, 0];

        // Map user input to the acceleration vector.
        const acc = vec3.create();
        if (Inputs.isHeld('KeyW')) {
            vec3.add(acc, acc, forward);
        }
        if (Inputs.isHeld('KeyS')) {
            vec3.sub(acc, acc, forward);
        }
        if (Inputs.isHeld('KeyD')) {
            vec3.add(acc, acc, right);
        }
        if (Inputs.isHeld('KeyA')) {
            vec3.sub(acc, acc, right);
        }
        if (Inputs.isHeld('Space') && this.isGrounded) {
            this.velocity[1] = 5;
            this.isGrounded = false;
        }
        if(Inputs.isHeld('ShiftLeft')){
            if(this.weapon){
                console.log("Player attacks with katana");
                this.weapon.getComponentOfType(KatanaComponent).startAttack();  //Attack with katana
            }
        }

        const gravity = 22;
        this.velocity[1] -= gravity * clampedEffectiveDt;
        

        // Update velocity based on acceleration.
        vec3.scaleAndAdd(this.velocity, this.velocity, acc, clampedEffectiveDt * this.acceleration);

        // If there is no user input, apply decay.
        if (!Inputs.isHeld('KeyW') &&
            !Inputs.isHeld('KeyS') &&
            !Inputs.isHeld('KeyD') &&
            !Inputs.isHeld('KeyA'))
        {
            const decay = Math.exp(clampedEffectiveDt * Math.log(1 - this.decay));
            const velxz = [...this.velocity];
            vec3.scale(velxz, velxz, decay);
            this.velocity[0] = velxz[0];
            this.velocity[2] = velxz[2];
        }

        const speed = Math.sqrt(this.velocity[0]**2 + this.velocity[2]**2);
        if (speed > this.maxSpeed) {
            const scale = this.maxSpeed / speed;
            this.velocity[0] *= scale;
            this.velocity[2] *= scale;
        }

        const transform = this.entity.getComponentOfType(Transform);
        if (transform) {
            // Update translation based on velocity.
            vec3.scaleAndAdd(transform.translation,
                transform.translation, this.velocity, clampedEffectiveDt);

            if (transform.translation[1] <= this.groundY) {
                transform.translation[1] = this.groundY
                this.velocity[1] = 0
                this.isGrounded = true
            }        

            // Update rotation based on the Euler angles.
            const rotation = quat.create();
            quat.rotateY(rotation, rotation, this.yaw);
            quat.rotateX(rotation, rotation, this.pitch);
            transform.rotation = rotation;

            if (this.guyEntity) {
                const guyTransform = this.guyEntity.getComponentOfType(Transform);
                if (guyTransform) {
                    guyTransform.rotation = quat.create();
                }
            }

            
        if (this.isGrounded) {

            const targetY = this.isCrouching
                ? this.crouchY
                : this.standY;

            this.currentY = this.lerp(
                this.currentY,
                targetY,
                Math.min(1, this.crouchSpeed * clampedEffectiveDt)
            );

            transform.translation[1] = this.currentY;
        }

        }
    }

    updateInput()
    {
        const {dx, dy} = Inputs.mouseDelta();

        this.pitch -= dy * this.pointerSensitivity;
        this.yaw   -= dx * this.pointerSensitivity;

        const twopi = Math.PI * 2;
        const halfpi = Math.PI / 2;

        this.pitch = Math.min(Math.max(this.pitch, -halfpi), halfpi);
        this.yaw = ((this.yaw % twopi) + twopi) % twopi;

        if (Inputs.isHeld('KeyF')) {
            if (DeferredRenderer.randomRectangle.scale[0] > 0.020)
            {
                this.playerTimeScale = 50.0; // slower player
                World.timeScale = 0.01; // slower enemies/world
                this.isSlowTime = true
            }
        }
        else {
            this.playerTimeScale = 1; // normal speed
            World.timeScale = 1;  // normal speed
            this.isSlowTime = false;
        }

        if (Inputs.isReleased('KeyF') && DeferredRenderer.randomRectangle.scale[0] > 0.020){ 
            DeferredRenderer.randomRectangle.scale[0] -= 0.020
        }

        this.isCrouching = Inputs.isHeld('KeyC');
    }

    onCollision(entity, other, collider)
    {
        if (!collider.trigger)
            return;

        if (collider.triggerAction === "EnterTower")
        {
            World.loadStage = "tutorial";
        }
    }

    onReset()
    {
        this.yaw = 0.0;
        this.pitch = 0.0;
    }


    givePlayerKatana(katana){
        this.weapon = katana;
    }
}
