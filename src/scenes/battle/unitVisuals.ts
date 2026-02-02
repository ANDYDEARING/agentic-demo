/**
 * battle/unitVisuals.ts
 *
 * Unit spawning, model loading, and visual management.
 * Handles 3D models, HP bars, designation labels, and visual state.
 */

import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  AbstractMesh,
  SceneLoader,
  PBRMaterial,
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import type { Unit, UnitClass, Team, UnitCustomization } from "../../types";
import { getClassData } from "../../types";
import {
  TILE_SIZE,
  BATTLE_MODEL_SCALE,
  BATTLE_MODEL_Y_POSITION,
  HP_BAR_ANCHOR_HEIGHT,
  HEAD_VARIANT_COUNT,
  HP_LOW_THRESHOLD,
  HP_MEDIUM_THRESHOLD,
} from "../../config";
import {
  SKIN_TONES,
  HAIR_COLORS,
  EYE_COLORS,
  HP_BAR_GREEN,
  HP_BAR_ORANGE,
  HP_BAR_RED,
  HP_BAR_BACKGROUND,
  HP_BAR_BORDER,
} from "../../config";
import { hexToColor3 } from "../../utils";
import { isMeleeWeapon, BOOST_BY_INDEX } from "../../config/balance";

// Greek letters for unit designations (matches LoadoutScene)
export const UNIT_DESIGNATIONS = ["Δ", "Ψ", "Ω"]; // Delta, Psi, Omega

// =============================================================================
// MATERIAL CREATION
// =============================================================================

/** Create a basic unit material (for fallback/debug) */
export function createUnitMaterial(
  name: string,
  color: Color3,
  scene: Scene
): StandardMaterial {
  const mat = new StandardMaterial(`${name}Mat`, scene);
  mat.diffuseColor = color;
  return mat;
}

/** Disable IBL/environment features on PBR materials to prevent RGBD shader issues */
function disableMaterialIBL(meshes: AbstractMesh[]): void {
  meshes.forEach((m) => {
    if (
      m.material &&
      (m.material as PBRMaterial).reflectionTexture !== undefined
    ) {
      const mat = m.material as PBRMaterial;
      mat.reflectionTexture = null;
      mat.environmentIntensity = 0;
    }
  });
}

// =============================================================================
// MODEL LOADING
// =============================================================================

/** Get model filename based on unit class and gender */
function getModelFileName(unitClass: UnitClass, isMale: boolean): string {
  const gender = isMale ? "m" : "f";
  const classData = getClassData(unitClass);
  return `${classData.modelFile}_${gender}.glb`;
}

// =============================================================================
// UNIT CREATION
// =============================================================================

/**
 * Create a unit with full visual representation.
 *
 * @param unitClass - The class of unit to create
 * @param team - Which team the unit belongs to
 * @param gridX - Starting grid X position
 * @param gridZ - Starting grid Z position
 * @param scene - Babylon.js scene
 * @param gridOffset - Grid offset for world position calculation
 * @param gui - GUI texture for HP bars
 * @param loadoutIndex - Index in the loadout (for designation/tie-breaking)
 * @param teamColor - Color for team-specific elements
 * @param customization - Optional unit customization
 * @param boost - Optional boost index (0=HP, 1=Damage, 2=Speed)
 */
