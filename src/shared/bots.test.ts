import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOT_COUNT, botPlayers, ratMutation } from './bots.ts';
import { makeGhosts } from './board.ts';

const ghosts = makeGhosts('2026-12-02');

test('bots are reproducible for a day and always labelled as bots', () => {
  const a = botPlayers('2026-12-02', 'medium', ghosts, 36, 0);
  const b = botPlayers('2026-12-02', 'medium', ghosts, 36, 0);
  assert.deepEqual(a, b);
  assert.equal(a.length, BOT_COUNT);
  for (const bot of a) assert.match(bot.name, /^lab rat #\d{3} \(bot\)$/);
  assert.equal(new Set(a.map((x) => x.id)).size, BOT_COUNT);
});

test('bot scores are valid immunity percentages with some spread', () => {
  const bots = botPlayers('2026-12-02', 'medium', ghosts, 36, 0);
  for (const bot of bots) assert.ok(bot.immunity >= 0 && bot.immunity <= 100);
  const scores = new Set(bots.map((b) => b.immunity));
  assert.ok(scores.size > 5, 'bots should not all score the same');
});

test('different days give different bots', () => {
  const a = botPlayers('2026-12-02', 'medium', ghosts, 36, 0);
  const b = botPlayers('2026-12-03', 'medium', ghosts, 36, 0);
  assert.notDeepEqual(a, b);
});

test('a Vaccine day wake delay helps the bots on average', () => {
  const mean = (delay: number) => {
    const bots = botPlayers('2026-12-02', 'hard', ghosts, 19, delay, 200);
    return bots.reduce((s, b) => s + b.immunity, 0) / bots.length;
  };
  assert.ok(mean(2) > mean(0));
});

test('lab rats pick a stable mutation per day, and all three show up over time', () => {
  assert.equal(ratMutation('2026-12-05'), ratMutation('2026-12-05'));
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) seen.add(ratMutation(`2026-12-${String((i % 28) + 1).padStart(2, '0')}-${i}`));
  assert.equal(seen.size, 3);
});
