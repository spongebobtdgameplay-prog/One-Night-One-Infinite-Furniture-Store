import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

export class AssetLoader {
    constructor(Renderer) {
        this.Renderer = Renderer;
        this.Cache = new Map();

        this.Draco = new DRACOLoader();
        this.Draco.setDecoderPath("./vendor/draco/");

        this.Ktx2 = new KTX2Loader();
        this.Ktx2.setTranscoderPath("./vendor/basis/");
        this.Ktx2.detectSupport(Renderer);

        this.Gltf = new GLTFLoader();
        this.Gltf.setDRACOLoader(this.Draco);
        this.Gltf.setKTX2Loader(this.Ktx2);
    }

    async LoadModel(Id, Url) {
        if (this.Cache.has(Id)) {
            return this.Cache.get(Id).clone(true);
        }

        const Gltf = await this.Gltf.loadAsync(Url);
        const Model = Gltf.scene;
        Model.traverse(Object => {
            if (!Object.isMesh) return;
            Object.castShadow = true;
            Object.receiveShadow = true;
        });

        this.Cache.set(Id, Model);
        return Model.clone(true);
    }

    Dispose() {
        this.Cache.clear();
        this.Draco.dispose();
        this.Ktx2.dispose();
    }
}
