#!/usr/bin/env npx tsx
/**
 * CLI entry point for headless battle simulation.
 *
 * Usage: npm run simulation [count]
 * Example: npm run simulation 1000
 */

import { runSimulation, printStats } from "../src/battle/simulation";

const battleCount = parseInt(process.argv[2]) || 1000;

console.log(`Running ${battleCount} AI vs AI battles...`);
const startTime = Date.now();

const stats = runSimulation(battleCount, (completed, total) => {
  process.stdout.write(`\rProgress: ${completed}/${total}`);
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`\rCompleted in ${elapsed}s                    `);

printStats(stats);
