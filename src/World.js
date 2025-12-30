import { DeferredRendererSettings } from "./renderer/DeferredRenderer.js";
import { Scene } from "./Scene.js";

export class World {
    static timeScale = 1.0;
    static poprSettings = new DeferredRendererSettings();
    static scene = new Scene();
    static activeCamera = null;
}
