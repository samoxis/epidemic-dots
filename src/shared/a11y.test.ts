import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../client/index.css', import.meta.url), 'utf8');

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};
const token = (name: string) => {
  const m = new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(m?.[1], `token ${name} exists`);
  return m[1];
};

test('body text colours keep WCAG AA contrast (4.5:1) on the paper and white backgrounds', () => {
  const paper = token('dgv-paper');
  for (const fg of [token('dgv-ink'), token('dgv-muted')]) {
    assert.ok(ratio(fg, paper) >= 4.5, `${fg} on paper`);
    assert.ok(ratio(fg, '#ffffff') >= 4.5, `${fg} on white`);
  }
  assert.ok(ratio(token('dgv-ink'), token('dgv-pink')) >= 4.5, 'button text on pink');
  assert.ok(ratio(token('dgv-ink'), token('dgv-yellow')) >= 4.5, 'text on yellow');
});

test('inactive step text is readable, and the page lets people zoom', () => {
  const m = /\.dgv-step \{[^}]*color:\s*(#[0-9a-fA-F]{6})/.exec(css);
  assert.ok(m?.[1], 'step colour found');
  assert.ok(ratio(m[1], token('dgv-paper')) >= 4.5);
  for (const f of ['game.html', 'splash.html']) {
    const html = readFileSync(new URL(`../client/${f}`, import.meta.url), 'utf8');
    assert.ok(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(html), `${f} allows pinch zoom`);
    assert.match(html, /<html lang="en"/);
  }
});
