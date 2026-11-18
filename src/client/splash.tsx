import './index.css';
import '@fontsource/caveat/latin-700.css';

import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { randomSeeds } from '../shared/engine';
import type { StateResponse } from '../shared/api';
import { makeGhosts } from '../shared/board';
import { rngFromText } from '../shared/rng';
import { Board } from './ui/Board';
import { mutationName } from './ui/mutations';
import { FULL_VIEW } from './ui/consts';
import { countdown, germName, keptIn, prettyDay, simulate, useDay } from './useDay';

const STEP_MS = 1100;
const HOLD_STEPS = 3; // pause on the last round before the loop restarts

function captionFor(round: number, wake: number): string {
  if (round === 0) return 'Everyone starts small.';
  if (round < wake) return 'Dots grow into empty squares.';
  if (round === wake) return 'The germs wake up.';
  if (round < 8) return 'Germs jump between nearby dots.';
  return 'Survivors count.';
}

/** The feed card: it explains the game by playing a short loop of today's board, then asks for one tap. */
function Card({ state }: { state: StateResponse }) {
  const played = state.played;
  // Newcomers watch a demo placement; players watch their own best run.
  // Newcomers watch a practice board, never today's: the loop would show which colony is sick before they play.
  const shown = useMemo(() => (played ? state : { ...state, ghosts: makeGhosts(`demo-${state.day}`) }), [played, state]);
  const seeds = useMemo(() => played?.seeds ?? randomSeeds(rngFromText(`demo:${state.day}`), shown.ghosts), [played, state.day, shown.ghosts]);
  const frames = useMemo(() => simulate(shown, seeds), [shown, seeds]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => (t + 1) % (frames.length + HOLD_STEPS)), STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced, frames.length]);

  const round = reduced ? 5 : Math.min(tick, frames.length - 1);
  const frame = frames[round] ?? null;
  const prev = !reduced && round > 0 && tick < frames.length ? (frames[round - 1] ?? null) : null;
  const kept = played ? keptIn(frames[8]) : 0;
  const hops = state.strain.jump;

  return (
    <div className="dgv-wrap">
      <div className="dgv-card">
        <span className="dgv-tape l" />
        <span className="dgv-tape r" />
        <div className="dgv-row">
          <h1 className="dgv-title">Epidemic Dots</h1>
          <span className="dgv-tag">{prettyDay(state.day)}</span>
        </div>
        <div className="dgv-small dgv-muted" style={{ marginTop: 2 }}>
          A daily outbreak puzzle. 3 runs a day, your best counts.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'stretch' }}>
          <Board
            ghosts={shown.ghosts}
            mine={seeds}
            frame={frame}
            prev={prev}
            view={FULL_VIEW}
            label={played ? 'Replay of your best run on today\'s board' : 'Short demo of a game on a practice board'}
            compact
          />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.3 }}>
              <b>Plant 3 dots.</b> They grow into empty squares. One neighbour is <b>secretly sick</b>: germs jump between dots. Keep yours alive.
            </div>
            <div className="dgv-small dgv-muted" style={{ lineHeight: 1.35 }}>
              {played ? (
                <b style={{ color: 'var(--dgv-ink)' }}>
                  Your best: {kept} of {state.bestPossible} dots survived ({played.immunity}%)
                </b>
              ) : (
                <b style={{ color: 'var(--dgv-ink)' }}>
                  {state.players} {state.players === 1 ? 'player' : 'players'} today, plus {state.bots} rat bots for company
                </b>
              )}
              <br />
              Team goal: {state.strain.teamGoal}% immunity, real players only ({state.players > 0 ? `now ${state.avgImmunity}%` : 'be the first'})
            </div>
          </div>
        </div>
        <div className="dgv-row" style={{ marginTop: 6, gap: 6 }}>
          <span className="dgv-small" aria-live="off">
            <span className="dgv-chip" style={{ marginRight: 6 }}>
              {played ? 'Your run' : 'Practice board'}
            </span>
            {captionFor(round, state.strain.wake)}
          </span>
        </div>
        <div className="dgv-small dgv-muted" style={{ marginTop: 4 }}>
          Today's germ: <b>{germName(state.strain.name)}</b> (hops {hops} {hops === 1 ? 'square' : 'squares'}, wakes in round {state.strain.wake}){state.strain.mutation !== 'none' ? `, ${mutationName(state.strain.mutation)} edition${state.strain.mutationBy === 'rats' ? ' (picked by the lab rats)' : ''}` : ''}
        </div>
        {state.strain.vaccine && (
          <div className="dgv-ok" style={{ marginTop: 8, padding: '4px 8px', borderRadius: 8, border: '1.5px solid var(--dgv-ink)', fontSize: 13 }}>
            Vaccine day: the germs sleep in until round {state.strain.wake}.
          </div>
        )}
        <button className="dgv-btn" style={{ marginTop: 10 }} onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}>
          {played ? 'See your result' : "Play today's board"}
        </button>
        <div className="dgv-row dgv-muted" style={{ marginTop: 7, fontSize: 11.5 }}>
          <span>
            {played ? `${state.maxAttempts - state.attemptsUsed} of ${state.maxAttempts} runs left · ` : ''}New board in {countdown(state.secondsToReset)}
          </span>
        </div>
      </div>
    </div>
  );
}

export const Splash = () => {
  const { state, error } = useDay();

  if (error) {
    return (
      <div className="dgv-wrap">
        <div className="dgv-card">
          <h1 className="dgv-title">Epidemic Dots</h1>
          <p className="dgv-small dgv-muted">The lab's lights are off. Tap to try the full game.</p>
          <button className="dgv-btn" onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}>
            Open the game
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
          <p className="dgv-small dgv-muted">Warming up the lab...</p>
        </div>
      </div>
    );
  }

  return <Card state={state} />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
