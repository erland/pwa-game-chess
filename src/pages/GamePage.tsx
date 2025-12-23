import { useMemo, useReducer, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  formatOrientation,
  formatTimeControl,
  parseOrientationParam,
  parseTimeControlParam
} from '../domain/localSetup';
import type { Square } from '../domain/chessTypes';
import { createInitialGameState } from '../domain/gameState';
import { getPiece } from '../domain/board';
import { generateLegalMoves } from '../domain/legalMoves';
import { gameReducer } from '../domain/reducer';
import { getGameStatus } from '../domain/gameStatus';
import { isInCheck } from '../domain/attack';
import { ChessBoard } from '../ui/ChessBoard';

function makeLocalGameId(): string {
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function GamePage() {
  const [searchParams] = useSearchParams();

  const timeControl = parseTimeControlParam(searchParams.get('tc'));
  const orientation = parseOrientationParam(searchParams.get('o'));

  const gameId = useMemo(() => makeLocalGameId(), []);

  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const legalMovesFromSelection = useMemo(() => {
    if (selectedSquare === null) return [];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  const status = useMemo(() => getGameStatus(state), [state]);
  const inCheck = status.kind === 'inProgress' ? isInCheck(state, state.sideToMove) : false;
  const isGameOver = status.kind !== 'inProgress';

  if (!timeControl || !orientation) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Missing or invalid setup</h2>
          <p className="muted">
            This page expects setup parameters in the URL. Please go back and start a new local game.
          </p>
          <div className="actions">
            <Link to="/local/setup" className="btn btn-primary">
              Go to local setup
            </Link>
            <Link to="/" className="btn btn-secondary">
              Home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  function handleSquareClick(square: Square) {
    if (isGameOver) return;

    const piece = getPiece(state.board, square);

    // No selection yet: select your own piece.
    if (selectedSquare === null) {
      if (piece && piece.color === state.sideToMove) {
        setSelectedSquare(square);
      }
      return;
    }

    // Clicking the selected square toggles selection off.
    if (square === selectedSquare) {
      setSelectedSquare(null);
      return;
    }

    // Clicking another own piece changes selection.
    if (piece && piece.color === state.sideToMove) {
      setSelectedSquare(square);
      return;
    }

    // Otherwise: try to make a move.
    const candidates = legalMovesFromSelection.filter((m) => m.to === square);
    if (candidates.length === 0) return;

    // If there are multiple promotion candidates, default to queen.
    const queenPromo = candidates.find((m) => m.promotion === 'q');
    const chosen = queenPromo ?? candidates[0];
    dispatch({ type: 'applyMove', move: chosen });
    setSelectedSquare(null);
  }

  return (
    <section className="stack">
      <div className="card">
        <h2>Local game</h2>
        <p className="muted">
          Game ID: <code>{gameId}</code>
        </p>

        <dl className="dl">
          <div>
            <dt>Time control</dt>
            <dd>{formatTimeControl(timeControl)}</dd>
          </div>
          <div>
            <dt>Orientation</dt>
            <dd>{formatOrientation(orientation)}</dd>
          </div>
        </dl>

        <div className="gameMeta">
          <div>
            <span className="muted">Side to move</span>
            <div className="metaValue">{state.sideToMove === 'w' ? 'White' : 'Black'}</div>
          </div>
          <div>
            <span className="muted">Status</span>
            <div className="metaValue">
              {status.kind === 'inProgress' && (inCheck ? 'In check' : 'In progress')}
              {status.kind === 'checkmate' && `Checkmate — ${status.winner === 'w' ? 'White' : 'Black'} wins`}
              {status.kind === 'stalemate' && 'Draw — stalemate'}
              {status.kind === 'drawInsufficientMaterial' && 'Draw — insufficient material'}
            </div>
          </div>
          <div className="metaActions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                dispatch({ type: 'newGame' });
                setSelectedSquare(null);
              }}
            >
              Restart
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="h3">Board</h3>
        <ChessBoard
          state={state}
          orientation={orientation}
          selectedSquare={selectedSquare}
          legalMovesFromSelection={legalMovesFromSelection}
          onSquareClick={handleSquareClick}
          disabled={isGameOver}
        />
        <p className="muted">Click a piece to see legal moves. Click a highlighted square to move.</p>

        <div className="actions">
          <Link to="/local/setup" className="btn btn-primary">
            New game
          </Link>
          <Link to="/" className="btn btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
