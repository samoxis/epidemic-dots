import { useCallback, useEffect, useState } from 'react';
import { ROUNDS, VACCINE_WAKE_DELAY, aliveOf, myCells, runSim, type Frame, type Point } from '../shared/engine';
import type { ErrorResponse, ShareResponse, StateResponse } from '../shared/api';
import type { Mutation } from '../shared/engine';
import { labForecast } from '../shared/dayBoard';

async function readJson(res: Response): Promise<StateResponse | ErrorResponse> {
  return (await res.json()) as StateResponse | ErrorResponse;
}

/** Loads today's board and the player's own result, and saves a play. */
export function useDay() {
  const [state, setStateRaw] = useState<StateResponse | null>(null);
  /** When the latest state arrived (ms), so countdowns can tick from it. */
  const [stateAt, setStateAt] = useState(0);
  const setState = useCallback((next: StateResponse | null | ((s: StateResponse | null) => StateResponse | null)) => {
    setStateRaw(next);
    setStateAt(Date.now());
  }, []);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((data: StateResponse | ErrorResponse) => {
    if ('status' in data) setError(data.message);
    else {
      setState(data);
      setError(null);
    }
  }, [setState]);

  const reload = useCallback(() => {
    fetch('/api/state')
      .then(readJson)
      .then(apply)
      .catch(() => setError("Could not load today's board."));
  }, [apply]);

  useEffect(() => {
    let alive = true;
    fetch('/api/state')
      .then(readJson)
      .then((data) => {
        if (alive) apply(data);
      })
      .catch(() => {
        if (alive) setError("Could not load today's board.");
      });
    return () => {
      alive = false;
    };
  }, [apply]);

  /** Saves a run. Returns the new state (with Patient Zero, now that the board was played) or an error message. */
  const play = useCallback(async (seeds: readonly Point[]): Promise<StateResponse | string> => {
    try {
      const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
      });
      const data = await readJson(res);
      if ('status' in data) return data.message;
      setState(data);
      return data;
    } catch {
      return 'The lab lost your paperwork. Try again.';
    }
  }, [setState]);

  /** Vote for tomorrow's mutation. Returns an error message, or null on success. */
  const vote = useCallback(async (choice: Mutation): Promise<string | null> => {
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      const data = await readJson(res);
      if ('status' in data) return data.message;
      setState(data);
      return null;
    } catch {
      return 'The ballot box is jammed. Try again.';
    }
  }, [setState]);

  /** Opt in or out of showing the league as flair. Returns an error message, or null on success. */
  const setFlair = useCallback(async (on: boolean): Promise<string | null> => {
    try {
      const res = await fetch('/api/flair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      });
      const data = await readJson(res);
      if ('status' in data) return data.message;
      setState(data);
      return null;
    } catch {
      return 'The flair printer jammed. Nothing changed.';
    }
  }, [setState]);

  /** Posts the score comment as the player. Only ever called from an explicit confirm tap. */
  const share = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await fetch('/api/share', { method: 'POST' });
      const data = (await res.json()) as ShareResponse;
      if (data.status === 'error') return { ok: false, message: data.message };
      setState((s) => (s ? { ...s, shared: true } : s));
      return { ok: true, message: 'Posted. Your username is on it, as promised.' };
    } catch {
      return { ok: false, message: 'The lab pigeon got lost. Nothing was shared.' };
    }
  }, [setState]);

  return { state, stateAt, error, play, vote, share, setFlair, reload } as const;
}

/** All 9 frames (start + 8 rounds) of a placement on today's board, using the same engine as the server. */
export function simulate(state: StateResponse, seeds: readonly Point[], plague = true): Frame[] {
  return runSim(seeds, false, state.strain.level, plague, state.ghosts, state.strain.vaccine ? VACCINE_WAKE_DELAY : 0, state.strain.mutation).frames;
}

export function keptIn(frame: Frame | undefined): number {
  return frame ? myCells(aliveOf(frame), false) : 0;
}

/** The lab's prediction, computed exactly like the server does (see shared/dayBoard.ts). */
export function forecastFor(state: StateResponse, seeds: readonly Point[]): number {
  return labForecast(keptIn(simulate(state, seeds, false)[ROUNDS]), state.strain.fc, state.bestPossible);
}

export function countdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function prettyDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "#5 SNEEZY" -> "Sneezy". */
export function germName(name: string): string {
  const word = name.replace(/^#\d+\s*/, '');
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
