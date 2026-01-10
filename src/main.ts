import { Engine } from "@babylonjs/core/Engines/engine";
import { createTitleScene } from "./scenes/TitleScene";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

let currentScene = createTitleScene(engine, canvas);

engine.runRenderLoop(() => {
  currentScene.render();
});

window.addEventListener("resize", () => {
  engine.resize();
});
