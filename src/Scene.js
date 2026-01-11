import { Entity } from "../engine/core/Entity.js";

export class Scene {
    root = new Entity(this);
    componentData = new Map();

    constructor() {}

    createEntity()
    {
        return new Entity(this);
    }

    addEntity(entity)
    {
        entity.parent ??= this.root;
        if (entity.scene)
        {
            if (entity.scene !== this)
            {
                entity.scene.removeEntity(entity);
                this._fullAdd(entity);
            }
        } 
        else
        {
            this._fullAdd(entity);
        }
        return entity;
    }

    _fullAdd(entity)
    {
        if (entity.parent === null) entity.parent = this.root;
        entity.scene = this;
        for (const component of entity.components)
            this._addComponent(entity, component);
        for (const child of entity.children)
            this.addEntity(child);
    }

    removeEntity(entity)
    {
        const children = [...entity.children];
        for (const child of children) this.removeEntity(child);
        for (const component of entity.components) this._removeComponent(entity, component);
        entity.scene = null;
        if (entity.parent === this.root) 
            entity.parent = null;
    }

    // https://dev.to/anishkumar/tree-data-structure-in-javascript-1o99
    *entities() {
        yield* this._walk(this.root);
    }

    *allEntities() {
        yield* this._allWalk(this.root);
    }

    *_walk(entity) {
        if (entity.hidden) return;
        yield entity;
        for (const child of entity.children)
            yield* this._walk(child);
    }

    *_allWalk(entity) {
        yield entity;
        for (const child of entity.children)
            yield* this._allWalk(child);
    }

    *query(componentType) {
        const data = this._getComponentData(componentType)
        for (const [entity, component] of data.entries()) {
            if (!entity.isVisible()) continue;
            yield [entity, component];
        }
    }

    _getComponentData(type)
    {
        let data = this.componentData.get(type);
        if (!data) {
            data = new ComponentData();
            this.componentData.set(type, data);
        }
        return data;
    }

    _addComponent(entity, component)
    {
        // javascript manevri
        const type = component?.constructor;
        if (typeof type !== "function") {
            console.error(new Error("uhh"));
            return null;
        }

        const data = this._getComponentData(type);
        if (data.has(entity))
        {
            console.error(new Error("entity already has component"));
            return null;
        }

        data.add(entity, component);
        return component;
    }

    _removeComponent(entity, component)
    {
        // javascript manevri
        const type = component?.constructor;
        if (typeof type !== "function") {
            console.error(new Error("uhh"));
            return;
        }

        return this._getComponentData(type).remove(entity);
    }

    _getComponentOfType(entity, type)
    {
        return this._getComponentData(type).get(entity);
    }
}

class ComponentData {
    entities = [];
    components = [];
    entityToIndex = new WeakMap();

    has(entity) 
    {
        return this.entityToIndex.has(entity);
    }

    get(entity) 
    {
        const i = this.entityToIndex.get(entity);
        return i === undefined ? null : this.components[i];
    }

    add(entity, component) 
    {
        const i = this.entityToIndex.get(entity);
        if (i !== undefined) {
            this.components[i] = component;
            return;
        }

        this.entityToIndex.set(entity, this.entities.length);
        this.entities.push(entity);
        this.components.push(component);
    }

    remove(entity) 
    {
        const i = this.entityToIndex.get(entity);
        if (i === undefined) return null;

        const last = this.entities.length - 1;

        if (i !== last) {
            this.entities[i] = this.entities[last];
            this.components[i] = this.components[last];
            this.entityToIndex.set(this.entities[last], i);
        }

        this.entities.pop();
        this.entityToIndex.delete(entity);
        return this.components.pop();
    }

    *entries() {
        for (let i = 0; i < this.entities.length; i++) {
            yield [this.entities[i], this.components[i]];
        }
    }

    *entities() {
        yield* this.entities;
    }

    *components() {
        yield* this.components;
    }
}