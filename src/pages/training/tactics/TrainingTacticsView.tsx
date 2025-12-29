import type { ProgressiveHintLevel } from '../../../domain/coach/types';
import { PromotionChooser } from '../../../ui/PromotionChooser';

import type { UseTacticsSessionControllerResult } from './useTacticsSessionController';
import { TacticsIntroCard } from './components/TacticsIntroCard';
import { TacticsPuzzleCard } from './components/TacticsPuzzleCard';

export function TrainingTacticsView(props: {
  ctrl: UseTacticsSessionControllerResult;
  showHintSquares: boolean;
  showHintArrow: boolean;
}) {
  const { ctrl, showHintSquares, showHintArrow } = props;

  return (
    <section className="stack">
      <TacticsIntroCard
        solve={ctrl.solve}
        reviewSessionId={ctrl.reviewSessionId}
        reviewMistakesCount={ctrl.reviewMistakes.length}
        reviewIndex={ctrl.reviewIndex}
        availableTacticCount={ctrl.availableTacticCount}
        run={ctrl.run}
        startLabel={ctrl.startLabel}
        startDisabled={ctrl.startDisabled}
        onStartNext={ctrl.startNext}
        onReset={ctrl.tryAgain}
        canReset={!!ctrl.session && !ctrl.session.result}
        onEndSession={ctrl.endRun}
        onGoToSessionSummary={ctrl.goToSessionSummary}
      />

      {ctrl.session && (
        <>
          <TacticsPuzzleCard
            session={ctrl.session}
            orientation={ctrl.orientation}
            checkSquares={ctrl.checkSquares}
            hintMove={ctrl.hintMove}
            moveInput={ctrl.moveInput}
            pendingPromotion={ctrl.pendingPromotion}
            noticeText={ctrl.noticeText}
            displayedLine={ctrl.displayedLine}
            progressText={ctrl.progressText}
            showHintSquares={showHintSquares}
            showHintArrow={showHintArrow}
            onHint={(level: ProgressiveHintLevel) => ctrl.showHint(level)}
            onClearHint={ctrl.clearHint}
            onShowLine={ctrl.giveUpShowLine}
            onNext={ctrl.startNext}
            onTryAgain={ctrl.tryAgain}
          />

          {ctrl.pendingPromotion && (
            <PromotionChooser
              color={ctrl.session.state.sideToMove}
              options={ctrl.pendingPromotion.options}
              onChoose={ctrl.moveInput.choosePromotion}
              onCancel={ctrl.moveInput.cancelPromotion}
            />
          )}
        </>
      )}
    </section>
  );
}