export async function createUnit(
  unitClass: UnitClass,
  team: Team,
  gridX: number,
  gridZ: number,
  scene: Scene,
  gridOffset: number,
  gui: AdvancedDynamicTexture,
  loadoutIndex: number,
  teamColor: Color3,
  customization?: UnitCustomization,
  boost?: number
): Promise<Unit> {
  const classData = getClassData(unitClass);

  // Default customization if not provided
  const c: UnitCustomization = customization ?? {
    body: "male",
    weapon: "pistol",
    handedness: "right",
    head: 0,
    hairColor: 0,
    eyeColor: 2,
    skinTone: 4,
  };

  // Load 3D model
  const isMale = c.body === "male";
  const modelFile = getModelFileName(unitClass, isMale);
  const result = await SceneLoader.ImportMeshAsync(
    "",
    `${import.meta.env.BASE_URL}models/`,
    modelFile,
    scene
  );

  const modelRoot = result.meshes[0];
  const modelMeshes = result.meshes;
  const animationGroups = result.animationGroups;

  // Disable IBL features to prevent RGBD shader timeout issues
  disableMaterialIBL(modelMeshes);

  // Hide model initially until facing is set (prevents wrong-direction flash)
  modelRoot.setEnabled(false);

  // Position and scale the model
  modelRoot.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    BATTLE_MODEL_Y_POSITION,
    gridZ * TILE_SIZE - gridOffset
  );
  modelRoot.scaling = new Vector3(
    c.handedness === "right" ? -BATTLE_MODEL_SCALE : BATTLE_MODEL_SCALE,
    BATTLE_MODEL_SCALE,
    BATTLE_MODEL_SCALE
  );

  // Apply customizations to the model
  applyHeadVisibility(modelMeshes, c.head);
  applyWeaponVisibility(modelMeshes, isMeleeWeapon(c.weapon));
  applyColorCustomization(modelMeshes, c, teamColor);

  // Set metadata for click detection
  modelMeshes.forEach((mesh) => {
    mesh.metadata = { type: "unit", unitClass, team };
  });

  // Start idle animation
  animationGroups.forEach((ag) => ag.stop());
  const isMelee = isMeleeWeapon(c.weapon);
  const idleAnim = isMelee
    ? animationGroups.find((ag) => ag.name === "Idle_Sword")
    : animationGroups.find((ag) => ag.name === "Idle_Gun");
  idleAnim?.start(true);

  // Create HP bar anchor (invisible mesh for GUI linkage)
  const hpBarAnchor = MeshBuilder.CreateBox(
    `${team}_${unitClass}_anchor_${gridX}_${gridZ}`,
    { size: 0.01 },
    scene
  );
  hpBarAnchor.position = new Vector3(
    gridX * TILE_SIZE - gridOffset,
    HP_BAR_ANCHOR_HEIGHT,
    gridZ * TILE_SIZE - gridOffset
  );
  hpBarAnchor.isVisible = false;
  hpBarAnchor.metadata = { type: "unit", unitClass, team };

  // Create HP bar UI elements
  const { hpBar, hpBarBg } = createHpBar(gui, hpBarAnchor);

  // Create designation label
  const designationText = createDesignationLabel(
    gui,
    hpBarAnchor,
    loadoutIndex,
    teamColor
  );

  // Apply boost multipliers using BOOST_BY_INDEX
  const boostIndex = boost ?? 0;
  const boostData = BOOST_BY_INDEX[boostIndex];
  const hpMultiplier = boostData.stat === "hp" ? 1 + boostData.multiplier : 1;
  const attackMultiplier = boostData.stat === "attack" ? 1 + boostData.multiplier : 1;
  const speedMultiplier = boostData.stat === "speed" ? 1 + boostData.multiplier : 1;

  const boostedHp = Math.round(classData.hp * hpMultiplier);
  const boostedAttack = Math.round(classData.attack * attackMultiplier);
  const boostedSpeed = classData.speed * speedMultiplier;

  return {
    mesh: hpBarAnchor,
    unitClass,
    team,
    gridX,
    gridZ,
    moveRange: classData.moveRange,
    hp: boostedHp,
    maxHp: boostedHp,
    attack: boostedAttack,
    healAmount: classData.healAmount,
    hpBar,
    hpBarBg,
    designationLabel: designationText,
    originalColor: teamColor.clone(),
    hasMoved: false,
    hasAttacked: false,
    speed: boostedSpeed,
    speedBonus: 0,
    accumulator: 0,
    loadoutIndex,
    boost: boost ?? 0,
    modelRoot,
    modelMeshes,
    animationGroups,
    customization: c,
    teamColor,
    facing: {
      currentAngle: 0,
      baseOffset: 0,
      isFlipped: false,
    },
    isConcealed: false,
    isCovering: false,
  };
}

// =============================================================================
// CUSTOMIZATION HELPERS
// =============================================================================

