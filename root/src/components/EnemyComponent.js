import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';

import { BulletComponent } from './BulletComponent.js';


export class EnemyComponent {
    constructor(scene, entity, player, bulletModel = null, type = 'Melee') {
        this.entity = entity;
        this.transform = entity.getComponentOfType(Transform);
        this.player = player;

        this.speed = 3;
        this.attackRange = 1.2;
        this.rangedAttackRange = 5;

        this.attackDuration = 2.0;
        this.attackTimer = 0;

        this.turnSpeed = 5.0;

        this.state = 'chase';

        this.runAnim = 2;  //animacija 2 je running with sword in veli bolj smooth, kot 6. Animacija 6 je sam running.
        this.outwardAttackAnim = 5;
        this.inwardAttackAnim = 4;

        this.gunShootingAnim = 0;

        this.enemyType = type;


        this.shootTime = 0.2;
        this.shootTimer = 0;
        this.hasFired = false;

        this.bulletModel = bulletModel;
        this.scene = scene;

        entity.skeleton?.playAnimationByIndex(this.runAnim);
    }


    update() {
        switch(this.enemyType){
            case 'Melee':
                this.MeleeEnemyBehaviour(t, dt);
                break;
            case 'Ranged':
                this.RangedEnemyBehaviour(t, dt);
                break;
            default:
                break;    
        }
        
        

    }


    MeleeEnemyBehaviour(t, dt){
        if (!this.player) return;

        const playerTransform = this.player.getComponentOfType(Transform);
        if (!playerTransform) return;

        // --- WORLD direction (XZ only) ---
        const dir = glm.vec3.sub(
            glm.vec3.create(),
            playerTransform.final_position,
            this.transform.final_position
        );

        dir[1] = 0;

        const distance = glm.vec3.length(dir);

        if (distance > 0.0001) {
            glm.vec3.scale(dir, dir, 1 / distance);
        }

        // -------------------------------
        // CHASE
        // -------------------------------
        if (this.state === 'chase') {
            // move
            
            glm.vec3.scaleAndAdd(
                this.transform.translation,
                this.transform.translation,
                dir,
                this.speed * dt
            );

            

            this.faceDirection(dir, dt);

            // enter attack ONCE
            if (distance <= this.attackRange) {
                this.state = 'attack';
                this.attackTimer = this.attackDuration;


                let attackAnim = Math.floor(Math.random() * 2 + 4);
                this.entity.skeleton?.playAnimationByIndex(attackAnim);
            }
        }

        // -------------------------------
        // ATTACK (LOCKED)
        // -------------------------------
        else if (this.state === 'attack') {
            this.attackTimer -= dt;

            // rotate only
            this.faceDirection(dir, dt);

            if (this.attackTimer <= 0) {
                this.state = 'chase';
                this.entity.skeleton?.playAnimationByIndex(this.runAnim);
            }
        }
    }


    RangedEnemyBehaviour(t, dt){
        //Tle je behaviour za enemije s pistolo, za določanje lah uporabljaš this.enemyType
        if (!this.player) return;

        const playerTransform = this.player.getComponentOfType(Transform);
        if (!playerTransform) return;

        // --- WORLD direction (XZ only) ---
        const dir = glm.vec3.sub(
            glm.vec3.create(),
            playerTransform.final_position,
            this.transform.final_position
        );

        dir[1] = 0;

        const distance = glm.vec3.length(dir);

        if (distance > 0.0001) {
            glm.vec3.scale(dir, dir, 1 / distance);
        }

        // -------------------------------
        // CHASE
        // -------------------------------
        if (this.state === 'chase') {
            // move
            
            glm.vec3.scaleAndAdd(
                this.transform.translation,
                this.transform.translation,
                dir,
                this.speed * dt
            );

            

            this.faceDirection(dir, dt);

            // enter attack ONCE
            if (distance <= this.rangedAttackRange) {
                this.state = 'attack';
                this.attackTimer = this.attackDuration;

            


                this.entity.skeleton?.playAnimationByIndex(this.gunShootingAnim);
            }
        }

        // -------------------------------
        // ATTACK (LOCKED)
        // -------------------------------
        else if (this.state === 'attack') {
            this.attackTimer -= dt;
            this.shootTimer += dt;

            if (!this.hasFired && this.shootTimer >= this.shootTime) {
                this.spawnBullet();
                this.hasFired = true;
            }

             this.faceDirection(dir, dt);

            if (this.attackTimer <= 0) {
                this.state = 'chase';
                this.hasFired = false;
                this.entity.skeleton?.playAnimationByIndex(this.runAnim);
            }
        }
    }


    faceDirection(dir, dt) {
        if (glm.vec3.length(dir) < 0.001) return;

        // mau je scam k nimas se animacij pa assetov ampak se znajdes pomoje
        const forward = glm.vec3.fromValues(0, 0, 1);
        const q = glm.quat.create();

        // nared recimo da ce prides dost blizu da se zacne premikat ravno pod playerju pa playa neko animacijo
        // lah probas mu tud dt weapon (macko alpaneki) v roko
        // vsak entity ma funkcijo findChildByName in loh poisces "LeftHand" in parentas orozje po njega
        glm.quat.rotationTo(q, forward, dir);
        glm.quat.normalize(q, q);

        const current = this.transform.rotation;

        const t = Math.min(1, this.turnSpeed * dt);

        glm.quat.slerp(current, current, q, t);

        this.transform.rotation = current;

    }

    spawnBullet() {
        const gun = this.entity.findChildByName("Pistol_5") 
            ?? this.entity.findChildByName("mixamorig:RightHand");

        if (!gun) return;

        const bullet_scene = this.bulletModel.loadScene();
        const bullet = this.bulletModel.buildEntityFromScene(bullet_scene);
        const transform = bullet.getComponentOfType(Transform);
        transform.translation = [...gun.getComponentOfType(Transform).final_position];

        const dir = glm.vec3.sub(
            glm.vec3.create(),
            this.player.getComponentOfType(Transform).final_position,
            gun.getComponentOfType(Transform).final_position
        );

        dir[1] = 0;

        bullet.addComponent(new BulletComponent(bullet, dir));

        this.scene.push(...bullet_scene);
    }
}
