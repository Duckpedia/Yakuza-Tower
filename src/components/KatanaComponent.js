import * as glm from 'glm';
import { Transform } from 'engine/core/Transform.js';
import { World } from '../World.js';


export class KatanaComponent {

    constructor(entity, transform, world) {
        this.entity = entity;
        this.transform = transform;
        this.world = world;
    }

    update() {
        let dt = World.getDt();
    }
}
