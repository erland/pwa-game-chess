import { useCallback, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

import type { GameState, Move, Piece, Square } from '../../domain/chessTypes';
import { getPiece } from '../../domain/board';
import { generateLegalMoves } from '../../domain/legalMoves';

export type DragState =
  | {
      origin: Square;
      piece: Piece;
      startX: number;
      startY: number;
      clientX: number;
      clientY: number;
      isDragging: boolean;
      // Cache legal moves for the origin to make drag robust even if selection state updates a bit later.
      legalMoves: Move[];
    }
  | null;

export type SquareHandlers = {
  onClick: () => void;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
};

export function useBoardInteraction(args: {
  state: GameState;
  disabled?: boolean;
  onSquareClick: (sq: Square) => void;
  onMoveAttempt: (from: Square, to: Square, candidates: Move[]) => void;
  squareFromClientPoint: (boardEl: HTMLElement, clientX: number, clientY: number) => Square | null;
}) {
  const { state, disabled, onSquareClick, onMoveAttempt, squareFromClientPoint } = args;

  const boardRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState<DragState>(null);

  const getSquareHandlers = useCallback(
    (sq: Square, piece: Piece | null): SquareHandlers => {
      return {
        onClick: () => {
          if (disabled) return;
          // If a drag occurred, the browser will still fire a click on pointer-up.
          // Suppress it so we don't toggle selection or re-attempt moves.
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onSquareClick(sq);
        },
        onPointerDown: (e) => {
          if (disabled) return;
          if (!piece) return;
          if (piece.color !== state.sideToMove) return;

          // Start tracking drag. We'll consider it a drag once pointer moves past threshold.
          // Cache legal moves for origin to make drop resolution deterministic.
          suppressClickRef.current = false;

          setDragging({
            origin: sq,
            piece,
            startX: e.clientX,
            startY: e.clientY,
            clientX: e.clientX,
            clientY: e.clientY,
            isDragging: false,
            // Don't call onSquareClick here: userEvent.click triggers pointerdown + click.
            // Calling onSquareClick twice can toggle selection off (and tests/users won't see highlights).
            // Instead, compute legal moves directly for drag UI.
            legalMoves: generateLegalMoves(state, sq)
          });
        },
        onPointerMove: (e) => {
          if (!dragging) return;
          // Only update if we're dragging the same origin piece.
          if (dragging.origin !== sq) return;

          const dx = e.clientX - dragging.startX;
          const dy = e.clientY - dragging.startY;
          const dist = Math.hypot(dx, dy);
          const nextIsDragging = dragging.isDragging || dist >= 6;
          if (nextIsDragging) suppressClickRef.current = true;

          setDragging((prev) =>
            prev
              ? {
                  ...prev,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  isDragging: nextIsDragging
                }
              : prev
          );
        },
        onPointerUp: (e) => {
          if (!dragging) return;
          if (dragging.origin !== sq) return;

          if (disabled) {
            setDragging(null);
            suppressClickRef.current = false;
            return;
          }

          // Not a drag (tap / click). Let the normal onClick handler run.
          if (!dragging.isDragging) {
            setDragging(null);
            return;
          }

          const boardEl = boardRef.current;
          if (!boardEl) {
            setDragging(null);
            return;
          }

          const dest = squareFromClientPoint(boardEl, e.clientX, e.clientY);

          if (dest === null) {
            setDragging(null);
            return;
          }

          // Treat as a drag-drop move attempt if destination differs.
          if (dest !== dragging.origin) {
            const destPiece = getPiece(state.board, dest);
            if (destPiece && destPiece.color === state.sideToMove) {
              // Dropped on own piece: change selection.
              onSquareClick(dest);
            } else {
              const candidates = dragging.legalMoves.filter((m) => m.to === dest);
              // Always report the attempt so the parent can show feedback.
              onMoveAttempt(dragging.origin, dest, candidates);
            }
          }

          setDragging(null);
        }
      };
    },
    [disabled, dragging, onMoveAttempt, onSquareClick, squareFromClientPoint, state]
  );

  return { boardRef, dragging, getSquareHandlers };
}