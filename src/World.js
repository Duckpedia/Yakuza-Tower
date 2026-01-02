import { DeferredRendererSettings } from "./renderer/DeferredRenderer.js";
import { Scene } from "./Scene.js";

export class World {
    static timeScale = 1.0;
    static poprSettings = new DeferredRendererSettings();
    static scene = new Scene();
    static activeCamera = null;
    static timers = { global: { time: 0.0, dt: 0.0 }, game: { time: 0.0, dt: 0.0 } };

    static getDt(name = 'game')
    {
        return World.timers[name].dt;
    }
    
    static getTime(name = 'game')
    {
        return World.timers[name].time;
    }
}
