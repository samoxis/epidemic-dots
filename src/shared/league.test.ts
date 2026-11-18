import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEAGUES, leagueName, nextLeague } from './league.ts';
import { PROMOTION_IMMUNITY } from './engine.ts';

test('promotion needs the weekly average and happens once a week', () => {
  assert.deepEqual(nextLeague(0, PROMOTION_IMMUNITY - 1, false), { index: 0, promoted: false });
  assert.deepEqual(nextLeague(0, PROMOTION_IMMUNITY, false), { index: 1, promoted: true });
  assert.deepEqual(nextLeague(1, 99, true), { index: 1, promoted: false });
});

test('you never move down and the top league is the end', () => {
  assert.equal(nextLeague(2, 0, false).index, 2);
  const top = LEAGUES.length - 1;
  assert.deepEqual(nextLeague(top, 100, false), { index: top, promoted: false });
  assert.equal(leagueName(99), 'Pandemic');
  assert.equal(leagueName(-3), 'Sniffle');
});
