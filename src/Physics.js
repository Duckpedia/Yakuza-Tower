import { vec3, mat4, quat } from 'glm';
import { Transform } from 'engine/core/core.js';
import { vec4 } from '../lib/glm.js';
import { World } from './World.js';
import { DeferredRenderer } from './renderer/DeferredRenderer.js';
import { PhysicsComponent } from './components/PhysicsComponent.js';

export const Layers = {
    WORLD:  1 << 0,
    PLAYER: 1 << 1,
    ENEMY:  1 << 2,
    PICKUP: 1 << 3,
    BULLET: 1 << 4,
    TRIGGER: 1 << 5,
    KATANA: 1 << 6,
};

function getLayer(e){
    return e._bounds?.layer ?? Layers.WORLD;
}

function getMask(e){
    return e._bounds?.mask ?? ~0; //default je da se collidajo z vsem
}

function mutual(a, b) {
  return (getLayer(b) & getMask(a)) !== 0 && (getLayer(a) & getMask(b)) !== 0; //da se mutually colidata
}

export class Physics {
    constructor() { }

    update(t, dt, scene) {
        const g = -9.81;
        const colliders = [...scene.query(PhysicsComponent)];
        
        //ts sam da gravity deluje za tko pickups pa to sranje, it should fall
        for (const [_, b] of colliders){
            if (!b.isDynamic) continue;
            const e = b.parentEntity;
            if (!e.velocity) continue;
            e.velocity[1] += g * dt;
            const tr = e.getComponentOfType(Transform);
            tr.translation[0] += e.velocity[0] * dt;
            tr.translation[1] += e.velocity[1] * dt;
            tr.translation[2] += e.velocity[2] * dt;
        }

        for (const [aEnt, aB] of colliders){
            if (World.poprSettings.debug)
            {
                const aabb = this.getTransformedAABB(aEnt, aB);
                DeferredRenderer.Draw3DBoxMinMax(
                    aabb.min, 
                    aabb.max, 
                    null, 
                    aB.isDynamic ? [1.0, 0.0, 0.0] : [1.0, 0.0, 1.0]   
                );
            }
            if (!aB.isDynamic) continue;

            for (const [bEnt, bB] of colliders){
                if (aEnt === bEnt) continue;
                
                //filtriranje po maskah pa layerjih
                if ((bB.layer & aB.mask) === 0) continue;
                if ((aB.layer & bB.mask) === 0) continue;

                this.resolveCollision(aEnt, aB, bEnt, bB);
            }
        }
    }

    intervalIntersection(min1, max1, min2, max2) {
        return !(min1 > max2 || min2 > max1);
    }

    aabbIntersection(aabb1, aabb2) {
        return this.intervalIntersection(aabb1.min[0], aabb1.max[0], aabb2.min[0], aabb2.max[0])
            && this.intervalIntersection(aabb1.min[1], aabb1.max[1], aabb2.min[1], aabb2.max[1])
            && this.intervalIntersection(aabb1.min[2], aabb1.max[2], aabb2.min[2], aabb2.max[2]);
    }

