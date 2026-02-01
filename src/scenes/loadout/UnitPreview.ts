/**
 * UnitPreview.ts
 *
 * Handles 3D model loading and appearance updates for unit previews.
 * Used by both card previews and the customize editor.
 */

import {
  Scene,
  Vector3,
  SceneLoader,
  AbstractMesh,
  AnimationGroup,
  PBRMaterial,
  RenderTargetTexture,
  ArcRotateCamera,
} from "@babylonjs/core";
import { Rectangle, Image, TextBlock, Control } from "@babylonjs/gui";
import { getClassData } from "../../types";
import { hexToColor3, hexToColor4 } from "../../utils";
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS } from "../../config";
import { COLORS } from "./colors";
import type { UnitState } from "./types";

export interface UnitPreviewConfig {
  scene: Scene;
  container: Rectangle;
  id: string;
  rttSize?: number;
  layerMask: number;
  cameraRadius?: number;
  cameraTarget?: Vector3;
  getTeamColor: () => string;
  getState: () => UnitState;
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  isScrolling?: () => boolean;
  disableMaterialIBL: (meshes: AbstractMesh[]) => void;
  registerForCleanup: (meshes: AbstractMesh[], anims: AnimationGroup[]) => void;
  isSceneDisposed: () => boolean;
}

export interface UnitPreviewController {
  /** Force reload the model (e.g., after class or body change) */
  reload: () => void;
  /** Update appearance without reloading model (colors, weapon, etc.) */
  refresh: () => void;
  /** Reset animation to idle and sync rotation */
  syncAnimation: () => void;
  /** Cycle to next animation manually */
  cycleAnimation: () => void;
  /** Get the RTT for external use */
  getRTT: () => RenderTargetTexture;
  /** Dispose all resources */
  dispose: () => void;
}

/**
 * Create a unit preview system with RTT rendering.
 * Handles model loading, appearance updates, and animation cycling.
 */
