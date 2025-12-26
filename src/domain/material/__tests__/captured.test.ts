import { createInitialGameState } from '../../gameState';
import { applyMove } from '../../applyMove';
import { generateLegalMoves } from '../../legalMoves';
import { getCapturedPiecesFromState, captureMaterialDelta } from '../captured';

function play(state: ReturnType<typeof createInitialGameState>, fromAlg: string, toAlg: string) {
  const from = (fromAlg.charCodeAt(0) - 97) + (Number(fromAlg[1]) - 1) * 8;
  const to = (toAlg.charCodeAt(0) - 97) + (Number(toAlg[1]) - 1) * 8;
  // generateLegalMoves() uses state.sideToMove internally. Passing `from` narrows
  // the set for quicker lookup and matches the function signature (Square).
  const legal = generateLegalMoves(state, from);
  const mv = legal.find((m) => m.from === from && m.to === to);
  if (!mv) throw new Error(`Move not legal: ${fromAlg}-${toAlg}`);
  return applyMove(state, mv);
}

describe('captured pieces', () => {
  it('tracks captures by side', () => {
    // A tiny line where White captures a pawn: 1. e4 d5 2. exd5
    let s = createInitialGameState();
    s = play(s, 'e2', 'e4');
    s = play(s, 'd7', 'd5');
    s = play(s, 'e4', 'd5'); // capture

    const cap = getCapturedPiecesFromState(s, 'w');
    expect(cap.w).toEqual(['p']);
    expect(cap.b).toEqual([]);
    expect(captureMaterialDelta(cap)).toBe(1);
  });
});
