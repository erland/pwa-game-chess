import type { Move, Square } from '../../chessTypes';

import { uciToLegalMove } from '../openingsDrill';

import type { HintMove, OpeningsSessionState } from './openingsSession.types';

export function selectOpeningsExpectedUci(session: OpeningsSessionState): string | null {
  if (session.mode === 'nodes') return session.currentNode?.expectedUci ?? null;
  return session.current ? session.current.lineUci[session.index] ?? null : null;
}

export function selectOpeningsExpectedMove(session: OpeningsSessionState): Move | null {
  if (!session.state) return null;
  const exp = selectOpeningsExpectedUci(session);
  if (!exp) return null;
  if (session.state.sideToMove !== session.drillColor) return null;
  return uciToLegalMove(session.state, exp);
}

export function selectOpeningsHintMove(session: OpeningsSessionState): HintMove | null {
  if (!session.showHintFlag) return null;
  const m = selectOpeningsExpectedMove(session);
  if (!m) return null;
  return { from: m.from, to: m.to };
}

export function selectOpeningsDisabledForMoveInput(session: OpeningsSessionState): boolean {
  if (!session.running) return true;
  if (!session.state) return true;
  if (session.state.sideToMove !== session.drillColor) return true;
  return false;
}

export function selectOpeningsCheckSquares(): Square[] {
  // Openings drills don’t highlight check squares currently.
  return [];
}
