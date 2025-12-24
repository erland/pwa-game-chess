import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import type { ChessAi } from '../domain/ai/types';
import { aiConfigFromDifficulty } from '../domain/ai/presets';
import { HeuristicBot } from '../domain/ai/heuristicBot';
import { StrongEngineBot } from '../domain/ai/strongEngineBot';
import { WorkerEngineAi, isWorkerEngineSupported } from './game/workerEngineAi';
import { toAlgebraic } from '../domain/square';

function makeGameId(mode: GameMode): string {
  const prefix = mode === 'local' ? 'local' : 'vs';
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}


function parseIntParam(param: string | null): number | null {
  if (param == null) return null;
  const n = Number.parseInt(param, 10);
  return Number.isFinite(n) ? n : null;
}

function parseFloatParam(param: string | null): number | null {
  if (param == null) return null;
  const n = Number.parseFloat(param);
  return Number.isFinite(n) ? n : null;
}

function cloneStateSnapshot<T>(state: T): T {
  // GameState is JSON-serializable by design in this project.
  // A deep clone avoids subtle bugs where AI sees a mutated reference.
  return JSON.parse(JSON.stringify(state)) as T;
}

function isAbortError(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { name?: unknown }).name === 'AbortError';
}

function movesEqual(a: Move, b: Move): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    (a.promotion ?? null) === (b.promotion ?? null) &&
    Boolean(a.isCastle) === Boolean(b.isCastle) &&
    (a.castleSide ?? null) === (b.castleSide ?? null) &&
    Boolean(a.isEnPassant) === Boolean(b.isEnPassant)
  );
}

