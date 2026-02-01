/**
 * Content for How To and For Nerds overlays
 */

import {
  ACTIONS_PER_TURN,
  ACCUMULATOR_THRESHOLD,
  SPEED_BONUS_PER_UNUSED_ACTION,
  GRID_SIZE,
} from "./constants";
import {
  BOOST_DATA,
  WEAPON_DATA,
  CLASS_BASE_STATS,
} from "./balance";

export function getHowToContent(): string {
  const toughPct = Math.round(BOOST_DATA.tough.multiplier * 100);
  const deadlyPct = Math.round(BOOST_DATA.deadly.multiplier * 100);
  const quickPct = Math.round(BOOST_DATA.quick.multiplier * 100);
  const swordMultiplier = WEAPON_DATA.sword.damageMultiplier;

  // Get move ranges (show range if all same, or list per class)
  const soldierMove = CLASS_BASE_STATS.soldier.moveRange;
  const operatorMove = CLASS_BASE_STATS.operator.moveRange;
  const medicMove = CLASS_BASE_STATS.medic.moveRange;
  const allSameMove = soldierMove === operatorMove && operatorMove === medicMove;
  const moveDesc = allSameMove
    ? `up to ${soldierMove} tiles`
    : `Soldier ${soldierMove}, Operator ${operatorMove}, Medic ${medicMove}`;

  return `GOAL: Eliminate all enemy units.

YOUR TURN: Each unit gets ${ACTIONS_PER_TURN} actions. Mix and match:
  - Move (${moveDesc})
  - Attack (melee = adjacent, ranged = line of sight)
  - Use ability (class-specific)

WEAPONS:
  - ${WEAPON_DATA.sword.name}: ${swordMultiplier}x damage, must be adjacent to target
  - ${WEAPON_DATA.pistol.name}: Lower damage, can't hit adjacent tiles

CLASSES:
  - Soldier: Use COVER to watch tiles and auto-attack enemies
  - Operator: Use CONCEAL to block the next hit (then it breaks)
  - Medic: Use HEAL on yourself or adjacent allies

BOOSTS (pick one per unit):
  - Tough: +${toughPct}% HP
  - Deadly: +${deadlyPct}% Damage
  - Quick: +${quickPct}% Speed (act sooner)

TIPS:
  - Ending turn early with unused actions gives a speed bonus
  - Ranged units should stay back; melee units close the gap
  - Medics heal better when safe behind allies
  - Cover triggers when enemies act in watched tiles`;
}

export function getNerdContent(): string {
  const soldier = CLASS_BASE_STATS.soldier;
  const operator = CLASS_BASE_STATS.operator;
  const medic = CLASS_BASE_STATS.medic;

  const toughPct = Math.round(BOOST_DATA.tough.multiplier * 100);
  const deadlyPct = Math.round(BOOST_DATA.deadly.multiplier * 100);
  const quickPct = Math.round(BOOST_DATA.quick.multiplier * 100);

  const swordMultiplier = WEAPON_DATA.sword.damageMultiplier;
  const pistolMultiplier = WEAPON_DATA.pistol.damageMultiplier;
  const baseSpeed = soldier.speed;

  return `GRID: ${GRID_SIZE}x${GRID_SIZE} tiles

UNIT BASE STATS:
  Soldier:  HP ${soldier.hp} | ATK ${soldier.attack} | Move ${soldier.moveRange}
  Operator: HP ${operator.hp} | ATK ${operator.attack} | Move ${operator.moveRange}
  Medic:    HP ${medic.hp} | ATK ${medic.attack} | Move ${medic.moveRange}

DAMAGE FORMULA:
  Damage = ATK x Weapon Multiplier
  ${WEAPON_DATA.pistol.name}: x${pistolMultiplier} | ${WEAPON_DATA.sword.name}: x${swordMultiplier}
  Example: Soldier (ATK ${soldier.attack}) + Sword = ${soldier.attack} x ${swordMultiplier} = ${soldier.attack * swordMultiplier}

BOOSTS:
  Tough (+${toughPct}% HP):    HP ${soldier.hp} -> ${Math.round(soldier.hp * (1 + BOOST_DATA.tough.multiplier))}
  Deadly (+${deadlyPct}% ATK): ATK ${soldier.attack} -> ${Math.round(soldier.attack * (1 + BOOST_DATA.deadly.multiplier))} (sword dmg: ${Math.round(soldier.attack * (1 + BOOST_DATA.deadly.multiplier) * swordMultiplier)})
  Quick (+${quickPct}% Speed): Speed ${baseSpeed} -> ${(baseSpeed * (1 + BOOST_DATA.quick.multiplier)).toFixed(2)}

TURN ORDER (Accumulator System):
  - Each unit has an accumulator starting at 0
  - Each tick: accumulator += speed
  - When accumulator >= ${ACCUMULATOR_THRESHOLD}, unit acts
  - After acting: accumulator resets to 0
  - Higher speed = more frequent turns

SPEED BONUS (for ending turn early):
  +${SPEED_BONUS_PER_UNUSED_ACTION} speed per unused action
  Max bonus: +${SPEED_BONUS_PER_UNUSED_ACTION * ACTIONS_PER_TURN} (skip entire turn)

ACTIONS PER TURN: ${ACTIONS_PER_TURN}
  - Move, Attack, or Ability each cost 1 action
  - Same action can be repeated (move+move, attack+attack)

COVER (Soldier):
  - Activation: Costs 1 action
  - Watched tiles:
    * ${WEAPON_DATA.sword.name}: All 8 adjacent (diagonals need LOS)
    * ${WEAPON_DATA.pistol.name}: All tiles in LOS (not adjacent)
  - Triggers: When enemy completes ANY action in a watched tile
  - Effect: Auto-attack the enemy, then Cover ends
  - Breaks when:
    * Reaction fires (attacks enemy)
    * Covering unit takes damage
    * Covering unit's next turn starts
  - Note: Concealed enemies don't trigger Cover

CONCEAL (Operator):
  - Activation: Costs 1 action (one-way toggle)
  - Effect: Next incoming attack deals 0 damage
  - Breaks when: Unit is attacked (damage negated)
  - Cannot be manually deactivated

HEAL (Medic):
  - Heals ${medic.healAmount} HP per use
  - Valid targets: Self or adjacent ally
  - Diagonal targets require line of sight
  - Cannot overheal (capped at max HP)

LINE OF SIGHT:
  - Blocked by: Terrain blocks, other units
  - Units block the interior of their tile, not corners
  - Diagonal attacks/heals require clear LOS
  - ${WEAPON_DATA.pistol.name} attacks cannot target adjacent tiles`;
}
