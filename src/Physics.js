import { vec3, mat4 } from 'glm';
import { Transform } from 'engine/core/core.js';
import { DeferredRenderer } from './renderer/DeferredRenderer.js';
import { vec4 } from '../lib/glm.js';
import { World } from './World.js';

export class BoundsComponent{
  constructor({
    type = "aabb",
    localMin = [-0.5, -0.5, -0.5],
    localMax = [ 0.5,  0.5,  0.5],
    isDynamic = false,
    layer = 1 << 0,
    mask = ~0,
  } = {}) {
    this.type = type;
    this.localMin = localMin;
    this.localMax = localMax;
    this.isDynamic = isDynamic;
    this.layer = layer;
    this.mask = mask;
  }
}

export const Layers = {
    WORLD:  1 << 0,
    PLAYER: 1 << 1,
    ENEMY:  1 << 2,
    PICKUP: 1 << 3,
    BULLET: 1 << 4,
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
        const position = new vec4();
        const scale = new vec4();
        const mat = new mat4();

        const g = -9.81;
        const colliders = [...scene.query(BoundsComponent)]; //array komponent k so collidable
        
        //ts sam da gravity deluje za tko pickups pa to sranje, it should fall
        for (const [e, b] of colliders){
            if (!b.isDynamic) continue;
            if (!e.velocity) continue;

            e.velocity[1] += g * dt;

            const tr = e.getComponentOfType(Transform);
            tr.translation[0] += e.velocity[0] * dt;
            tr.translation[1] += e.velocity[1] * dt;
            tr.translation[2] += e.velocity[2] * dt;
        }

        for (const entity of scene.entities()) {
            // tko bi mogl bit
            if (World.poprSettings.debug && entity._bounds)
            {
                // entity._bounds.isDynamic;
                // entity._bounds.layer;
                // entity._bounds.type; == "aabb" | "obb" | krkol hocs pac
                // obb zdej dobis iz _transform.final
                // mat4.getScaling(scale, entity._transform.final);
                // aabb vrjetn sezmer hocs met glede na ta obb da loh ze prej izlocis une k se def ne collidajo
                // tkoda za dynamic stvari te na novo usak frame preracunas i think :D
                DeferredRenderer.Draw3DBox(entity._transform.final, entity._bounds.isDynamic ? [1.0, 0.0, 0.0] : [1.0, 0.0, 1.0]);
            }
        }

        for (const [aEnt, aB] of colliders){
            if (!aB.isDynamic) continue;

            for (const [bEnt, bB] of colliders){
                if (aEnt === bEnt) continue;

                //filtriranje po maskah pa layerjih
                if ((bB.layer & aB.mask) === 0) continue;
                if ((aB.layer & bB.mask) === 0) continue;

                if (!bB.isDynamic) this.resolveCollision(aEnt, aB, bEnt, bB);
                else this.resolveDynamicDynamic(aEnt, aB, bEnt, bB);
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

        if (aEnt.velocity && minDirection[1] > 0) aEnt.velocity[1] = 0;  //to prepreci jitter, minimal solution for now

        const tr = aEnt.getComponentOfType(Transform);
        if (!tr) return;

        vec3.add(tr.translation, tr.translation, minDirection);
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

    raycast(from, to, scene){
        const dir = vec3.sub(vec3.create(), to, from); //naredimo vektor, direction pa length
        const maxDistance = vec3.length(dir); //tukaj imamo pa length raya
        vec3.normalize(dir, dir); //normaliziramo ker prejsna funkcija vrne dejanski distance

        let closestHit = null;
        let closest = Infinity;

        for (const [entity, b] of scene.query(BoundsComponent)){
            //sepravi zdej filtera by layer and mask ne pa samo static bs
            const mask = Layers.WORLD | Layers.PLAYER | Layers.ENEMY;
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

    //psiho koda incoming
    resolveDynamicDynamic(aEnt, aB, bEnt, bB){
        const aBox = this.getTransformedAABB(aEnt, aB);
        const bBox = this.getTransformedAABB(bEnt, bB);
        if (!this.aabbIntersection(aBox, bBox)) return;

        //half half logika, podobno kot prej 
        const diffa = vec3.sub(vec3.create(), bBox.max, aBox.min);
        const diffb = vec3.sub(vec3.create(), aBox.max, bBox.min);

        let minDiff = Infinity;
        let pushA = [0, 0, 0];

        if (diffa[0] >= 0 && diffa[0] < minDiff) { minDiff = diffa[0]; pushA = [ minDiff, 0, 0]; }
        if (diffa[1] >= 0 && diffa[1] < minDiff) { minDiff = diffa[1]; pushA = [ 0, minDiff, 0]; }
        if (diffa[2] >= 0 && diffa[2] < minDiff) { minDiff = diffa[2]; pushA = [ 0, 0, minDiff]; }

        if (diffb[0] >= 0 && diffb[0] < minDiff) { minDiff = diffb[0]; pushA = [-minDiff, 0, 0]; }
        if (diffb[1] >= 0 && diffb[1] < minDiff) { minDiff = diffb[1]; pushA = [0, -minDiff, 0]; }
        if (diffb[2] >= 0 && diffb[2] < minDiff) { minDiff = diffb[2]; pushA = [0, 0, -minDiff]; }

        const ta = aEnt.getComponentOfType(Transform);
        const tb = bEnt.getComponentOfType(Transform);
        if (!ta || !tb) return;

        vec3.add(ta.translation, ta.translation, vec3.scale(vec3.create(), pushA,  0.5));
        vec3.add(tb.translation, tb.translation, vec3.scale(vec3.create(), pushA, -0.5));
    }

}
