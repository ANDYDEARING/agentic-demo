import type { UnitClass } from "../../types";
import { BOOST_BY_INDEX, WEAPON_DATA } from "../../config/balance";

// Greek letters for unit designations
export const UNIT_DESIGNATIONS = ["Δ", "Ψ", "Ω"] as const; // Delta, Psi, Omega

// Class info for UI display
export const CLASS_INFO: Record<UnitClass, { name: string; tagline: string; abilityName: string; abilityDesc: string }> = {
  soldier: {
    name: "Soldier",
    tagline: "The settlement's last line of defense",
    abilityName: "COVER",
    abilityDesc: "Activate to counter enemies in range, potentially interrupting their move",
  },
  operator: {
    name: "Operator",
    tagline: "A ghost in the chaos of battle",
    abilityName: "CONCEAL",
    abilityDesc: "Activate to negate the next incoming hit and avoid triggering enemy Cover",
  },
  medic: {
    name: "Medic",
    tagline: "Keeping hope alive under fire",
    abilityName: "HEAL",
    abilityDesc: "Restore HP to self or adjacent allies (diagonals require line of sight)",
  },
};

// Boost options - values derived from BOOST_DATA
export const BOOST_INFO = [
  { name: "Tough", stat: "HP", get value() { return Math.round(BOOST_BY_INDEX[0].multiplier * 100); }, desc: "This unit has an extra" },
  { name: "Deadly", stat: "Damage", get value() { return Math.round(BOOST_BY_INDEX[1].multiplier * 100); }, desc: "This unit deals an extra" },
  { name: "Quick", stat: "Speed", get value() { return Math.round(BOOST_BY_INDEX[2].multiplier * 100); }, desc: "This unit has" },
];

// Weapon options - descriptions derived from WEAPON_DATA
export const WEAPON_INFO = {
  pistol: {
    label: "Pistol",
    desc: "Can attack non-adjacent units in Line of Sight",
  },
  sword: {
    label: "Sword",
    get desc() { return `${WEAPON_DATA.sword.damageMultiplier}x damage, adjacent spaces only`; },
  },
};

// Get full unit description for cards
export function getUnitDescription(unitClass: UnitClass, boostIndex: number, weaponType: "sword" | "pistol"): string {
  const cls = CLASS_INFO[unitClass];
  const boost = BOOST_INFO[boostIndex];
  const weapon = WEAPON_INFO[weaponType];

  return [
    cls.tagline,
    `[${cls.abilityName}]: ${cls.abilityDesc}`,
    `[${boost.name.toUpperCase()}]: ${boost.desc} +${boost.value}% ${boost.stat}`,
    `[${weapon.label.toUpperCase()}]: ${weapon.desc}`,
  ].join("\n\n");
}
