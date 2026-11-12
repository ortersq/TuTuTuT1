import test from 'node:test';
import assert from 'node:assert';
import { runGeneticOptimizer } from './geneticOptimizer';
import { Kline } from '../types/trading';

test('Genetic Algorithm Optimizer - Run Optimization & Parameter Heatmap Grid', () => {
  const dummyKlines: Kline[] = Array.from({ length: 100 }, (_, i) => ({
    timestamp: 1700000000000 + i * 60000,
    open: 65000 + (i % 5),
    high: 65100 + (i % 5),
    low: 64900 - (i % 5),
    close: 65050 + (i % 3),
    volume: 120 + (i % 10),
    quoteVolume: 7800000 + i * 1000,
    tradesCount: 1500 + i,
  }));

  const result = runGeneticOptimizer(dummyKlines);

  assert.strictEqual(result.generationCount, 10, 'Should execute 10 generations');
  assert.ok(result.bestGenome, 'Should contain a best genome');
  assert.ok(result.bestGenome.fitnessScore > 0, 'Fitness score should be positive');
  assert.ok(result.bestGenome.winRate >= 0 && result.bestGenome.winRate <= 100, 'Win rate should be percentage');
  assert.strictEqual(result.parameterHeatmap.length, 25, 'Should generate 5x5 = 25 parameter contribution heatmap cells');

  const optimalCells = result.parameterHeatmap.filter((cell) => cell.isOptimal);
  assert.strictEqual(optimalCells.length, 1, 'Exactly one heatmap cell should be marked optimal');
  assert.strictEqual(optimalCells[0].emaFast, result.bestGenome.emaFast, 'Optimal cell fast EMA should match best genome');
  assert.strictEqual(optimalCells[0].emaSlow, result.bestGenome.emaSlow, 'Optimal cell slow EMA should match best genome');

  assert.ok(result.evolutionProgressLog.length >= 10, 'Should record generation logs');
});
