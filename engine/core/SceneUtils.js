import { mat4 } from 'glm';

import { Transform } from './Transform.js';

export function getLocalModelMatrix(entity) {
    const matrix = mat4.create();
    for (const transform of entity.getComponentsOfType(Transform)) {
        matrix.multiply(transform.matrix);
    }
    return matrix;
}

export function getGlobalModelMatrix(entity) {
    if (entity.parent) {
        const parentMatrix = getGlobalModelMatrix(entity.parent);
        const modelMatrix = getLocalModelMatrix(entity);
        return parentMatrix.multiply(modelMatrix);
    } else {
        return getLocalModelMatrix(entity);
    }
}
