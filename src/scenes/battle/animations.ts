/**
 * battle/animations.ts
 *
 * Animation helpers for battle units.
 * Handles movement animation, facing system, and animation playback.
 */

import type { Unit } from "../../types";

// =============================================================================
// ANIMATION PLAYBACK
// =============================================================================

/**
 * Play a named animation on a unit.
 * Stops all current animations first.
 *
 * @param unit - The unit to animate
 * @param animName - Name of animation to play (e.g., "Run", "Sword_Slash")
 * @param loop - Whether to loop the animation
 * @param onComplete - Optional callback when animation finishes (only for non-looped)
 */
export function playAnimation(
  unit: Unit,
  animName: string,
  loop: boolean,
  onComplete?: () => void
): void {
  if (!unit.animationGroups) {
    console.warn(`No animation groups for ${unit.unitClass}`);
    if (onComplete) onComplete();
    return;
  }

  // Stop all current animations
  unit.animationGroups.forEach((ag) => ag.stop());

  const anim = unit.animationGroups.find((ag) => ag.name === animName);
  if (anim) {
    anim.start(loop);
    if (onComplete && !loop) {
      anim.onAnimationEndObservable.addOnce(() => onComplete());
    }
  } else {
    // Animation not found - call onComplete immediately so game doesn't hang
    console.warn(
      `Animation "${animName}" not found for ${unit.unitClass}. ` +
        `Available: ${unit.animationGroups.map((ag) => ag.name).join(", ")}`
    );
    if (onComplete) onComplete();
  }
}

/**
 * Play the appropriate idle animation based on combat style.
 */
export function playIdleAnimation(unit: Unit): void {
  const isMelee = unit.customization?.combatStyle === "melee";
  playAnimation(unit, isMelee ? "Idle_Sword" : "Idle_Gun", true);
}

// =============================================================================
// FACING SYSTEM
// =============================================================================

/**
 * Initialize facing configuration for a unit.
 * Should be called after spawning but before setting initial facing.
 */
export function initFacing(unit: Unit): void {
  const isFlipped = unit.customization?.handedness === "right";
  unit.facing = {
    currentAngle: 0,
    baseOffset: 0,
    isFlipped: isFlipped,
  };
}

/**
 * Apply the current facing angle to the unit's 3D model.
 */
export function applyFacing(unit: Unit): void {
  if (!unit.modelRoot) return;
  unit.modelRoot.rotationQuaternion = null;
  unit.modelRoot.rotation.y = unit.facing.currentAngle + unit.facing.baseOffset;
}

/**
 * Make a unit face a specific grid position.
 *
 * @param unit - The unit to rotate
 * @param targetX - Target grid X coordinate
 * @param targetZ - Target grid Z coordinate
 * @param fromX - Optional starting X (defaults to unit's current position)
 * @param fromZ - Optional starting Z (defaults to unit's current position)
 */
export function faceTarget(
  unit: Unit,
  targetX: number,
  targetZ: number,
  fromX?: number,
  fromZ?: number
): void {
  const startX = fromX ?? unit.gridX;
  const startZ = fromZ ?? unit.gridZ;
  const dx = targetX - startX;
  const dz = targetZ - startZ;
  if (dx === 0 && dz === 0) return;
  unit.facing.currentAngle = Math.atan2(dx, dz);
  applyFacing(unit);
}

/**
 * Make a unit face the closest living enemy.
 */
export function faceClosestEnemy(unit: Unit, allUnits: Unit[]): void {
  const enemies = allUnits.filter((u) => u.team !== unit.team && u.hp > 0);
  if (enemies.length === 0) return;

  let closest = enemies[0];
  let closestDist =
    Math.abs(closest.gridX - unit.gridX) + Math.abs(closest.gridZ - unit.gridZ);

  for (const enemy of enemies) {
    const dist =
      Math.abs(enemy.gridX - unit.gridX) + Math.abs(enemy.gridZ - unit.gridZ);
    if (dist < closestDist) {
      closest = enemy;
      closestDist = dist;
    }
  }

  faceTarget(unit, closest.gridX, closest.gridZ);
}

/**
 * Make a unit face the average position of all enemies.
 * Useful for initial spawn facing.
 */
export function faceAverageEnemyPosition(unit: Unit, allUnits: Unit[]): void {
  const enemies = allUnits.filter((u) => u.team !== unit.team);
  if (enemies.length === 0) return;

  const avgX = enemies.reduce((sum, e) => sum + e.gridX, 0) / enemies.length;
  const avgZ = enemies.reduce((sum, e) => sum + e.gridZ, 0) / enemies.length;

  faceTarget(unit, avgX, avgZ);
}

/**
 * Legacy alias for faceTarget - kept for compatibility.
 */
export function setUnitFacing(
  unit: Unit,
  targetX: number,
  targetZ: number,
  fromX?: number,
  fromZ?: number
): void {
  faceTarget(unit, targetX, targetZ, fromX, fromZ);
}
