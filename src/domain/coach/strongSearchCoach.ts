import type { Color, GameState, Move } from '../chessTypes';
import { applyMoveForValidation } from '../applyMove';
import type { AiConfig } from '../ai/types';
import { findBestMoveStrong } from '../ai/strongSearch';
import type { StrongSearchEnv } from '../ai/strongSearch';
import { moveToUci } from '../notation/uci';

import type { Coach, CoachAnalysis, CoachConfig, CoachMoveGrade } from './types';
import { computeCpLoss, gradeCpLoss } from './grade';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function makeAbortError(): Error {
  const err =
    typeof DOMException !== 'undefined'
      ? new DOMException('Aborted', 'AbortError')
      : Object.assign(new Error('Aborted'), { name: 'AbortError' });
  return err;
}

function normalizeConfig(c: CoachConfig): AiConfig {
  return {
    difficulty: 'custom',
    maxDepth: c.maxDepth,
    thinkTimeMs: c.thinkTimeMs,
    randomness: 0,
    seed: 0
  };
}

function flipScoreIfNeeded(scoreCp: number | undefined, from: Color, to: Color): number | undefined {
  if (typeof scoreCp !== 'number') return undefined;
  return from === to ? scoreCp : -scoreCp;
}

export function createStrongSearchCoach(): Coach {
  async function analyze(state: GameState, perspective: Color, config: CoachConfig, signal: AbortSignal): Promise<CoachAnalysis> {
    if (signal.aborted) throw makeAbortError();

    const aiColor = state.sideToMove;
    const env: StrongSearchEnv = {
      nowMs,
      shouldAbort: () => signal.aborted
    };

    const t0 = nowMs();
    const res = findBestMoveStrong(env, { state, aiColor, config: normalizeConfig(config) });
    const t1 = nowMs();

    const pv = res.meta?.pv;
    const bestMoveUci = (pv && pv.length ? pv[0] : null) ?? moveToUci(res.move);

    return {
      perspective,
      sideToMove: state.sideToMove,
      scoreCp: flipScoreIfNeeded(res.meta?.scoreCp, aiColor, perspective),
      mateIn: res.meta?.mateIn,
      bestMoveUci,
      pv: pv && pv.length ? pv : [bestMoveUci],
      depth: res.meta?.depth,
      nodes: res.meta?.nodes,
      timeMs: res.meta?.timeMs ?? Math.max(0, Math.round(t1 - t0))
    };
  }

  async function gradeMove(before: GameState, move: Move, config: CoachConfig, signal: AbortSignal): Promise<CoachMoveGrade> {
    const player = before.sideToMove;
    const best = await analyze(before, player, config, signal);
    const after = applyMoveForValidation(before, move);
    const played = await analyze(after, player, config, signal);

    const cpLoss = computeCpLoss(best.scoreCp, played.scoreCp);
    return {
      label: gradeCpLoss(cpLoss),
      cpLoss,
      bestMoveUci: best.bestMoveUci,
      playedMoveUci: moveToUci(move),
      bestScoreCp: best.scoreCp,
      playedScoreCp: played.scoreCp
    };
  }

  return { analyze, gradeMove };
}