/** Apply head variant visibility */
function applyHeadVisibility(meshes: AbstractMesh[], headIndex: number): void {
  for (let i = 0; i < HEAD_VARIANT_COUNT; i++) {
    const headName = `Head_00${i + 1}`;
    const headMeshes = meshes.filter((m) => m.name.includes(headName));
    headMeshes.forEach((mesh) => mesh.setEnabled(i === headIndex));
  }
}

/** Apply weapon visibility based on combat style */
function applyWeaponVisibility(meshes: AbstractMesh[], isMelee: boolean): void {
  const swordMeshes = meshes.filter((m) =>
    m.name.toLowerCase().includes("sword")
  );
  const pistolMeshes = meshes.filter((m) =>
    m.name.toLowerCase().includes("pistol")
  );
  swordMeshes.forEach((m) => m.setEnabled(isMelee));
  pistolMeshes.forEach((m) => m.setEnabled(!isMelee));
}

/** Apply color customization to model materials */
function applyColorCustomization(
  meshes: AbstractMesh[],
  customization: UnitCustomization,
  teamColor: Color3
): void {
  meshes.forEach((mesh) => {
    if (!mesh.material) return;
    const mat = mesh.material as PBRMaterial;
    const matName = mat.name;

    if (matName === "MainSkin") {
      mat.albedoColor = hexToColor3(
        SKIN_TONES[customization.skinTone] || SKIN_TONES[4]
      );
    } else if (matName === "MainHair") {
      mat.albedoColor = hexToColor3(
        HAIR_COLORS[customization.hairColor] || HAIR_COLORS[0]
      );
    } else if (matName === "MainEye") {
      mat.albedoColor = hexToColor3(
        EYE_COLORS[customization.eyeColor] || EYE_COLORS[2]
      );
    } else if (matName === "TeamMain") {
      mat.albedoColor = teamColor;
    }
  });
}

// =============================================================================
// HP BAR
// =============================================================================

/** Create HP bar UI elements */
function createHpBar(
  gui: AdvancedDynamicTexture,
  anchor: Mesh
): { hpBar: Rectangle; hpBarBg: Rectangle } {
  const hpBarBg = new Rectangle();
  hpBarBg.width = "34px";
  hpBarBg.height = "6px";
  hpBarBg.background = HP_BAR_BACKGROUND;
  hpBarBg.thickness = 1;
  hpBarBg.color = HP_BAR_BORDER;
  hpBarBg.isVisible = false; // Hide until model is ready
  gui.addControl(hpBarBg);
  hpBarBg.linkWithMesh(anchor);
  hpBarBg.linkOffsetY = -50;

  const hpBar = new Rectangle();
  hpBar.width = "30px";
  hpBar.height = "4px";
  hpBar.background = HP_BAR_GREEN;
  hpBar.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
  hpBar.left = "2px";
  hpBarBg.addControl(hpBar);

  return { hpBar, hpBarBg };
}

