/**
 * config/balance.ts
 *
 * Game balance configuration - all editable stats for tuning.
 * Organized by category for easy discovery and modification.
 *
 * Each class, weapon, and boost has independently editable values.
 */

import type { UnitClass } from "../types";

// =============================================================================
// WEAPON TYPES & DATA
// =============================================================================

/** Available weapon types */
export type WeaponType = "sword" | "pistol";

/** Attack pattern derived from weapon */
export type AttackPattern = "melee" | "ranged";

/** Weapon configuration */
export interface WeaponData {
  id: WeaponType;
  name: string;           // Display name (capitalized)
  pattern: AttackPattern; // Melee = adjacent, Ranged = LOS (not adjacent)
  damageMultiplier: number;
}

/** Weapon definitions - damage multipliers applied to unit's base attack */
export const WEAPON_DATA: Record<WeaponType, WeaponData> = {
  sword: {
    id: "sword",
    name: "Sword",
    pattern: "melee",
    damageMultiplier: 2.0,
  },
  pistol: {
    id: "pistol",
    name: "Pistol",
    pattern: "ranged",
    damageMultiplier: 1.0,
  },
};

/** All available weapons */
export const ALL_WEAPONS: WeaponType[] = ["sword", "pistol"];

/** Helper to get weapon data */
export function getWeaponData(weapon: WeaponType): WeaponData {
  return WEAPON_DATA[weapon];
}

/** Helper to check if weapon uses melee pattern */
export function isMeleeWeapon(weapon: WeaponType): boolean {
  return WEAPON_DATA[weapon].pattern === "melee";
}

/** Helper to check if weapon uses ranged pattern */
export function isRangedWeapon(weapon: WeaponType): boolean {
  return WEAPON_DATA[weapon].pattern === "ranged";
}

// =============================================================================
// BOOST TYPES & DATA
// =============================================================================

/** Available boost types */
export type BoostType = "tough" | "deadly" | "quick";

/** Boost configuration */
export interface BoostData {
  id: BoostType;
  index: number;          // 0, 1, 2 for backwards compatibility
  name: string;           // Display name
  description: string;    // Short description for UI
  stat: "hp" | "attack" | "speed";
  multiplier: number;     // e.g., 0.25 = +25%
}

/** Boost definitions - each has its own independent multiplier */
export const BOOST_DATA: Record<BoostType, BoostData> = {
  tough: {
    id: "tough",
    index: 0,
    name: "Tough",
    description: "+HP",
    stat: "hp",
    multiplier: 0.25,
  },
  deadly: {
    id: "deadly",
    index: 1,
    name: "Deadly",
    description: "+ATK",
    stat: "attack",
    multiplier: 0.25,
  },
  quick: {
    id: "quick",
    index: 2,
    name: "Quick",
    description: "+Speed",
    stat: "speed",
    multiplier: 0.25,
  },
};

/** Boost lookup by index (for backwards compatibility) */
export const BOOST_BY_INDEX: BoostData[] = [
  BOOST_DATA.tough,
  BOOST_DATA.deadly,
  BOOST_DATA.quick,
];

/** All available boosts */
export const ALL_BOOSTS: BoostType[] = ["tough", "deadly", "quick"];

/** Helper to get boost data by type */
export function getBoostData(boost: BoostType): BoostData {
  return BOOST_DATA[boost];
}

/** Helper to get boost data by index */
export function getBoostByIndex(index: number): BoostData {
  return BOOST_BY_INDEX[index] || BOOST_DATA.tough;
}

// =============================================================================
// CLASS BASE STATS
// =============================================================================

/** Base stats for a unit class (before weapon/boost modifiers) */
export interface ClassBaseStats {
  hp: number;
  attack: number;
  speed: number;
  moveRange: number;
  attackRange: number;
  healAmount: number;
}

/** Per-class base stats - independently editable */
export const CLASS_BASE_STATS: Record<UnitClass, ClassBaseStats> = {
  soldier: {
    hp: 75,
    attack: 20,
    speed: 1.0,
    moveRange: 3,
    attackRange: 2,
    healAmount: 0,
  },
  operator: {
    hp: 75,
    attack: 20,
    speed: 1.0,
    moveRange: 3,
    attackRange: 2,
    healAmount: 0,
  },
  medic: {
    hp: 75,
    attack: 20,
    speed: 1.0,
    moveRange: 3,
    attackRange: 2,
    healAmount: 25,
  },
};

/** Helper to get class base stats */
export function getClassBaseStats(unitClass: UnitClass): ClassBaseStats {
  return CLASS_BASE_STATS[unitClass];
}

// =============================================================================
// STAT CALCULATION HELPERS
// =============================================================================

/**
 * Calculate final stats for a unit given class, weapon, and boost.
 */
export function calculateUnitStats(
  unitClass: UnitClass,
  weapon: WeaponType,
  boostIndex: number
): {
  hp: number;
  attack: number;
  speed: number;
  moveRange: number;
  attackRange: number;
  healAmount: number;
  damageMultiplier: number;
} {
  const base = CLASS_BASE_STATS[unitClass];
  const weaponData = WEAPON_DATA[weapon];
  const boost = BOOST_BY_INDEX[boostIndex] || BOOST_DATA.tough;

  // Apply boost multipliers
  const hpMultiplier = boost.stat === "hp" ? 1 + boost.multiplier : 1;
  const attackMultiplier = boost.stat === "attack" ? 1 + boost.multiplier : 1;
  const speedMultiplier = boost.stat === "speed" ? 1 + boost.multiplier : 1;

  return {
    hp: Math.round(base.hp * hpMultiplier),
    attack: Math.round(base.attack * attackMultiplier),
    speed: base.speed * speedMultiplier,
    moveRange: base.moveRange,
    attackRange: base.attackRange,
    healAmount: base.healAmount,
    damageMultiplier: weaponData.damageMultiplier,
  };
}

/**
 * Calculate damage for an attack.
 */
export function calculateWeaponDamage(baseAttack: number, weapon: WeaponType): number {
  return Math.round(baseAttack * WEAPON_DATA[weapon].damageMultiplier);
}
