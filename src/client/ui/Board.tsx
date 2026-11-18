import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { N, type Frame, type Ghost, type Point } from '../../shared/engine';
import { Compost, Sticker } from './art';
import { COLONY_COLORS, CS, SICK_COLOR, type View } from './consts';

type Props = {
  ghosts: readonly Ghost[];
  mine: readonly Point[];
  /** When set, the board shows this simulation frame instead of the planting view. */
  frame?: Frame | null;
  /** Previous frame, used to pop in only the cells that changed. */
  prev?: Frame | null;
  /** Squares where the player's colony could grow (planting preview). */
  preview?: readonly Point[];
  view: View;
  label: string;
  /** Called with the board cell under the tap, or null when the tap fell outside. */
  onCell?: ((cell: Point, direct?: boolean) => void) | undefined;
  /** Pixel offset applied to the tap: fingers land a little below and right of the target centre. */
  tapOffset?: { x: number; y: number };
  zoomed?: boolean;
  compact?: boolean;
};

const key = (x: number, y: number) => `${x},${y}`;

export function Board({
  ghosts,
  mine,
  frame,
  prev,
  preview,
  view,
  label,
  onCell,
  tapOffset,
  zoomed,
  compact,
}: Props) {
  const [cursor, setCursor] = useState<Point>([5, 5]);
  const [focused, setFocused] = useState(false);
  const seeds = new Set<string>();
  for (const g of ghosts) for (const [x, y] of g.seeds) seeds.add(key(x, y));
  for (const [x, y] of mine) seeds.add(key(x, y));

  const lines = [];
  for (let i = 1; i < N; i++) {
    lines.push(
      <path
        key={i}
        d={`M${i * CS} 0V${N * CS}M0 ${i * CS}H${N * CS}`}
        stroke="#c4d3ea"
        strokeWidth={zoomed ? 1.2 : 0.8}
      />
    );
  }

  const cells = [];
  if (frame) {
    let n = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = y * N + x;
        const owner = frame.own[k];
        if (!owner) continue;
        const dead = frame.dead[k] === true;
        const sick = (frame.inf[k] ?? -1) >= 0;
        const small = !seeds.has(key(x, y));
        // the player's own dot catching the germs: a little shiver instead of the usual pop
        const shiver = owner === 'me' && sick && !dead && prev != null && (prev.inf[k] ?? -1) < 0;
        const changed =
          prev != null &&
          (prev.own[k] !== owner ||
            ((prev.inf[k] ?? -1) < 0 && sick) ||
            (prev.dead[k] !== true && dead));
        const inner = dead ? (
          <Compost x={x} y={y} />
        ) : sick ? (
          <Sticker x={x} y={y} fill={SICK_COLOR} mood="sick" small={small} />
        ) : (
          <Sticker
            x={x}
            y={y}
            fill={COLONY_COLORS[owner] ?? '#ddd'}
            mood={owner === 'me' ? 'happy' : 'calm'}
            small={small}
          />
        );
        if (changed) {
          cells.push(
            <g
              key={k}
              className={shiver ? 'dgv-shiver' : 'dgv-pop'}
              style={{ animationDelay: shiver ? '0ms' : `${Math.min(520, n * 18)}ms` }}
            >
              {inner}
            </g>
          );
          n++;
        } else {
          cells.push(<g key={k}>{inner}</g>);
        }
      }
    }
  } else {
    for (const g of ghosts) {
      for (const [x, y] of g.seeds)
        cells.push(
          <Sticker
            key={`g${x},${y}`}
            x={x}
            y={y}
            fill={COLONY_COLORS[g.id] ?? '#ddd'}
            mood="calm"
          />
        );
    }
    // a freshly planted dot hops in (the pop plays once, when it mounts)
    for (const [x, y] of mine)
      cells.push(
        <g key={`m${x},${y}`} className="dgv-pop">
          <Sticker x={x} y={y} fill={COLONY_COLORS.me ?? '#ffd166'} mood="happy" />
        </g>
      );
  }

  const handle = (e: MouseEvent<SVGSVGElement>) => {
    if (!onCell) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX + (tapOffset?.x ?? 0);
    const py = e.clientY + (tapOffset?.y ?? 0);
    const ux = view.x + ((px - r.left) / r.width) * view.w;
    const uy = view.y + ((py - r.top) / r.height) * view.h;
    const cx = Math.floor(ux / CS);
    const cy = Math.floor(uy / CS);
    onCell([
      Math.min(N - 1, Math.max(0, cx)),
      Math.min(N - 1, Math.max(0, cy)),
    ]);
  };

  const describe = (c: Point): string => {
    const where = `Column ${c[0] + 1}, row ${c[1] + 1}`;
    if (mine.some((m) => m[0] === c[0] && m[1] === c[1]))
      return `${where}. Your dot. Enter takes it back.`;
    if (ghosts.some((g) => g.seeds.some((s) => s[0] === c[0] && s[1] === c[1])))
      return `${where}. Taken by a neighbour.`;
    return `${where}. Empty. Enter plants a dot.`;
  };

  const keys = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!onCell) return;
    const d: Record<string, Point> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = d[e.key];
    if (step) {
      e.preventDefault();
      setCursor(([x, y]) => [
        Math.min(N - 1, Math.max(0, x + step[0])),
        Math.min(N - 1, Math.max(0, y + step[1])),
      ]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCell(cursor, true);
    }
  };

  const interactive = onCell !== undefined;

  return (
    <>
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className={compact ? 'dgv-board dgv-board-compact' : 'dgv-board'}
        role={interactive ? 'application' : 'img'}
        aria-label={
          interactive
            ? `${label} Keyboard: arrow keys move, Enter plants or takes back a dot.`
            : label
        }
        tabIndex={interactive ? 0 : undefined}
        onClick={handle}
        onKeyDown={keys}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {lines}
        {!frame &&
          preview?.map(([x, y]) => (
            <rect
              key={`p${x},${y}`}
              x={x * CS + 3}
              y={y * CS + 3}
              width={CS - 6}
              height={CS - 6}
              rx={4}
              fill="#ffd166"
              opacity={0.45}
            />
          ))}
        {cells}
        {interactive && focused && (
          <rect
            x={cursor[0] * CS + 1}
            y={cursor[1] * CS + 1}
            width={CS - 2}
            height={CS - 2}
            rx={4}
            fill="none"
            stroke="#1f2a44"
            strokeWidth={2.4}
            strokeDasharray="4 2"
          />
        )}
      </svg>
      {interactive && focused && (
        <div className="dgv-sr" aria-live="polite">
          {describe(cursor)}
        </div>
      )}
    </>
  );
}
