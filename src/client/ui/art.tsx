// Sticker art: round colonies with faces, drawn in SVG so they stay sharp at any zoom.
import type { ReactNode } from 'react';
import { CS, INK } from './consts';

export type Mood = 'calm' | 'happy' | 'sick';

function Face({ cx, cy, mood, a }: { cx: number; cy: number; mood: Mood; a: number }): ReactNode {
  if (mood === 'sick') {
    return (
      <>
        <path d={`M${cx - 5 * a} ${cy - 2 * a}l${3 * a} ${1.6 * a}m${4 * a} ${-1.6 * a}l${3 * a} ${1.6 * a}`} stroke={INK} strokeWidth={1.2 * a} />
        <circle cx={cx - 3.4 * a} cy={cy - 0.4 * a} r={1.2 * a} fill={INK} />
        <circle cx={cx + 3.4 * a} cy={cy - 0.4 * a} r={1.2 * a} fill={INK} />
        <path
          d={`M${cx - 3.5 * a} ${cy + 4 * a}q${1.2 * a} ${-2 * a} ${2.3 * a} 0t${2.3 * a} 0t${2.3 * a} 0`}
          stroke={INK}
          strokeWidth={1.2 * a}
          fill="none"
        />
        <circle cx={cx - 5.2 * a} cy={cy + 2.6 * a} r={1 * a} fill="#5d8a22" />
        <circle cx={cx + 5.4 * a} cy={cy + 3 * a} r={0.9 * a} fill="#5d8a22" />
        <circle cx={cx + 0.5 * a} cy={cy - 5.6 * a} r={0.9 * a} fill="#5d8a22" />
      </>
    );
  }
  return (
    <>
      <circle cx={cx - 3.4 * a} cy={cy - 1.2 * a} r={1.5 * a} fill={INK} />
      <circle cx={cx + 3.4 * a} cy={cy - 1.2 * a} r={1.5 * a} fill={INK} />
      {mood === 'happy' ? (
        <path d={`M${cx - 3.8 * a} ${cy + 2.4 * a}q${3.8 * a} ${4.6 * a} ${7.6 * a} 0`} stroke={INK} strokeWidth={1.4 * a} fill="none" />
      ) : (
        <path d={`M${cx - 3 * a} ${cy + 3.3 * a}q${3 * a} ${2.4 * a} ${6 * a} 0`} stroke={INK} strokeWidth={1.3 * a} fill="none" />
      )}
    </>
  );
}

/** A colony cell. Seeds are drawn a little bigger than grown cells so the starting dots stay readable. */
export function Sticker({ x, y, fill, mood, small = false }: { x: number; y: number; fill: string; mood: Mood; small?: boolean }) {
  const cx = x * CS + CS / 2;
  const cy = y * CS + CS / 2;
  const r = small ? 8 : 9.3;
  const a = small ? 0.88 : 1.02;
  return (
    <g>
      <circle cx={cx + 0.7} cy={cy + 1} r={r} fill={INK} opacity={0.15} />
      <circle cx={cx} cy={cy} r={r} fill={fill} stroke={INK} strokeWidth={small ? 1.3 : 1.7} />
      {mood === 'happy' && <circle cx={cx} cy={cy} r={r + 1.8} fill="none" stroke={INK} strokeWidth={1} strokeDasharray="2.2 1.6" />}
      <path
        d={`M${cx - 4.6 * a} ${cy - 5.2 * a}q${2.6 * a} ${-2.6 * a} ${6 * a} ${-1.6 * a}`}
        stroke="#fff"
        opacity={0.7}
        strokeWidth={1.3 * a}
        fill="none"
        strokeLinecap="round"
      />
      <Face cx={cx} cy={cy} mood={mood} a={a} />
    </g>
  );
}

/** A colony cell that has died: small grey compost with crossed-out eyes. */
export function Compost({ x, y }: { x: number; y: number }) {
  const cx = x * CS + CS / 2;
  const cy = y * CS + CS / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="#d9d4c6" stroke="#8a8474" strokeWidth={1} />
      <path
        d={`M${cx - 3} ${cy - 2.4}l2.2 2.2m0 -2.2l-2.2 2.2m5 -2.2l2.2 2.2m0 -2.2l-2.2 2.2`}
        stroke="#6b6558"
        strokeWidth={1}
      />
    </g>
  );
}
