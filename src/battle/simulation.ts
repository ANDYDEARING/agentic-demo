/**
 * battle/simulation.ts
 *
 * Batch battle simulation and statistics collection.
 * Runs many AI vs AI battles and tracks win rates by trait.
 */

import type { UnitClass, WeaponType } from "../types";
import { runBattle, generateRandomLoadout, type UnitLoadout, type BattleResult } from "./runner";
import { WEAPON_DATA } from "../config/balance";

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
  weaponCounts: Record<WeaponType, TraitStats>;

  // Win rates by boost
  boostCounts: Record<number, TraitStats>;

  // Win rates by class+weapon combo
  classWeaponCounts: Record<string, TraitStats>;

  // Win rates by class+boost combo
  classBoostCounts: Record<string, TraitStats>;
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
      sword: { appearances: 0, wins: 0 },
      pistol: { appearances: 0, wins: 0 },
    },
    boostCounts: {
      0: { appearances: 0, wins: 0 },
      1: { appearances: 0, wins: 0 },
      2: { appearances: 0, wins: 0 },
    },
    classWeaponCounts: {},
    classBoostCounts: {},
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
    stats.weaponCounts[unit.weapon].appearances++;
    if (won) stats.weaponCounts[unit.weapon].wins++;

    // Boost
    stats.boostCounts[unit.boost].appearances++;
    if (won) stats.boostCounts[unit.boost].wins++;

    // Class+Weapon combo
    const classWeaponKey = `${unit.unitClass}+${unit.weapon}`;
    if (!stats.classWeaponCounts[classWeaponKey]) {
      stats.classWeaponCounts[classWeaponKey] = { appearances: 0, wins: 0 };
    }
    stats.classWeaponCounts[classWeaponKey].appearances++;
    if (won) stats.classWeaponCounts[classWeaponKey].wins++;

    // Class+Boost combo
    const classBoostKey = `${unit.unitClass}+${unit.boost}`;
    if (!stats.classBoostCounts[classBoostKey]) {
      stats.classBoostCounts[classBoostKey] = { appearances: 0, wins: 0 };
    }
    stats.classBoostCounts[classBoostKey].appearances++;
    if (won) stats.classBoostCounts[classBoostKey].wins++;
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
    const weaponData = WEAPON_DATA[weapon as WeaponType];
    const name = weaponData?.name || weapon;
    console.log(`${name.padEnd(12)} ${formatPercent(data.wins, data.appearances)}`);
  }

  console.log("\n=== BOOST WIN RATES ===");
  for (const [boost, data] of Object.entries(stats.boostCounts)) {
    const name = BOOST_NAMES[parseInt(boost)] || boost;
    console.log(`${name.padEnd(18)} ${formatPercent(data.wins, data.appearances)}`);
  }

  console.log("\n=== CLASS+WEAPON COMBOS ===");
  const sortedWeaponCombos = Object.entries(stats.classWeaponCounts).sort((a, b) => {
    const aRate = a[1].appearances > 0 ? a[1].wins / a[1].appearances : 0;
    const bRate = b[1].appearances > 0 ? b[1].wins / b[1].appearances : 0;
    return bRate - aRate;
  });
  for (const [combo, data] of sortedWeaponCombos) {
    const [cls, weapon] = combo.split("+");
    const className = cls.charAt(0).toUpperCase() + cls.slice(1);
    const weaponName = WEAPON_DATA[weapon as WeaponType]?.name || weapon;
    const name = `${className}+${weaponName}`;
    console.log(`${name.padEnd(20)} ${formatPercent(data.wins, data.appearances)}`);
  }

  console.log("\n=== CLASS+BOOST COMBOS ===");
  const sortedBoostCombos = Object.entries(stats.classBoostCounts).sort((a, b) => {
    const aRate = a[1].appearances > 0 ? a[1].wins / a[1].appearances : 0;
    const bRate = b[1].appearances > 0 ? b[1].wins / b[1].appearances : 0;
    return bRate - aRate;
  });
  for (const [combo, data] of sortedBoostCombos) {
    const [cls, boost] = combo.split("+");
    const className = cls.charAt(0).toUpperCase() + cls.slice(1);
    const boostName = BOOST_NAMES[parseInt(boost)]?.split(" ")[0] || boost;
    const name = `${className}+${boostName}`;
    console.log(`${name.padEnd(20)} ${formatPercent(data.wins, data.appearances)}`);
  }
}
