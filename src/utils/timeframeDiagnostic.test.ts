import test from 'node:test';
import assert from 'node:assert/strict';
import { botEngine } from '../server/botEngine';

test('TimeframeDiagnosticModule generates complete report ranking 1m to 1d timeframes', () => {
  const report = botEngine.getTimeframeDiagnosticReport();

  assert.ok(report, 'Diagnostic report should be defined');
  assert.ok(report.rankings.length === 8, `Should rank all 8 timeframes (1m to 1d), got ${report.rankings.length}`);

  const timeframes = report.rankings.map((r) => r.timeframe);
  assert.ok(timeframes.includes('1m'), 'Should include 1m');
  assert.ok(timeframes.includes('5m'), 'Should include 5m');
  assert.ok(timeframes.includes('15m'), 'Should include 15m');
  assert.ok(timeframes.includes('30m'), 'Should include 30m');
  assert.ok(timeframes.includes('1h'), 'Should include 1h');
  assert.ok(timeframes.includes('4h'), 'Should include 4h');
  assert.ok(timeframes.includes('1d'), 'Should include 1d');

  // Verify rank 1 has isRecommended = true
  const topRec = report.rankings.find((r) => r.rank === 1);
  assert.ok(topRec, 'Rank 1 item should exist');
  assert.equal(topRec.isRecommended, true, 'Top ranked item should be marked as recommended');
  assert.equal(topRec.timeframe, report.recommendedTimeframe, 'Recommended timeframe should match rank 1');
  assert.ok(report.recommendationReason.length > 10, 'Recommendation reason should be populated');
});
