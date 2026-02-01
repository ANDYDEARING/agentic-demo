import type { UnitClass } from "../../types";

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

// Boost options
export const BOOST_INFO = [
  { name: "Tough", stat: "HP", value: 25, desc: "This unit has an extra" },
  { name: "Deadly", stat: "Damage", value: 25, desc: "This unit deals an extra" },
  { name: "Quick", stat: "Speed", value: 25, desc: "This unit has" },
] as const;

// Weapon options
export const WEAPON_INFO = {
  ranged: {
    label: "Ranged",
    desc: "Can attack non-adjacent units in Line of Sight",
  },
  melee: {
    label: "Melee",
    desc: "2x damage, adjacent spaces only",
  },
} as const;

// Get full unit description for cards
export function getUnitDescription(unitClass: UnitClass, boostIndex: number, weaponStyle: "ranged" | "melee"): string {
  const cls = CLASS_INFO[unitClass];
  const boost = BOOST_INFO[boostIndex];
  const weapon = WEAPON_INFO[weaponStyle];

  return [
    cls.tagline,
    `[${cls.abilityName}]: ${cls.abilityDesc}`,
    `[${boost.name.toUpperCase()}]: ${boost.desc} +${boost.value}% ${boost.stat}`,
    `[${weapon.label.toUpperCase()}]: ${weapon.desc}`,
  ].join("\n\n");
}
