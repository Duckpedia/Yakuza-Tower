import { quat, vec3, mat4 } from 'glm';

import { Transform } from 'engine/core/Transform.js';

export class PlayerComponent {

    constructor(entity, domElement, {
        pitch = 0,
        yaw = 0,
        velocity = [0, 0, 0],
        acceleration = 50,
        maxSpeed = 5,
        decay = 0.99999,
        pointerSensitivity = 0.002,
        isCrouching = false,
        groundY = 1.5,
        isGrounded = true

    } = {}) {
        this.entity = entity;
        this.domElement = domElement;

        this.keys = {};
        this.isCrouching = isCrouching
        this.isGrounded = isGrounded
        this.groundY = groundY

        this.pitch = pitch;
        this.yaw = yaw;

        this.velocity = velocity;
        this.acceleration = acceleration;
        this.maxSpeed = maxSpeed;
        this.decay = decay;
        this.pointerSensitivity = pointerSensitivity;
        this.playerTimeScale = 1.0

        this.initHandlers();
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    initHandlers() {
        this.pointermoveHandler = this.pointermoveHandler.bind(this);
        this.keydownHandler = this.keydownHandler.bind(this);
        this.keyupHandler = this.keyupHandler.bind(this);

        const element = this.domElement;
        const doc = element.ownerDocument;

        doc.addEventListener('keydown', this.keydownHandler);
        doc.addEventListener('keyup', this.keyupHandler);

        element.addEventListener('click', e => element.requestPointerLock());
        doc.addEventListener('pointerlockchange', e => {
            if (doc.pointerLockElement === element) {
                doc.addEventListener('pointermove', this.pointermoveHandler);
            } else {
                doc.removeEventListener('pointermove', this.pointermoveHandler);
            }
        });
    }

    update(t, dt) {

        const effectiveDt = dt * this.playerTimeScale;
        
        // Calculate forward and right vectors.
        const cos = Math.cos(this.yaw);
        const sin = Math.sin(this.yaw);
        const forward = [-sin, 0, -cos];
        const right = [cos, 0, -sin];
        const up = [0, 1, 0];

        // Map user input to the acceleration vector.
        const acc = vec3.create();
        if (this.keys['KeyW']) {
            vec3.add(acc, acc, forward);
        }
        if (this.keys['KeyS']) {
            vec3.sub(acc, acc, forward);
        }
        if (this.keys['KeyD']) {
            vec3.add(acc, acc, right);
        }
        if (this.keys['KeyA']) {
            vec3.sub(acc, acc, right);
        }
        if (this.keys['Space'] && this.isGrounded) {
            this.velocity[1] = 5;
            this.isGrounded = false;
        }

        const gravity = 22;
        this.velocity[1] -= gravity * effectiveDt;

        // Update velocity based on acceleration.
        vec3.scaleAndAdd(this.velocity, this.velocity, acc, effectiveDt * this.acceleration);

        // If there is no user input, apply decay.
        if (!this.keys['KeyW'] &&
            !this.keys['KeyS'] &&
            !this.keys['KeyD'] &&
            !this.keys['KeyA'])
        {
            const decay = Math.exp(effectiveDt * Math.log(1 - this.decay));
            vec3.scale(this.velocity, this.velocity, decay);
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
                transform.translation, this.velocity, effectiveDt);

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

            
           if (this.isCrouching && this.isGrounded) {
                transform.translation[1] = 0.8;  
            } 

        }
    }

    pointermoveHandler(e) {
        const dx = e.movementX;
        const dy = e.movementY;

        this.pitch -= dy * this.pointerSensitivity;
        this.yaw   -= dx * this.pointerSensitivity;

        const twopi = Math.PI * 2;
        const halfpi = Math.PI / 2;

        this.pitch = Math.min(Math.max(this.pitch, -halfpi), halfpi);
        this.yaw = ((this.yaw % twopi) + twopi) % twopi;
    }


    // not ctrl for crouch cuz that deletes tab D:

    keydownHandler(e) {
        this.keys[e.code] = true;

        if (e.code === 'KeyF') {
            this.playerTimeScale = 0.5; // slower player
            window.worldTimeScale = 0.2; // slower enemies/world
        }   

        if (e.code === 'KeyC') {
            this.isCrouching = true;
        }
        
        
    }

    keyupHandler(e) {
        this.keys[e.code] = false;

        if (e.code === 'KeyF') {
            this.playerTimeScale = 1; // normal speed
            window.worldTimeScale = 1;  // normal speed
        }

        if (e.code === 'KeyC') {
            this.isCrouching = false;
        }
    }

}