export function createUnitPreview(config: UnitPreviewConfig): UnitPreviewController {
  const {
    scene,
    container,
    id,
    rttSize = 256,
    layerMask,
    cameraRadius = 2.0,
    cameraTarget = new Vector3(0, 1.0, 0),
    getTeamColor,
    getState,
    onLoadStart,
    onLoadComplete,
    isScrolling = () => false,
    disableMaterialIBL,
    registerForCleanup,
    isSceneDisposed,
  } = config;

  // Create RTT
  const rtt = new RenderTargetTexture(`rtt_${id}`, rttSize, scene, false);
  rtt.clearColor = hexToColor4(COLORS.bgPreview);
  scene.customRenderTargets.push(rtt);

  // Create camera
  const camera = new ArcRotateCamera(
    `cam_${id}`,
    -Math.PI / 2 + 0.2,
    Math.PI / 2.3,
    cameraRadius,
    cameraTarget.clone(),
    scene
  );
  rtt.activeCamera = camera;
  camera.layerMask = layerMask;

  // Force square aspect ratio
  const originalGetEngine = camera.getEngine.bind(camera);
  camera.getEngine = () => {
    const eng = originalGetEngine();
    return { ...eng, getAspectRatio: () => 1 } as any;
  };

  // Canvas for pixel transfer
  const canvas = document.createElement("canvas");
  canvas.width = rttSize;
  canvas.height = rttSize;
  const ctx = canvas.getContext("2d")!;

  // Inner container (maintains square aspect ratio)
  const innerContainer = new Rectangle(`innerPreview_${id}`);
  innerContainer.width = "100%";
  innerContainer.height = "100%";
  innerContainer.thickness = 0;
  innerContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
  container.addControl(innerContainer);

  // Make container square based on height
  const updateInnerSize = () => {
    const h = container.heightInPixels;
    if (h > 0) {
      innerContainer.width = `${h}px`;
    }
  };
  container.onAfterDrawObservable.add(updateInnerSize);

  // Loading text
  const loadingText = new TextBlock(`loading_${id}`);
  loadingText.text = "Loading...";
  loadingText.color = "#666666";
  loadingText.fontSize = 11;
  innerContainer.addControl(loadingText);

  // Preview image
  const previewImage = new Image(`img_${id}`, "");
  previewImage.stretch = Image.STRETCH_UNIFORM;
  previewImage.width = "100%";
  previewImage.height = "100%";
  previewImage.alpha = 0;
  innerContainer.addControl(previewImage);

  // Click to cycle animation
  innerContainer.isPointerBlocker = true;
  innerContainer.onPointerClickObservable.add(() => cycleAnimation());

  // State
  let frameCount = 0;
  let modelLoaded = false;
  let loadedModelKey = "";
  let mesh: AbstractMesh | null = null;
  let meshes: AbstractMesh[] = [];
  let animations: AnimationGroup[] = [];

  // Animation cycling
  const rotationSpeed = 0.008;
  let totalRotation = 0;
  let animPhase = 0; // 0=idle, 1=attack, 2=run

  function cycleAnimation(): void {
    if (!modelLoaded || animations.length === 0) return;

    totalRotation = 0;
    animPhase = (animPhase + 1) % 3;

    const state = getState();
    const isMelee = state.selectedStyle === "melee";

    animations.forEach(ag => ag.stop());

    if (animPhase === 0) {
      const idleAnim = isMelee
        ? animations.find(ag => ag.name === "Idle_Sword")
        : animations.find(ag => ag.name === "Idle_Gun");
      if (idleAnim) idleAnim.start(true);
    } else if (animPhase === 1) {
      const attackAnim = isMelee
        ? animations.find(ag => ag.name === "Sword_Slash")
        : animations.find(ag => ag.name === "Gun_Shoot");
      if (attackAnim) attackAnim.start(true);
    } else {
      const runAnim = animations.find(ag => ag.name === "Run");
      if (runAnim) runAnim.start(true);
    }
  }

  // Render observer
  rtt.onAfterRenderObservable.add(() => {
    if (!modelLoaded) return;

    frameCount++;

    // Rotate camera slowly
    camera.alpha += rotationSpeed;
    totalRotation += rotationSpeed;

    // After one full rotation, cycle to next animation
    if (totalRotation >= Math.PI * 2) {
      cycleAnimation();
    }

    // Skip updates during scroll to prevent flickering
    if (frameCount % 2 !== 0 || isScrolling()) return;

    rtt.readPixels()?.then((buffer) => {
      if (!buffer) return;
      const pixels = new Uint8Array(buffer.buffer);
      const imageData = ctx.createImageData(rttSize, rttSize);

      // Convert RGBA buffer (flip Y axis)
      for (let y = 0; y < rttSize; y++) {
        for (let x = 0; x < rttSize; x++) {
          const srcIdx = ((rttSize - 1 - y) * rttSize + x) * 4;
          const dstIdx = (y * rttSize + x) * 4;
          imageData.data[dstIdx] = pixels[srcIdx];
          imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
          imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
          imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
        }
      }

      ctx.putImageData(imageData, 0, 0);
      previewImage.source = canvas.toDataURL();

      if (previewImage.alpha < 1) {
        previewImage.alpha = 1;
        loadingText.isVisible = false;
      }
    });
  });

  function updateAppearance(): void {
    if (meshes.length === 0 || !mesh) return;

    const state = getState();
    const customization = state.customization;
    const headIndex = customization.head;
    const isMelee = state.selectedStyle === "melee";
    const isRightHanded = customization.handedness === "right";

    const teamColor = hexToColor3(getTeamColor());

    // Mirror for handedness
    const currentScale = mesh.scaling;
    mesh.scaling.x = isRightHanded ? -Math.abs(currentScale.x) : Math.abs(currentScale.x);

    meshes.forEach(m => {
      if (m.material) {
        const mat = m.material as PBRMaterial;
        const matName = mat.name;

        if (matName === "TeamMain") {
          mat.albedoColor = teamColor;
        } else if (matName === "MainSkin") {
          mat.albedoColor = hexToColor3(SKIN_TONES[customization.skinTone] || SKIN_TONES[4]);
        } else if (matName === "MainHair") {
          mat.albedoColor = hexToColor3(HAIR_COLORS[customization.hairColor] || HAIR_COLORS[0]);
        } else if (matName === "MainEye") {
          mat.albedoColor = hexToColor3(EYE_COLORS[customization.eyeColor] || EYE_COLORS[2]);
        }
      }

      // Toggle head variants
      for (let i = 0; i < 4; i++) {
        const headName = `Head_00${i + 1}`;
        if (m.name.includes(headName)) {
          m.setEnabled(i === headIndex);
        }
      }

      // Toggle weapons
      const meshNameLower = m.name.toLowerCase();
      if (meshNameLower.includes("sword")) {
        m.setEnabled(isMelee);
      } else if (meshNameLower.includes("pistol")) {
        m.setEnabled(!isMelee);
      }
    });

    // Start idle animation
    animations.forEach(ag => ag.stop());
    const idleAnim = isMelee
      ? animations.find(ag => ag.name === "Idle_Sword")
      : animations.find(ag => ag.name === "Idle_Gun");
    if (idleAnim) {
      idleAnim.start(true);
    }

    // Reset animation cycle
    animPhase = 0;
    totalRotation = 0;
  }

  function loadModel(): void {
    const state = getState();
    const classData = getClassData(state.selectedClass);
    const gender = state.customization.body === "male" ? "m" : "f";
    const modelKey = `${classData.modelFile}_${gender}`;

    // Skip if same model already loaded
    if (modelKey === loadedModelKey && mesh) {
      updateAppearance();
      return;
    }

    modelLoaded = false;
    previewImage.alpha = 0;
    loadingText.isVisible = true;
    onLoadStart?.();

    // Dispose old model
    if (mesh) {
      if (rtt.renderList) {
        rtt.renderList.length = 0;
      }
      meshes.forEach(m => {
        if (m.material) {
          m.material.dispose(false, true);
        }
      });
      mesh.dispose(false, true);
      mesh = null;
      meshes = [];
    }

    // Dispose old animations
    animations.forEach(a => {
      a.stop();
      a.dispose();
    });
    animations = [];

    loadedModelKey = modelKey;
    const modelPath = `${import.meta.env.BASE_URL}models/${modelKey}.glb`;

    SceneLoader.ImportMeshAsync("", modelPath, "", scene).then((result) => {
      if (isSceneDisposed()) {
        result.meshes.forEach(m => m.dispose());
        result.animationGroups.forEach(ag => ag.dispose());
        return;
      }

      mesh = result.meshes[0];
      meshes = result.meshes;
      mesh.position = new Vector3(0, 0, 0);
      mesh.scaling.setAll(0.9);

      result.meshes.forEach(m => {
        m.layerMask = layerMask;
      });

      disableMaterialIBL(result.meshes);

      if (rtt.renderList) {
        rtt.renderList.length = 0;
        result.meshes.forEach(m => rtt.renderList!.push(m));
      }

      animations = result.animationGroups;
      registerForCleanup(result.meshes, result.animationGroups);

      modelLoaded = true;
      updateAppearance();
      onLoadComplete?.();
    }).catch((error) => {
      if (isSceneDisposed()) return;
      console.error(`Failed to load model: ${modelPath}`, error);
      loadingText.text = "Error loading";
    });
  }

  function syncAnimation(): void {
    animPhase = 0;
    totalRotation = 0;
    camera.alpha = -Math.PI / 2 + 0.2;

    if (animations.length > 0) {
      const state = getState();
      const isMelee = state.selectedStyle === "melee";
      animations.forEach(ag => ag.stop());
      const idleAnim = isMelee
        ? animations.find(ag => ag.name === "Idle_Sword")
        : animations.find(ag => ag.name === "Idle_Gun");
      if (idleAnim) idleAnim.start(true);
    }
  }

  function dispose(): void {
    const idx = scene.customRenderTargets.indexOf(rtt);
    if (idx >= 0) {
      scene.customRenderTargets.splice(idx, 1);
    }
    rtt.dispose();
    camera.dispose();

    // Note: meshes and animations are cleaned up by the parent via registerForCleanup
  }

  // Initial load
  loadModel();

  return {
    reload: loadModel,
    refresh: updateAppearance,
    syncAnimation,
    cycleAnimation,
    getRTT: () => rtt,
    dispose,
  };
}
