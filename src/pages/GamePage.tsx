import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  formatOrientation,
  formatTimeControl,
  parseOrientationParam,
  parseTimeControlParam
} from '../domain/localSetup';
import type { Color, Move, Square } from '../domain/chessTypes';
import { oppositeColor } from '../domain/chessTypes';
import { createInitialGameState } from '../domain/gameState';
import { getPiece } from '../domain/board';
import { generateLegalMoves } from '../domain/legalMoves';
import { gameReducer } from '../domain/reducer';
import { getGameStatus } from '../domain/gameStatus';
import { isInCheck } from '../domain/attack';
import { ChessBoard } from '../ui/ChessBoard';
import { PromotionChooser } from '../ui/PromotionChooser';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ResultDialog } from '../ui/ResultDialog';

function makeLocalGameId(): string {
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}


type ClockState = {
  wMs: number;
  bMs: number;
};

function formatClockMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const timeControl = parseTimeControlParam(searchParams.get('tc'));
  const orientation = parseOrientationParam(searchParams.get('o'));

  const gameId = useMemo(() => makeLocalGameId(), []);

  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
    options: Move[];
  } | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: 'resign'; title: string; message: string }
    | { kind: 'draw'; title: string; message: string }
    | null
  >(null);

  const legalMovesFromSelection = useMemo(() => {
    if (selectedSquare === null) return [];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  const status = useMemo(() => getGameStatus(state), [state]);
  const inCheck = status.kind === 'inProgress' ? isInCheck(state, state.sideToMove) : false;
  const isGameOver = status.kind !== 'inProgress';

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const hasClock = timeControl?.kind === 'fischer';
  const clockInitialMs = hasClock ? timeControl.initialSeconds * 1000 : 0;
  const clockIncrementMs = hasClock ? timeControl.incrementSeconds * 1000 : 0;

  const [clock, setClock] = useState<ClockState | null>(() => {
    if (!hasClock) return null;
    return { wMs: clockInitialMs, bMs: clockInitialMs };
  });

  const lastTickRef = useRef<number | null>(null);
  const prevMoveCountRef = useRef<number>(0);

  // Reset clock when time control changes (or when entering the page).
  useEffect(() => {
    if (!hasClock) {
      setClock(null);
      return;
    }
    setClock({ wMs: clockInitialMs, bMs: clockInitialMs });
    lastTickRef.current = Date.now();
    prevMoveCountRef.current = 0;
  }, [hasClock, clockInitialMs]);

  // Apply Fischer increment to the player who just moved.
  useEffect(() => {
    if (!hasClock) return;

    const prevCount = prevMoveCountRef.current;
    const nextCount = state.history.length;

    if (nextCount > prevCount) {
      const mover: Color = oppositeColor(state.sideToMove); // because sideToMove already switched
      if (clockIncrementMs > 0) {
        setClock((c) => {
          if (!c) return c;
          return mover === 'w' ? { ...c, wMs: c.wMs + clockIncrementMs } : { ...c, bMs: c.bMs + clockIncrementMs };
        });
      }
      lastTickRef.current = Date.now();
    }

    // Restart/new game: history is cleared.
    if (nextCount === 0 && prevCount > 0) {
      setClock({ wMs: clockInitialMs, bMs: clockInitialMs });
      lastTickRef.current = Date.now();
    }

    prevMoveCountRef.current = nextCount;
  }, [hasClock, clockIncrementMs, clockInitialMs, state.history.length, state.sideToMove]);

  // Tick down the active side.
  useEffect(() => {
    if (!hasClock) return;
    if (isGameOver) return;

    // If the clock starts at 0, end immediately.
    if (clockInitialMs <= 0) {
      dispatch({ type: 'timeout', loser: stateRef.current.sideToMove });
      return;
    }

    lastTickRef.current = Date.now();

    const id = window.setInterval(() => {
      const now = Date.now();
      const last = lastTickRef.current ?? now;
      const delta = Math.max(0, now - last);
      lastTickRef.current = now;

      const active = stateRef.current.sideToMove;
      let didTimeout = false;

      setClock((c) => {
        if (!c) return c;
        const next = { ...c };
        if (active === 'w') {
          next.wMs = Math.max(0, next.wMs - delta);
          if (next.wMs === 0) didTimeout = true;
        } else {
          next.bMs = Math.max(0, next.bMs - delta);
          if (next.bMs === 0) didTimeout = true;
        }
        return next;
      });

      if (didTimeout) {
        dispatch({ type: 'timeout', loser: active });
      }
    }, 200);

    return () => window.clearInterval(id);
  }, [hasClock, isGameOver, clockInitialMs, dispatch]);

  // Close in-progress input dialogs if the game ends (mate/draw/resign).
  useEffect(() => {
    if (!isGameOver) return;
    setConfirm(null);
    setPendingPromotion(null);
    setSelectedSquare(null);
  }, [isGameOver]);

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

  function tryApplyCandidates(from: Square, to: Square, candidates: Move[]) {
    if (candidates.length === 0) return;

    const promo = candidates.filter((m) => Boolean(m.promotion));
    if (promo.length > 0) {
      // Ask the user which piece to promote to.
      setPendingPromotion({ from, to, options: promo });
      return;
    }

    // Non-promotion: there should be exactly one legal candidate.
    dispatch({ type: 'applyMove', move: candidates[0] });
    setSelectedSquare(null);
  }

  function handleSquareClick(square: Square) {
    if (isGameOver) return;
    if (pendingPromotion) return;
    if (confirm) return;

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

    tryApplyCandidates(selectedSquare, square, candidates);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (isGameOver) return;
    if (pendingPromotion) return;
    if (confirm) return;
    // Drag-drop is allowed even if selection is out of sync.
    tryApplyCandidates(from, to, candidates);
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
          {hasClock && clock && (
            <>
              <div>
                <span className="muted">White clock</span>
                <div
                  className={`metaValue clockValue ${state.sideToMove === 'w' ? 'clockActive' : ''}`}
                  aria-label="White clock"
                >
                  {formatClockMs(clock.wMs)}
                </div>
              </div>
              <div>
                <span className="muted">Black clock</span>
                <div
                  className={`metaValue clockValue ${state.sideToMove === 'b' ? 'clockActive' : ''}`}
                  aria-label="Black clock"
                >
                  {formatClockMs(clock.bMs)}
                </div>
              </div>
            </>
          )}

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
              {status.kind === 'drawAgreement' && 'Draw — agreed'}
              {status.kind === 'timeout' && `Time out — ${status.winner === 'w' ? 'White' : 'Black'} wins`}
              {status.kind === 'resign' &&
                `${status.loser === 'w' ? 'White' : 'Black'} resigned — ${
                  status.winner === 'w' ? 'White' : 'Black'
                } wins`}
            </div>
          </div>
          <div className="metaActions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                dispatch({ type: 'newGame' });
                setSelectedSquare(null);
                setPendingPromotion(null);
              }}
              disabled={Boolean(pendingPromotion) || Boolean(confirm)}
            >
              Restart
            </button>
          </div>
        </div>

        <div className="actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setConfirm({
                kind: 'draw',
                title: 'Offer draw',
                message: 'Offer a draw and accept it immediately?'
              })
            }
            disabled={isGameOver || Boolean(pendingPromotion) || Boolean(confirm)}
          >
            Offer draw
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setConfirm({
                kind: 'resign',
                title: 'Resign',
                message: `Resign as ${state.sideToMove === 'w' ? 'White' : 'Black'}?`
              })
            }
            disabled={isGameOver || Boolean(pendingPromotion) || Boolean(confirm)}
          >
            Resign
          </button>
          <Link to="/" className="btn btn-secondary" aria-label="Back to Home">
            Home
          </Link>
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
          onMoveAttempt={handleMoveAttempt}
          disabled={isGameOver || Boolean(pendingPromotion) || Boolean(confirm)}
        />
        <p className="muted">Tap to move, or drag a piece to a highlighted square.</p>

        {pendingPromotion && (
          <PromotionChooser
            color={state.sideToMove}
            options={pendingPromotion.options}
            onChoose={(move) => {
              dispatch({ type: 'applyMove', move });
              setPendingPromotion(null);
              setSelectedSquare(null);
            }}
            onCancel={() => {
              setPendingPromotion(null);
              // Keep selection so the user can try again.
            }}
          />
        )}

        {confirm && (
          <ConfirmDialog
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.kind === 'resign' ? 'Resign' : 'Agree draw'}
            cancelLabel="Cancel"
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              if (confirm.kind === 'resign') {
                dispatch({ type: 'resign' });
              } else {
                dispatch({ type: 'agreeDraw' });
              }
              setConfirm(null);
              setSelectedSquare(null);
              setPendingPromotion(null);
            }}
          />
        )}

        {isGameOver && (
          <ResultDialog
            status={status as Exclude<typeof status, { kind: 'inProgress' }>}
            onRestart={() => {
              dispatch({ type: 'newGame' });
              setSelectedSquare(null);
              setPendingPromotion(null);
              setConfirm(null);
            }}
            onNewGame={() => navigate('/local/setup')}
            onHome={() => navigate('/')}
          />
        )}

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
