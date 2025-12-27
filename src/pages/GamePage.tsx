import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { formatOrientation, formatTimeControl } from '../domain/localSetup';
import type { Move, Square } from '../domain/chessTypes';
import { createInitialGameState } from '../domain/gameState';
import { getPiece } from '../domain/board';
import { generateLegalMoves } from '../domain/legalMoves';
import { generatePseudoLegalMoves } from '../domain/movegen';
import { getCapturedPiecesFromState } from '../domain/material/captured';
import { gameReducer } from '../domain/reducer';

import { ChessBoard } from '../ui/ChessBoard';
import { CapturedPiecesPanel } from '../ui/CapturedPiecesPanel';
import { PromotionChooser } from '../ui/PromotionChooser';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ResultDialog } from '../ui/ResultDialog';

import { useDerivedGameView } from './game/useDerivedGameView';
import { useLocalClocks, formatClockMs } from './game/useLocalClocks';
import { useToastNotice } from './game/useToastNotice';
import { useAiController } from './game/useAiController';
import { useGameSetup } from './game/useGameSetup';
import { useHintController } from './game/useHintController';
import { useGameRecording } from './game/useGameRecording';
import { formatDifficulty, formatSideChoice } from '../domain/vsComputerSetup';

export function GamePage() {
  const navigate = useNavigate();

  const {
    mode,
    timeControl,
    orientation,
    gameId,
    restartId,
    playerSideChoice,
    difficulty,
    playerColor,
    aiColor,
    aiConfig,
    ai,
    setupPath,
    setupLabel,
    players,
    recordedMode,
    recordedTimeControl
  } = useGameSetup();

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

  const { status, isGameOver, inCheck, lastMove, checkSquares } = useDerivedGameView(state);

  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);

  const legalMovesFromSelection = useMemo(() => {
    if (selectedSquare === null) return [];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  const capturedPieces = useMemo(() => getCapturedPiecesFromState(state, 'w'), [state]);

  const { commitMove } = useGameRecording({
    gameId,
    recordedMode,
    players,
    recordedTimeControl,
    isGameOver,
    status,
    history: state.history,
    dispatch
  });

  const { hasClock, clock } = useLocalClocks(state, timeControl ?? { kind: 'none' }, isGameOver, dispatch);

  // Hint controller is created after AI controller, but AI needs a stable reference to clear hints.
  const clearHintRef = useRef<(() => void) | null>(null);

  const aiCtl = useAiController({
    enabled: mode === 'vsComputer',
    state,
    isGameOver,
    aiColor,
    ai,
    config: aiConfig,
    onApplyMove: (move) => {
      clearHintRef.current?.();
      commitMove(move);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setConfirm(null);
    },
    onError: (msg) => showNotice(msg)
  });

  const hint = useHintController({
    enabled: mode === 'vsComputer',
    state,
    isGameOver,
    playerColor,
    aiConfig,
    blocked: Boolean(pendingPromotion) || Boolean(confirm),
    aiIsThinking: aiCtl.isThinking,
    showNotice
  });
  clearHintRef.current = hint.clearHint;

  // Close in-progress input dialogs if the game ends (mate/draw/resign).
  useEffect(() => {
    if (!isGameOver) return;
    setConfirm(null);
    setPendingPromotion(null);
    setSelectedSquare(null);
    hint.clearHint();
    clearNotice();
  }, [isGameOver, hint.clearHint, clearNotice]);

  const setupMissing = !timeControl || !orientation;

  if (setupMissing) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Missing or invalid setup</h2>
          <p className="muted">This page expects setup parameters in the URL. Please go back and start a new game.</p>
          <div className="actions">
            <Link to={setupPath} className="btn btn-primary">
              {setupLabel}
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

    // Any manual move attempt consumes the hint (and cancels in-flight hint work).
    if (hint.isHintThinking || hint.hintMove || hint.hintText) hint.clearHint();

    const promo = candidates.filter((m) => Boolean(m.promotion));
    if (promo.length > 0) {
      // Ask the user which piece to promote to.
      setPendingPromotion({ from, to, options: promo });
      return;
    }

    // Non-promotion: there should be exactly one legal candidate.
    commitMove(candidates[0]);
    setSelectedSquare(null);
  }

  function handleSquareClick(square: Square) {
    if (isGameOver) return;
    if (mode === 'vsComputer' && state.sideToMove === aiColor) return;
    if (aiCtl.isThinking) return;
    if (pendingPromotion) return;
    if (confirm) return;

    const piece = getPiece(state.board, square);

    // No selection yet: select your own piece.
    if (selectedSquare === null) {
      if (piece && piece.color === state.sideToMove) {
        setSelectedSquare(square);
      } else if (piece && piece.color !== state.sideToMove) {
        showNotice('Illegal move');
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
    if (candidates.length === 0) {
      // Provide brief feedback: distinguish "pseudolegal but illegal" (king safety) from other illegal attempts.
      const pseudo = generatePseudoLegalMoves(state, selectedSquare).filter((m) => m.to === square);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      return;
    }

    tryApplyCandidates(selectedSquare, square, candidates);
  }

  function handleMoveAttempt(from: Square, to: Square, candidates: Move[]) {
    if (isGameOver) return;
    if (hint.isHintThinking || hint.hintMove || hint.hintText) hint.clearHint();
    if (mode === 'vsComputer' && state.sideToMove === aiColor) return;
    if (aiCtl.isThinking) return;
    if (pendingPromotion) return;
    if (confirm) return;

    // Drag-drop is allowed even if selection is out of sync.
    if (candidates.length === 0) {
      const pseudo = generatePseudoLegalMoves(state, from).filter((m) => m.to === to);
      showNotice(pseudo.length > 0 ? 'King would be in check' : 'Illegal move');
      setSelectedSquare(from);
      return;
    }

    tryApplyCandidates(from, to, candidates);
  }

  return (
    <section className="stack">
      <div className="card">
        <h2>{mode === 'local' ? 'Local game' : 'Vs computer game'}</h2>
        {mode === 'vsComputer' && (
          <p className="muted vsHeaderLine">
            You: <strong>{playerColor === 'w' ? 'White' : 'Black'}</strong> <span aria-hidden>•</span> Computer:{' '}
            <strong>{aiColor === 'w' ? 'White' : 'Black'}</strong>
          </p>
        )}
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
          {mode === 'vsComputer' && (
            <>
              <div>
                <dt>Your side</dt>
                <dd>{playerSideChoice ? formatSideChoice(playerSideChoice) : '—'}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{difficulty ? formatDifficulty(difficulty) : '—'}</dd>
              </div>

              {difficulty === 'custom' && (
                <>
                  <div>
                    <dt>Think time</dt>
                    <dd>{(aiConfig.thinkTimeMs ?? 0) + ' ms'}</dd>
                  </div>
                  <div>
                    <dt>Randomness</dt>
                    <dd>{Math.round((aiConfig.randomness ?? 0) * 100) + '%'}</dd>
                  </div>
                  <div>
                    <dt>Search depth</dt>
                    <dd>{aiConfig.maxDepth ?? 1}</dd>
                  </div>
                </>
              )}
            </>
          )}
        </dl>

        {mode === 'vsComputer' && (
          <div className="notice" role="note" style={{ marginTop: 12 }}>
            Computer plays <strong>{aiColor === 'w' ? 'White' : 'Black'}</strong>.
          </div>
        )}

        {mode === 'vsComputer' && aiCtl.isThinking && (
          <div
            className="notice"
            role="status"
            aria-live="polite"
            aria-label="Computer thinking"
            style={{ marginTop: 12 }}
          >
            <span className="spinner" aria-hidden />
            Computer thinking…
          </div>
        )}

        {mode === 'vsComputer' && (hint.isHintThinking || hint.hintText) && (
          <div
            className="notice"
            role={hint.isHintThinking ? 'status' : 'note'}
            aria-live="polite"
            aria-label="Hint"
            style={{ marginTop: 12 }}
          >
            {hint.isHintThinking ? (
              <>
                <span className="spinner" aria-hidden />
                Calculating hint…
              </>
            ) : (
              <>
                Hint: <strong>{hint.hintText}</strong>
              </>
            )}
          </div>
        )}

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
                aiCtl.cancel();
                hint.clearHint();
                dispatch({ type: 'newGame' });
                restartId();
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
          {mode === 'vsComputer' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (hint.isHintThinking || hint.hintText) {
                  hint.clearHint();
                } else {
                  void hint.requestHint();
                }
              }}
              disabled={
                !hint.isHintThinking &&
                !hint.hintText &&
                (isGameOver ||
                  aiCtl.isThinking ||
                  Boolean(pendingPromotion) ||
                  Boolean(confirm) ||
                  state.sideToMove !== playerColor)
              }
            >
              {hint.isHintThinking ? 'Cancel hint' : hint.hintText ? 'Hide hint' : 'Hint'}
            </button>
          )}

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
                message:
                  mode === 'vsComputer'
                    ? `Resign as ${playerColor === 'w' ? 'White' : 'Black'}?`
                    : `Resign as ${state.sideToMove === 'w' ? 'White' : 'Black'}?`
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
        <CapturedPiecesPanel captured={capturedPieces} showDelta />

        <ChessBoard
          state={state}
          orientation={orientation}
          selectedSquare={selectedSquare}
          legalMovesFromSelection={legalMovesFromSelection}
          hintMove={hint.hintMove}
          lastMove={lastMove}
          checkSquares={checkSquares}
          onSquareClick={handleSquareClick}
          onMoveAttempt={handleMoveAttempt}
          disabled={
            isGameOver ||
            Boolean(pendingPromotion) ||
            Boolean(confirm) ||
            aiCtl.isThinking ||
            (mode === 'vsComputer' && state.sideToMove === aiColor)
          }
        />
        {noticeText && (
          <div className="toast" role="status" aria-live="polite">
            {noticeText}
          </div>
        )}
        <p className="muted">Tap to move, or drag a piece to a highlighted square.</p>

        {pendingPromotion && (
          <PromotionChooser
            color={state.sideToMove}
            options={pendingPromotion.options}
            onChoose={(move) => {
              hint.clearHint();
              commitMove(move);
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
              aiCtl.cancel();
              hint.clearHint();
              if (confirm.kind === 'resign') {
                dispatch({ type: 'resign', loser: mode === 'vsComputer' ? playerColor : undefined });
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
              aiCtl.cancel();
              hint.clearHint();
              dispatch({ type: 'newGame' });
              restartId();
              setSelectedSquare(null);
              setPendingPromotion(null);
              setConfirm(null);
            }}
            onNewGame={() => navigate(setupPath)}
            onHome={() => navigate('/')}
          />
        )}

        <div className="actions">
          <Link to={setupPath} className="btn btn-primary">
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