/** Create designation label (Greek symbol) */
function createDesignationLabel(
  gui: AdvancedDynamicTexture,
  anchor: Mesh,
  loadoutIndex: number,
  teamColor: Color3
): TextBlock {
  const designation = UNIT_DESIGNATIONS[loadoutIndex] || "?";
  const text = new TextBlock(`designation_${loadoutIndex}`);
  text.text = designation;
  text.fontSize = 14;
  text.fontWeight = "bold";

  // Convert teamColor to hex
  const r = Math.round(teamColor.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(teamColor.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(teamColor.b * 255).toString(16).padStart(2, "0");
  text.color = `#${r}${g}${b}`;
  text.outlineWidth = 2;
  text.outlineColor = "black";
  text.isVisible = false; // Hide until model is ready

  gui.addControl(text);
  text.linkWithMesh(anchor);
  text.linkOffsetY = -32; // Below the HP bar

  return text;
}

// =============================================================================
// UNIT VISUAL STATE
// =============================================================================

/** Update HP bar visual based on current HP */
export function updateHpBar(unit: Unit): void {
  if (unit.hpBar) {
    const hpPercent = Math.max(0, unit.hp / unit.maxHp);
    unit.hpBar.width = `${30 * hpPercent}px`;

    // Update color based on HP percentage
    if (hpPercent < HP_LOW_THRESHOLD) {
      unit.hpBar.background = HP_BAR_RED;
    } else if (hpPercent < HP_MEDIUM_THRESHOLD) {
      unit.hpBar.background = HP_BAR_ORANGE;
    } else {
      unit.hpBar.background = HP_BAR_GREEN;
    }
  }
}

/** Set unit to exhausted visual state (dimmed) */
export function setUnitExhausted(unit: Unit): void {
  if (unit.modelMeshes) {
    unit.modelMeshes.forEach((mesh) => {
      if (mesh.material && (mesh.material as PBRMaterial).albedoColor) {
        const mat = mesh.material as PBRMaterial;
        if (!mesh.metadata?.originalAlbedo) {
          mesh.metadata = mesh.metadata || {};
          mesh.metadata.originalAlbedo = mat.albedoColor?.clone();
        }
        if (mat.albedoColor) {
          mat.albedoColor = mat.albedoColor.scale(0.4);
        }
      }
    });
  }
}

/** Set unit to inactive visual state (normal appearance) */
export function setUnitInactive(unit: Unit): void {
  resetUnitAppearance(unit);
}

/** Reset unit appearance to default colors */
export function resetUnitAppearance(unit: Unit): void {
  if (unit.modelMeshes && unit.customization) {
    unit.modelMeshes.forEach((mesh) => {
      if (mesh.material) {
        const mat = mesh.material as PBRMaterial;
        const matName = mat.name;

        if (matName === "MainSkin") {
          mat.albedoColor = hexToColor3(
            SKIN_TONES[unit.customization!.skinTone] || SKIN_TONES[4]
          );
        } else if (matName === "MainHair") {
          mat.albedoColor = hexToColor3(
            HAIR_COLORS[unit.customization!.hairColor] || HAIR_COLORS[0]
          );
        } else if (matName === "MainEye") {
          mat.albedoColor = hexToColor3(
            EYE_COLORS[unit.customization!.eyeColor] || EYE_COLORS[2]
          );
        } else if (matName === "TeamMain") {
          mat.albedoColor = unit.teamColor;
        } else if (mesh.metadata?.originalAlbedo) {
          mat.albedoColor = mesh.metadata.originalAlbedo.clone();
        }
      }
    });
  }
}

// =============================================================================
// UNIT MOVEMENT
// =============================================================================

/** Move unit to new grid position (instant, no animation) */
export function moveUnit(
  unit: Unit,
  newX: number,
  newZ: number,
  gridOffset: number
): void {
  unit.gridX = newX;
  unit.gridZ = newZ;

  const newPosX = newX * TILE_SIZE - gridOffset;
  const newPosZ = newZ * TILE_SIZE - gridOffset;

  // Move HP bar anchor
  unit.mesh.position = new Vector3(newPosX, HP_BAR_ANCHOR_HEIGHT, newPosZ);

  // Move 3D model
  if (unit.modelRoot) {
    unit.modelRoot.position = new Vector3(
      newPosX,
      BATTLE_MODEL_Y_POSITION,
      newPosZ
    );
  }
}

// =============================================================================
// CONCEAL VISUAL
// =============================================================================

import { CONCEAL_ALPHA, CONCEAL_EMISSIVE_SCALE } from "../../config";

/** Apply conceal visual effect (semi-transparent with team color tint) */
export function applyConcealVisual(unit: Unit): void {
  if (unit.modelMeshes) {
    unit.modelMeshes.forEach((mesh) => {
      if (mesh.material) {
        const mat = mesh.material as PBRMaterial;
        mat.alpha = CONCEAL_ALPHA;
        mat.emissiveColor = unit.teamColor.scale(CONCEAL_EMISSIVE_SCALE);
      }
    });
  }
}

/** Remove conceal visual effect */
export function removeConcealVisual(unit: Unit): void {
  if (unit.modelMeshes) {
    unit.modelMeshes.forEach((mesh) => {
      if (mesh.material) {
        const mat = mesh.material as PBRMaterial;
        mat.alpha = 1.0;
        mat.emissiveColor = Color3.Black();
      }
    });
  }
}
