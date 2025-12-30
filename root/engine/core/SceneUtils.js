import { mat4 } from 'glm';

export function updateWorldMatricesRecursive(entity, parentMatrix)
{
    const transform = entity._transform;
    if (transform)
    {
        // TODO: tuki je transform.matrix dost slow k rab klicat fromRotationTranslatioScale
        mat4.mul(transform.final, parentMatrix, transform.matrix);
        if (entity._calculateInverse)
            mat4.invert(transform.inv_final, transform.final);
    }

    for (const child of entity.children) {
        updateWorldMatricesRecursive(child, transform?.final ?? parentMatrix);
    }
}