import { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  formatOrientation,
  formatTimeControl,
  parseOrientationParam,
  parseTimeControlParam
} from '../domain/localSetup';
import type { Move, Square } from '../domain/chessTypes';
import type { Color } from '../domain/chessTypes';
import { parseGameModeParam, type GameMode } from '../domain/gameMode';
import { formatDifficulty, formatSideChoice, parseDifficultyParam, parseSideChoiceParam } from '../domain/vsComputerSetup';
import { createInitialGameState } from '../domain/gameState';
import { getPiece } from '../domain/board';
import { generateLegalMoves } from '../domain/legalMoves';
import { generatePseudoLegalMoves } from '../domain/movegen';
import { gameReducer } from '../domain/reducer';
import { oppositeColor } from '../domain/chessTypes';
import { ChessBoard } from '../ui/ChessBoard';
import { PromotionChooser } from '../ui/PromotionChooser';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ResultDialog } from '../ui/ResultDialog';
import { useDerivedGameView } from './game/useDerivedGameView';
import { useLocalClocks, formatClockMs } from './game/useLocalClocks';
import { useToastNotice } from './game/useToastNotice';
import { useAiController } from './game/useAiController';
import type { AiConfig, ChessAi } from '../domain/ai/types';

function makeGameId(mode: GameMode): string {
  const prefix = mode === 'local' ? 'local' : 'vs';
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function GamePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const modeFromParam = parseGameModeParam(searchParams.get('m'));
  const mode: GameMode = modeFromParam ?? (location.pathname.startsWith('/vs-computer') ? 'vsComputer' : 'local');

  const playerSideChoice = parseSideChoiceParam(searchParams.get('side')) ?? 'w';
  const difficulty = parseDifficultyParam(searchParams.get('d')) ?? 'easy';

  const navigate = useNavigate();

  const timeControl = parseTimeControlParam(searchParams.get('tc'));
  const orientation = parseOrientationParam(searchParams.get('o'));

  const gameId = useMemo(() => makeGameId(mode), [mode]);

  // In vs-computer mode, the player may choose "Random"; resolve it once per page mount.
  const playerColor: Color = useMemo(() => {
    if (playerSideChoice === 'r') return Math.random() < 0.5 ? 'w' : 'b';
    return playerSideChoice;
  }, [playerSideChoice, gameId]);

  const aiColor: Color = useMemo(() => oppositeColor(playerColor), [playerColor]);

  // v2 Step 2 introduces the AI boundary. A concrete AI is plugged in during later steps.
  const ai: ChessAi | null = null;
  const aiConfig: AiConfig = useMemo(() => ({ difficulty }), [difficulty]);

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

  // Step 9/8 alignment: brief feedback for illegal move attempts.
  const { noticeText, showNotice, clearNotice } = useToastNotice(1500);

  const legalMovesFromSelection = useMemo(() => {
    if (selectedSquare === null) return [];
    return generateLegalMoves(state, selectedSquare);
  }, [state, selectedSquare]);

  const { status, isGameOver, inCheck, lastMove, checkSquares } = useDerivedGameView(state);

  const { hasClock, clock } = useLocalClocks(
    state,
    timeControl ?? { kind: 'none' },
    isGameOver,
    dispatch
  );

  // v2 Step 2: AI boundary + orchestration hook.
  // Note: actual AI implementation is introduced in later steps (v2 Step 3+).
  const aiCtl = useAiController({
    enabled: mode === 'vsComputer' && Boolean(ai),
    state,
    isGameOver,
    aiColor,
    ai,
    config: aiConfig,
    onApplyMove: (move) => {
      dispatch({ type: 'applyMove', move });
      setSelectedSquare(null);
      setPendingPromotion(null);
      setConfirm(null);
    },
    onError: (msg) => showNotice(msg)
  });

  // Close in-progress input dialogs if the game ends (mate/draw/resign).
  useEffect(() => {
    if (!isGameOver) return;
    setConfirm(null);
    setPendingPromotion(null);
    setSelectedSquare(null);
    clearNotice();
  }, [isGameOver, clearNotice]);

  const setupPath = mode === 'vsComputer' ? '/vs-computer/setup' : '/local/setup';
  const setupLabel = mode === 'vsComputer' ? 'Go to vs computer setup' : 'Go to local setup';

  if (!timeControl || !orientation) {
    return (
      <section className="stack">
        <div className="card">
          <h2>Missing or invalid setup</h2>
          <p className="muted">
            This page expects setup parameters in the URL. Please go back and start a new game.
          </p>
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
                <dd>{formatSideChoice(playerSideChoice)}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{formatDifficulty(difficulty)}</dd>
              </div>
            </>
          )}
        </dl>

        {mode === 'vsComputer' && (
          <div className="notice" role="note" style={{ marginTop: 12 }}>
            <strong>Note:</strong> Vs-computer AI is wired up in later v2 steps. For now you can play both sides.
          </div>
        )}

        {mode === 'vsComputer' && aiCtl.isThinking && (
          <div className="notice" role="status" aria-live="polite" style={{ marginTop: 12 }}>
            Computer thinking…
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
          lastMove={lastMove}
          checkSquares={checkSquares}
          onSquareClick={handleSquareClick}
          onMoveAttempt={handleMoveAttempt}
          disabled={isGameOver || Boolean(pendingPromotion) || Boolean(confirm) || aiCtl.isThinking}
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