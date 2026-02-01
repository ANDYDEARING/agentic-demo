/**
 * battle/simulation.ts
 *
 * Batch battle simulation and statistics collection.
 * Runs many AI vs AI battles and tracks win rates by trait.
 */

import type { UnitClass, CombatStyle } from "../types";
import { runBattle, generateRandomLoadout, type UnitLoadout, type BattleResult } from "./runner";

// =============================================================================
// STATISTICS TYPES
// =============================================================================

interface TraitStats {
  appearances: number;
  wins: number;
}

export interface SimulationStats {
  totalBattles: number;
  draws: number;

  // Win rates by class
  classCounts: Record<UnitClass, TraitStats>;

  // Win rates by weapon
  weaponCounts: Record<CombatStyle, TraitStats>;

  // Win rates by boost
  boostCounts: Record<number, TraitStats>;

  // Win rates by class+weapon combo
  comboCounts: Record<string, TraitStats>;
}

// =============================================================================
// STATISTICS COLLECTION
// =============================================================================

function createEmptyStats(): SimulationStats {
  return {
    totalBattles: 0,
    draws: 0,
    classCounts: {
      soldier: { appearances: 0, wins: 0 },
      operator: { appearances: 0, wins: 0 },
      medic: { appearances: 0, wins: 0 },
    },
    weaponCounts: {
      melee: { appearances: 0, wins: 0 },
      ranged: { appearances: 0, wins: 0 },
    },
    boostCounts: {
      0: { appearances: 0, wins: 0 },
      1: { appearances: 0, wins: 0 },
      2: { appearances: 0, wins: 0 },
    },
    comboCounts: {},
  };
}

function recordLoadout(
  stats: SimulationStats,
  loadout: UnitLoadout[],
  won: boolean
): void {
  for (const unit of loadout) {
    // Class
    stats.classCounts[unit.unitClass].appearances++;
    if (won) stats.classCounts[unit.unitClass].wins++;

    // Weapon
    stats.weaponCounts[unit.combatStyle].appearances++;
    if (won) stats.weaponCounts[unit.combatStyle].wins++;

    // Boost
    stats.boostCounts[unit.boost].appearances++;
    if (won) stats.boostCounts[unit.boost].wins++;

    // Combo
    const comboKey = `${unit.unitClass}+${unit.combatStyle}`;
    if (!stats.comboCounts[comboKey]) {
      stats.comboCounts[comboKey] = { appearances: 0, wins: 0 };
    }
    stats.comboCounts[comboKey].appearances++;
    if (won) stats.comboCounts[comboKey].wins++;
  }
}

function recordBattle(stats: SimulationStats, result: BattleResult): void {
  stats.totalBattles++;

  if (result.winner === null) {
    stats.draws++;
    return;
  }

  const p1Won = result.winner === "player1";
  recordLoadout(stats, result.p1Loadout, p1Won);
  recordLoadout(stats, result.p2Loadout, !p1Won);
}

// =============================================================================
// SIMULATION RUNNER
// =============================================================================

export function runSimulation(
  battleCount: number,
  progressCallback?: (completed: number, total: number) => void
): SimulationStats {
  const stats = createEmptyStats();

  for (let i = 0; i < battleCount; i++) {
    const p1Loadout = generateRandomLoadout();
    const p2Loadout = generateRandomLoadout();
    const result = runBattle(p1Loadout, p2Loadout);
    recordBattle(stats, result);

    if (progressCallback && (i + 1) % 100 === 0) {
      progressCallback(i + 1, battleCount);
    }
  }

  return stats;
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

const BOOST_NAMES: Record<number, string> = {
  0: "Tough (+HP)",
  1: "Deadly (+ATK)",
  2: "Quick (+Speed)",
};

function formatPercent(wins: number, total: number): string {
  if (total === 0) return "N/A";
  const percent = ((wins / total) * 100).toFixed(1);
  return `${percent}% (${wins}/${total})`;
}

export function printStats(stats: SimulationStats): void {
  console.log(`\nCompleted ${stats.totalBattles} battles (${stats.draws} draws)\n`);

  console.log("=== CLASS WIN RATES ===");
  for (const [cls, data] of Object.entries(stats.classCounts)) {
    const name = cls.charAt(0).toUpperCase() + cls.slice(1);
    console.log(`${name.padEnd(12)} ${formatPercent(data.wins, data.appearances)}`);
  }

  console.log("\n=== WEAPON WIN RATES ===");
  for (const [weapon, data] of Object.entries(stats.weaponCounts)) {
    const name = weapon.charAt(0).toUpperCase() + weapon.slice(1);
    console.log(`${name.padEnd(12)} ${formatPercent(data.wins, data.appearances)}`);
  }

  console.log("\n=== BOOST WIN RATES ===");
  for (const [boost, data] of Object.entries(stats.boostCounts)) {
    const name = BOOST_NAMES[parseInt(boost)] || boost;
    console.log(`${name.padEnd(18)} ${formatPercent(data.wins, data.appearances)}`);
  }

  console.log("\n=== CLASS+WEAPON COMBOS ===");
  const sortedCombos = Object.entries(stats.comboCounts).sort((a, b) => {
    const aRate = a[1].appearances > 0 ? a[1].wins / a[1].appearances : 0;
    const bRate = b[1].appearances > 0 ? b[1].wins / b[1].appearances : 0;
    return bRate - aRate;
  });
  for (const [combo, data] of sortedCombos) {
    const [cls, weapon] = combo.split("+");
    const name = `${cls.charAt(0).toUpperCase() + cls.slice(1)}+${weapon.charAt(0).toUpperCase() + weapon.slice(1)}`;
    console.log(`${name.padEnd(20)} ${formatPercent(data.wins, data.appearances)}`);
  }
}