    getTransformedAABB(entity, bounds) {
        // Transform all vertices of the AABB from local to global space.
        const matrix = entity._transform.final;
        const { localMin: min, localMax: max } = bounds; //wazzaaaaappp
        const vertices = [
            [min[0], min[1], min[2]],
            [min[0], min[1], max[2]],
            [min[0], max[1], min[2]],
            [min[0], max[1], max[2]],
            [max[0], min[1], min[2]],
            [max[0], min[1], max[2]],
            [max[0], max[1], min[2]],
            [max[0], max[1], max[2]],
        ].map(v => vec3.transformMat4(v, v, matrix));

        // Find new min and max by component.
        const xs = vertices.map(v => v[0]);
        const ys = vertices.map(v => v[1]);
        const zs = vertices.map(v => v[2]);
        const newmin = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
        const newmax = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];
        return { min: newmin, max: newmax };
    }

    resolveCollision(aEnt, aB, bEnt, bB){
        //dodala da skipa entities brez aabb, nebodo mel physics nebo pa errorja.
        const aBox = this.getTransformedAABB(aEnt, aB);
        const bBox = this.getTransformedAABB(bEnt, bB);

        if (!this.aabbIntersection(aBox, bBox)) return;

        // Move entity A minimally to avoid collision.
        const diffa = vec3.sub(vec3.create(), bBox.max, aBox.min);
        const diffb = vec3.sub(vec3.create(), aBox.max, bBox.min);
        
        let minDiff = Infinity;
        let minDirection = [0, 0, 0];
        
        if (diffa[0] >= 0 && diffa[0] < minDiff) { minDiff = diffa[0]; minDirection = [ minDiff, 0, 0]; }
        if (diffa[1] >= 0 && diffa[1] < minDiff) { minDiff = diffa[1]; minDirection = [ 0, minDiff, 0]; }
        if (diffa[2] >= 0 && diffa[2] < minDiff) { minDiff = diffa[2]; minDirection = [ 0, 0, minDiff]; }
        
        if (diffb[0] >= 0 && diffb[0] < minDiff) { minDiff = diffb[0]; minDirection = [-minDiff, 0, 0]; }
        if (diffb[1] >= 0 && diffb[1] < minDiff) { minDiff = diffb[1]; minDirection = [0, -minDiff, 0]; }
        if (diffb[2] >= 0 && diffb[2] < minDiff) { minDiff = diffb[2]; minDirection = [0, 0, -minDiff]; }
        
        const actualA = aB.parentEntity ?? aEnt; // enemyji alpkj majo loh vec colliderjov tkoda vsi v resnici kazejo nanga
        const ta = actualA._transform;
        if(!ta) return;
        
        const actualB = bB.parentEntity ?? bEnt;
        actualA.onCollision(actualB, bB);

        if (bB.trigger) // triggers dont affect others
            return;

        if (bB.isDynamic)
        {
            const tb = actualB._transform;
            if (!tb) return;

            vec3.scale(minDirection, minDirection, 0.5)
            vec3.add(ta.translation, ta.translation, minDirection);
            vec3.sub(tb.translation, tb.translation, minDirection);
        }
        else
        {
            if (actualA.velocity && minDirection[1] > 0) actualA.velocity[1] = 0;  //to prepreci jitter, minimal solution for now
            vec3.add(ta.translation, ta.translation, minDirection);
        }
    }

    rayAABB(origin, dir, aabb){
        //slab metoda (P(t) = origin + t · dir) in potrebujemo intersection vseh tri axis
        let tmin = -Infinity;
        let tmax = Infinity;

        for(let i = 0; i < 3; i++){
            if(Math.abs(dir[i]) < 1e-6){ //tole prepreci napako pr ful mejhnih spremembah
                if(origin[i] < aabb.min[i] || origin[i] > aabb.max[i]){
                    return null;
                }
            }
            else{
                let inverseD = 1/dir[i];
                let t1 = (aabb.min[i] - origin[i]) * inverseD;
                let t2 = (aabb.max[i] - origin[i]) * inverseD;

                if (t1 > t2) [t1, t2] = [t2, t1];

                tmin = Math.max(tmin, t1);
                tmax = Math.min(tmax, t2);

                if (tmin > tmax) return null;
            }
        }

        if (tmin >= 0) return tmin; //ray se zacne izven boxa
        if (tmax >= 0) return tmax; //ray se zacne v boxu
        return null; //tuki je pa ray za boxom in potem vrne null ker je pac za tabo

    }

    raycast(from, to, scene, mask = Layers.WORLD | Layers.PLAYER | Layers.ENEMY | Layers.PICKUP){
        if (World.poprSettings.debug)
            DeferredRenderer.Draw3DLine(from, to, [1.0, 0.0, 0.0]);

        const dir = vec3.sub(vec3.create(), to, from); //naredimo vektor, direction pa length
        const maxDistance = vec3.length(dir); //tukaj imamo pa length raya
        vec3.normalize(dir, dir); //normaliziramo ker prejsna funkcija vrne dejanski distance

        let closestHit = null;
        let closest = Infinity;

        for (const [entity, b] of scene.query(PhysicsComponent)){
            //sepravi zdej filtera by layer and mask ne pa samo static bs
            if ((b.layer & mask) === 0) continue;

            const worldAABB = this.getTransformedAABB(entity, b);
            const t = this.rayAABB(from, dir, worldAABB); //ce dobimo t dobimo skalarno razdaljo

            if(t !== null && t <= maxDistance && t < closest){
                closest = t;
                closestHit = entity;
            }
        }

        if(!closestHit) return null;

        const hitPoint = vec3.scaleAndAdd(
            vec3.create(),
            from,
            dir,
            closest
        );

        //ven dobimo kaj je bilo zadeto, kje v svetu je bilo zadeto in kok dalec je
        return{
            entity: closestHit, 
            point: hitPoint,
            distance: closest,
        };
    }

}
