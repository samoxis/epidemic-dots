import './index.css';
import '@fontsource/caveat/latin-700.css';

import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { N, ROUNDS, immunityScore, type Point } from '../shared/engine';
import { Board } from './ui/Board';
import { COLONY_NAMES, CS, FULL_VIEW, type View } from './ui/consts';
import {
  MUTATION_INFO,
  mutationName,
  type VotableMutation,
} from './ui/mutations';
import { SHARE_ENABLED, shareText } from '../shared/share';
import { resultCue, roundCues } from '../shared/soundPlan';
import { isMuted, setMuted, sfx } from './sound';
import { journey } from './journey';
import { CountUp } from './ui/CountUp';
import { DotShower } from './ui/DotShower';
import {
  countdown,
  forecastFor,
  germName,
  keptIn,
  prettyDay,
  simulate,
  useDay,
} from './useDay';

const ZOOM = 6; // zoom area in cells: 2x magnification, about 10 mm per square on a typical phone
const STEP_MS = 1200;
// Fingers land a little below and to the right of the target centre, so the sensed point is nudged up and left.
const TAP_OFFSET = { x: -2, y: -3 };
// With a mouse or trackpad a square is easy to hit, so a click plants straight away; the zoom step is for fingers.
const FINE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(pointer: coarse)').matches;

type Phase = 'plant' | 'run' | 'done';

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const sameCell = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

