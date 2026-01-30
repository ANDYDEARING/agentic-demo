/**
 * Content for How To and For Nerds overlays
 */

import {
  ACTIONS_PER_TURN,
  ACCUMULATOR_THRESHOLD,
  SPEED_BONUS_PER_UNUSED_ACTION,
  BASE_UNIT_SPEED,
  MELEE_DAMAGE_MULTIPLIER,
  BOOST_MULTIPLIER,
  GRID_SIZE,
} from "./constants";
import { CLASS_DATA } from "../types";

export function getHowToContent(): string {
  return `GOAL: Eliminate all enemy units.

YOUR TURN: Each unit gets 2 actions. Mix and match:
  - Move (up to 3 tiles)
  - Attack (melee = adjacent, ranged = line of sight)
  - Use ability (class-specific)

WEAPONS:
  - Melee: High damage, must be adjacent to target
  - Ranged: Lower damage, can't hit adjacent tiles

CLASSES:
  - Soldier: Use COVER to watch tiles and auto-attack enemies
  - Operator: Use CONCEAL to block the next hit (then it breaks)
  - Medic: Use HEAL on yourself or adjacent allies

BOOSTS (pick one per unit):
  - Tough: +25% HP
  - Deadly: +25% Damage
  - Quick: +25% Speed (act sooner)

TIPS:
  - Ending turn early with unused actions gives a speed bonus
  - Ranged units should stay back; melee units close the gap
  - Medics heal better when safe behind allies
  - Cover triggers when enemies act in watched tiles`;
}

export function getNerdContent(): string {
  const soldier = CLASS_DATA.soldier;
  const operator = CLASS_DATA.operator;
  const medic = CLASS_DATA.medic;
  const boostPct = Math.round(BOOST_MULTIPLIER * 100);
  const meleeMultiplier = MELEE_DAMAGE_MULTIPLIER;

  return `GRID: ${GRID_SIZE}x${GRID_SIZE} tiles

UNIT BASE STATS:
  Soldier:  HP ${soldier.hp} | ATK ${soldier.attack} | Move ${soldier.moveRange}
  Operator: HP ${operator.hp} | ATK ${operator.attack} | Move ${operator.moveRange}
  Medic:    HP ${medic.hp} | ATK ${medic.attack} | Move ${medic.moveRange}

DAMAGE FORMULA:
  Ranged: ATK x 1 = ${soldier.attack} damage
  Melee:  ATK x ${meleeMultiplier} = ${soldier.attack * meleeMultiplier} damage

BOOSTS (+${boostPct}%):
  Tough:  HP ${soldier.hp} -> ${Math.round(soldier.hp * (1 + BOOST_MULTIPLIER))}
  Deadly: ATK ${soldier.attack} -> ${Math.round(soldier.attack * (1 + BOOST_MULTIPLIER))} (melee dmg: ${Math.round(soldier.attack * (1 + BOOST_MULTIPLIER) * meleeMultiplier)})
  Quick:  Speed ${BASE_UNIT_SPEED} -> ${(BASE_UNIT_SPEED * (1 + BOOST_MULTIPLIER)).toFixed(2)}

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
    * Melee: All 8 adjacent (diagonals need LOS)
    * Ranged: All tiles in LOS (not adjacent)
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
  - Ranged attacks cannot target adjacent tiles`;
}
