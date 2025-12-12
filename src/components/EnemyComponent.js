import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';

export class EnemyComponent {
    constructor(entity, player) {
        this.entity = entity;
        this.transform = this.entity.getComponentOfType(Transform);
        this.player = player;
    }

    update(t, dt) {
        // predlagam ti da si zgruntas simple state machine, 
        // to je basically en member State ki ti pove kaj enemy trenutno pocne
        // npr Idle, Running, Shooting, Searching...
        // in nardis da dela appropriate thing based on that

        // mau je scam k nimas se animacij pa assetov ampak se znajdes pomoje

        // nared recimo da ce prides dost blizu da se zacne premikat ravno pod playerju pa playa neko animacijo
        // lah probas mu tud dt weapon (macko alpaneki) v roko
        // vsak entity ma funkcijo findChildByName in loh poisces "LeftHand" in parentas orozje po njega

        // glm.quat.rotateY(this.transform.rotation, this.transform.rotation, dt * t * t * 0.1);
    }
}