export const App = () => {
  const { state, stateAt, error, play, vote, share, setFlair, setStreakHidden, setNameHidden, reload } = useDay();
  const [flairMsg, setFlairMsg] = useState<string | null>(null);
  const [confirmShare, setConfirmShare] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [voteMsg, setVoteMsg] = useState('');
  const [mine, setMine] = useState<Point[]>([]);
  const [released, setReleased] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [releasedSeeds, setReleasedSeeds] = useState<Point[] | null>(null);
  const [runPhase, setRunPhase] = useState<'run' | 'done'>('run');
  const [round, setRound] = useState(ROUNDS);
  const [zoomed, setZoomed] = useState(false);
  const [view, setView] = useState<View>(FULL_VIEW);
  const [msg, setMsg] = useState('Tap an empty square to plant a dot.');
  const [busy, setBusy] = useState(false);
  const [soundOff, setSoundOff] = useState(isMuted);
  // the germs' wake-up round: a sneeze shakes the board for a moment
  const [sneeze, setSneeze] = useState(0);
  // beat the lab: a short dot shower over the result
  const [celebrate, setCelebrate] = useState(false);
  // the 'New board in' countdown ticks once a minute from when the state arrived
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  // what the current run will sound like at its end (set on release, played once)
  const runEnd = useRef<{ cue: 'cheer' | 'meh'; played: boolean; immunity: number } | null>(null);
  // Devvit Journeys: the app is ready once today's board has arrived
  useEffect(() => {
    if (state) journey.appReady();
  }, [state]);
  const timer = useRef<number | undefined>(undefined);
  const anim = useRef<number | undefined>(undefined);
  const viewRef = useRef<View>(FULL_VIEW);
  useEffect(() => {
    viewRef.current = view;
  });

  // A player who already played today lands straight on their result; otherwise the phase follows this session.
  const played = state?.played ?? null;
  const phase: Phase = released
    ? runPhase
    : played && !retrying
      ? 'done'
      : 'plant';
  const runSeeds: Point[] | null = released
    ? releasedSeeds
    : (played?.seeds ?? null);

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      if (anim.current !== undefined) cancelAnimationFrame(anim.current);
    },
    []
  );

  const frames = useMemo(
    () => (state && runSeeds ? simulate(state, runSeeds) : null),
    [state, runSeeds]
  );
  const preview = useMemo<Point[]>(() => {
    if (!state || mine.length !== 3 || phase !== 'plant') return [];
    const f = simulate(state, mine, false)[ROUNDS];
    const out: Point[] = [];
    if (f) {
      f.own.forEach((o, i) => {
        if (o === 'me') {
          const p: Point = [i % N, Math.floor(i / N)];
          if (!mine.some((m) => sameCell(m, p))) out.push(p);
        }
      });
    }
    return out;
  }, [state, mine, phase]);

  const animateView = useCallback((target: View) => {
    if (anim.current !== undefined) cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(target);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 220);
      const e = 1 - Math.pow(1 - k, 3);
      setView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  const onCell = useCallback(
    (cell: Point, direct = false) => {
      if (!state || phase !== 'plant' || busy) return;
      if (state.ghosts.some((g) => g.seeds.some((s) => sameCell(s, cell)))) {
        sfx.nope();
        setMsg('That square is taken. Squatters, probably.');
        return;
      }
      if (!zoomed && !direct && !FINE_POINTER) {
        const x0 = clamp(cell[0] - 2, 0, N - ZOOM);
        const y0 = clamp(cell[1] - 2, 0, N - ZOOM);
        sfx.zoom();
        setZoomed(true);
        setMsg('Zoomed in. Tap the exact square.');
        animateView({ x: x0 * CS, y: y0 * CS, w: ZOOM * CS, h: ZOOM * CS });
        return;
      }
      const at = mine.findIndex((m) => sameCell(m, cell));
      if (at >= 0) {
        sfx.recall();
        setMine(mine.filter((_, i) => i !== at));
        setMsg(
          'Dot recalled. It looked nervous anyway. Tap an empty square to plant it elsewhere.'
        );
      } else if (mine.length < 3) {
        const next = [...mine, cell];
        sfx.plant(next.length);
        journey.planted(next.length);
        setMine(next);
        setMsg(
          next.length === 3
            ? 'Ready. Yellow squares show where your dots could grow.'
            : 'Planted. It looks thrilled. Tap an empty square for the next dot.'
        );
      } else {
        sfx.nope();
        setMsg(
          'Three dots only. The lab is on a budget. Tap one of yours to take it back.'
        );
      }
      setZoomed(false);
      animateView(FULL_VIEW);
    },
    [state, phase, busy, zoomed, mine, animateView]
  );

  const backToBoard = () => {
    setZoomed(false);
    setMsg('Tap an empty square to plant a dot.');
    animateView(FULL_VIEW);
  };

  const finishRun = useCallback(() => {
    window.clearInterval(timer.current);
    setRound(ROUNDS);
    setRunPhase('done');
    const end = runEnd.current;
    if (end && !end.played) {
      end.played = true;
      sfx.result(end.cue);
      if (end.cue === 'cheer') {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 2600);
      }
      journey.finished(end.immunity, end.cue === 'cheer');
    }
  }, []);

  /** Another run on the same board: back to planting. Only the best run of the day counts. */
  const tryAgain = () => {
    journey.interaction('try_again');
    window.clearInterval(timer.current);
    setRetrying(true);
    setReleased(false);
    setReleasedSeeds(null);
    setMine([]);
    setRound(ROUNDS);
    setZoomed(false);
    setView(FULL_VIEW);
    setMsg('Tap an empty square to plant a dot.');
    window.scrollTo({ top: 0 });
  };

  const release = async () => {
    if (!state || busy || phase !== 'plant') return;
    if (mine.length < 3) {
      sfx.nope();
      setMsg('Plant 3 dots first. The germs can wait.');
      return;
    }
    setBusy(true);
    const saved = await play(mine);
    setBusy(false);
    if (typeof saved === 'string') {
      setMsg(saved);
      return;
    }
    sfx.release();
    journey.released();
    // Use the state the server sent back: on the first run of the day only it knows Patient Zero.
    const runFrames = simulate(saved, mine);
    const runKept = keptIn(runFrames[ROUNDS]);
    runEnd.current = {
      cue: resultCue(runKept, forecastFor(saved, mine)),
      played: false,
      immunity: immunityScore(runKept, saved.bestPossible),
    };
    const wake = saved.strain.wake;
    setReleasedSeeds(mine);
    setReleased(true);
    setRunPhase('run');
    setRound(0);
    let r = 0;
    timer.current = window.setInterval(() => {
      r++;
      setRound(r);
      if (r === wake) {
        setSneeze(r);
        window.setTimeout(() => setSneeze(0), 900);
      }
      if (r >= ROUNDS) finishRun();
      else sfx.round(r, roundCues(runFrames, r, wake));
    }, STEP_MS);
  };

  if (error) {
    return (
      <div className="dgv-wrap">
        <div className="dgv-card">
          <h1 className="dgv-title">Epidemic Dots</h1>
          <p>{error}</p>
          <button className="dgv-btn" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="dgv-wrap">
        <div className="dgv-card">
          <h1 className="dgv-title">Epidemic Dots</h1>
          <p className="dgv-muted">Warming up the lab...</p>
        </div>
      </div>
    );
  }

  const frame = frames && phase !== 'plant' ? (frames[round] ?? null) : null;
  const prev =
    frames && phase === 'run' && round > 0 ? (frames[round - 1] ?? null) : null;
  const step = phase === 'plant' ? (mine.length === 3 ? 2 : 1) : 3;
  const roundMsg =
    round === 0
      ? 'Start. Everyone looks calm. Suspiciously calm.'
      : round < state.strain.wake
        ? `Round ${round} of 8. Dots are growing.`
        : round === state.strain.wake
          ? `Round ${round} of 8. The germs just woke up and chose violence.`
          : `Round ${round} of 8. Somebody sneezed.`;
  const status =
    phase === 'plant'
      ? msg
      : round === ROUNDS && phase === 'done'
        ? 'Round 8 of 8. Dust settles.'
        : roundMsg;

  const kept = frames ? keptIn(frames[ROUNDS]) : 0;
  // The card describes the run on screen; the server keeps the best run of the day.
  const runImmunity = immunityScore(kept, state.bestPossible);
  const runClean = frames
    ? !frames.some((f) =>
        f.own.some((o, i) => o === 'me' && (f.inf[i] ?? -1) >= 0)
      )
    : false;
  const runForecast = runSeeds ? forecastFor(state, runSeeds) : 0;
  // Why the run went the way it did: the secret is revealed once the player has run the board.
  const zeroId = state.ghosts.find((g) => g.zero)?.id ?? null;
  const zeroName = zeroId ? (COLONY_NAMES[zeroId] ?? zeroId) : null;
  const lastFrame = frames?.[ROUNDS];
  const infectedMine = lastFrame
    ? lastFrame.own.filter(
        (o, i) => o === 'me' && (lastFrame.inf[i] ?? -1) >= 0
      ).length
    : 0;
  const firstHit = frames
    ? frames.findIndex((f) =>
        f.own.some((o, i) => o === 'me' && (f.inf[i] ?? -1) >= 0)
      )
    : -1;
  const runsLeft = state.maxAttempts - state.attemptsUsed;

  // New players get the short tour open; players with any history see it folded away behind "How to play".
  const firstTime = !state.week && !state.played && state.attemptsUsed === 0;
  const stepsList = (
    <>
      <div className={`dgv-step ${step === 1 ? 'on' : ''}`}>
        <span className="n">1</span>
        <span>
          Tap <b>3 squares</b> to plant your dots.
        </span>
      </div>
      <div className={`dgv-step ${step === 2 ? 'on' : ''}`}>
        <span className="n">2</span>
        <span>
          Press the pink button. Your dots grow into <b>empty squares</b> next
          to them.
        </span>
      </div>
      <div className="dgv-step">
        <span className="n">3</span>
        <span>
          One colony is <b>secretly sick</b>. Germs jump to nearby dots. Keep
          yours alive.
        </span>
      </div>
    </>
  );

  return (
    <div className="dgv-wrap">
      <div className={`dgv-card dgv-split ${phase === 'plant' ? 'dgv-plant' : ''}`}>
        {celebrate && <DotShower />}
        <span className="dgv-tape l" />
        <span className="dgv-tape r" />
        <div className="dgv-row dgv-head" style={{ marginTop: 4 }}>
          <h1 className="dgv-title">Epidemic Dots</h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="dgv-sound"
              aria-pressed={!soundOff}
              aria-label="Sound effects"
              title={soundOff ? 'Sound is off' : 'Sound is on'}
              onClick={() => {
                const off = !soundOff;
                setMuted(off);
                setSoundOff(off);
                if (!off) sfx.click();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                {soundOff ? (
                  <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                ) : (
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                )}
              </svg>
            </button>
            <span className="dgv-tag">{prettyDay(state.day)}</span>
          </span>
        </div>

        {phase === 'plant' &&
          (firstTime ? (
            <div className="dgv-steps">
              <div
                className="dgv-small"
                style={{ fontWeight: 700, marginBottom: 2 }}
              >
                First time here? The 20-second tour:
              </div>
              {stepsList}
            </div>
          ) : (
            <details className="dgv-steps">
              <summary className="dgv-link" style={{ cursor: 'pointer' }}>
                How to play
              </summary>
              {stepsList}
            </details>
          ))}
        {state.strain.vaccine && (
          <div
            className="dgv-ok"
            style={{
              margin: '6px 0',
              padding: '4px 8px',
              borderRadius: 8,
              border: '1.5px solid var(--dgv-ink)',
              fontSize: 14,
            }}
          >
            Vaccine day: yesterday's team goal was reached, so the germs sleep
            in until round {state.strain.wake}.
          </div>
        )}
        <div
          className="dgv-small dgv-muted dgv-intel"
          style={{ margin: '6px 0 8px' }}
        >
          Today's germ: <b>{germName(state.strain.name)}</b>. It starts
          spreading in round {state.strain.wake} and jumps up to{' '}
          {state.strain.jump} {state.strain.jump === 1 ? 'square' : 'squares'}.
          {state.strain.mutation !== 'none' && (
            <>
              {' '}
              Yesterday the{' '}
              {state.strain.mutationBy === 'rats'
                ? 'lab rats (bots), with nobody else voting,'
                : 'lab'}{' '}
              voted for <b>{mutationName(state.strain.mutation)}</b>:{' '}
              {MUTATION_INFO[state.strain.mutation].text}
            </>
          )}
          {state.strain.cancelled && (
            <>
              {' '}
              Yesterday{' '}
              {state.strain.cancelled.by === 'rats'
                ? 'the lab rats (bots), with nobody else voting,'
                : 'the lab'}{' '}
              voted for <b>{mutationName(state.strain.cancelled.mutation)}</b>, but it
              made today's board unfair, so the lab cancelled it. Paperwork was filed.
            </>
          )}
        </div>

        {phase === 'plant' && (
          <div className="dgv-small dgv-muted" style={{ margin: '0 0 8px' }}>
            Neighbours today:{' '}
            {state.realColonies > 0 && (
              <>
                {Object.entries(state.neighbourNames)
                  .filter(([id]) => id !== state.yourColony)
                  .map(([id, n]) => `${n} (${COLONY_NAMES[id] ?? id})`)
                  .join(', ')}
                {Object.keys(state.neighbourNames).filter((id) => id !== state.yourColony).length > 0 ? ', ' : ''}
                {(() => {
                  const anon = state.realColonies - Object.keys(state.neighbourNames).length;
                  return anon > 0
                    ? `${anon} anonymous ${anon === 1 ? 'player' : 'players'} from yesterday, `
                    : '';
                })()}
                and{' '}
              </>
            )}
            {state.ghosts.length - state.realColonies} lab-rat bot{' '}
            {state.ghosts.length - state.realColonies === 1
              ? 'colony'
              : 'colonies'}
            .
            {state.yourColony && (
              <>
                {' '}
                <b style={{ color: 'var(--dgv-ink)' }}>
                  Your colony from yesterday is back as the{' '}
                  {COLONY_NAMES[state.yourColony] ?? state.yourColony} one.
                </b>{' '}
                Try not to sneeze on yourself.
              </>
            )}
          </div>
        )}

        <div className={`dgv-boardbox ${sneeze ? 'dgv-sneeze' : ''}`}>
          {sneeze > 0 && (
            <span className="dgv-achoo" aria-hidden="true">
              Achoo!
            </span>
          )}
          <Board
            ghosts={state.ghosts}
            mine={phase === 'plant' ? mine : (runSeeds ?? mine)}
            frame={frame}
            prev={prev}
            preview={preview}
            view={view}
            label="Board. Tap a square to plant a dot."
            onCell={phase === 'plant' ? onCell : undefined}
            tapOffset={TAP_OFFSET}
            zoomed={zoomed}
          />
          {zoomed && phase === 'plant' && (
            <button
              className="dgv-btn ghost"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                height: 34,
                fontSize: 13,
              }}
              onClick={backToBoard}
            >
              Back to board
            </button>
          )}
        </div>

        <div
          className="dgv-act"
          style={{ marginTop: 8, minHeight: 22, fontSize: 16 }}
          aria-live="polite"
        >
          {status}
        </div>

        {phase === 'plant' && (
          <>
            <div className="dgv-row dgv-act" style={{ marginTop: 6 }}>
              <div style={{ whiteSpace: 'nowrap' }}>
                Planted: <b>{mine.length} / 3</b>
              </div>
              <span className="dgv-note">
                {mine.length === 3
                  ? `Lab's prediction: you keep ${forecastFor(state, mine)} dots. Beat it.`
                  : "Plant 3 dots to see the lab's prediction"}
              </span>
            </div>
            <div
              className="dgv-act"
              style={{ display: 'flex', gap: 8, marginTop: 12 }}
            >
              <button className="dgv-btn" onClick={() => void release()}>
                {busy ? 'Saving...' : 'Release the germs'}
              </button>
              <button
                className="dgv-btn ghost"
                onClick={() => {
                  setMine([]);
                  setMsg('Tap an empty square to plant a dot.');
                  backToBoard();
                }}
              >
                Clear
              </button>
            </div>
          </>
        )}

        {phase === 'run' && (
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <button className="dgv-link" onClick={finishRun}>
              skip to the end
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="dgv-row" style={{ marginTop: 8, fontSize: 14 }}>
            <span>Round</span>
            <input
              type="range"
              min={0}
              max={ROUNDS}
              step={1}
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Replay round"
            />
            <b>{round}</b>
          </div>
        )}

        {phase === 'done' && played && frames && (
          <div
            style={{
              marginTop: 14,
              borderTop: '1.5px dashed var(--dgv-ink)',
              paddingTop: 12,
            }}
          >
            <div className="dgv-small dgv-muted">You kept alive</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <CountUp className="dgv-big" value={kept} />
              <span style={{ fontSize: 18 }}>dots</span>
            </div>
            <div className="dgv-bar">
              <div style={{ width: `${Math.min(100, runImmunity)}%` }} />
            </div>
            <div className="dgv-small dgv-muted">
              The lab's benchmark today is {state.bestPossible} (the best
              placement it found). Your immunity score: <b>{runImmunity}%</b>.
            </div>
            {played.immunity > runImmunity && (
              <div className="dgv-small" style={{ marginTop: 4 }}>
                Your best run today is <b>{played.immunity}%</b>. That is the
                one that counts.
              </div>
            )}
            <div style={{ margin: '10px 0 8px', fontSize: 17 }}>
              {kept > runForecast
                ? `The lab predicted ${runForecast}. You kept ${kept}. Science humbled.`
                : `The lab predicted ${runForecast}. You kept ${kept}. The lab was right. Annoying.`}
            </div>

            <div className="dgv-goal" style={{ margin: '6px 0 10px' }}>
              <div style={{ fontSize: 15 }}>
                <b>What happened</b>
              </div>
              <div
                className="dgv-small"
                style={{ marginTop: 4, lineHeight: 1.4 }}
              >
                {zeroName && (
                  <>
                    Patient Zero was the <b>{zeroName}</b> colony.{' '}
                  </>
                )}
                {runClean ? (
                  <>
                    The germs never reached your dots. Tomorrow, try to grow
                    bigger without getting touched.
                  </>
                ) : (
                  <>
                    The germs reached <b>{infectedMine}</b> of your dots, first
                    in round {firstHit}. Germs hop up to {state.strain.jump}{' '}
                    {state.strain.jump === 1 ? 'square' : 'squares'}, so try
                    planting farther from the {zeroName ?? 'sick'} colony.
                  </>
                )}
              </div>
            </div>

            {runClean && (
              <div style={{ marginBottom: 6 }}>
                <span className="dgv-badge" style={{ background: '#c8f0a0' }}>
                  Squeaky clean
                </span>{' '}
                <span className="dgv-small dgv-muted">
                  The germs never touched you.
                </span>
              </div>
            )}
            {kept > state.bestPossible && (
              <div style={{ marginBottom: 6 }}>
                <span className="dgv-badge" style={{ background: '#ffe9a8' }}>
                  Beat the lab
                </span>{' '}
                <span className="dgv-small dgv-muted">
                  You found a better placement than the lab did.
                </span>
              </div>
            )}
            {kept > runForecast && (
              <div style={{ marginBottom: 6 }}>
                <span className="dgv-badge" style={{ background: '#ffd1e3' }}>
                  Proved the lab wrong
                </span>{' '}
                <span className="dgv-small dgv-muted">
                  You beat its prediction.
                </span>
              </div>
            )}
            {!runClean && kept <= runForecast && (
              <div className="dgv-small dgv-muted" style={{ marginBottom: 8 }}>
                No badges today. The germs sent their regards.
              </div>
            )}

            {runsLeft > 0 ? (
              <button
                className="dgv-btn"
                style={{ marginTop: 14 }}
                onClick={tryAgain}
              >
                Try again ({runsLeft} {runsLeft === 1 ? 'run' : 'runs'} left
                today)
              </button>
            ) : (
              <div className="dgv-small" style={{ marginTop: 10 }}>
                That was your last run today. The lab needs a nap. Your best
                counts.
              </div>
            )}
            <div className="dgv-small dgv-muted" style={{ marginTop: 6 }}>
              Only your best run of the day counts. New board in{' '}
              {countdown(Math.max(0, state.secondsToReset - Math.floor((now - stateAt) / 1000)))}.
            </div>

            <div className="dgv-small" style={{ marginTop: 6 }}>
              {state.nameHidden ? (
                <>
                  You appear as an anonymous lab rat (player) in the rank and on tomorrow's board.{' '}
                  <button className="dgv-link" onClick={() => void setNameHidden(false)}>
                    Show my name
                  </button>
                </>
              ) : (
                <>
                  <span className="dgv-muted">
                    Your username shows in the rank, on tomorrow's board and in the daily recap.
                  </span>{' '}
                  <button
                    className="dgv-link"
                    onClick={() => {
                      journey.interaction('name', 'hide');
                      void setNameHidden(true);
                    }}
                  >
                    Hide my name
                  </button>
                </>
              )}
            </div>

            {state.streak && (
              <div className="dgv-small" style={{ marginTop: 6 }}>
                {state.streak.hidden ? (
                  <>
                    Streak hidden.{' '}
                    <button className="dgv-link" onClick={() => void setStreakHidden(false)}>
                      Show it
                    </button>
                  </>
                ) : (
                  <>
                    <b>
                      {state.streak.days}-day streak.
                    </b>{' '}
                    <span className="dgv-muted">
                      {state.streak.freezeAvailable
                        ? 'One free lazy day left this week: skip a day and it survives.'
                        : 'Lazy day used this week. The germs are taking attendance.'}
                    </span>{' '}
                    <button
                      className="dgv-link"
                      onClick={() => {
                        journey.interaction('streak', 'hide');
                        void setStreakHidden(true);
                      }}
                    >
                      Hide streak
                    </button>
                  </>
                )}
              </div>
            )}

            {SHARE_ENABLED && (
              <div className="dgv-goal">
                <div style={{ fontSize: 15 }}>
                  <b>Brag a little?</b>
                </div>
                {state.shared ? (
                  <div className="dgv-small" style={{ marginTop: 4 }}>
                    {shareMsg ?? 'You already shared today.'}
                  </div>
                ) : !confirmShare ? (
                  <>
                    <div
                      className="dgv-small dgv-muted"
                      style={{ margin: '4px 0 8px' }}
                    >
                      Optional. Nothing is posted unless you confirm on the next
                      step.
                    </div>
                    <button
                      className="dgv-btn ghost"
                      onClick={() => setConfirmShare(true)}
                    >
                      Share my score as a comment
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="dgv-small dgv-muted"
                      style={{ margin: '4px 0 6px' }}
                    >
                      The lab's account posts this as a reply to the pinned
                      comment.{' '}
                      <b style={{ color: 'var(--dgv-ink)' }}>
                        {state.nameHidden
                          ? 'Your name stays hidden.'
                          : 'Your username is on it.'}
                      </b>{' '}
                      It never shows where your dots were. This is what will appear:
                    </div>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        font: 'inherit',
                        fontSize: 14,
                        background: '#fff',
                        border: '1.5px dashed var(--dgv-ink)',
                        borderRadius: 8,
                        padding: 8,
                        margin: '0 0 8px',
                      }}
                    >
                      {shareText({
                        day: state.day,
                        kept: played.kept,
                        bestPossible: state.bestPossible,
                        immunity: played.immunity,
                        clean: played.clean,
                        who: state.nameHidden ? null : (state.myName ?? 'u/you'),
                      })
                        .replace(/\*\*/g, '')
                        .replace(/\^\((.*)\)/, '$1')}
                    </pre>
                    <div className="dgv-row">
                      <button
                        className="dgv-btn"
                        style={{
                          width: 'auto',
                          padding: '0 14px',
                          fontSize: 15,
                        }}
                        disabled={sharing}
                        onClick={() => {
                          setSharing(true);
                          void share().then((r) => {
                            setSharing(false);
                            setShareMsg(r.message);
                            if (r.ok) {
                              setConfirmShare(false);
                              journey.interaction('share_score');
                            }
                          });
                        }}
                      >
                        Post it
                      </button>
                      <button
                        className="dgv-link"
                        onClick={() => setConfirmShare(false)}
                      >
                        Not now
                      </button>
                    </div>
                    {shareMsg && (
                      <div className="dgv-small" style={{ marginTop: 6 }}>
                        {shareMsg}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="dgv-goal">
              <div style={{ fontSize: 15 }}>
                <b>Team goal</b>: everyone's best runs average{' '}
                {state.strain.teamGoal}% immunity
              </div>
              <div className="dgv-bar green">
                <div
                  style={{
                    width: `${Math.min(100, Math.round((state.avgImmunity / state.strain.teamGoal) * 100))}%`,
                  }}
                />
              </div>
              <div className="dgv-small dgv-muted">
                {state.players === 0
                  ? 'No real players yet today.'
                  : `Today, ${state.players} ${state.players === 1 ? 'player' : 'players'} average ${state.avgImmunity}%.`}{' '}
                Reach {state.strain.teamGoal}% and the next day is a Vaccine
                day: the germs start later. The lab rats (bots) do not count
                toward the goal.
              </div>
            </div>

            <div className="dgv-goal">
              <div style={{ fontSize: 15 }}>
                <b>Vote for tomorrow's mutation</b>
              </div>
              <div className="dgv-small dgv-muted" style={{ marginBottom: 6 }}>
                The most popular one changes how the germs behave tomorrow. You
                can change your vote until midnight UTC. If nobody votes, the
                lab rats (bots) pick one.
              </div>
              {(Object.keys(MUTATION_INFO) as VotableMutation[]).map((m) => (
                <button
                  key={m}
                  className={`dgv-vote ${state.myVote === m ? 'on' : ''}`}
                  aria-pressed={state.myVote === m}
                  onClick={() => {
                    sfx.click();
                    journey.interaction('mutation_vote', m);
                    void vote(m).then((err) =>
                      setVoteMsg(
                        err ?? 'Vote counted. The germs are taking notes.'
                      )
                    );
                  }}
                >
                  <span>
                    <b>{MUTATION_INFO[m].name}</b>
                    <span className="dgv-small dgv-muted">
                      {' '}
                      {MUTATION_INFO[m].text}
                    </span>
                  </span>
                  <b>{state.votes[m]}</b>
                </button>
              ))}
              {voteMsg && (
                <div className="dgv-small" style={{ marginTop: 6 }}>
                  {voteMsg}
                </div>
              )}
            </div>

            {state.rank && (
              <>
                <div style={{ fontSize: 15, marginBottom: 4 }}>
                  <b>Your rank today</b>{' '}
                  <span className="dgv-muted">
                    · #{state.rank.position} of {state.rank.total}
                  </span>
                </div>
                <div className="dgv-small dgv-muted" style={{ marginBottom: 4 }}>
                  {state.players === 1
                    ? 'You are the only real player so far today; the rest are lab rats (bots).'
                    : `${state.players} real players today (by username, or "player" if they hide it); the rest are lab rats (bots).`}
                </div>
                <div
                  className="dgv-near"
                  style={{ borderTop: '1px solid #d6cfbd' }}
                >
                  {state.rank.near.map((r) => (
                    <div
                      key={`${r.position}-${r.name}`}
                      className={r.you ? 'you' : ''}
                    >
                      <span>
                        #{r.position} {r.name}
                      </span>
                      <span>{r.immunity}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="dgv-goal" style={{ marginTop: 10 }}>
              <div style={{ fontSize: 15 }}>
                <b>League: {state.league.name}</b>
                {state.league.promotedThisWeek && state.league.index > 0 && (
                  <span
                    className="dgv-badge"
                    style={{ background: '#ffd1e3', marginLeft: 8 }}
                  >
                    Promoted this week
                  </span>
                )}
              </div>
              <div className="dgv-small dgv-muted" style={{ marginTop: 4 }}>
                {state.week
                  ? `Your week: ${state.week.avg}% average over ${state.week.days} ${state.week.days === 1 ? 'day' : 'days'}. `
                  : ''}
                {state.league.next
                  ? `Average ${state.promotion}% this week to reach ${state.league.next}. `
                  : 'You made it to the top league. The germs salute you. '}
                You never move down while you keep playing.
              </div>
              <div style={{ marginTop: 8 }}>
                {state.flair ? (
                  <>
                    <div className="dgv-small">
                      Your league shows next to your name in this subreddit.
                    </div>
                    <button
                      className="dgv-link"
                      onClick={() => {
                        journey.interaction('league_flair', 'off');
                        void setFlair(false).then((err) =>
                          setFlairMsg(err ?? 'Flair removed.')
                        );
                      }}
                    >
                      Remove my flair
                    </button>
                  </>
                ) : (
                  <>
                    <div
                      className="dgv-small dgv-muted"
                      style={{ marginBottom: 6 }}
                    >
                      Optional: show "{state.league.name} league" as your flair
                      in this subreddit. Everyone can see it next to your name.
                      You can remove it any time.
                    </div>
                    <button
                      className="dgv-btn ghost"
                      onClick={() => {
                        journey.interaction('league_flair', 'on');
                        void setFlair(true).then((err) =>
                          setFlairMsg(err ?? 'Done. Your league is on show.')
                        );
                      }}
                    >
                      Show my league as flair
                    </button>
                  </>
                )}
                {flairMsg && (
                  <div className="dgv-small" style={{ marginTop: 6 }}>
                    {flairMsg}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
