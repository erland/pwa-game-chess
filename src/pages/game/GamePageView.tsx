import { Link } from 'react-router-dom';

import type { GameState, Move, Square } from '../../domain/chessTypes';
import type { Orientation, TimeControl } from '../../domain/localSetup';
import { formatOrientation, formatTimeControl } from '../../domain/localSetup';
import type { SideChoice } from '../../domain/vsComputerSetup';
import { formatDifficulty, formatSideChoice } from '../../domain/vsComputerSetup';
import type { AiConfig, AiDifficulty } from '../../domain/ai/types';
import type { CapturedPieces } from '../../domain/material/captured';

import { ChessBoard } from '../../ui/ChessBoard';
import { CapturedPiecesPanel } from '../../ui/CapturedPiecesPanel';
import { PromotionChooser } from '../../ui/PromotionChooser';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ResultDialog } from '../../ui/ResultDialog';

import { formatClockMs } from './useLocalClocks';
import type { GameInteractionController, HintUiState } from './useGameInteractionController';
import type { GameStatus } from '../../domain/chessTypes';

export function GamePageView(props: {
  setupMissing: boolean;

  mode: 'local' | 'vsComputer';
  timeControl: TimeControl | null;
  orientation: Orientation | null;

  gameId: string;

  setupPath: string;
  setupLabel: string;

  playerColor: GameState['sideToMove'];
  aiColor: GameState['sideToMove'];

  playerSideChoice: SideChoice | null;
  difficulty: AiDifficulty | null;
  aiConfig: AiConfig;

  state: GameState;
  status: GameStatus;
  inCheck: boolean;
  isGameOver: boolean;
  lastMove: Move | null;
  checkSquares: Square[];

  capturedPieces: CapturedPieces;

  hasClock: boolean;
  clock: { wMs: number; bMs: number } | null;

  aiIsThinking: boolean;

  hint: HintUiState;
  noticeText: string | null;

  interaction: GameInteractionController;

  onNewGame: () => void;
  onHome: () => void;
}) {
  const {
    setupMissing,
    mode,
    timeControl,
    orientation,
    gameId,
    setupPath,
    setupLabel,
    playerColor,
    aiColor,
    playerSideChoice,
    difficulty,
    aiConfig,
    state,
    status,
    inCheck,
    isGameOver,
    lastMove,
    checkSquares,
    capturedPieces,
    hasClock,
    clock,
    aiIsThinking,
    hint,
    noticeText,
    interaction,
    onNewGame,
    onHome
  } = props;

  if (setupMissing) {
    return (
      <section className="stack">
        <div className="card gameArea">
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

  return (
    <section className="stack">
      <div className="card gameArea">
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
            <dd>{formatTimeControl(timeControl ?? { kind: 'none' })}</dd>
          </div>
          <div>
            <dt>Orientation</dt>
            <dd>{formatOrientation(orientation ?? 'w')}</dd>
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

        {mode === 'vsComputer' && aiIsThinking && (
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
                `${status.loser === 'w' ? 'White' : 'Black'} resigned — ${status.winner === 'w' ? 'White' : 'Black'} wins`}
            </div>
          </div>
          <div className="metaActions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={interaction.restart}
              disabled={Boolean(interaction.pendingPromotion) || Boolean(interaction.confirm)}
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
              onClick={interaction.toggleHint}
              disabled={
                !hint.isHintThinking &&
                !hint.hintText &&
                (isGameOver ||
                  aiIsThinking ||
                  Boolean(interaction.pendingPromotion) ||
                  Boolean(interaction.confirm) ||
                  state.sideToMove !== playerColor)
              }
            >
              {hint.isHintThinking ? 'Cancel hint' : hint.hintText ? 'Hide hint' : 'Hint'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={interaction.askOfferDraw}
            disabled={isGameOver || Boolean(interaction.pendingPromotion) || Boolean(interaction.confirm)}
          >
            Offer draw
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={interaction.askResign}
            disabled={isGameOver || Boolean(interaction.pendingPromotion) || Boolean(interaction.confirm)}
          >
            Resign
          </button>
          <Link to="/" className="btn btn-secondary" aria-label="Back to Home">
            Home
          </Link>
        </div>

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
      </div>

      <div className="card gameArea">
        <h3 className="h3">Board</h3>
        <CapturedPiecesPanel captured={capturedPieces} showDelta />

        <ChessBoard
          state={state}
          orientation={orientation ?? 'w'}
          selectedSquare={interaction.selectedSquare}
          legalMovesFromSelection={interaction.legalMovesFromSelection}
          hintMove={hint.hintMove}
          lastMove={lastMove}
          checkSquares={checkSquares}
          onSquareClick={interaction.handleSquareClick}
          onMoveAttempt={interaction.handleMoveAttempt}
          disabled={
            isGameOver ||
            Boolean(interaction.pendingPromotion) ||
            Boolean(interaction.confirm) ||
            aiIsThinking ||
            (mode === 'vsComputer' && state.sideToMove === aiColor)
          }
        />

        {noticeText && (
          <div className="toast" role="status" aria-live="polite">
            {noticeText}
          </div>
        )}

        <p className="muted">Tap to move, or drag a piece to a highlighted square.</p>

        {interaction.pendingPromotion && (
          <PromotionChooser
            color={state.sideToMove}
            options={interaction.pendingPromotion.options}
            onChoose={interaction.choosePromotion}
            onCancel={interaction.cancelPromotion}
          />
        )}

        {interaction.confirm && (
          <ConfirmDialog
            title={interaction.confirm.title}
            message={interaction.confirm.message}
            confirmLabel={interaction.confirm.kind === 'resign' ? 'Resign' : 'Agree draw'}
            cancelLabel="Cancel"
            onCancel={interaction.cancelConfirm}
            onConfirm={interaction.confirmAction}
          />
        )}

        {isGameOver && (
          <ResultDialog
            status={status as Exclude<typeof status, { kind: 'inProgress' }>}
            onRestart={interaction.restart}
            onNewGame={onNewGame}
            onHome={onHome}
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
