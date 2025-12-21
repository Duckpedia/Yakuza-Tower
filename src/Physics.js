import { vec3, mat4 } from 'glm';
import { getGlobalModelMatrix } from 'engine/core/SceneUtils.js';
import { Transform } from 'engine/core/core.js';
import { DeferredRenderer } from './renderer/DeferredRenderer.js';
import { vec4 } from '../lib/glm.js';
import { World } from './World.js';

export class Physics {

    constructor(scene) {
        this.scene = scene;
    }

    update(t, dt) {
        const position = new vec4();
        const scale = new vec4();
        const mat = new mat4();

        for (const entity of this.scene) {

            if (World.poprSettings.debug && entity.aabb && entity.customProperties)
            {
                mat4.getTranslation(position, entity._transform.final);
                mat4.getScaling(scale, entity._transform.final);
                mat4.identity(mat);
                mat4.translate(mat, mat, position);
                mat4.scale(mat, mat, scale);
                DeferredRenderer.Draw3DBoxMinMax(entity.aabb.min, entity.aabb.max, mat);
            }

            if (entity.customProperties?.isDynamic) 
            {
                for (const other of this.scene) {
                    if (entity !== other && other.customProperties?.isStatic) {
                        this.resolveCollision(entity, other);
                    }
                }
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

    getTransformedAABB(entity) {
        // Transform all vertices of the AABB from local to global space.
        const matrix = getGlobalModelMatrix(entity);
        const { min , max } = entity.aabb;
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

    resolveCollision(a, b) {
        //dodala da skipa entities brez aabb, nebodo mel physics nebo pa errorja.
        if (!a.aabb || !b.aabb) return;

        const aBox = this.getTransformedAABB(a);
        const bBox = this.getTransformedAABB(b);

        // Check if there is collision.
        const isColliding = this.aabbIntersection(aBox, bBox);
        if (!isColliding) {
            return;
        }

        // Move entity A minimally to avoid collision.
        const diffa = vec3.sub(vec3.create(), bBox.max, aBox.min);
        const diffb = vec3.sub(vec3.create(), aBox.max, bBox.min);

        let minDiff = Infinity;
        let minDirection = [0, 0, 0];
        if (diffa[0] >= 0 && diffa[0] < minDiff) {
            minDiff = diffa[0];
            minDirection = [minDiff, 0, 0];
        }
        if (diffa[1] >= 0 && diffa[1] < minDiff) {
            minDiff = diffa[1];
            minDirection = [0, minDiff, 0];
        }
        if (diffa[2] >= 0 && diffa[2] < minDiff) {
            minDiff = diffa[2];
            minDirection = [0, 0, minDiff];
        }
        if (diffb[0] >= 0 && diffb[0] < minDiff) {
            minDiff = diffb[0];
            minDirection = [-minDiff, 0, 0];
        }
        if (diffb[1] >= 0 && diffb[1] < minDiff) {
            minDiff = diffb[1];
            minDirection = [0, -minDiff, 0];
        }
        if (diffb[2] >= 0 && diffb[2] < minDiff) {
            minDiff = diffb[2];
            minDirection = [0, 0, -minDiff];
        }

        const transform = a.getComponentOfType(Transform);
        if (!transform) {
            return;
        }

        vec3.add(transform.translation, transform.translation, minDirection);
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

    raycast(from, to){
        const dir = vec3.sub(vec3.create(), to, from); //naredimo vektor, direction pa length
        const maxDistance = vec3.length(dir); //tukaj imamo pa length raya
        vec3.normalize(dir, dir); //normaliziramo ker prejsna funkcija vrne dejanski distance

        let closestHit = null;
        let closest = Infinity;

        for(const entity of this.scene){
            //to je da samo skippa ce niso collidable pa brezveze matematiko
            if(!entity.customProperties?.isStatic) continue;
            if(!entity.aabb) continue;

            const worldAABB = this.getTransformedAABB(entity);
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