export function GamePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const modeFromParam = parseGameModeParam(searchParams.get('m'));
  const mode: GameMode = modeFromParam ?? (location.pathname.startsWith('/vs-computer') ? 'vsComputer' : 'local');

  const playerSideChoice = parseSideChoiceParam(searchParams.get('side')) ?? 'w';
  const difficulty = parseDifficultyParam(searchParams.get('d')) ?? 'easy';

  const customThinkTimeMs = parseIntParam(searchParams.get('tt'));
  const customRandomness = parseFloatParam(searchParams.get('rn'));
  const customMaxDepth = parseIntParam(searchParams.get('md'));

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

  const aiConfig = useMemo(() => {
    if (difficulty !== 'custom') return aiConfigFromDifficulty(difficulty);
    return aiConfigFromDifficulty('custom', undefined, {
      thinkTimeMs: customThinkTimeMs ?? undefined,
      randomness: customRandomness ?? undefined,
      maxDepth: customMaxDepth ?? undefined
    });
  }, [difficulty, customThinkTimeMs, customRandomness, customMaxDepth]);

  // v2 Step 7: choose AI implementation.
  // - Easy/Medium: baseline heuristic bot (fast, no worker required).
  // - Hard/Custom (with deeper depth): prefer WorkerEngineAi, fallback to StrongEngineBot.
  const ai: ChessAi | null = useMemo(() => {
    if (mode !== 'vsComputer') return null;

    const wantsStrong = difficulty === 'hard' || (difficulty === 'custom' && (aiConfig.maxDepth ?? 1) >= 3);
    if (!wantsStrong) return new HeuristicBot();

    if (isWorkerEngineSupported()) return new WorkerEngineAi();
    return new StrongEngineBot();
  }, [mode, difficulty, aiConfig.maxDepth]);

  // Ensure we init/dispose AI implementations that need lifecycle.
  useEffect(() => {
    void ai?.init?.();
    return () => {
      void ai?.dispose?.();
    };
  }, [ai]);

  const [state, dispatch] = useReducer(gameReducer, undefined, () => createInitialGameState());
  const stateRef = useRef(state);
  stateRef.current = state;

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

  // v2 Step 6: Hint feature (recommended move for the player).
  const [hintMove, setHintMove] = useState<{ from: Square; to: Square } | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [isHintThinking, setIsHintThinking] = useState(false);
  const hintAbortRef = useRef<AbortController | null>(null);
  const hintRequestRef = useRef(0);

  function clearHint() {
    // Bump the request id so any in-flight promise result is treated as stale,
    // even if a particular AI implementation ignores AbortSignal.
    hintRequestRef.current += 1;
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setIsHintThinking(false);
    setHintMove(null);
    setHintText(null);
  }

  useEffect(() => {
    return () => {
      hintAbortRef.current?.abort();
    };
  }, []);

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
    enabled: mode === 'vsComputer',
    state,
    isGameOver,
    aiColor,
    ai,
    config: aiConfig,
    onApplyMove: (move) => {
      clearHint();
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
    clearHint();
    clearNotice();
  }, [isGameOver, clearNotice]);

  // If any move is played (or the game ends), clear any stale hint.
  useEffect(() => {
    // Don't wipe a hint while we're actively computing it.
    if (isHintThinking) return;
    setHintMove(null);
    setHintText(null);
  }, [state.history.length, state.forcedStatus]);

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

    // Any manual move attempt consumes the hint (and cancels in-flight hint work).
    if (isHintThinking || hintMove || hintText) clearHint();

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

  async function requestHint() {
    if (mode !== 'vsComputer') return;
    if (isGameOver) return;
    if (pendingPromotion || confirm) return;
    if (aiCtl.isThinking) return;
    // Only compute a hint for the player's turn.
    if (state.sideToMove !== playerColor) return;

    // Cancel any previous hint request.
    hintAbortRef.current?.abort();
    const reqId = ++hintRequestRef.current;
    const ac = new AbortController();
    hintAbortRef.current = ac;

    const snapshot = cloneStateSnapshot(state);
    const snapshotHistoryLen = snapshot.history.length;
    const snapshotSideToMove = snapshot.sideToMove;

    // Use a deterministic, "best move" configuration for hints.
    // Keep it fast even if the selected difficulty is "Hard".
    const hintConfig = {
      ...aiConfig,
      difficulty: 'hard' as const,
      maxDepth: Math.max(2, aiConfig.maxDepth ?? 1),
      randomness: 0,
      thinkTimeMs: Math.max(80, Math.min(250, aiConfig.thinkTimeMs ?? 180))
    };

    setIsHintThinking(true);
    setHintMove(null);
    setHintText(null);

    try {
      // Hints should be quick and deterministic; use the baseline bot to avoid heavy computation.
      const res = await new HeuristicBot().getMove(
        {
          state: snapshot,
          aiColor: snapshotSideToMove,
          config: hintConfig,
          requestId: `hint_${reqId}`
        },
        ac.signal
      );

      // Ignore stale results.
      if (ac.signal.aborted) return;
      if (hintRequestRef.current !== reqId) return;

      // If the position changed (player made a move / AI moved), ignore the result.
      const current = stateRef.current;
      if (current.history.length !== snapshotHistoryLen) return;
      if (current.sideToMove !== snapshotSideToMove) return;

      // Validate move (defensive): it must still be legal.
      const legal = generateLegalMoves(current);
      const match = legal.find((m) => movesEqual(m, res.move));
      if (!match) {
        setIsHintThinking(false);
        showNotice('Hint unavailable');
        return;
      }

      setIsHintThinking(false);
      setHintMove({ from: match.from, to: match.to });
      setHintText(`${toAlgebraic(match.from)} → ${toAlgebraic(match.to)}`);
    } catch (e: unknown) {
      if (isAbortError(e)) return;
      setIsHintThinking(false);
      showNotice('Hint failed');
    }
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
    if (isHintThinking || hintMove || hintText) clearHint();
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
          <div className="notice" role="status" aria-live="polite" style={{ marginTop: 12 }}>
            Computer thinking…
          </div>
        )}

        {mode === 'vsComputer' && (isHintThinking || hintText) && (
          <div
            className="notice"
            role={isHintThinking ? 'status' : 'note'}
            aria-live="polite"
            aria-label="Hint"
            style={{ marginTop: 12 }}
          >
            {isHintThinking ? (
              'Calculating hint…'
            ) : (
              <>
                Hint: <strong>{hintText}</strong>
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
                // If the computer is thinking, cancel it before restarting.
                aiCtl.cancel();
                clearHint();
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
          {mode === 'vsComputer' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (isHintThinking || hintText) {
                  clearHint();
                } else {
                  void requestHint();
                }
              }}
              disabled={
                // If we're already showing a hint or computing one, allow the user to cancel/hide.
                !isHintThinking &&
                !hintText &&
                (isGameOver ||
                  aiCtl.isThinking ||
                  Boolean(pendingPromotion) ||
                  Boolean(confirm) ||
                  // Only allow hint on the player's turn.
                  state.sideToMove !== playerColor)
              }
            >
              {isHintThinking ? 'Cancel hint' : hintText ? 'Hide hint' : 'Hint'}
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
        <ChessBoard
          state={state}
          orientation={orientation}
          selectedSquare={selectedSquare}
          legalMovesFromSelection={legalMovesFromSelection}
          hintMove={hintMove}
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
              clearHint();
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
              // If the computer is thinking and the user ends the game, cancel the in-flight AI request
              // immediately so it can't apply a stale move.
              aiCtl.cancel();
              clearHint();
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
              clearHint();
              dispatch({ type: 'newGame' });
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