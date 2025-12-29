import { Link } from 'react-router-dom';

import { ChessBoard } from '../../../ui/ChessBoard';
import { PromotionChooser } from '../../../ui/PromotionChooser';

import type { UseOpeningsSessionControllerResult } from './useOpeningsSessionController';
import { OpeningsIntroCard } from './components/OpeningsIntroCard';
import { OpeningLineListItem } from './components/OpeningLineListItem';

export function TrainingOpeningsView(props: {
  ctrl: UseOpeningsSessionControllerResult;
  showHintSquares: boolean;
  showHintArrow: boolean;
}) {
  const { ctrl, showHintSquares, showHintArrow } = props;

  return (
    <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 style={{ margin: 0 }}>Openings</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Repertoire drill (v2). Node-based spaced repetition (decision points) + optional full-line drill.
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn btn-secondary" to="/training">
            Back
          </Link>
        </div>
      </div>

      {ctrl.status === 'loading' && <p className="muted">Loading packs…</p>}
      {ctrl.status === 'error' && <p className="muted">Error: {ctrl.error ?? 'Unknown error'}</p>}

      {ctrl.status === 'ready' && ctrl.packWarnings.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pack warnings</h3>
          <ul>
            {ctrl.packWarnings.map((w, i) => (
              <li key={i} className="muted">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {ctrl.status === 'ready' && ctrl.openingNodesWarnings.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Line validation warnings</h3>
          <ul>
            {ctrl.openingNodesWarnings.slice(0, 10).map((w, i) => (
              <li key={i} className="muted">
                {w}
              </li>
            ))}
          </ul>
          {ctrl.openingNodesWarnings.length > 10 && (
            <div className="muted" style={{ fontSize: 12 }}>
              …and {ctrl.openingNodesWarnings.length - 10} more
            </div>
          )}
        </div>
      )}

      {ctrl.status === 'ready' && ctrl.refs.length === 0 && (
        <div className="card">
          <p className="muted">
            No opening lines found in packs. Add items of type <code>openingLine</code> in a pack JSON.
          </p>
        </div>
      )}

      {ctrl.status === 'ready' && ctrl.refs.length > 0 && (
        <OpeningsIntroCard
          mode={ctrl.mode}
          drillColor={ctrl.drillColor}
          linesCount={ctrl.refs.length}
          nodesCount={ctrl.openingNodes.length}
          learnedNodeCount={ctrl.learnedNodeCount}
          onModeChange={ctrl.setMode}
          onColorChange={ctrl.setDrillColor}
          onStart={() => ctrl.startDrill(null)}
        />
      )}

      {/* Node drill session */} 
      {ctrl.mode === 'nodes' && ctrl.currentNode && ctrl.state && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>
                {ctrl.currentNode.packTitle} • {ctrl.currentNode.name}
              </h3>
              <div className="muted" style={{ fontSize: 12 }}>
                Node: {ctrl.currentNode.key} • Expected: {ctrl.currentNode.expectedUci}
              </div>

              {ctrl.byKeyNodeStats.get(ctrl.currentNode.key) ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Attempts: {ctrl.byKeyNodeStats.get(ctrl.currentNode.key)!.attempts} • Successes:{' '}
                  {ctrl.byKeyNodeStats.get(ctrl.currentNode.key)!.successes} • Next due:{' '}
                  {ctrl.byKeyNodeStats.get(ctrl.currentNode.key)!.nextDueAtMs
                    ? new Date(ctrl.byKeyNodeStats.get(ctrl.currentNode.key)!.nextDueAtMs!).toLocaleDateString()
                    : '—'}
                </div>
              ) : null}
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={ctrl.toggleHint}
                disabled={!ctrl.running || ctrl.state.sideToMove !== ctrl.drillColor}
              >
                {ctrl.showHintFlag ? 'Hide hint' : 'Hint'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={ctrl.resetToInitial}>
                Reset
              </button>
              <button className="btn btn-secondary" type="button" onClick={ctrl.stopSession}>
                Stop
              </button>
            </div>
          </div>

          {ctrl.resultMsg && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Result</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                {ctrl.resultMsg}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" type="button" onClick={() => ctrl.startDrill(null)}>
                  Next node
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    if (ctrl.currentNode) ctrl.startNode(ctrl.currentNode);
                  }}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ChessBoard
              state={ctrl.state}
              orientation={ctrl.orientation}
              selectedSquare={ctrl.moveInput.selectedSquare}
              legalMovesFromSelection={ctrl.moveInput.legalMovesFromSelection}
              hintMove={ctrl.hintMove}
              showHintSquares={showHintSquares}
              showHintArrow={showHintArrow}
              onSquareClick={ctrl.moveInput.handleSquareClick}
              onMoveAttempt={ctrl.moveInput.handleMoveAttempt}
              disabled={
                Boolean(ctrl.pendingPromotion) ||
                Boolean(ctrl.resultMsg) ||
                !ctrl.running ||
                ctrl.state.sideToMove !== ctrl.drillColor
              }
            />
          </div>

          {ctrl.noticeText && (
            <div className="toast" role="status" aria-live="polite">
              {ctrl.noticeText}
            </div>
          )}

          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Start FEN: {ctrl.initialFen ?? '—'}
          </div>

          {ctrl.pendingPromotion && (
            <PromotionChooser
              color={ctrl.state.sideToMove}
              options={ctrl.pendingPromotion.options}
              onChoose={ctrl.moveInput.choosePromotion}
              onCancel={ctrl.moveInput.cancelPromotion}
            />
          )}
        </div>
      )}

      {/* Line drill session */}
      {ctrl.mode === 'line' && ctrl.current && ctrl.state && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>
                {ctrl.current.packTitle} • {ctrl.current.item.name ?? ctrl.current.item.itemId}
              </h3>
              <div className="muted" style={{ fontSize: 12 }}>
                Key: {ctrl.current.key} • Moves: {ctrl.current.lineUci.length} • Next: {ctrl.expectedUci ?? '—'}
              </div>

              {ctrl.byKeyStats.get(ctrl.current.key) ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Attempts: {ctrl.byKeyStats.get(ctrl.current.key)!.attempts} • Successes:{' '}
                  {ctrl.byKeyStats.get(ctrl.current.key)!.successes} • Accuracy:{' '}
                  {ctrl.byKeyStats.get(ctrl.current.key)!.attempts > 0
                    ? Math.round(
                        (ctrl.byKeyStats.get(ctrl.current.key)!.successes / ctrl.byKeyStats.get(ctrl.current.key)!.attempts) *
                          100
                      )
                    : 0}
                  %
                </div>
              ) : null}
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={ctrl.toggleHint}
                disabled={!ctrl.running || ctrl.state.sideToMove !== ctrl.drillColor}
              >
                {ctrl.showHintFlag ? 'Hide hint' : 'Hint'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={ctrl.resetToInitial}>
                Reset
              </button>
              <button className="btn btn-secondary" type="button" onClick={ctrl.stopSession}>
                Stop
              </button>
            </div>
          </div>

          {ctrl.resultMsg && (
            <div className="card" style={{ marginTop: 10 }}>
              <strong>Result</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                {ctrl.resultMsg}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" type="button" onClick={() => ctrl.startDrill(ctrl.current)}>
                  Try again
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => ctrl.startDrill(null)}>
                  Next
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ChessBoard
              state={ctrl.state}
              orientation={ctrl.orientation}
              selectedSquare={ctrl.moveInput.selectedSquare}
              legalMovesFromSelection={ctrl.moveInput.legalMovesFromSelection}
              hintMove={ctrl.hintMove}
              showHintSquares={showHintSquares}
              showHintArrow={showHintArrow}
              onSquareClick={ctrl.moveInput.handleSquareClick}
              onMoveAttempt={ctrl.moveInput.handleMoveAttempt}
              disabled={
                Boolean(ctrl.pendingPromotion) ||
                Boolean(ctrl.resultMsg) ||
                !ctrl.running ||
                ctrl.state.sideToMove !== ctrl.drillColor
              }
            />
          </div>

          {ctrl.noticeText && (
            <div className="toast" role="status" aria-live="polite">
              {ctrl.noticeText}
            </div>
          )}

          <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Progress: {Math.min(ctrl.index, ctrl.current.lineUci.length)}/{ctrl.current.lineUci.length}{' '}
            {ctrl.initialFen ? `• Start FEN: ${ctrl.initialFen}` : ''}
          </div>

          {ctrl.pendingPromotion && (
            <PromotionChooser
              color={ctrl.state.sideToMove}
              options={ctrl.pendingPromotion.options}
              onChoose={ctrl.moveInput.choosePromotion}
              onCancel={ctrl.moveInput.cancelPromotion}
            />
          )}
        </div>
      )}

      {ctrl.status === 'ready' && ctrl.refs.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Available opening lines</h3>
          <ol>
            {ctrl.refs.map((r) => (
              <OpeningLineListItem key={r.key} refItem={r} stats={ctrl.byKeyStats.get(r.key) ?? null} onStart={() => ctrl.startDrill(r)} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
